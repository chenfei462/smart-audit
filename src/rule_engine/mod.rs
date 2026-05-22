pub mod balance_check;
pub mod benford;
pub mod date_continuity;
pub mod duplicate;
pub mod related_party;
pub mod round_amount;
pub mod rules;
pub mod threshold;

use crate::models::{
    AuditConfig, AuditFinding, FindingMetadata, FindingRiskLevel, LegalBasisMetadata, Severity,
    Transaction,
};
use anyhow::Result;

pub trait AuditRule: Send + Sync {
    fn name(&self) -> &str;
    fn description(&self) -> &str;
    fn check(&self, transactions: &[Transaction]) -> Result<Vec<AuditFinding>>;
}

pub fn create_rules_from_config(config: &AuditConfig) -> Vec<Box<dyn AuditRule>> {
    let mut audit_rules: Vec<Box<dyn AuditRule>> = Vec::new();

    if let Some(ref rules_config) = config.rules {
        if let Some(ref balance_check) = rules_config.balance_check {
            if balance_check.enabled {
                audit_rules.push(Box::new(balance_check::BalanceCheck::from_config(
                    balance_check,
                )));
            }
        }
        if let Some(ref threshold) = rules_config.threshold {
            if threshold.enabled {
                audit_rules.push(Box::new(threshold::ThresholdCheck::from_config(threshold)));
            }
        }
        if let Some(ref duplicate) = rules_config.duplicate {
            if duplicate.enabled {
                audit_rules.push(Box::new(duplicate::DuplicateCheck::from_config(duplicate)));
            }
        }
        if let Some(ref date_continuity) = rules_config.date_continuity {
            if date_continuity.enabled {
                audit_rules.push(Box::new(date_continuity::DateContinuityCheck::new(
                    date_continuity.max_gap_days.unwrap_or(7),
                )));
            }
        }
        if let Some(ref round_amount) = rules_config.round_amount {
            if round_amount.enabled {
                audit_rules.push(Box::new(round_amount::RoundAmountCheck::new(
                    round_amount.count_threshold.unwrap_or(5),
                )));
            }
        }
    }

    audit_rules.push(Box::new(benford::BenfordCheck::default()));
    audit_rules.push(Box::new(related_party::RelatedPartyCheck::default()));
    audit_rules
}

pub fn build_fiscal_finding(
    metadata: FindingMetadata,
    evidence_summary: impl Into<String>,
    related_rows: Vec<usize>,
) -> AuditFinding {
    AuditFinding::from_metadata(metadata, evidence_summary, related_rows)
}

pub const CATEGORY_FUND_FLOW: &str = "资金流向异常";
pub const CATEGORY_PAYMENT_TIMING: &str = "支付时点异常";
pub const CATEGORY_DUPLICATE_SPLIT: &str = "重复与拆分支付";
pub const CATEGORY_BUDGET_DEVIATION: &str = "预算执行偏离";
pub const CATEGORY_LEDGER: &str = "往来与挂账异常";

pub const ACCOUNTING_VOUCHER_LEGAL_BASIS: LegalBasisMetadata = LegalBasisMetadata {
    regulation_name: "中华人民共和国会计法",
    article_no: "第十四条、第十七条",
    legal_reasoning: "会计凭证和会计账簿应当依据实际发生的经济业务事项登记，保证会计资料真实、完整。",
    scope: "会计凭证、会计账簿、财政资金收支记录",
};

pub const FISCAL_SUPERVISION_LEGAL_BASIS: LegalBasisMetadata = LegalBasisMetadata {
    regulation_name: "中华人民共和国预算法",
    article_no: "第五十七条、第九十二条",
    legal_reasoning: "预算执行和财政资金支付应当按批准的预算、用途和进度执行，异常支付需留存审批和业务依据。",
    scope: "预算执行、财政支付、专项资金和采购资金监督",
};

pub const GOVERNMENT_PROCUREMENT_LEGAL_BASIS: LegalBasisMetadata = LegalBasisMetadata {
    regulation_name: "中华人民共和国政府采购法",
    article_no: "第六条、第四十二条",
    legal_reasoning: "政府采购活动应当遵循公开透明、公平竞争和诚实信用原则，并保存采购文件和可复核记录。",
    scope: "政府采购项目、合同、验收、支付及供应商相关记录",
};

pub const BALANCE_METADATA: FindingMetadata = FindingMetadata {
    rule_code: "FISCAL-BUDGET-001",
    rule_name: "凭证借贷失衡",
    rule_category: CATEGORY_BUDGET_DEVIATION,
    risk_level: FindingRiskLevel::High,
    severity: Severity::Error,
    legal_basis: ACCOUNTING_VOUCHER_LEGAL_BASIS,
    audit_rationale:
        "财政监督要求凭证借贷方向与金额勾稽一致，借贷失衡会直接影响预算执行真实性和账务可靠性。",
    recommended_action: "立即核对原始凭证、记账分录和预算科目映射，修正失衡分录并复核影响范围。",
};

pub const THRESHOLD_METADATA: FindingMetadata = FindingMetadata {
    rule_code: "FISCAL-FLOW-001",
    rule_name: "大额专项资金支付",
    rule_category: CATEGORY_FUND_FLOW,
    risk_level: FindingRiskLevel::High,
    severity: Severity::Warning,
    legal_basis: FISCAL_SUPERVISION_LEGAL_BASIS,
    audit_rationale:
        "财政监督需要重点关注超阈值资金支出，特别是专项资金、大额集中支付和异常用途流向。",
    recommended_action:
        "核对资金用途、预算指标、支付审批链路和收款对象，确认是否存在超预算或异常拨付。",
};

pub const DUPLICATE_METADATA: FindingMetadata = FindingMetadata {
    rule_code: "FISCAL-DUP-001",
    rule_name: "疑似重复支付",
    rule_category: CATEGORY_DUPLICATE_SPLIT,
    risk_level: FindingRiskLevel::High,
    severity: Severity::Warning,
    legal_basis: FISCAL_SUPERVISION_LEGAL_BASIS,
    audit_rationale:
        "同金额、同科目、近时点重复支付是财政监督中的高频核查点，可能对应重复报销或重复拨付。",
    recommended_action:
        "核对收款对象、支付批次、业务单据和审批流水，确认是否存在重复支付并及时追偿或冲销。",
};

pub const DATE_REVERSAL_METADATA: FindingMetadata = FindingMetadata {
    rule_code: "FISCAL-TIME-001",
    rule_name: "支付时序倒挂",
    rule_category: CATEGORY_PAYMENT_TIMING,
    risk_level: FindingRiskLevel::Medium,
    severity: Severity::Warning,
    legal_basis: ACCOUNTING_VOUCHER_LEGAL_BASIS,
    audit_rationale: "支付日期倒挂可能反映补录、倒填或异常冲账行为，需要结合业务流程核验。",
    recommended_action: "核对业务发生时间、审批时间和记账时间，确认是否存在倒签、补录或事后调整。",
};

pub const DATE_GAP_METADATA: FindingMetadata = FindingMetadata {
    rule_code: "FISCAL-TIME-002",
    rule_name: "支付时点异常间断",
    rule_category: CATEGORY_PAYMENT_TIMING,
    risk_level: FindingRiskLevel::Medium,
    severity: Severity::Warning,
    legal_basis: FISCAL_SUPERVISION_LEGAL_BASIS,
    audit_rationale:
        "财政业务长期无交易后突然集中支付，可能意味着延后确认、集中列支或阶段性突击处理。",
    recommended_action: "核对间断期间业务背景和后续集中支付原因，判断是否存在集中列支或异常补记。",
};

pub const ROUND_AMOUNT_METADATA: FindingMetadata = FindingMetadata {
    rule_code: "FISCAL-DUP-002",
    rule_name: "整数金额集中支付",
    rule_category: CATEGORY_DUPLICATE_SPLIT,
    risk_level: FindingRiskLevel::Medium,
    severity: Severity::Warning,
    legal_basis: FISCAL_SUPERVISION_LEGAL_BASIS,
    audit_rationale: "大量整数金额支付可能意味着拆分拨付、模板化报销或缺乏真实业务定价基础。",
    recommended_action: "抽查对应业务合同、预算批复和支付凭证，确认金额形成依据是否充分。",
};

pub const BENFORD_ALERT_METADATA: FindingMetadata = FindingMetadata {
    rule_code: "FISCAL-FLOW-002",
    rule_name: "金额分布异常",
    rule_category: CATEGORY_FUND_FLOW,
    risk_level: FindingRiskLevel::Medium,
    severity: Severity::Warning,
    legal_basis: ACCOUNTING_VOUCHER_LEGAL_BASIS,
    audit_rationale: "金额首位分布明显偏离自然分布时，可能意味着人工拼凑、模板化录入或异常筛选。",
    recommended_action: "结合大额支出、整数金额和重点科目进一步抽样，核验金额形成逻辑。",
};

pub const BENFORD_SUMMARY_METADATA: FindingMetadata = FindingMetadata {
    rule_code: "FISCAL-FLOW-003",
    rule_name: "金额分布概览",
    rule_category: CATEGORY_FUND_FLOW,
    risk_level: FindingRiskLevel::Low,
    severity: Severity::Info,
    legal_basis: ACCOUNTING_VOUCHER_LEGAL_BASIS,
    audit_rationale: "Benford 分布概览用于辅助判断金额整体分布是否自然，不单独构成审计结论。",
    recommended_action: "将该概览与具体高风险规则结果结合使用，不单独作为整改依据。",
};

pub const ROUND_TRIP_METADATA: FindingMetadata = FindingMetadata {
    rule_code: "FISCAL-FLOW-004",
    rule_name: "同日同额资金回流",
    rule_category: CATEGORY_FUND_FLOW,
    risk_level: FindingRiskLevel::High,
    severity: Severity::Warning,
    legal_basis: FISCAL_SUPERVISION_LEGAL_BASIS,
    audit_rationale:
        "同日同额多次流转是财政资金回流和异常往返的重要线索，需重点核查资金用途真实性。",
    recommended_action: "核对收付款双方、资金用途和原始单据，确认是否存在资金回流或循环支付。",
};

pub const PERIOD_END_METADATA: FindingMetadata = FindingMetadata {
    rule_code: "FISCAL-TIME-003",
    rule_name: "期末集中支付",
    rule_category: CATEGORY_PAYMENT_TIMING,
    risk_level: FindingRiskLevel::High,
    severity: Severity::Warning,
    legal_basis: FISCAL_SUPERVISION_LEGAL_BASIS,
    audit_rationale: "月末或期末集中支付常见于突击执行预算、调节支出节奏或期末冲量。",
    recommended_action: "重点核对期末支付审批依据、预算执行节点和业务实质，确认是否存在突击列支。",
};

pub const FREQUENT_LEDGER_METADATA: FindingMetadata = FindingMetadata {
    rule_code: "FISCAL-LEDGER-001",
    rule_name: "高频往来科目组合",
    rule_category: CATEGORY_LEDGER,
    risk_level: FindingRiskLevel::Medium,
    severity: Severity::Info,
    legal_basis: ACCOUNTING_VOUCHER_LEGAL_BASIS,
    audit_rationale: "高频往来科目组合可能意味着挂账、往来清理不及时或固定模式下的异常资金流转。",
    recommended_action: "抽查高频组合背后的业务场景，确认往来挂账是否真实、及时和闭环。",
};

pub const ZSCORE_METADATA: FindingMetadata = FindingMetadata {
    rule_code: "FISCAL-FLOW-005",
    rule_name: "异常金额波动",
    rule_category: CATEGORY_FUND_FLOW,
    risk_level: FindingRiskLevel::Medium,
    severity: Severity::Warning,
    legal_basis: FISCAL_SUPERVISION_LEGAL_BASIS,
    audit_rationale:
        "异常波动金额可能对应非常规支付、集中调拨或单笔异常支出，需要结合预算和用途核实。",
    recommended_action: "结合预算指标、支付审批和业务说明，对异常波动交易逐笔抽查。",
};
