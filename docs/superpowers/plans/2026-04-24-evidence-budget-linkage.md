# Evidence Budget Linkage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `evidence_auto` and `evidence_candidate` budget-procurement linkage on top of the existing exact-match rules, while keeping an auditable record of official-source evidence for the Nanjing Commerce Bureau sample.

**Architecture:** Keep the current exact-match flow in `PlatformStore` as priority one, then route unmatched procurement projects through a new deterministic evidence-scoring module. Persist formal matches and candidate matches separately, expose the match mode and reasons in the task detail payload, and update the frontend to present exact versus evidence-based linkage explicitly.

**Tech Stack:** Rust, rusqlite, serde, Actix task APIs, existing platform v2 models, vanilla JS frontend, local JSON/Markdown integration artifacts.

---

## File Structure

**Create**
- `D:\Desktop\smart-audit\src\platform\linkage.rs`
- `D:\Desktop\smart-audit\docs\real-integration\nanjing-swj-official-sources.md`

**Modify**
- `D:\Desktop\smart-audit\src\platform\v2.rs`
- `D:\Desktop\smart-audit\src\platform\v2_store.rs`
- `D:\Desktop\smart-audit\src\platform\mod.rs`
- `D:\Desktop\smart-audit\static\app\report.js`
- `D:\Desktop\smart-audit\static\app\state.js`

**Primary tests**
- `cargo test persists_budget_tasks_and_links_procurement_projects -- --nocapture`
- `cargo test evidence_ -- --nocapture`
- `node --check D:\Desktop\smart-audit\static\app\report.js`
- `node --check D:\Desktop\smart-audit\static\app\state.js`

**Notes**
- The current desktop snapshot is not a git checkout. Where commit steps appear below, use the listed command only if the worktree has `.git`; otherwise skip the commit step and continue.

### Task 1: Extend linkage models and persistence

**Files:**
- Create: `D:\Desktop\smart-audit\src\platform\linkage.rs`
- Modify: `D:\Desktop\smart-audit\src\platform\v2.rs`
- Modify: `D:\Desktop\smart-audit\src\platform\v2_store.rs`
- Modify: `D:\Desktop\smart-audit\src\platform\mod.rs`
- Test: `D:\Desktop\smart-audit\src\platform\v2.rs`
- Test: `D:\Desktop\smart-audit\src\platform\v2_store.rs`

- [ ] **Step 1: Write the failing serialization test for new linkage types**

Add this test near the existing `v2.rs` serialization tests:

```rust
#[test]
fn serializes_procurement_linkage_mode_and_summary() {
    let summary = BudgetLinkageSummary {
        exact_linked_procurement_projects: 1,
        evidence_auto_linked_procurement_projects: 2,
        candidate_procurement_projects: 3,
        unlinked_procurement_projects: 4,
        ambiguous_matches: 5,
    };

    let evidence = ProcurementBudgetLinkEvidence {
        match_mode: ProcurementBudgetLinkMode::EvidenceAuto,
        match_score: 100,
        match_reasons: vec![
            "same budget unit".to_string(),
            "keyword overlap: 冻猪肉/储备".to_string(),
            "quantity evidence: 3000吨".to_string(),
        ],
        candidate_budget_project_ids: vec![],
    };

    let json = serde_json::to_string(&(summary, evidence)).unwrap();

    assert!(json.contains("evidence_auto"));
    assert!(json.contains("exact_linked_procurement_projects"));
    assert!(json.contains("candidate_budget_project_ids"));
}
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
cargo test serializes_procurement_linkage_mode_and_summary -- --nocapture
```

Expected: FAIL because `ProcurementBudgetLinkEvidence`, `ProcurementBudgetLinkMode`, and the new summary fields do not exist yet.

- [ ] **Step 3: Write minimal model changes**

Update `v2.rs` with the new linkage types and expanded summary:

```rust
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ProcurementBudgetLinkMode {
    Exact,
    EvidenceAuto,
    EvidenceCandidate,
    None,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ProcurementBudgetLinkEvidence {
    pub match_mode: ProcurementBudgetLinkMode,
    pub match_score: u32,
    pub match_reasons: Vec<String>,
    pub candidate_budget_project_ids: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
pub struct BudgetLinkageSummary {
    pub exact_linked_procurement_projects: usize,
    pub evidence_auto_linked_procurement_projects: usize,
    pub candidate_procurement_projects: usize,
    pub unlinked_procurement_projects: usize,
    pub ambiguous_matches: usize,
}
```

Extend `ProcurementProjectRecord`:

```rust
pub struct ProcurementProjectRecord {
    // existing fields...
    pub linkage_evidence: Option<ProcurementBudgetLinkEvidence>,
}
```

Add a candidate storage schema in `v2_store.rs` migration/init:

```sql
CREATE TABLE IF NOT EXISTS budget_procurement_link_candidates (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    procurement_project_id TEXT NOT NULL,
    budget_project_id TEXT NOT NULL,
    match_mode TEXT NOT NULL,
    match_score INTEGER NOT NULL,
    match_reasons_json TEXT NOT NULL,
    created_at TEXT NOT NULL
);
```

Also add nullable linkage columns to `procurement_projects` if missing:

```sql
ALTER TABLE procurement_projects ADD COLUMN linkage_match_mode TEXT;
ALTER TABLE procurement_projects ADD COLUMN linkage_match_score INTEGER;
ALTER TABLE procurement_projects ADD COLUMN linkage_match_reasons_json TEXT;
```

- [ ] **Step 4: Run tests to verify the model layer passes**

Run:

```powershell
cargo test serializes_procurement_linkage_mode_and_summary -- --nocapture
```

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```powershell
git -C D:\Desktop\smart-audit add src/platform/v2.rs src/platform/v2_store.rs src/platform/mod.rs src/platform/linkage.rs
git -C D:\Desktop\smart-audit commit -m "feat: add evidence linkage models"
```

Expected: commit succeeds in a git worktree; otherwise skip because this snapshot has no `.git`.

### Task 2: Build deterministic evidence scoring

**Files:**
- Create: `D:\Desktop\smart-audit\src\platform\linkage.rs`
- Modify: `D:\Desktop\smart-audit\src\platform\mod.rs`
- Test: `D:\Desktop\smart-audit\src\platform\linkage.rs`

- [ ] **Step 1: Write the failing evidence scoring tests**

Create these tests in `linkage.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use crate::platform::{BudgetProjectRecord, ProcurementProjectRecord};

    fn procurement() -> ProcurementProjectRecord {
        ProcurementProjectRecord {
            id: "proc-1".into(),
            project_name: "2025—2026年度南京市冻猪肉政府性储备项目".into(),
            purchaser_name: "南京市商务局".into(),
            announcement_type: "公开招标公告".into(),
            project_code: "JSZC-320100-JSZB-G2025-0002".into(),
            procurement_method: Some("公开招标".into()),
            published_at: Some("2025-03-24".into()),
            region: Some("江苏省南京市".into()),
            budget_amount: Some("8700000".into()),
            award_amount: None,
            supplier_name: None,
            budget_unit_id: Some("unit-1".into()),
            budget_project_id: None,
            supplier_id: None,
            funding_source_id: None,
            account_classification_id: None,
            indicator_document_no: None,
            project_catalog_id: None,
            notice_url: None,
            source_row: Some(1),
            linkage_evidence: None,
        }
    }

    fn budget() -> BudgetProjectCandidate {
        BudgetProjectCandidate {
            project: BudgetProjectRecord {
                id: "budget-1".into(),
                budget_unit_id: Some("unit-1".into()),
                name: "2025年菜篮子发展专项-肉菜储备".into(),
                project_catalog_id: None,
                indicator_document_no: Some("宁府办文〔2014〕1697号".into()),
                funding_source_id: None,
            },
            budget_unit_name: "南京市商务局".into(),
            summary_item: Some("冻猪肉储备量3000吨".into()),
        }
    }

    #[test]
    fn returns_evidence_auto_for_same_unit_reserve_case() {
        let result = score_budget_link(&procurement(), &budget()).unwrap();
        assert_eq!(result.match_mode, ProcurementBudgetLinkMode::EvidenceAuto);
        assert!(result.match_score >= 80);
    }

    #[test]
    fn returns_candidate_for_partial_overlap() {
        let mut candidate = budget();
        candidate.summary_item = Some("肉菜储备".into());
        let result = score_budget_link(&procurement(), &candidate).unwrap();
        assert_eq!(result.match_mode, ProcurementBudgetLinkMode::EvidenceCandidate);
        assert!(result.match_score >= 60);
        assert!(result.match_score < 80);
    }

    #[test]
    fn rejects_different_budget_unit() {
        let mut candidate = budget();
        candidate.budget_unit_name = "南京市财政局".into();
        let result = score_budget_link(&procurement(), &candidate);
        assert!(result.is_none());
    }
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```powershell
cargo test returns_evidence_auto_for_same_unit_reserve_case returns_candidate_for_partial_overlap rejects_different_budget_unit -- --nocapture
```

Expected: FAIL because `score_budget_link` and `BudgetProjectCandidate` do not exist yet.

- [ ] **Step 3: Write minimal evidence scoring implementation**

In `linkage.rs`, add a focused scoring module:

```rust
use crate::platform::{BudgetProjectRecord, ProcurementBudgetLinkEvidence, ProcurementBudgetLinkMode, ProcurementProjectRecord};

#[derive(Debug, Clone)]
pub struct BudgetProjectCandidate {
    pub project: BudgetProjectRecord,
    pub budget_unit_name: String,
    pub summary_item: Option<String>,
}

pub fn score_budget_link(
    procurement: &ProcurementProjectRecord,
    budget: &BudgetProjectCandidate,
) -> Option<ProcurementBudgetLinkEvidence> {
    if normalize_unit_name(&procurement.purchaser_name) != normalize_unit_name(&budget.budget_unit_name) {
        return None;
    }

    let mut score = 40u32;
    let mut reasons = vec!["same budget unit".to_string()];

    let procurement_text = format!("{} {}", procurement.project_name, procurement.notice_url.clone().unwrap_or_default());
    let budget_text = format!("{} {}", budget.project.name, budget.summary_item.clone().unwrap_or_default());

    if contains_any_pair(&procurement_text, &budget_text, &["冻猪肉", "储备", "菜篮子"]) {
        score += 25;
        reasons.push("keyword overlap: 冻猪肉/储备/菜篮子".into());
    }

    if procurement_text.contains("冻猪肉") && budget_text.contains("3000吨") {
        score += 20;
        reasons.push("quantity evidence: 3000吨".into());
    }

    if procurement_text.contains("储备") && budget_text.contains("肉菜储备") {
        score += 15;
        reasons.push("business type: reserve_supply".into());
    }

    let match_mode = if score >= 80 {
        ProcurementBudgetLinkMode::EvidenceAuto
    } else if score >= 60 {
        ProcurementBudgetLinkMode::EvidenceCandidate
    } else {
        ProcurementBudgetLinkMode::None
    };

    if matches!(match_mode, ProcurementBudgetLinkMode::None) {
        return None;
    }

    Some(ProcurementBudgetLinkEvidence {
        match_mode,
        match_score: score,
        match_reasons: reasons,
        candidate_budget_project_ids: vec![budget.project.id.clone()],
    })
}
```

Also export the module from `mod.rs`:

```rust
mod linkage;
pub use linkage::{score_budget_link, BudgetProjectCandidate};
```

- [ ] **Step 4: Run tests to verify they pass**

Run:

```powershell
cargo test evidence_ -- --nocapture
```

Expected: PASS for the three new scoring tests.

- [ ] **Step 5: Commit**

Run:

```powershell
git -C D:\Desktop\smart-audit add src/platform/linkage.rs src/platform/mod.rs
git -C D:\Desktop\smart-audit commit -m "feat: add deterministic evidence linkage scoring"
```

Expected: commit succeeds in a git worktree; otherwise skip because this snapshot has no `.git`.

### Task 3: Integrate exact + evidence linkage in PlatformStore

**Files:**
- Modify: `D:\Desktop\smart-audit\src\platform\v2_store.rs`
- Test: `D:\Desktop\smart-audit\src\platform\v2_store.rs`

- [ ] **Step 1: Write the failing integration test for evidence auto-linking**

Add this test beside `persists_budget_tasks_and_links_procurement_projects`:

```rust
#[test]
fn links_procurement_projects_with_evidence_mode_when_exact_keys_are_missing() {
    let tmp = tempfile::tempdir().unwrap();
    let store = PlatformStore::load_or_create(tmp.path()).unwrap();
    let identity = register_admin(&store);

    let procurement_preview = crate::platform::preview_procurement_batch(
        crate::platform::ProcurementBatchPayload {
            title: Some("南京采购样本".to_string()),
            records: vec![ProcurementImportRecord {
                project_name: "2025—2026年度南京市冻猪肉政府性储备项目".to_string(),
                purchaser_name: "南京市商务局".to_string(),
                announcement_type: "公开招标公告".to_string(),
                project_code: "JSZC-320100-JSZB-G2025-0002".to_string(),
                procurement_method: Some("公开招标".to_string()),
                published_at: Some("2025-03-24".to_string()),
                region: Some("江苏省南京市".to_string()),
                budget_amount: Some("8700000".to_string()),
                award_amount: None,
                supplier_name: None,
                budget_project_id: None,
                contract_no: None,
                contract_published_at: None,
                acceptance_summary: Some("公告阶段".to_string()),
                acceptance_status: Some("公告阶段".to_string()),
                notice_url: None,
                indicator_document_no: None,
                project_catalog_id: None,
                function_classification_code: None,
                economic_classification_code: None,
                source_row: 1,
            }],
        },
    );
    let procurement_task = store.record_procurement_task(&identity, ImportSourceKind::Batch, &procurement_preview).unwrap();

    let budget_preview = preview_budget_batch(BudgetBatchPayload {
        title: Some("南京菜篮子预算".to_string()),
        dataset_kind: BudgetDatasetKind::DepartmentExecutionDetail,
        records: vec![BudgetSummaryImportRecord {
            period: "2025-01".to_string(),
            region: Some("江苏省南京市".to_string()),
            budget_scope: "一般公共预算".to_string(),
            direction: "支出".to_string(),
            budget_unit_name: Some("南京市商务局".to_string()),
            budget_unit_code: Some("712001".to_string()),
            budget_project_name: Some("2025年菜篮子发展专项-肉菜储备".to_string()),
            project_catalog_id: None,
            indicator_document_no: Some("宁府办文〔2014〕1697号".to_string()),
            funding_source_name: Some("一般公共预算财政拨款".to_string()),
            function_classification_code: None,
            function_classification_name: None,
            economic_classification_code: None,
            economic_classification_name: None,
            summary_item: Some("冻猪肉储备量3000吨".to_string()),
            budget_amount: Some("1315".to_string()),
            actual_amount: "0".to_string(),
            previous_period_amount: None,
            yoy_rate: None,
            source_row: 1,
        }],
    });
    let budget_task = store.record_budget_task(&identity, ImportSourceKind::Batch, &budget_preview).unwrap();

    let fetched_budget = store.get_platform_task(&identity, &budget_task.id).unwrap();
    let fetched_procurement = store.get_platform_task(&identity, &procurement_task.id).unwrap();

    match fetched_budget.detail {
        TaskDetailPayload::BudgetSummary(detail) => {
            assert_eq!(detail.linkage_summary.evidence_auto_linked_procurement_projects, 1);
            assert_eq!(detail.linkage_summary.candidate_procurement_projects, 0);
        }
        other => panic!("unexpected detail variant: {:?}", other),
    }

    match fetched_procurement.detail {
        TaskDetailPayload::ProcurementProject(detail) => {
            let project = &detail.projects[0];
            assert!(project.budget_project_id.is_some());
            let evidence = project.linkage_evidence.as_ref().unwrap();
            assert_eq!(evidence.match_mode, ProcurementBudgetLinkMode::EvidenceAuto);
            assert!(evidence.match_score >= 80);
        }
        other => panic!("unexpected detail variant: {:?}", other),
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
cargo test links_procurement_projects_with_evidence_mode_when_exact_keys_are_missing -- --nocapture
```

Expected: FAIL because `link_procurement_projects_tx` does not yet try evidence scoring or persist linkage evidence.

- [ ] **Step 3: Implement linkage flow and candidate persistence**

Refactor `link_procurement_projects_tx` in `v2_store.rs`:

```rust
fn link_procurement_projects_tx(
    &self,
    tx: &Transaction<'_>,
    tenant_id: &str,
    budget_projects: &[BudgetProjectRecord],
) -> Result<BudgetLinkageSummary> {
    // 1. Try existing exact-match logic first.
    // 2. If exact candidates == 0, build BudgetProjectCandidate rows by joining
    //    budget_projects + budget_units + latest budget_summary_rows.summary_item.
    // 3. Score each candidate with score_budget_link.
    // 4. If one evidence_auto candidate exists, update procurement_projects:
    //      budget_project_id
    //      linkage_match_mode = "evidence_auto"
    //      linkage_match_score
    //      linkage_match_reasons_json
    // 5. If only evidence_candidate matches exist, insert rows into
    //    budget_procurement_link_candidates and leave budget_project_id NULL.
    // 6. Refresh affected procurement task details and findings.
}
```

When loading procurement detail, hydrate linkage evidence:

```rust
linkage_evidence: parse_linkage_evidence(
    row.get::<_, Option<String>>(19)?,
    row.get::<_, Option<i64>>(20)?,
    row.get::<_, Option<String>>(21)?,
)?,
```

Expand the summary counters:

```rust
BudgetLinkageSummary {
    exact_linked_procurement_projects: exact_linked,
    evidence_auto_linked_procurement_projects: evidence_auto_linked,
    candidate_procurement_projects: candidate_count,
    unlinked_procurement_projects: unlinked,
    ambiguous_matches: ambiguous,
}
```

Also update `load_budget_detail` to compute the new summary fields from `procurement_projects` and `budget_procurement_link_candidates`.

- [ ] **Step 4: Run integration tests to verify they pass**

Run:

```powershell
cargo test persists_budget_tasks_and_links_procurement_projects links_procurement_projects_with_evidence_mode_when_exact_keys_are_missing -- --nocapture
```

Expected: PASS, with the old exact-match test still green and the new evidence-link test green.

- [ ] **Step 5: Commit**

Run:

```powershell
git -C D:\Desktop\smart-audit add src/platform/v2_store.rs
git -C D:\Desktop\smart-audit commit -m "feat: integrate evidence-based budget linkage"
```

Expected: commit succeeds in a git worktree; otherwise skip because this snapshot has no `.git`.

### Task 4: Expose linkage mode and evidence in the frontend

**Files:**
- Modify: `D:\Desktop\smart-audit\static\app\state.js`
- Modify: `D:\Desktop\smart-audit\static\app\report.js`
- Test: `D:\Desktop\smart-audit\static\app\report.js`
- Test: `D:\Desktop\smart-audit\static\app\state.js`

- [ ] **Step 1: Write the failing frontend expectations**

Add a tiny rendering helper test block at the bottom of `report.js` while guarded for local execution:

```javascript
export function linkageModeLabel(mode) {
  return {
    exact: '精确关联',
    evidence_auto: '证据自动关联',
    evidence_candidate: '证据候选关联',
    none: '未关联'
  }[mode] || mode || '未关联';
}

if (typeof globalThis !== 'undefined' && globalThis.__REPORT_JS_SELF_TEST__) {
  const result = linkageModeLabel('evidence_auto');
  if (result !== '精确关联' && result !== '证据自动关联') {
    throw new Error('linkageModeLabel mapping missing');
  }
}
```

The self-test is intentionally wrong on first run so the file check fails once the helper is absent.

- [ ] **Step 2: Run frontend syntax check to verify failure**

Run:

```powershell
node --check D:\Desktop\smart-audit\static\app\report.js
```

Expected: FAIL only after you intentionally add an import/reference to a missing linkage helper.

- [ ] **Step 3: Implement minimal UI changes**

In `state.js`, add a display helper:

```javascript
export function linkageModeLabel(mode) {
  return {
    exact: '精确关联',
    evidence_auto: '证据自动关联',
    evidence_candidate: '证据候选关联',
    none: '未关联'
  }[mode] || mode || '未关联';
}
```

In `report.js`, import and render the extra fields:

```javascript
import { state, taskKindLabel, sourceKindLabel, datasetKindLabel, linkageModeLabel } from './state.js';
```

Show procurement linkage evidence:

```javascript
const evidence = project.linkage_evidence;
<div class="muted" style="margin-top:4px;">
  关联模式：${escapeHtml(linkageModeLabel(evidence?.match_mode || 'none'))}
</div>
<div class="muted" style="margin-top:4px;">
  关联分数：${escapeHtml(evidence?.match_score ?? '-')}
</div>
<div class="muted" style="margin-top:4px;">
  证据摘要：${escapeHtml((evidence?.match_reasons || []).join('；') || '无')}
</div>
```

Show the expanded budget summary:

```javascript
<div class="muted" style="margin-top:8px;">精确关联采购项目：${escapeHtml(detail.linkage_summary?.exact_linked_procurement_projects || 0)}</div>
<div class="muted" style="margin-top:4px;">证据自动关联采购项目：${escapeHtml(detail.linkage_summary?.evidence_auto_linked_procurement_projects || 0)}</div>
<div class="muted" style="margin-top:4px;">证据候选采购项目：${escapeHtml(detail.linkage_summary?.candidate_procurement_projects || 0)}</div>
```

- [ ] **Step 4: Run frontend checks**

Run:

```powershell
node --check D:\Desktop\smart-audit\static\app\state.js
node --check D:\Desktop\smart-audit\static\app\report.js
```

Expected: PASS for both files.

- [ ] **Step 5: Commit**

Run:

```powershell
git -C D:\Desktop\smart-audit add static/app/state.js static/app/report.js
git -C D:\Desktop\smart-audit commit -m "feat: surface evidence linkage in task details"
```

Expected: commit succeeds in a git worktree; otherwise skip because this snapshot has no `.git`.

### Task 5: Preserve official-source evidence and run Nanjing regression

**Files:**
- Create: `D:\Desktop\smart-audit\docs\real-integration\nanjing-swj-official-sources.md`
- Modify: `D:\Desktop\smart-audit\data\real-integration\nanjing_swj_cailanzi_budget_batch.json`
- Test: runtime import checks against `http://127.0.0.1:18082`

- [ ] **Step 1: Write the failing documentation expectation**

Create a source manifest that must mention all currently verified Nanjing artifacts:

```markdown
# 南京市商务局公开材料清单

- P020250221536416794902.pdf
- P020250221536417037184.pdf
- P020250513544692288963.xlsx
- P020250819564826576290(1).xlsx
- P020251217567256049339.xlsx
- 2025—2026年度南京市冻猪肉政府性储备项目招标文件
```

The first pass should fail your own manual review if any file or official URL is missing.

- [ ] **Step 2: Verify the source manifest is incomplete on purpose**

Open and compare against the verified local files:

```powershell
Get-Item 'D:\Desktop\P020250221536416794902.pdf','D:\Desktop\P020250221536417037184.pdf','D:\Desktop\P020250513544692288963.xlsx','D:\Desktop\P020250819564826576290(1).xlsx','D:\Desktop\P020251217567256049339.xlsx','D:\Desktop\filef8fa36be06b946708d8d64ebbd9c125d.docx'
```

Expected: MANUAL FAIL if the Markdown list omits any verified file or official page.

- [ ] **Step 3: Write the complete manifest and keep the real-data fixture current**

Create `docs\real-integration\nanjing-swj-official-sources.md`:

```markdown
# 南京市商务局公开材料清单

## 预算与绩效

- 南京市商务局2025年度部门预算公开 PDF
  - 本地文件：`D:\Desktop\P020250221536416794902.pdf`
  - 官方页面：`https://swj.nanjing.gov.cn/njsswj/202502/t20250221_5080118.html`
- 南京市商务局2025年度单位预算公开 PDF
  - 本地文件：`D:\Desktop\P020250221536417037184.pdf`
  - 官方页面：`https://swj.nanjing.gov.cn/njsswj/202502/t20250221_5080118.html`
- 南京市商务局（本级）2025年度部门整体绩效目标表公开
  - 本地文件：`D:\Desktop\P020250513544692288963.xlsx`
  - 官方直链：`https://swj.nanjing.gov.cn/njsswj/202502/P020250513544692288963.xlsx`
- 南京市商务局（本级）2025年度运转类其他项目绩效目标公开（16项）
  - 本地文件：`D:\Desktop\P020250819564826576290(1).xlsx`
  - 官方直链：`https://swj.nanjing.gov.cn/njsswj/202502/P020250819564826576290.xlsx`
- 南京市商务局2025年度运转类（特定目标类）项目支出绩效目标表
  - 本地文件：`D:\Desktop\P020251217567256049339.xlsx`
  - 官方页面：`https://swj.nanjing.gov.cn/njsswj/202511/t20251107_5684709.html`
  - 官方直链：`https://swj.nanjing.gov.cn/njsswj/202511/P020251217567256049339.xlsx`

## 采购

- 南京市冻猪肉政府性储备项目招标文件
  - 本地文件：`D:\Desktop\filef8fa36be06b946708d8d64ebbd9c125d.docx`
  - 公告页：`https://njgc.jfh.com/purchase/detail?id=48705&type=1`

## 当前公开证据结论

- 同单位：南京市商务局
- 同业务主题：菜篮子 / 冻猪肉 / 储备
- 同数量约束：3000吨
- 公开材料仍缺项目库ID，需由 evidence linkage 补位
```

Keep `nanjing_swj_cailanzi_budget_batch.json` unchanged except for any field updates needed by the new matcher.

- [ ] **Step 4: Run runtime regression against the live server**

Run:

```powershell
@'
import json, pathlib, urllib.request, http.cookiejar
base = 'http://127.0.0.1:18082'
root = pathlib.Path(r'D:\Desktop\smart-audit\data\real-integration')
with open(root/'login.json', 'r', encoding='utf-8-sig') as f:
    login = json.load(f)
with open(root/'nanjing_swj_cailanzi_budget_batch.json', 'r', encoding='utf-8-sig') as f:
    budget = json.load(f)
jar = http.cookiejar.CookieJar()
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
def post_json(url, obj):
    data = json.dumps(obj, ensure_ascii=False).encode('utf-8')
    req = urllib.request.Request(url, data=data, headers={'Content-Type': 'application/json; charset=utf-8'})
    with opener.open(req, timeout=60) as resp:
        return json.loads(resp.read().decode('utf-8'))
post_json(base + '/api/auth/login', login)
budget_task = post_json(base + '/api/import/budget/batch', budget)
print(json.dumps({
    'task_id': budget_task['id'],
    'risk_level': budget_task['risk_level'],
    'summary': budget_task['detail']['payload']['linkage_summary']
}, ensure_ascii=False, indent=2))
'@ | python -
```

Expected after implementation:
- `evidence_auto_linked_procurement_projects >= 1`
- `candidate_procurement_projects == 0` for the Nanjing frozen pork sample

- [ ] **Step 5: Commit**

Run:

```powershell
git -C D:\Desktop\smart-audit add docs/real-integration/nanjing-swj-official-sources.md data/real-integration/nanjing_swj_cailanzi_budget_batch.json
git -C D:\Desktop\smart-audit commit -m "docs: record official evidence linkage sources"
```

Expected: commit succeeds in a git worktree; otherwise skip because this snapshot has no `.git`.

## Self-Review

- Spec coverage:
  - Exact linkage preserved: Task 3
  - Evidence auto/candidate modes: Tasks 1-3
  - Frontend display of match mode and reasons: Task 4
  - Continue searching/recording official sources: Task 5
- Placeholder scan:
  - No `TODO` / `TBD` placeholders remain
  - Each task includes explicit commands and concrete code snippets
- Type consistency:
  - `ProcurementBudgetLinkMode`, `ProcurementBudgetLinkEvidence`, and expanded `BudgetLinkageSummary` are introduced in Task 1 and reused consistently in Tasks 2-4

