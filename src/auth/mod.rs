use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum UserRole {
    Admin,
    Auditor,
    DepartmentReviewer,
    Supervisor,
    RectificationUser,
    Viewer,
}

impl UserRole {
    pub fn can_run_audit(&self) -> bool {
        matches!(
            self,
            Self::Admin | Self::Auditor | Self::DepartmentReviewer | Self::Supervisor
        )
    }

    pub fn can_manage_admin(&self) -> bool {
        matches!(self, Self::Admin)
    }

    pub fn can_export_sensitive(&self) -> bool {
        matches!(
            self,
            Self::Admin | Self::Auditor | Self::DepartmentReviewer | Self::Supervisor
        )
    }

    pub fn can_access_case_workbench(&self) -> bool {
        matches!(
            self,
            Self::Admin | Self::Auditor | Self::DepartmentReviewer | Self::Supervisor
        )
    }

    pub fn can_review_case(&self) -> bool {
        matches!(
            self,
            Self::Admin | Self::DepartmentReviewer | Self::Supervisor
        )
    }

    pub fn can_access_operations(&self) -> bool {
        matches!(
            self,
            Self::Admin | Self::Supervisor | Self::DepartmentReviewer
        )
    }

    pub fn can_access_rectification_portal(&self) -> bool {
        matches!(self, Self::Admin | Self::RectificationUser)
    }
}

impl std::fmt::Display for UserRole {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Admin => write!(f, "admin"),
            Self::Auditor => write!(f, "auditor"),
            Self::DepartmentReviewer => write!(f, "department_reviewer"),
            Self::Supervisor => write!(f, "supervisor"),
            Self::RectificationUser => write!(f, "rectification_user"),
            Self::Viewer => write!(f, "viewer"),
        }
    }
}

impl std::str::FromStr for UserRole {
    type Err = String;

    fn from_str(value: &str) -> Result<Self, Self::Err> {
        match value {
            "admin" | "Admin" => Ok(Self::Admin),
            "auditor" | "Auditor" => Ok(Self::Auditor),
            "department_reviewer" | "DepartmentReviewer" => Ok(Self::DepartmentReviewer),
            "supervisor" | "Supervisor" => Ok(Self::Supervisor),
            "rectification_user" | "RectificationUser" => Ok(Self::RectificationUser),
            "viewer" | "Viewer" => Ok(Self::Viewer),
            _ => Err("invalid role".to_string()),
        }
    }
}

pub fn validate_password_policy(password: &str) -> Result<(), String> {
    if password.len() < 8 {
        return Err("password must be at least 8 characters".to_string());
    }
    if !password.chars().any(|c| c.is_ascii_alphabetic()) {
        return Err("password must include a letter".to_string());
    }
    if !password.chars().any(|c| c.is_ascii_digit()) {
        return Err("password must include a number".to_string());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validates_password_policy() {
        assert!(validate_password_policy("Admin123").is_ok());
        assert!(validate_password_policy("weak").is_err());
    }

    #[test]
    fn parses_role() {
        assert_eq!("admin".parse::<UserRole>().unwrap(), UserRole::Admin);
        assert_eq!(
            "department_reviewer".parse::<UserRole>().unwrap(),
            UserRole::DepartmentReviewer
        );
        assert_eq!(
            "rectification_user".parse::<UserRole>().unwrap(),
            UserRole::RectificationUser
        );
        assert!("nope".parse::<UserRole>().is_err());
    }
}
