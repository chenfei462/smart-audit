use serde_json::Value;
use std::fs;
use std::path::Path;

#[test]
fn nanjing_commerce_linkage_baseline_stays_stable() {
    let path = Path::new("data/regression/nanjing_commerce_baseline.json");
    assert!(
        path.exists(),
        "南京商务局回归样本缺失: {}. If the sample is intentionally unavailable, record the blocker in docs/STATUS.md.",
        path.display()
    );
    let value: Value = serde_json::from_str(&fs::read_to_string(path).unwrap()).unwrap();
    let summary = &value["budget_linkage_summary"];

    assert_eq!(summary["evidence_auto_linked_procurement_projects"], 34);
    assert_eq!(summary["exact_linked_procurement_projects"], 0);
    assert_eq!(summary["unlinked_procurement_projects"], 939);
}
