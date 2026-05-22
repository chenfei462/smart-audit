use super::defaults::{
    default_data_sources, default_report_templates, default_scenarios, now_string, risk_level,
};
use super::{
    AiServiceProfile, ArtifactStatus, ArtifactStructuredSummary, ArtifactType, AuditLogEntry,
    AuditReviewPackage, AuditTask, CompletedTaskInput, DataSourceTemplate, EvidenceArtifact, FindingCase,
    FindingCaseStatus, LeadRequest, LeadRequestInput, NewEvidenceArtifactInput, NewUserInput,
    Organization, PlatformState, ProjectRecord, RegistrationInput, ReportTemplate,
    RuleFeedbackInput, RuleFeedbackStats, ScenarioPreset, SessionIdentity, TaskStatus, Tenant,
    UserAccount, UserProfile,
};
use crate::auth::{validate_password_policy, UserRole};
use crate::models::{AnomalyConfig, AuditConfig, RoundAmountConfig, RulesConfig, ThresholdConfig};
use anyhow::{Context, Result};
use rusqlite::types::Type;
use rusqlite::{params, Connection, OptionalExtension, Row, Transaction};
use serde::de::DeserializeOwned;
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::Duration;
use uuid::Uuid;

pub struct PlatformStore {
    db_path: PathBuf,
}

impl PlatformStore {
    pub fn load_or_create(base_dir: &Path) -> Result<Self> {
        let data_dir = base_dir.join("data");
        fs::create_dir_all(&data_dir)
            .with_context(|| format!("failed to create {}", data_dir.display()))?;
        let db_path = data_dir.join("platform.db");
        let store = Self { db_path };
        let mut conn = store.connect()?;
        Self::initialize_schema(&mut conn)?;
        store.ensure_platform_v2_schema()?;
        store.import_legacy_state_if_needed(&mut conn, &data_dir)?;
        store.repair_question_mark_demo_names()?;
        store.ensure_ai_profile()?;
        store.clear_deprecated_ai_secrets()?;
        store.clear_deprecated_connector_secrets()?;
        Ok(store)
    }

    pub fn has_users(&self) -> bool {
        self.connect()
            .and_then(|conn| {
                Ok(conn.query_row(
                    "SELECT EXISTS(SELECT 1 FROM users WHERE active = 1)",
                    [],
                    |row| row.get::<_, i64>(0),
                )?)
            })
            .map(|value| value == 1)
            .unwrap_or(false)
    }

    pub fn list_scenarios(&self) -> Vec<ScenarioPreset> {
        default_scenarios()
    }

    pub fn list_report_templates(&self) -> Vec<ReportTemplate> {
        default_report_templates()
    }

    pub fn list_data_sources(&self) -> Vec<DataSourceTemplate> {
        default_data_sources()
    }

    pub fn register_tenant_admin(&self, input: RegistrationInput) -> Result<UserProfile> {
        validate_password_policy(&input.password).map_err(anyhow::Error::msg)?;
        let tenant_name = input.tenant_name.trim();
        let organization_name = input.organization_name.trim();
        let username = input.username.trim();
        let display_name = input.display_name.trim();
        if tenant_name.is_empty() || organization_name.is_empty() || username.is_empty() {
            anyhow::bail!("tenant, organization, and username are required");
        }

        let tenant = Tenant {
            id: Uuid::new_v4().to_string(),
            name: tenant_name.to_string(),
            deployment_mode: "public-cloud-saas".to_string(),
            data_key_b64: crate::encryption::generate_data_key(),
            created_at: now_string(),
        };
        let organization = Organization {
            id: Uuid::new_v4().to_string(),
            tenant_id: tenant.id.clone(),
            name: organization_name.to_string(),
            kind: "regulator".to_string(),
            created_at: now_string(),
        };
        let user = UserAccount {
            id: Uuid::new_v4().to_string(),
            tenant_id: tenant.id.clone(),
            organization_id: organization.id.clone(),
            username: username.to_string(),
            password_hash: bcrypt::hash(&input.password, bcrypt::DEFAULT_COST)
                .context("failed to hash password")?,
            display_name: display_name.to_string(),
            role: UserRole::Admin,
            active: true,
            must_change_password: false,
            created_at: now_string(),
            last_login_at: None,
        };

        let mut conn = self.connect()?;
        let tx = conn.transaction().context("failed to start transaction")?;
        self.ensure_unique_username(&tx, &user.username)?;
        self.insert_tenant(&tx, &tenant)?;
        self.insert_organization(&tx, &organization)?;
        self.insert_user(&tx, &user)?;
        self.insert_audit_log(
            &tx,
            &AuditLogEntry {
                id: Uuid::new_v4().to_string(),
                tenant_id: Some(tenant.id.clone()),
                organization_id: Some(organization.id.clone()),
                user_id: Some(user.id.clone()),
                username: Some(user.username.clone()),
                action: "tenant.register".to_string(),
                target_type: "tenant".to_string(),
                target_id: tenant.id.clone(),
                outcome: "success".to_string(),
                detail: format!(
                    "Created tenant '{}' with primary admin '{}'",
                    tenant.name, user.username
                ),
                created_at: now_string(),
            },
        )?;
        tx.commit().context("failed to commit registration")?;

        Ok(UserProfile {
            id: user.id,
            tenant_id: tenant.id,
            organization_id: organization.id,
            username: user.username,
            display_name: user.display_name,
            role: user.role,
            organization_name: organization.name,
            tenant_name: tenant.name,
            must_change_password: user.must_change_password,
        })
    }

    pub fn authenticate(&self, username: &str, password: &str) -> Result<SessionIdentity> {
        let mut conn = self.connect()?;
        let tx = conn.transaction().context("failed to start transaction")?;
        let user = tx
            .query_row(
                "SELECT id, tenant_id, organization_id, username, password_hash, display_name,
                        role, active, must_change_password, created_at, last_login_at
                 FROM users
                 WHERE lower(username) = lower(?1)",
                [username.trim()],
                Self::row_to_user,
            )
            .optional()
            .context("failed to query user")?
            .context("invalid username or password")?;
        if !user.active {
            anyhow::bail!("account is disabled");
        }
        let verified =
            bcrypt::verify(password, &user.password_hash).context("failed to verify password")?;
        if !verified {
            anyhow::bail!("invalid username or password");
        }

        tx.execute(
            "UPDATE users SET last_login_at = ?2 WHERE id = ?1",
            params![user.id, now_string()],
        )
        .context("failed to update last login")?;
        self.insert_audit_log(
            &tx,
            &AuditLogEntry {
                id: Uuid::new_v4().to_string(),
                tenant_id: Some(user.tenant_id.clone()),
                organization_id: Some(user.organization_id.clone()),
                user_id: Some(user.id.clone()),
                username: Some(user.username.clone()),
                action: "auth.login".to_string(),
                target_type: "user".to_string(),
                target_id: user.id.clone(),
                outcome: "success".to_string(),
                detail: "Login successful".to_string(),
                created_at: now_string(),
            },
        )?;
        tx.commit().context("failed to commit login")?;

        Ok(SessionIdentity {
            user_id: user.id,
            tenant_id: user.tenant_id,
            organization_id: user.organization_id,
            username: user.username,
            display_name: user.display_name,
            role: user.role,
        })
    }

    pub fn get_profile(&self, identity: &SessionIdentity) -> Option<UserProfile> {
        self.connect()
            .ok()?
            .query_row(
                "SELECT u.id, u.tenant_id, u.organization_id, u.username, u.display_name,
                        u.role, u.must_change_password, o.name, t.name
                 FROM users u
                 JOIN organizations o ON o.id = u.organization_id
                 JOIN tenants t ON t.id = u.tenant_id
                 WHERE u.id = ?1",
                [identity.user_id.as_str()],
                |row| {
                    Ok(UserProfile {
                        id: row.get(0)?,
                        tenant_id: row.get(1)?,
                        organization_id: row.get(2)?,
                        username: row.get(3)?,
                        display_name: row.get(4)?,
                        role: parse_role(row.get::<_, String>(5)?)?,
                        must_change_password: int_to_bool(row.get::<_, i64>(6)?),
                        organization_name: row.get(7)?,
                        tenant_name: row.get(8)?,
                    })
                },
            )
            .optional()
            .ok()
            .flatten()
    }

    pub fn create_user(&self, actor: &SessionIdentity, input: NewUserInput) -> Result<UserProfile> {
        if actor.role != UserRole::Admin {
            anyhow::bail!("admin role required");
        }
        validate_password_policy(&input.password).map_err(anyhow::Error::msg)?;
        let mut conn = self.connect()?;
        let tx = conn.transaction().context("failed to start transaction")?;
        self.ensure_unique_username(&tx, &input.username)?;

        let organization = tx
            .query_row(
                "SELECT id, tenant_id, name, kind, created_at
                 FROM organizations
                 WHERE id = ?1 AND tenant_id = ?2",
                params![input.organization_id, actor.tenant_id],
                Self::row_to_organization,
            )
            .optional()
            .context("failed to query organization")?
            .context("organization not found")?;

        let user = UserAccount {
            id: Uuid::new_v4().to_string(),
            tenant_id: actor.tenant_id.clone(),
            organization_id: organization.id.clone(),
            username: input.username.trim().to_string(),
            password_hash: bcrypt::hash(&input.password, bcrypt::DEFAULT_COST)
                .context("failed to hash password")?,
            display_name: input.display_name.trim().to_string(),
            role: input.role.clone(),
            active: true,
            must_change_password: true,
            created_at: now_string(),
            last_login_at: None,
        };
        self.insert_user(&tx, &user)?;
        self.insert_audit_log(
            &tx,
            &AuditLogEntry {
                id: Uuid::new_v4().to_string(),
                tenant_id: Some(actor.tenant_id.clone()),
                organization_id: Some(organization.id.clone()),
                user_id: Some(actor.user_id.clone()),
                username: Some(actor.username.clone()),
                action: "user.create".to_string(),
                target_type: "user".to_string(),
                target_id: user.id.clone(),
                outcome: "success".to_string(),
                detail: format!("Created user '{}' with role {}", user.username, user.role),
                created_at: now_string(),
            },
        )?;
        tx.commit().context("failed to commit user creation")?;

        Ok(UserProfile {
            id: user.id,
            tenant_id: user.tenant_id,
            organization_id: user.organization_id,
            username: user.username,
            display_name: user.display_name,
            role: user.role,
            organization_name: organization.name,
            tenant_name: self.tenant_name(&actor.tenant_id),
            must_change_password: user.must_change_password,
        })
    }

    pub fn reset_password(
        &self,
        actor: &SessionIdentity,
        user_id: &str,
        new_password: &str,
    ) -> Result<()> {
        if actor.role != UserRole::Admin {
            anyhow::bail!("admin role required");
        }
        validate_password_policy(new_password).map_err(anyhow::Error::msg)?;
        let mut conn = self.connect()?;
        let tx = conn.transaction().context("failed to start transaction")?;
        let updated = tx
            .execute(
                "UPDATE users
                 SET password_hash = ?1, must_change_password = 1
                 WHERE id = ?2 AND tenant_id = ?3",
                params![
                    bcrypt::hash(new_password, bcrypt::DEFAULT_COST)
                        .context("failed to hash password")?,
                    user_id,
                    actor.tenant_id
                ],
            )
            .context("failed to reset password")?;
        if updated == 0 {
            anyhow::bail!("user not found");
        }
        self.insert_audit_log(
            &tx,
            &AuditLogEntry {
                id: Uuid::new_v4().to_string(),
                tenant_id: Some(actor.tenant_id.clone()),
                organization_id: Some(actor.organization_id.clone()),
                user_id: Some(actor.user_id.clone()),
                username: Some(actor.username.clone()),
                action: "user.reset_password".to_string(),
                target_type: "user".to_string(),
                target_id: user_id.to_string(),
                outcome: "success".to_string(),
                detail: "Password reset by administrator".to_string(),
                created_at: now_string(),
            },
        )?;
        tx.commit().context("failed to commit password reset")?;
        Ok(())
    }

    pub fn list_users_for_tenant(&self, tenant_id: &str) -> Vec<UserProfile> {
        let conn = match self.connect() {
            Ok(conn) => conn,
            Err(_) => return Vec::new(),
        };
        let mut statement = match conn.prepare(
            "SELECT u.id, u.tenant_id, u.organization_id, u.username, u.display_name,
                    u.role, u.must_change_password, o.name, t.name
             FROM users u
             JOIN organizations o ON o.id = u.organization_id
             JOIN tenants t ON t.id = u.tenant_id
             WHERE u.tenant_id = ?1
             ORDER BY u.created_at ASC",
        ) {
            Ok(statement) => statement,
            Err(_) => return Vec::new(),
        };

        statement
            .query_map([tenant_id], |row| {
                Ok(UserProfile {
                    id: row.get(0)?,
                    tenant_id: row.get(1)?,
                    organization_id: row.get(2)?,
                    username: row.get(3)?,
                    display_name: row.get(4)?,
                    role: parse_role(row.get::<_, String>(5)?)?,
                    must_change_password: int_to_bool(row.get::<_, i64>(6)?),
                    organization_name: row.get(7)?,
                    tenant_name: row.get(8)?,
                })
            })
            .ok()
            .into_iter()
            .flat_map(|mapped| mapped.filter_map(|item| item.ok()))
            .collect()
    }

    pub fn create_lead_request(&self, input: LeadRequestInput) -> Result<LeadRequest> {
        let contact_name = input.contact_name.trim();
        let contact_channel = input.contact_channel.trim();
        let unit_type = input.unit_type.trim();
        let department = input.department.trim();
        let audit_scenario = input.audit_scenario.trim();
        let deployment_preference = input.deployment_preference.trim();
        let ai_expectation = input.ai_expectation.trim();

        if contact_name.is_empty()
            || contact_channel.is_empty()
            || unit_type.is_empty()
            || department.is_empty()
            || audit_scenario.is_empty()
            || deployment_preference.is_empty()
            || ai_expectation.is_empty()
        {
            anyhow::bail!("contact, unit, scenario, deployment, and AI fields are required");
        }

        let request = LeadRequest {
            id: Uuid::new_v4().to_string(),
            contact_name: contact_name.to_string(),
            contact_channel: contact_channel.to_string(),
            unit_type: unit_type.to_string(),
            department: department.to_string(),
            audit_scenario: audit_scenario.to_string(),
            deployment_preference: deployment_preference.to_string(),
            involves_real_data: input.involves_real_data,
            ai_expectation: ai_expectation.to_string(),
            note: input.note.trim().to_string(),
            created_at: now_string(),
        };

        let mut conn = self.connect()?;
        let tx = conn
            .transaction()
            .context("failed to start lead request transaction")?;
        self.insert_lead_request(&tx, &request)?;
        tx.commit().context("failed to commit lead request")?;
        Ok(request)
    }

    pub fn list_lead_requests(&self, limit: usize) -> Vec<LeadRequest> {
        let conn = match self.connect() {
            Ok(conn) => conn,
            Err(_) => return Vec::new(),
        };
        let mut statement = match conn.prepare(
            "SELECT id, contact_name, contact_channel, unit_type, department, audit_scenario,
                    deployment_preference, involves_real_data, ai_expectation, note, created_at
             FROM lead_requests
             ORDER BY created_at DESC
             LIMIT ?1",
        ) {
            Ok(statement) => statement,
            Err(_) => return Vec::new(),
        };

        statement
            .query_map([limit as i64], Self::row_to_lead_request)
            .ok()
            .into_iter()
            .flat_map(|mapped| mapped.filter_map(|item| item.ok()))
            .collect()
    }

    pub fn create_evidence_artifact(
        &self,
        actor: &SessionIdentity,
        task_id: &str,
        input: NewEvidenceArtifactInput,
    ) -> Result<EvidenceArtifact> {
        if !actor.role.can_run_audit() {
            anyhow::bail!("auditor role required");
        }
        let mut conn = self.connect()?;
        let tx = conn
            .transaction()
            .context("failed to start evidence artifact transaction")?;
        let task = tx
            .query_row(
                "SELECT id, tenant_id, organization_id, project_id, scenario_id, scenario_name,
                        report_template_id, dataset_name, source_kind, source_label, status,
                        risk_level, total_transactions, report_json, transactions_summary_json,
                        findings_json, created_by, created_at, started_at, completed_at
                 FROM tasks
                 WHERE tenant_id = ?1 AND id = ?2",
                params![actor.tenant_id, task_id],
                Self::row_to_task,
            )
            .optional()
            .context("failed to query task for evidence artifact")?
            .context("task not found")?;

        let artifact = EvidenceArtifact {
            id: input.id,
            task_id: task.id.clone(),
            tenant_id: task.tenant_id.clone(),
            organization_id: task.organization_id.clone(),
            artifact_type: input.artifact_type,
            source_filename: input.source_filename,
            mime_type: input.mime_type,
            storage_path: input.storage_path,
            transcript_text: input.transcript_text,
            structured_summary: input.structured_summary,
            status: input.status,
            error_message: input.error_message,
            created_by: actor.user_id.clone(),
            created_at: now_string(),
            updated_at: now_string(),
        };

        self.insert_evidence_artifact(&tx, &artifact)?;
        self.insert_audit_log(
            &tx,
            &AuditLogEntry {
                id: Uuid::new_v4().to_string(),
                tenant_id: Some(actor.tenant_id.clone()),
                organization_id: Some(actor.organization_id.clone()),
                user_id: Some(actor.user_id.clone()),
                username: Some(actor.username.clone()),
                action: "audit.artifact.create".to_string(),
                target_type: "evidence_artifact".to_string(),
                target_id: artifact.id.clone(),
                outcome: "success".to_string(),
                detail: format!(
                    "Created {:?} evidence artifact for task {}",
                    artifact.artifact_type, task_id
                ),
                created_at: now_string(),
            },
        )?;
        tx.commit()
            .context("failed to commit evidence artifact creation")?;
        Ok(artifact)
    }

    pub fn list_evidence_artifacts(
        &self,
        identity: &SessionIdentity,
        task_id: &str,
    ) -> Vec<EvidenceArtifact> {
        let conn = match self.connect() {
            Ok(conn) => conn,
            Err(_) => return Vec::new(),
        };
        let mut statement = match conn.prepare(
            "SELECT id, task_id, tenant_id, organization_id, artifact_type, source_filename,
                    mime_type, storage_path, transcript_text, structured_summary_json, status,
                    error_message, created_by, created_at, updated_at
             FROM evidence_artifacts
             WHERE tenant_id = ?1 AND task_id = ?2
             ORDER BY created_at DESC",
        ) {
            Ok(statement) => statement,
            Err(_) => return Vec::new(),
        };
        statement
            .query_map(
                params![identity.tenant_id.as_str(), task_id],
                Self::row_to_evidence_artifact,
            )
            .ok()
            .into_iter()
            .flat_map(|mapped| mapped.filter_map(|item| item.ok()))
            .collect()
    }

    pub fn get_evidence_artifact(
        &self,
        identity: &SessionIdentity,
        task_id: &str,
        artifact_id: &str,
    ) -> Option<EvidenceArtifact> {
        self.connect()
            .ok()?
            .query_row(
                "SELECT id, task_id, tenant_id, organization_id, artifact_type, source_filename,
                        mime_type, storage_path, transcript_text, structured_summary_json, status,
                        error_message, created_by, created_at, updated_at
                 FROM evidence_artifacts
                 WHERE tenant_id = ?1 AND task_id = ?2 AND id = ?3",
                params![identity.tenant_id.as_str(), task_id, artifact_id],
                Self::row_to_evidence_artifact,
            )
            .optional()
            .ok()
            .flatten()
    }

    pub fn update_evidence_artifact(
        &self,
        actor: &SessionIdentity,
        task_id: &str,
        artifact_id: &str,
        transcript_text: String,
        structured_summary: ArtifactStructuredSummary,
        status: ArtifactStatus,
        error_message: Option<String>,
    ) -> Result<EvidenceArtifact> {
        if !actor.role.can_run_audit() {
            anyhow::bail!("auditor role required");
        }
        let mut conn = self.connect()?;
        let tx = conn
            .transaction()
            .context("failed to start evidence artifact update transaction")?;

        let mut artifact = tx
            .query_row(
                "SELECT id, task_id, tenant_id, organization_id, artifact_type, source_filename,
                        mime_type, storage_path, transcript_text, structured_summary_json, status,
                        error_message, created_by, created_at, updated_at
                 FROM evidence_artifacts
                 WHERE tenant_id = ?1 AND task_id = ?2 AND id = ?3",
                params![actor.tenant_id.as_str(), task_id, artifact_id],
                Self::row_to_evidence_artifact,
            )
            .optional()
            .context("failed to query evidence artifact")?
            .context("evidence artifact not found")?;

        artifact.transcript_text = transcript_text;
        artifact.structured_summary = structured_summary;
        artifact.status = status;
        artifact.error_message = error_message;
        artifact.updated_at = now_string();

        tx.execute(
            "UPDATE evidence_artifacts
             SET transcript_text = ?4,
                 structured_summary_json = ?5,
                 status = ?6,
                 error_message = ?7,
                 updated_at = ?8
             WHERE tenant_id = ?1 AND task_id = ?2 AND id = ?3",
            params![
                actor.tenant_id.as_str(),
                task_id,
                artifact_id,
                artifact.transcript_text,
                serialize_json(&artifact.structured_summary)?,
                artifact_status_to_str(&artifact.status),
                artifact.error_message,
                artifact.updated_at
            ],
        )
        .context("failed to update evidence artifact")?;
        self.insert_audit_log(
            &tx,
            &AuditLogEntry {
                id: Uuid::new_v4().to_string(),
                tenant_id: Some(actor.tenant_id.clone()),
                organization_id: Some(actor.organization_id.clone()),
                user_id: Some(actor.user_id.clone()),
                username: Some(actor.username.clone()),
                action: "audit.artifact.update".to_string(),
                target_type: "evidence_artifact".to_string(),
                target_id: artifact.id.clone(),
                outcome: "success".to_string(),
                detail: format!("Updated evidence artifact status to {:?}", artifact.status),
                created_at: now_string(),
            },
        )?;
        tx.commit()
            .context("failed to commit evidence artifact update")?;
        Ok(artifact)
    }

    pub fn ai_profile(&self) -> AiServiceProfile {
        self.connect()
            .and_then(|conn| {
                Ok(conn.query_row(
                    "SELECT provider, api_url, model, enabled, guidance
                     FROM ai_profile
                     WHERE id = 1",
                    [],
                    |row| {
                        Ok(AiServiceProfile {
                            provider: row.get(0)?,
                            api_url: row.get(1)?,
                            model: row.get(2)?,
                            enabled: int_to_bool(row.get::<_, i64>(3)?),
                            guidance: row.get(4)?,
                            secret_configured: false,
                        })
                    },
                )?)
            })
            .unwrap_or_default()
    }

    pub fn update_ai_profile(
        &self,
        actor: &SessionIdentity,
        profile: AiServiceProfile,
    ) -> Result<AiServiceProfile> {
        if actor.role != UserRole::Admin {
            anyhow::bail!("admin role required");
        }
        let mut conn = self.connect()?;
        let tx = conn.transaction().context("failed to start transaction")?;
        self.upsert_ai_profile(&tx, &profile)?;
        self.insert_audit_log(
            &tx,
            &AuditLogEntry {
                id: Uuid::new_v4().to_string(),
                tenant_id: Some(actor.tenant_id.clone()),
                organization_id: Some(actor.organization_id.clone()),
                user_id: Some(actor.user_id.clone()),
                username: Some(actor.username.clone()),
                action: "admin.ai_profile.update".to_string(),
                target_type: "ai_profile".to_string(),
                target_id: "1".to_string(),
                outcome: "success".to_string(),
                detail: format!(
                    "Updated AI profile provider={} model={}",
                    profile.provider, profile.model
                ),
                created_at: now_string(),
            },
        )?;
        tx.commit().context("failed to commit ai profile update")?;
        Ok(profile)
    }

    pub fn record_task(
        &self,
        actor: &SessionIdentity,
        input: CompletedTaskInput,
    ) -> Result<AuditTask> {
        if !actor.role.can_run_audit() {
            anyhow::bail!("auditor role required");
        }
        let scenario = default_scenarios()
            .into_iter()
            .find(|item| item.id == input.scenario_id)
            .context("scenario not found")?;

        let mut conn = self.connect()?;
        let tx = conn.transaction().context("failed to start transaction")?;
        let project = tx
            .query_row(
                "SELECT id, tenant_id, organization_id, name, scenario_id, description, created_by, created_at
                 FROM projects
                 WHERE tenant_id = ?1 AND name = ?2 AND scenario_id = ?3",
                params![actor.tenant_id, input.project_name.trim(), input.scenario_id],
                Self::row_to_project,
            )
            .optional()
            .context("failed to query project")?
            .unwrap_or_else(|| ProjectRecord {
                id: Uuid::new_v4().to_string(),
                tenant_id: actor.tenant_id.clone(),
                organization_id: actor.organization_id.clone(),
                name: input.project_name.trim().to_string(),
                scenario_id: input.scenario_id.clone(),
                description: format!("{} workflow", scenario.name),
                created_by: actor.user_id.clone(),
                created_at: now_string(),
            });
        if !self.project_exists(&tx, &project.id)? {
            self.insert_project(&tx, &project)?;
        }

        let findings = input
            .report
            .findings
            .iter()
            .cloned()
            .map(|finding| FindingCase {
                id: Uuid::new_v4().to_string(),
                finding,
                assignee: None,
                note: String::new(),
                status: FindingCaseStatus::Open,
                updated_at: now_string(),
            })
            .collect::<Vec<_>>();
        let task = AuditTask {
            id: Uuid::new_v4().to_string(),
            tenant_id: actor.tenant_id.clone(),
            organization_id: actor.organization_id.clone(),
            project_id: project.id.clone(),
            scenario_id: scenario.id.clone(),
            scenario_name: scenario.name.clone(),
            report_template_id: input.report_template_id.clone(),
            dataset_name: input.dataset_name.clone(),
            source_kind: input.source_kind.clone(),
            source_label: input.source_label.clone(),
            status: TaskStatus::Completed,
            risk_level: risk_level(&input.report),
            total_transactions: input.report.total_transactions,
            report: input.report.clone(),
            transactions_summary: input.transactions_summary.clone(),
            findings,
            created_by: actor.user_id.clone(),
            created_at: now_string(),
            started_at: now_string(),
            completed_at: now_string(),
        };
        self.insert_task(&tx, &task)?;
        self.insert_audit_log(
            &tx,
            &AuditLogEntry {
                id: Uuid::new_v4().to_string(),
                tenant_id: Some(actor.tenant_id.clone()),
                organization_id: Some(actor.organization_id.clone()),
                user_id: Some(actor.user_id.clone()),
                username: Some(actor.username.clone()),
                action: "audit.task.completed".to_string(),
                target_type: "task".to_string(),
                target_id: task.id.clone(),
                outcome: "success".to_string(),
                detail: format!(
                    "Scenario={} source={} findings={}",
                    scenario.name,
                    task.source_kind,
                    task.report.findings.len()
                ),
                created_at: now_string(),
            },
        )?;
        tx.commit().context("failed to commit task")?;
        Ok(task)
    }

    pub fn list_tasks(&self, identity: &SessionIdentity) -> Vec<AuditTask> {
        let conn = match self.connect() {
            Ok(conn) => conn,
            Err(_) => return Vec::new(),
        };
        let mut statement = match conn.prepare(
            "SELECT id, tenant_id, organization_id, project_id, scenario_id, scenario_name,
                    report_template_id, dataset_name, source_kind, source_label, status,
                    risk_level, total_transactions, report_json, transactions_summary_json,
                    findings_json, created_by, created_at, started_at, completed_at
             FROM tasks
             WHERE tenant_id = ?1
             ORDER BY created_at ASC",
        ) {
            Ok(statement) => statement,
            Err(_) => return Vec::new(),
        };
        statement
            .query_map([identity.tenant_id.as_str()], Self::row_to_task)
            .ok()
            .into_iter()
            .flat_map(|mapped| mapped.filter_map(|item| item.ok()))
            .collect()
    }

    pub fn get_task(&self, identity: &SessionIdentity, task_id: &str) -> Option<AuditTask> {
        self.connect()
            .ok()?
            .query_row(
                "SELECT id, tenant_id, organization_id, project_id, scenario_id, scenario_name,
                        report_template_id, dataset_name, source_kind, source_label, status,
                        risk_level, total_transactions, report_json, transactions_summary_json,
                        findings_json, created_by, created_at, started_at, completed_at
                 FROM tasks
                 WHERE tenant_id = ?1 AND id = ?2",
                params![identity.tenant_id, task_id],
                Self::row_to_task,
            )
            .optional()
            .ok()
            .flatten()
    }

    pub fn update_finding_case(
        &self,
        identity: &SessionIdentity,
        task_id: &str,
        finding_case_id: &str,
        assignee: Option<String>,
        note: Option<String>,
        status: Option<FindingCaseStatus>,
    ) -> Result<AuditTask> {
        if !identity.role.can_run_audit() {
            anyhow::bail!("auditor role required");
        }
        let mut conn = self.connect()?;
        let tx = conn.transaction().context("failed to start transaction")?;
        let mut task = tx
            .query_row(
                "SELECT id, tenant_id, organization_id, project_id, scenario_id, scenario_name,
                        report_template_id, dataset_name, source_kind, source_label, status,
                        risk_level, total_transactions, report_json, transactions_summary_json,
                        findings_json, created_by, created_at, started_at, completed_at
                 FROM tasks
                 WHERE tenant_id = ?1 AND id = ?2",
                params![identity.tenant_id, task_id],
                Self::row_to_task,
            )
            .optional()
            .context("failed to query task")?
            .context("task not found")?;

        let finding_case = task
            .findings
            .iter_mut()
            .find(|item| item.id == finding_case_id)
            .context("finding case not found")?;
        if let Some(assignee) = assignee {
            finding_case.assignee = if assignee.trim().is_empty() {
                None
            } else {
                Some(assignee)
            };
        }
        if let Some(note) = note {
            finding_case.note = note;
        }
        if let Some(status) = status {
            finding_case.status = status;
        }
        finding_case.updated_at = now_string();

        tx.execute(
            "UPDATE tasks SET findings_json = ?2 WHERE id = ?1",
            params![task.id, serialize_json(&task.findings)?],
        )
        .context("failed to update finding workflow")?;
        self.insert_audit_log(
            &tx,
            &AuditLogEntry {
                id: Uuid::new_v4().to_string(),
                tenant_id: Some(identity.tenant_id.clone()),
                organization_id: Some(identity.organization_id.clone()),
                user_id: Some(identity.user_id.clone()),
                username: Some(identity.username.clone()),
                action: "audit.finding.update".to_string(),
                target_type: "finding_case".to_string(),
                target_id: finding_case_id.to_string(),
                outcome: "success".to_string(),
                detail: format!("Task {} finding workflow updated", task_id),
                created_at: now_string(),
            },
        )?;
        tx.commit().context("failed to commit finding update")?;
        Ok(task)
    }

    pub fn record_event(
        &self,
        identity: Option<&SessionIdentity>,
        action: &str,
        target_type: &str,
        target_id: &str,
        outcome: &str,
        detail: String,
    ) -> Result<()> {
        let mut conn = self.connect()?;
        let tx = conn.transaction().context("failed to start transaction")?;
        self.insert_audit_log(
            &tx,
            &AuditLogEntry {
                id: Uuid::new_v4().to_string(),
                tenant_id: identity.map(|actor| actor.tenant_id.clone()),
                organization_id: identity.map(|actor| actor.organization_id.clone()),
                user_id: identity.map(|actor| actor.user_id.clone()),
                username: identity.map(|actor| actor.username.clone()),
                action: action.to_string(),
                target_type: target_type.to_string(),
                target_id: target_id.to_string(),
                outcome: outcome.to_string(),
                detail,
                created_at: now_string(),
            },
        )?;
        tx.commit().context("failed to commit audit log")?;
        Ok(())
    }

    pub fn tenant_data_key(&self, tenant_id: &str) -> Option<Vec<u8>> {
        let encoded = self
            .connect()
            .ok()?
            .query_row(
                "SELECT data_key_b64 FROM tenants WHERE id = ?1",
                [tenant_id],
                |row| row.get::<_, String>(0),
            )
            .optional()
            .ok()
            .flatten()?;
        crate::encryption::decode_data_key(&encoded).ok()
    }

    pub fn record_rule_feedback(
        &self,
        identity: &SessionIdentity,
        input: RuleFeedbackInput,
    ) -> Result<()> {
        if !identity.role.can_run_audit() {
            anyhow::bail!("auditor role required");
        }
        let mut conn = self.connect()?;
        let tx = conn
            .transaction()
            .context("failed to start rule feedback transaction")?;
        let reviewed_at = now_string();
        tx.execute(
            "INSERT INTO rule_feedback (
                id, tenant_id, organization_id, task_id, finding_id, rule_code, scenario_id,
                rule_version, status, note, reviewed_by, reviewed_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
            params![
                Uuid::new_v4().to_string(),
                identity.tenant_id,
                identity.organization_id,
                input.task_id,
                input.finding_id,
                input.rule_code,
                input.scenario_id,
                input.rule_version,
                input.status.as_str(),
                input.note,
                identity.user_id,
                reviewed_at,
            ],
        )
        .context("failed to insert rule feedback")?;
        self.insert_audit_log(
            &tx,
            &AuditLogEntry {
                id: Uuid::new_v4().to_string(),
                tenant_id: Some(identity.tenant_id.clone()),
                organization_id: Some(identity.organization_id.clone()),
                user_id: Some(identity.user_id.clone()),
                username: Some(identity.username.clone()),
                action: "rule.feedback.record".to_string(),
                target_type: "finding".to_string(),
                target_id: input.finding_id.clone(),
                outcome: "success".to_string(),
                detail: format!(
                    "rule_code={} scenario={} version={} status={}",
                    input.rule_code,
                    input.scenario_id,
                    input.rule_version,
                    input.status.as_str()
                ),
                created_at: now_string(),
            },
        )?;
        tx.commit().context("failed to commit rule feedback")?;
        Ok(())
    }

    pub fn rule_feedback_stats(
        &self,
        identity: &SessionIdentity,
        rule_code: &str,
        scenario_id: &str,
        rule_version: &str,
    ) -> Result<RuleFeedbackStats> {
        let conn = self.connect()?;
        let mut statement = conn
            .prepare(
                "SELECT status, COUNT(*)
                 FROM rule_feedback
                 WHERE tenant_id = ?1
                   AND rule_code = ?2
                   AND scenario_id = ?3
                   AND rule_version = ?4
                 GROUP BY status",
            )
            .context("failed to prepare rule feedback stats query")?;
        let rows = statement
            .query_map(
                params![identity.tenant_id, rule_code, scenario_id, rule_version],
                |row| Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)? as usize)),
            )
            .context("failed to query rule feedback stats")?;
        let mut true_positive_hits = 0usize;
        let mut false_positive_hits = 0usize;
        let mut needs_review_hits = 0usize;
        for row in rows {
            let (status, count) = row.context("failed to read rule feedback stats row")?;
            match status.as_str() {
                "true_positive" => true_positive_hits = count,
                "false_positive" => false_positive_hits = count,
                "needs_review" => needs_review_hits = count,
                _ => {}
            }
        }
        let reviewed_hits = true_positive_hits + false_positive_hits;
        let false_positive_rate = if reviewed_hits == 0 {
            0.0
        } else {
            false_positive_hits as f64 / reviewed_hits as f64
        };
        Ok(RuleFeedbackStats {
            rule_code: rule_code.to_string(),
            scenario_id: scenario_id.to_string(),
            rule_version: rule_version.to_string(),
            reviewed_hits,
            false_positive_hits,
            true_positive_hits,
            needs_review_hits,
            false_positive_rate,
        })
    }

    pub fn list_audit_logs(&self, identity: &SessionIdentity) -> Vec<AuditLogEntry> {
        let conn = match self.connect() {
            Ok(conn) => conn,
            Err(_) => return Vec::new(),
        };
        let mut statement = match conn.prepare(
            "SELECT id, tenant_id, organization_id, user_id, username, action, target_type,
                    target_id, outcome, detail, created_at
             FROM audit_logs
             WHERE tenant_id = ?1
             ORDER BY created_at DESC
             LIMIT 200",
        ) {
            Ok(statement) => statement,
            Err(_) => return Vec::new(),
        };
        statement
            .query_map([identity.tenant_id.as_str()], Self::row_to_audit_log)
            .ok()
            .into_iter()
            .flat_map(|mapped| mapped.filter_map(|item| item.ok()))
            .collect()
    }

    pub fn export_audit_review_package(
        &self,
        identity: &SessionIdentity,
    ) -> Result<AuditReviewPackage> {
        if identity.role != UserRole::Admin {
            anyhow::bail!("admin role required");
        }
        let conn = self.connect()?;
        let mut statement = conn
            .prepare(
                "SELECT id, tenant_id, organization_id, user_id, username, action, target_type,
                        target_id, outcome, detail, created_at
                 FROM audit_logs
                 WHERE tenant_id = ?1
                 ORDER BY created_at ASC",
            )
            .context("failed to prepare audit review export query")?;
        let logs = statement
            .query_map([identity.tenant_id.as_str()], Self::row_to_audit_log)
            .context("failed to query audit review export")?
            .filter_map(|row| row.ok())
            .collect::<Vec<_>>();

        let jsonl = logs
            .iter()
            .map(|entry| {
                serde_json::json!({
                    "event_id": entry.id,
                    "who": {
                        "user_id": entry.user_id,
                        "username": entry.username,
                        "organization_id": entry.organization_id,
                        "tenant_id": entry.tenant_id,
                    },
                    "when": entry.created_at,
                    "what_data": {
                        "target_type": entry.target_type,
                        "target_id": entry.target_id,
                    },
                    "what_action": {
                        "action": entry.action,
                        "outcome": entry.outcome,
                        "detail": entry.detail,
                    },
                })
                .to_string()
            })
            .collect::<Vec<_>>()
            .join("\n");
        let jsonl = if jsonl.is_empty() {
            String::new()
        } else {
            format!("{jsonl}\n")
        };

        let mut csv =
            "event_id,who,when,action,target_type,target_id,outcome,detail\n".to_string();
        for entry in &logs {
            csv.push_str(&format!(
                "{},{},{},{},{},{},{},{}\n",
                audit_csv_escape(&entry.id),
                audit_csv_escape(entry.username.as_deref().unwrap_or("")),
                audit_csv_escape(&entry.created_at),
                audit_csv_escape(&entry.action),
                audit_csv_escape(&entry.target_type),
                audit_csv_escape(&entry.target_id),
                audit_csv_escape(&entry.outcome),
                audit_csv_escape(&entry.detail),
            ));
        }

        let jsonl_checksum = sha256_hex(jsonl.as_bytes());
        let csv_checksum = sha256_hex(csv.as_bytes());
        let manifest = serde_json::json!({
            "format_version": "audit-review-package-v1",
            "tenant_id": identity.tenant_id,
            "generated_by": identity.username,
            "generated_at": now_string(),
            "event_count": logs.len(),
            "files": [
                {
                    "name": "audit-log.jsonl",
                    "media_type": "application/x-ndjson",
                    "sha256": jsonl_checksum,
                    "records": logs.len(),
                },
                {
                    "name": "audit-log.csv",
                    "media_type": "text/csv",
                    "sha256": csv_checksum,
                    "records": logs.len(),
                }
            ],
        });
        let manifest_json = serde_json::to_string_pretty(&manifest)
            .context("failed to serialize audit review manifest")?;
        let package_checksum_sha256 =
            sha256_hex(format!("{jsonl}\n{csv}\n{manifest_json}").as_bytes());

        Ok(AuditReviewPackage {
            jsonl,
            csv,
            manifest_json,
            package_checksum_sha256,
        })
    }

    pub fn scenario_config(&self, scenario_id: &str) -> Result<AuditConfig> {
        let mut config = crate::load_config(None)?;
        match scenario_id {
            "fiscal-supervision" => {
                if let Some(ref mut rules) = config.rules {
                    rules.threshold.get_or_insert(ThresholdConfig {
                        enabled: true,
                        amount_threshold: Some("200000.00".to_string()),
                    });
                    rules.round_amount.get_or_insert(RoundAmountConfig {
                        enabled: true,
                        count_threshold: Some(3),
                    });
                }
            }
            "state-owned-capital" => {
                if let Some(ref mut anomaly) = config.anomaly {
                    anomaly.zscore_threshold = Some(2.5);
                } else {
                    config.anomaly = Some(AnomalyConfig {
                        enabled: true,
                        zscore_threshold: Some(2.5),
                        group_by_account: Some(true),
                    });
                }
            }
            "procurement-expense" => {
                if let Some(ref mut rules) = config.rules {
                    rules.threshold = Some(ThresholdConfig {
                        enabled: true,
                        amount_threshold: Some("80000.00".to_string()),
                    });
                    rules.round_amount = Some(RoundAmountConfig {
                        enabled: true,
                        count_threshold: Some(2),
                    });
                } else {
                    config.rules = Some(RulesConfig {
                        balance_check: None,
                        threshold: Some(ThresholdConfig {
                            enabled: true,
                            amount_threshold: Some("80000.00".to_string()),
                        }),
                        duplicate: None,
                        date_continuity: None,
                        account_compliance: None,
                        round_amount: Some(RoundAmountConfig {
                            enabled: true,
                            count_threshold: Some(2),
                        }),
                    });
                }
            }
            _ => {}
        }
        Ok(config)
    }

    pub fn resolve_report_template(&self, template_id: &str) -> Option<ReportTemplate> {
        default_report_templates()
            .into_iter()
            .find(|item| item.id == template_id && item.active)
    }

    pub fn resolve_data_source(
        &self,
        identity: &SessionIdentity,
        template_id: &str,
        table: Option<&str>,
    ) -> Result<DataSourceTemplate> {
        if identity.role == UserRole::Viewer {
            anyhow::bail!("viewer cannot connect data sources");
        }
        let template = default_data_sources()
            .into_iter()
            .find(|item| item.id == template_id && item.active)
            .context("data source template not found")?;
        if let Some(table_name) = table {
            if !template.allowed_tables.is_empty()
                && !template
                    .allowed_tables
                    .iter()
                    .any(|allowed| allowed == table_name)
            {
                anyhow::bail!("table is not whitelisted by this data source template");
            }
        }
        Ok(template)
    }

    pub(super) fn connect(&self) -> Result<Connection> {
        let conn = Connection::open(&self.db_path)
            .with_context(|| format!("failed to open {}", self.db_path.display()))?;
        conn.busy_timeout(Duration::from_secs(5))
            .context("failed to configure sqlite busy timeout")?;
        conn.pragma_update(None, "foreign_keys", "ON")
            .context("failed to enable foreign keys")?;
        Ok(conn)
    }

    fn initialize_schema(conn: &mut Connection) -> Result<()> {
        conn.execute_batch(
            "
            CREATE TABLE IF NOT EXISTS tenants (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                deployment_mode TEXT NOT NULL,
                data_key_b64 TEXT NOT NULL,
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS organizations (
                id TEXT PRIMARY KEY,
                tenant_id TEXT NOT NULL,
                name TEXT NOT NULL,
                kind TEXT NOT NULL,
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                tenant_id TEXT NOT NULL,
                organization_id TEXT NOT NULL,
                username TEXT NOT NULL,
                password_hash TEXT NOT NULL,
                display_name TEXT NOT NULL,
                role TEXT NOT NULL,
                active INTEGER NOT NULL,
                must_change_password INTEGER NOT NULL,
                created_at TEXT NOT NULL,
                last_login_at TEXT
            );
            CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username_nocase
                ON users(lower(username));
            CREATE TABLE IF NOT EXISTS projects (
                id TEXT PRIMARY KEY,
                tenant_id TEXT NOT NULL,
                organization_id TEXT NOT NULL,
                name TEXT NOT NULL,
                scenario_id TEXT NOT NULL,
                description TEXT NOT NULL,
                created_by TEXT NOT NULL,
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS tasks (
                id TEXT PRIMARY KEY,
                tenant_id TEXT NOT NULL,
                organization_id TEXT NOT NULL,
                project_id TEXT NOT NULL,
                scenario_id TEXT NOT NULL,
                scenario_name TEXT NOT NULL,
                report_template_id TEXT NOT NULL,
                dataset_name TEXT NOT NULL,
                source_kind TEXT NOT NULL,
                source_label TEXT NOT NULL,
                status TEXT NOT NULL,
                risk_level TEXT NOT NULL,
                total_transactions INTEGER NOT NULL,
                report_json TEXT NOT NULL,
                transactions_summary_json TEXT NOT NULL,
                findings_json TEXT NOT NULL,
                created_by TEXT NOT NULL,
                created_at TEXT NOT NULL,
                started_at TEXT NOT NULL,
                completed_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS audit_logs (
                id TEXT PRIMARY KEY,
                tenant_id TEXT,
                organization_id TEXT,
                user_id TEXT,
                username TEXT,
                action TEXT NOT NULL,
                target_type TEXT NOT NULL,
                target_id TEXT NOT NULL,
                outcome TEXT NOT NULL,
                detail TEXT NOT NULL,
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS rule_feedback (
                id TEXT PRIMARY KEY,
                tenant_id TEXT NOT NULL,
                organization_id TEXT NOT NULL,
                task_id TEXT NOT NULL,
                finding_id TEXT NOT NULL,
                rule_code TEXT NOT NULL,
                scenario_id TEXT NOT NULL,
                rule_version TEXT NOT NULL,
                status TEXT NOT NULL,
                note TEXT,
                reviewed_by TEXT NOT NULL,
                reviewed_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_rule_feedback_stats
                ON rule_feedback(tenant_id, rule_code, scenario_id, rule_version, status);
            CREATE TABLE IF NOT EXISTS ai_profile (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                provider TEXT NOT NULL,
                api_url TEXT NOT NULL,
                model TEXT NOT NULL,
                api_key TEXT NOT NULL,
                enabled INTEGER NOT NULL,
                guidance TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS lead_requests (
                id TEXT PRIMARY KEY,
                contact_name TEXT NOT NULL,
                contact_channel TEXT NOT NULL,
                unit_type TEXT NOT NULL,
                department TEXT NOT NULL,
                audit_scenario TEXT NOT NULL,
                deployment_preference TEXT NOT NULL,
                involves_real_data INTEGER NOT NULL,
                ai_expectation TEXT NOT NULL,
                note TEXT NOT NULL,
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS evidence_artifacts (
                id TEXT PRIMARY KEY,
                task_id TEXT NOT NULL,
                tenant_id TEXT NOT NULL,
                organization_id TEXT NOT NULL,
                artifact_type TEXT NOT NULL,
                source_filename TEXT NOT NULL,
                mime_type TEXT NOT NULL,
                storage_path TEXT NOT NULL,
                transcript_text TEXT NOT NULL,
                structured_summary_json TEXT NOT NULL,
                status TEXT NOT NULL,
                error_message TEXT,
                created_by TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            ",
        )
        .context("failed to initialize sqlite schema")?;
        Ok(())
    }

    fn import_legacy_state_if_needed(&self, conn: &mut Connection, data_dir: &Path) -> Result<()> {
        let legacy_path = data_dir.join("platform_state.json");
        if !legacy_path.exists() || !self.is_empty(conn)? {
            return Ok(());
        }
        let raw = fs::read_to_string(&legacy_path)
            .with_context(|| format!("failed to read {}", legacy_path.display()))?;
        let state: PlatformState =
            serde_json::from_str(&raw).context("failed to parse legacy platform state")?;
        let tx = conn
            .transaction()
            .context("failed to start migration transaction")?;
        for tenant in &state.tenants {
            self.insert_tenant(&tx, tenant)?;
        }
        for organization in &state.organizations {
            self.insert_organization(&tx, organization)?;
        }
        for user in &state.users {
            self.insert_user(&tx, user)?;
        }
        for project in &state.projects {
            self.insert_project(&tx, project)?;
        }
        for task in &state.tasks {
            self.insert_task(&tx, task)?;
        }
        for artifact in &state.evidence_artifacts {
            self.insert_evidence_artifact(&tx, artifact)?;
        }
        for log in &state.audit_logs {
            self.insert_audit_log(&tx, log)?;
        }
        self.upsert_ai_profile(&tx, &state.ai_profile)?;
        tx.commit().context("failed to commit legacy migration")?;

        let migrated_path = data_dir.join("platform_state.migrated.json");
        if migrated_path.exists() {
            fs::remove_file(&migrated_path)
                .with_context(|| format!("failed to remove {}", migrated_path.display()))?;
        }
        fs::rename(&legacy_path, &migrated_path).with_context(|| {
            format!(
                "failed to rename {} to {}",
                legacy_path.display(),
                migrated_path.display()
            )
        })?;
        Ok(())
    }

    fn ensure_ai_profile(&self) -> Result<()> {
        let mut conn = self.connect()?;
        let tx = conn
            .transaction()
            .context("failed to start ai profile transaction")?;
        self.upsert_ai_profile(&tx, &AiServiceProfile::default())?;
        tx.commit().context("failed to commit ai profile seed")?;
        Ok(())
    }

    fn repair_question_mark_demo_names(&self) -> Result<()> {
        let conn = self.connect()?;
        Self::repair_question_mark_column(
            &conn,
            "SELECT id, name FROM tenants",
            "UPDATE tenants SET name = ?1 WHERE id = ?2",
            "财政监督演示租户",
        )?;
        Self::repair_question_mark_column(
            &conn,
            "SELECT id, name FROM organizations",
            "UPDATE organizations SET name = ?1 WHERE id = ?2",
            "财政监督演示机构",
        )?;
        Self::repair_question_mark_column(
            &conn,
            "SELECT id, display_name FROM users",
            "UPDATE users SET display_name = ?1 WHERE id = ?2",
            "管理员",
        )?;
        Self::repair_question_mark_column(
            &conn,
            "SELECT id, name FROM projects",
            "UPDATE projects SET name = ?1 WHERE id = ?2",
            "财政监督演示任务",
        )?;
        Self::repair_question_mark_column(
            &conn,
            "SELECT id, dataset_name FROM tasks",
            "UPDATE tasks SET dataset_name = ?1 WHERE id = ?2",
            "财政监督脱敏样例",
        )?;
        Ok(())
    }

    fn repair_question_mark_column(
        conn: &Connection,
        select_sql: &str,
        update_sql: &str,
        replacement: &str,
    ) -> Result<()> {
        let ids = {
            let mut statement = conn
                .prepare(select_sql)
                .with_context(|| format!("failed to prepare repair query: {}", select_sql))?;
            let rows = statement
                .query_map([], |row| {
                    Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
                })
                .context("failed to scan repair candidates")?;
            rows.filter_map(|row| match row {
                Ok((id, value)) if is_question_mark_placeholder(&value) => Some(Ok(id)),
                Ok(_) => None,
                Err(error) => Some(Err(error)),
            })
            .collect::<std::result::Result<Vec<_>, _>>()
            .context("failed to collect repair candidates")?
        };

        for id in ids {
            conn.execute(update_sql, params![replacement, id])
                .with_context(|| format!("failed to execute repair update: {}", update_sql))?;
        }
        Ok(())
    }

    fn is_empty(&self, conn: &Connection) -> Result<bool> {
        let count = conn
            .query_row("SELECT COUNT(*) FROM tenants", [], |row| {
                row.get::<_, i64>(0)
            })
            .context("failed to count tenants")?;
        Ok(count == 0)
    }

    fn ensure_unique_username(&self, tx: &Transaction<'_>, username: &str) -> Result<()> {
        let exists = tx
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM users WHERE lower(username) = lower(?1))",
                [username.trim()],
                |row| row.get::<_, i64>(0),
            )
            .context("failed to check username")?;
        if exists == 1 {
            anyhow::bail!("username already exists");
        }
        Ok(())
    }

    fn project_exists(&self, tx: &Transaction<'_>, project_id: &str) -> Result<bool> {
        let exists = tx
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM projects WHERE id = ?1)",
                [project_id],
                |row| row.get::<_, i64>(0),
            )
            .context("failed to check project")?;
        Ok(exists == 1)
    }

    fn tenant_name(&self, tenant_id: &str) -> String {
        self.connect()
            .ok()
            .and_then(|conn| {
                conn.query_row(
                    "SELECT name FROM tenants WHERE id = ?1",
                    [tenant_id],
                    |row| row.get::<_, String>(0),
                )
                .optional()
                .ok()
                .flatten()
            })
            .unwrap_or_else(|| "Unknown tenant".to_string())
    }

    fn insert_tenant(&self, tx: &Transaction<'_>, tenant: &Tenant) -> Result<()> {
        tx.execute(
            "INSERT INTO tenants (id, name, deployment_mode, data_key_b64, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![
                tenant.id,
                tenant.name,
                tenant.deployment_mode,
                tenant.data_key_b64,
                tenant.created_at
            ],
        )
        .context("failed to insert tenant")?;
        Ok(())
    }

    fn insert_organization(&self, tx: &Transaction<'_>, organization: &Organization) -> Result<()> {
        tx.execute(
            "INSERT INTO organizations (id, tenant_id, name, kind, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![
                organization.id,
                organization.tenant_id,
                organization.name,
                organization.kind,
                organization.created_at
            ],
        )
        .context("failed to insert organization")?;
        Ok(())
    }

    fn insert_user(&self, tx: &Transaction<'_>, user: &UserAccount) -> Result<()> {
        tx.execute(
            "INSERT INTO users (
                id, tenant_id, organization_id, username, password_hash, display_name, role,
                active, must_change_password, created_at, last_login_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
            params![
                user.id,
                user.tenant_id,
                user.organization_id,
                user.username,
                user.password_hash,
                user.display_name,
                user.role.to_string(),
                bool_to_int(user.active),
                bool_to_int(user.must_change_password),
                user.created_at,
                user.last_login_at
            ],
        )
        .context("failed to insert user")?;
        Ok(())
    }

    fn insert_project(&self, tx: &Transaction<'_>, project: &ProjectRecord) -> Result<()> {
        tx.execute(
            "INSERT INTO projects (
                id, tenant_id, organization_id, name, scenario_id, description, created_by, created_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                project.id,
                project.tenant_id,
                project.organization_id,
                project.name,
                project.scenario_id,
                project.description,
                project.created_by,
                project.created_at
            ],
        )
        .context("failed to insert project")?;
        Ok(())
    }

    fn insert_task(&self, tx: &Transaction<'_>, task: &AuditTask) -> Result<()> {
        tx.execute(
            "INSERT INTO tasks (
                id, tenant_id, organization_id, project_id, scenario_id, scenario_name,
                report_template_id, dataset_name, source_kind, source_label, status, risk_level,
                total_transactions, report_json, transactions_summary_json, findings_json,
                created_by, created_at, started_at, completed_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20)",
            params![
                task.id,
                task.tenant_id,
                task.organization_id,
                task.project_id,
                task.scenario_id,
                task.scenario_name,
                task.report_template_id,
                task.dataset_name,
                task.source_kind,
                task.source_label,
                task_status_to_str(&task.status),
                task.risk_level,
                task.total_transactions as i64,
                serialize_json(&task.report)?,
                serialize_json(&task.transactions_summary)?,
                serialize_json(&task.findings)?,
                task.created_by,
                task.created_at,
                task.started_at,
                task.completed_at
            ],
        )
        .context("failed to insert task")?;
        Ok(())
    }

    pub(crate) fn insert_audit_log(
        &self,
        tx: &Transaction<'_>,
        entry: &AuditLogEntry,
    ) -> Result<()> {
        tx.execute(
            "INSERT INTO audit_logs (
                id, tenant_id, organization_id, user_id, username, action, target_type,
                target_id, outcome, detail, created_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
            params![
                entry.id,
                entry.tenant_id,
                entry.organization_id,
                entry.user_id,
                entry.username,
                entry.action,
                entry.target_type,
                entry.target_id,
                entry.outcome,
                entry.detail,
                entry.created_at
            ],
        )
        .context("failed to insert audit log")?;
        Ok(())
    }

    fn upsert_ai_profile(&self, tx: &Transaction<'_>, profile: &AiServiceProfile) -> Result<()> {
        tx.execute(
            "INSERT INTO ai_profile (id, provider, api_url, model, api_key, enabled, guidance)
             VALUES (1, ?1, ?2, ?3, ?4, ?5, ?6)
             ON CONFLICT(id) DO UPDATE SET
                provider = excluded.provider,
                api_url = excluded.api_url,
                model = excluded.model,
                api_key = excluded.api_key,
                enabled = excluded.enabled,
                guidance = excluded.guidance",
            params![
                profile.provider,
                profile.api_url,
                profile.model,
                "",
                bool_to_int(profile.enabled),
                profile.guidance
            ],
        )
        .context("failed to upsert ai profile")?;
        Ok(())
    }

    fn clear_deprecated_ai_secrets(&self) -> Result<()> {
        let conn = self.connect()?;
        conn.execute("UPDATE ai_profile SET api_key = '' WHERE api_key <> ''", [])
            .context("failed to clear deprecated ai secrets")?;
        Ok(())
    }

    fn insert_lead_request(&self, tx: &Transaction<'_>, request: &LeadRequest) -> Result<()> {
        tx.execute(
            "INSERT INTO lead_requests (
                id, contact_name, contact_channel, unit_type, department, audit_scenario,
                deployment_preference, involves_real_data, ai_expectation, note, created_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
            params![
                request.id,
                request.contact_name,
                request.contact_channel,
                request.unit_type,
                request.department,
                request.audit_scenario,
                request.deployment_preference,
                bool_to_int(request.involves_real_data),
                request.ai_expectation,
                request.note,
                request.created_at
            ],
        )
        .context("failed to insert lead request")?;
        Ok(())
    }

    fn insert_evidence_artifact(
        &self,
        tx: &Transaction<'_>,
        artifact: &EvidenceArtifact,
    ) -> Result<()> {
        tx.execute(
            "INSERT INTO evidence_artifacts (
                id, task_id, tenant_id, organization_id, artifact_type, source_filename,
                mime_type, storage_path, transcript_text, structured_summary_json, status,
                error_message, created_by, created_at, updated_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)",
            params![
                artifact.id,
                artifact.task_id,
                artifact.tenant_id,
                artifact.organization_id,
                artifact_type_to_str(&artifact.artifact_type),
                artifact.source_filename,
                artifact.mime_type,
                artifact.storage_path,
                artifact.transcript_text,
                serialize_json(&artifact.structured_summary)?,
                artifact_status_to_str(&artifact.status),
                artifact.error_message,
                artifact.created_by,
                artifact.created_at,
                artifact.updated_at
            ],
        )
        .context("failed to insert evidence artifact")?;
        Ok(())
    }

    fn row_to_user(row: &Row<'_>) -> rusqlite::Result<UserAccount> {
        Ok(UserAccount {
            id: row.get(0)?,
            tenant_id: row.get(1)?,
            organization_id: row.get(2)?,
            username: row.get(3)?,
            password_hash: row.get(4)?,
            display_name: row.get(5)?,
            role: parse_role(row.get::<_, String>(6)?)?,
            active: int_to_bool(row.get::<_, i64>(7)?),
            must_change_password: int_to_bool(row.get::<_, i64>(8)?),
            created_at: row.get(9)?,
            last_login_at: row.get(10)?,
        })
    }

    fn row_to_organization(row: &Row<'_>) -> rusqlite::Result<Organization> {
        Ok(Organization {
            id: row.get(0)?,
            tenant_id: row.get(1)?,
            name: row.get(2)?,
            kind: row.get(3)?,
            created_at: row.get(4)?,
        })
    }

    fn row_to_project(row: &Row<'_>) -> rusqlite::Result<ProjectRecord> {
        Ok(ProjectRecord {
            id: row.get(0)?,
            tenant_id: row.get(1)?,
            organization_id: row.get(2)?,
            name: row.get(3)?,
            scenario_id: row.get(4)?,
            description: row.get(5)?,
            created_by: row.get(6)?,
            created_at: row.get(7)?,
        })
    }

    fn row_to_task(row: &Row<'_>) -> rusqlite::Result<AuditTask> {
        let report_json: String = row.get(13)?;
        let summary_json: String = row.get(14)?;
        let findings_json: String = row.get(15)?;
        Ok(AuditTask {
            id: row.get(0)?,
            tenant_id: row.get(1)?,
            organization_id: row.get(2)?,
            project_id: row.get(3)?,
            scenario_id: row.get(4)?,
            scenario_name: row.get(5)?,
            report_template_id: row.get(6)?,
            dataset_name: row.get(7)?,
            source_kind: row.get(8)?,
            source_label: row.get(9)?,
            status: parse_task_status(row.get::<_, String>(10)?)?,
            risk_level: row.get(11)?,
            total_transactions: row.get::<_, i64>(12)? as usize,
            report: deserialize_json(13, &report_json)?,
            transactions_summary: deserialize_json(14, &summary_json)?,
            findings: deserialize_json(15, &findings_json)?,
            created_by: row.get(16)?,
            created_at: row.get(17)?,
            started_at: row.get(18)?,
            completed_at: row.get(19)?,
        })
    }

    fn row_to_audit_log(row: &Row<'_>) -> rusqlite::Result<AuditLogEntry> {
        Ok(AuditLogEntry {
            id: row.get(0)?,
            tenant_id: row.get(1)?,
            organization_id: row.get(2)?,
            user_id: row.get(3)?,
            username: row.get(4)?,
            action: row.get(5)?,
            target_type: row.get(6)?,
            target_id: row.get(7)?,
            outcome: row.get(8)?,
            detail: row.get(9)?,
            created_at: row.get(10)?,
        })
    }

    fn row_to_lead_request(row: &Row<'_>) -> rusqlite::Result<LeadRequest> {
        Ok(LeadRequest {
            id: row.get(0)?,
            contact_name: row.get(1)?,
            contact_channel: row.get(2)?,
            unit_type: row.get(3)?,
            department: row.get(4)?,
            audit_scenario: row.get(5)?,
            deployment_preference: row.get(6)?,
            involves_real_data: int_to_bool(row.get::<_, i64>(7)?),
            ai_expectation: row.get(8)?,
            note: row.get(9)?,
            created_at: row.get(10)?,
        })
    }

    fn row_to_evidence_artifact(row: &Row<'_>) -> rusqlite::Result<EvidenceArtifact> {
        let summary_json: String = row.get(9)?;
        Ok(EvidenceArtifact {
            id: row.get(0)?,
            task_id: row.get(1)?,
            tenant_id: row.get(2)?,
            organization_id: row.get(3)?,
            artifact_type: parse_artifact_type(row.get::<_, String>(4)?)?,
            source_filename: row.get(5)?,
            mime_type: row.get(6)?,
            storage_path: row.get(7)?,
            transcript_text: row.get(8)?,
            structured_summary: deserialize_json(9, &summary_json)?,
            status: parse_artifact_status(row.get::<_, String>(10)?)?,
            error_message: row.get(11)?,
            created_by: row.get(12)?,
            created_at: row.get(13)?,
            updated_at: row.get(14)?,
        })
    }
}

fn serialize_json<T: Serialize>(value: &T) -> Result<String> {
    serde_json::to_string(value).context("failed to serialize json")
}

fn sha256_hex(bytes: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    format!("{:x}", hasher.finalize())
}

fn audit_csv_escape(value: &str) -> String {
    let escaped = value.replace('"', "\"\"");
    format!("\"{}\"", escaped)
}

fn deserialize_json<T: DeserializeOwned>(index: usize, raw: &str) -> rusqlite::Result<T> {
    serde_json::from_str(raw).map_err(|error| {
        rusqlite::Error::FromSqlConversionFailure(index, Type::Text, Box::new(error))
    })
}

fn parse_role(value: String) -> rusqlite::Result<UserRole> {
    value.parse::<UserRole>().map_err(|error| {
        rusqlite::Error::FromSqlConversionFailure(
            0,
            Type::Text,
            Box::new(std::io::Error::new(std::io::ErrorKind::InvalidData, error)),
        )
    })
}

fn parse_task_status(value: String) -> rusqlite::Result<TaskStatus> {
    match value.as_str() {
        "Pending" => Ok(TaskStatus::Pending),
        "Running" => Ok(TaskStatus::Running),
        "Completed" => Ok(TaskStatus::Completed),
        "Failed" => Ok(TaskStatus::Failed),
        "Archived" => Ok(TaskStatus::Archived),
        other => Err(rusqlite::Error::FromSqlConversionFailure(
            0,
            Type::Text,
            Box::new(std::io::Error::new(
                std::io::ErrorKind::InvalidData,
                format!("invalid task status {}", other),
            )),
        )),
    }
}

fn task_status_to_str(value: &TaskStatus) -> &'static str {
    match value {
        TaskStatus::Pending => "Pending",
        TaskStatus::Running => "Running",
        TaskStatus::Completed => "Completed",
        TaskStatus::Failed => "Failed",
        TaskStatus::Archived => "Archived",
    }
}

fn parse_artifact_type(value: String) -> rusqlite::Result<ArtifactType> {
    match value.as_str() {
        "image" => Ok(ArtifactType::Image),
        "audio" => Ok(ArtifactType::Audio),
        other => Err(rusqlite::Error::FromSqlConversionFailure(
            0,
            Type::Text,
            Box::new(std::io::Error::new(
                std::io::ErrorKind::InvalidData,
                format!("invalid artifact type {}", other),
            )),
        )),
    }
}

fn artifact_type_to_str(value: &ArtifactType) -> &'static str {
    match value {
        ArtifactType::Image => "image",
        ArtifactType::Audio => "audio",
    }
}

fn parse_artifact_status(value: String) -> rusqlite::Result<ArtifactStatus> {
    match value.as_str() {
        "Processing" => Ok(ArtifactStatus::Processing),
        "Completed" => Ok(ArtifactStatus::Completed),
        "Failed" => Ok(ArtifactStatus::Failed),
        other => Err(rusqlite::Error::FromSqlConversionFailure(
            0,
            Type::Text,
            Box::new(std::io::Error::new(
                std::io::ErrorKind::InvalidData,
                format!("invalid artifact status {}", other),
            )),
        )),
    }
}

fn artifact_status_to_str(value: &ArtifactStatus) -> &'static str {
    match value {
        ArtifactStatus::Processing => "Processing",
        ArtifactStatus::Completed => "Completed",
        ArtifactStatus::Failed => "Failed",
    }
}

fn bool_to_int(value: bool) -> i64 {
    if value {
        1
    } else {
        0
    }
}

fn int_to_bool(value: i64) -> bool {
    value != 0
}

fn is_question_mark_placeholder(value: &str) -> bool {
    let trimmed = value.trim();
    !trimmed.is_empty() && trimmed.chars().all(|character| character == '?')
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn registers_first_tenant_admin() {
        let tmp = tempfile::tempdir().unwrap();
        let store = PlatformStore::load_or_create(tmp.path()).unwrap();
        let profile = store
            .register_tenant_admin(RegistrationInput {
                tenant_name: "Tenant A".to_string(),
                organization_name: "Org A".to_string(),
                username: "admin_a".to_string(),
                password: "Admin123".to_string(),
                display_name: "Alice".to_string(),
            })
            .unwrap();
        assert_eq!(profile.role, UserRole::Admin);
        assert!(store.has_users());
    }

    #[test]
    fn migrates_legacy_json_state() {
        let tmp = tempfile::tempdir().unwrap();
        let data_dir = tmp.path().join("data");
        fs::create_dir_all(&data_dir).unwrap();

        let tenant = Tenant {
            id: "tenant-1".to_string(),
            name: "Tenant A".to_string(),
            deployment_mode: "public-cloud-saas".to_string(),
            data_key_b64: crate::encryption::generate_data_key(),
            created_at: now_string(),
        };
        let organization = Organization {
            id: "org-1".to_string(),
            tenant_id: tenant.id.clone(),
            name: "Org A".to_string(),
            kind: "regulator".to_string(),
            created_at: now_string(),
        };
        let user = UserAccount {
            id: "user-1".to_string(),
            tenant_id: tenant.id.clone(),
            organization_id: organization.id.clone(),
            username: "admin_a".to_string(),
            password_hash: bcrypt::hash("Admin123", bcrypt::DEFAULT_COST).unwrap(),
            display_name: "Alice".to_string(),
            role: UserRole::Admin,
            active: true,
            must_change_password: false,
            created_at: now_string(),
            last_login_at: None,
        };
        let state = PlatformState {
            tenants: vec![tenant],
            organizations: vec![organization],
            users: vec![user],
            projects: Vec::new(),
            tasks: Vec::new(),
            evidence_artifacts: Vec::new(),
            scenarios: default_scenarios(),
            report_templates: default_report_templates(),
            data_sources: default_data_sources(),
            audit_logs: Vec::new(),
            ai_profile: AiServiceProfile::default(),
        };
        fs::write(
            data_dir.join("platform_state.json"),
            serde_json::to_vec_pretty(&state).unwrap(),
        )
        .unwrap();

        let store = PlatformStore::load_or_create(tmp.path()).unwrap();
        assert!(store.has_users());
        assert!(data_dir.join("platform.db").exists());
        assert!(data_dir.join("platform_state.migrated.json").exists());
    }

    #[test]
    fn stores_evidence_artifacts() {
        let tmp = tempfile::tempdir().unwrap();
        let store = PlatformStore::load_or_create(tmp.path()).unwrap();
        let admin = store
            .register_tenant_admin(RegistrationInput {
                tenant_name: "Tenant A".to_string(),
                organization_name: "Org A".to_string(),
                username: "admin_a".to_string(),
                password: "Admin123".to_string(),
                display_name: "Alice".to_string(),
            })
            .unwrap();
        let identity = SessionIdentity {
            user_id: admin.id.clone(),
            tenant_id: admin.tenant_id.clone(),
            organization_id: admin.organization_id.clone(),
            username: admin.username.clone(),
            display_name: admin.display_name.clone(),
            role: admin.role.clone(),
        };
        let report = crate::models::AuditReport::new(
            1,
            rust_decimal::Decimal::ZERO,
            rust_decimal::Decimal::ZERO,
        );
        let task = store
            .record_task(
                &identity,
                CompletedTaskInput {
                    scenario_id: "fiscal-supervision".to_string(),
                    project_name: "Test Project".to_string(),
                    dataset_name: "Test Dataset".to_string(),
                    source_kind: "demo".to_string(),
                    source_label: "demo".to_string(),
                    report_template_id: "gov-standard".to_string(),
                    report,
                    transactions_summary: Vec::new(),
                },
            )
            .unwrap();

        let artifact = store
            .create_evidence_artifact(
                &identity,
                &task.id,
                NewEvidenceArtifactInput {
                    id: "artifact-1".to_string(),
                    artifact_type: ArtifactType::Image,
                    source_filename: "receipt.png".to_string(),
                    mime_type: "image/png".to_string(),
                    storage_path: "data/evidence/test.png".to_string(),
                    transcript_text: "票据全文".to_string(),
                    structured_summary: ArtifactStructuredSummary::Image {
                        data: crate::platform::ImageArtifactSummary {
                            document_type: Some("财政票据".to_string()),
                            ..Default::default()
                        },
                    },
                    status: ArtifactStatus::Completed,
                    error_message: None,
                },
            )
            .unwrap();

        let artifacts = store.list_evidence_artifacts(&identity, &task.id);
        assert_eq!(artifacts.len(), 1);
        assert_eq!(artifacts[0].id, artifact.id);
    }

    #[test]
    fn repairs_question_mark_demo_names_without_overwriting_custom_values() {
        let tmp = tempfile::tempdir().unwrap();
        let store = PlatformStore::load_or_create(tmp.path()).unwrap();
        let admin = store
            .register_tenant_admin(RegistrationInput {
                tenant_name: "?".repeat(5),
                organization_name: "?".repeat(4),
                username: "admin_a".to_string(),
                password: "Admin123".to_string(),
                display_name: "?".repeat(3),
            })
            .unwrap();
        let identity = SessionIdentity {
            user_id: admin.id.clone(),
            tenant_id: admin.tenant_id.clone(),
            organization_id: admin.organization_id.clone(),
            username: admin.username.clone(),
            display_name: admin.display_name.clone(),
            role: admin.role.clone(),
        };
        store
            .record_task(
                &identity,
                CompletedTaskInput {
                    scenario_id: "fiscal-supervision".to_string(),
                    project_name: "?".repeat(6),
                    dataset_name: "?".repeat(5),
                    source_kind: "demo".to_string(),
                    source_label: "custom-demo".to_string(),
                    report_template_id: "gov-standard".to_string(),
                    report: crate::models::AuditReport::new(
                        0,
                        rust_decimal::Decimal::ZERO,
                        rust_decimal::Decimal::ZERO,
                    ),
                    transactions_summary: Vec::new(),
                },
            )
            .unwrap();

        let conn = store.connect().unwrap();
        conn.execute(
            "INSERT INTO projects (
                id, tenant_id, organization_id, name, scenario_id, description, created_by, created_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                "project-custom",
                admin.tenant_id,
                admin.organization_id,
                "正常项目",
                "fiscal-supervision",
                "custom",
                admin.id,
                now_string()
            ],
        )
        .unwrap();
        drop(conn);
        drop(store);

        let reopened = PlatformStore::load_or_create(tmp.path()).unwrap();
        let profile = reopened
            .get_profile(&SessionIdentity {
                user_id: admin.id,
                tenant_id: admin.tenant_id.clone(),
                organization_id: admin.organization_id.clone(),
                username: admin.username,
                display_name: admin.display_name,
                role: admin.role,
            })
            .unwrap();
        assert_eq!(profile.tenant_name, "财政监督演示租户");
        assert_eq!(profile.organization_name, "财政监督演示机构");
        assert_eq!(profile.display_name, "管理员");

        let conn = reopened.connect().unwrap();
        let repaired_project: String = conn
            .query_row(
                "SELECT name FROM projects WHERE name = ?1",
                ["财政监督演示任务"],
                |row| row.get(0),
            )
            .unwrap();
        let custom_project: String = conn
            .query_row(
                "SELECT name FROM projects WHERE id = ?1",
                ["project-custom"],
                |row| row.get(0),
            )
            .unwrap();
        let repaired_dataset: String = conn
            .query_row("SELECT dataset_name FROM tasks LIMIT 1", [], |row| {
                row.get(0)
            })
            .unwrap();

        assert_eq!(repaired_project, "财政监督演示任务");
        assert_eq!(custom_project, "正常项目");
        assert_eq!(repaired_dataset, "财政监督脱敏样例");
    }

    #[test]
    fn stores_public_lead_requests() {
        let tmp = tempfile::tempdir().unwrap();
        let store = PlatformStore::load_or_create(tmp.path()).unwrap();
        let lead = store
            .create_lead_request(LeadRequestInput {
                contact_name: "张三".to_string(),
                contact_channel: "zhangsan@example.com".to_string(),
                unit_type: "财政局".to_string(),
                department: "监督处".to_string(),
                audit_scenario: "财政监督".to_string(),
                deployment_preference: "private-cloud-poc".to_string(),
                involves_real_data: false,
                ai_expectation: "configurable".to_string(),
                note: "先做汇报".to_string(),
            })
            .unwrap();

        let leads = store.list_lead_requests(10);
        assert_eq!(leads.len(), 1);
        assert_eq!(leads[0].id, lead.id);
        assert_eq!(leads[0].contact_name, "张三");
    }
}
