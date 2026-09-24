"""Unit test MedSafe rule engine — không cần DB.

Kiểm tra đủ 5 trạng thái bắt buộc và các tình huống nhóm "Rule engine" của README mục 14:
có/không quy tắc, dữ liệu thiếu, dữ liệu quá cũ (mô phỏng qua thiếu), nhiều cảnh báo.
"""
from app.modules.safety.engine import (
    STATUS_FAILED,
    STATUS_HAS_ALERTS,
    STATUS_INSUFFICIENT_DATA,
    STATUS_NO_ALERTS_IN_SCOPE,
    STATUS_OUT_OF_SCOPE,
    EngineDrug,
    PatientContext,
    run_checks,
)


def rule(**kw):
    base = {
        "id": "r1",
        "code": "T001",
        "version": "1.0",
        "type": "drug_drug",
        "title": "Quy tắc test",
        "message": "Nội dung cảnh báo test",
        "severity": "high",
        "status": "approved",
        "condition": {"pair": ["ThuocA", "ThuocB"]},
        "required_data": [],
        "source_title": "Nguồn test",
        "source_version": "1.0",
    }
    base.update(kw)
    return base


def drug(name, ing_ids=None, raw=None):
    return EngineDrug(
        raw_name=raw or name,
        drug_id="d-" + name.lower(),
        name=name,
        ingredient_ids=ing_ids or [],
        ingredient_names=[],
    )


# ---------------- drug_drug ----------------

def test_drug_drug_alert_when_pair_present():
    rules = [rule()]
    drugs = [drug("ThuocA"), drug("ThuocB")]
    res = run_checks(rules, drugs, PatientContext())
    assert res.status == STATUS_HAS_ALERTS
    assert len(res.alerts) == 1
    assert res.alerts[0].rule_code == "T001"
    assert res.alerts[0].source_title == "Nguồn test"
    assert res.alerts[0].source_version == "1.0"


def test_no_rule_no_alert_in_scope():
    rules = []
    drugs = [drug("ThuocA")]
    res = run_checks(rules, drugs, PatientContext())
    assert res.status == STATUS_NO_ALERTS_IN_SCOPE
    assert res.alerts == []


def test_alert_fires_once_per_rule():
    rules = [rule()]
    drugs = [drug("ThuocA"), drug("ThuocB"), drug("ThuocA 500")]
    res = run_checks(rules, drugs, PatientContext())
    assert len(res.alerts) == 1  # 1 quy tắc → 1 cảnh báo, dù pair xuất hiện ở dạng khác


# ---------------- duplicate_ingredient ----------------

def test_duplicate_ingredient_alert():
    rules = [
        rule(
            code="DI1",
            type="duplicate_ingredient",
            condition={"ingredient_id": "ing-paracetamol"},
            severity="high",
        )
    ]
    drugs = [
        drug("Panadol", ing_ids=["ing-paracetamol"]),
        drug("Efferalgan", ing_ids=["ing-paracetamol"]),
    ]
    res = run_checks(rules, drugs, PatientContext())
    assert res.status == STATUS_HAS_ALERTS
    assert res.alerts[0].rule_type == "duplicate_ingredient"
    assert set(res.alerts[0].detail["drugs"]) == {"Panadol", "Efferalgan"}


def test_single_holder_no_duplicate_alert():
    rules = [
        rule(
            code="DI1",
            type="duplicate_ingredient",
            condition={"ingredient_id": "ing-paracetamol"},
        )
    ]
    drugs = [drug("Panadol", ing_ids=["ing-paracetamol"])]
    res = run_checks(rules, drugs, PatientContext())
    assert res.status == STATUS_NO_ALERTS_IN_SCOPE


# ---------------- drug_allergy ----------------

def test_allergy_alert_with_verified_allergy():
    rules = [
        rule(
            code="DA1",
            type="drug_allergy",
            condition={"ingredient_ids": ["ing-amox"], "allergy_names": ["Penicillin", "Amoxicillin"]},
        )
    ]
    drugs = [drug("Amoxicillin 500mg", ing_ids=["ing-amox"])]
    patient = PatientContext(allergy_ingredient_names=["Penicillin"])
    res = run_checks(rules, drugs, patient)
    assert res.status == STATUS_HAS_ALERTS
    assert res.alerts[0].rule_type == "drug_allergy"
    assert res.alerts[0].detail["matched_ingredient"] == "ing-amox"


def test_allergy_no_cross_reactivity_guessing():
    """Không suy diễn dị ứng chéo: dị ứng Penicillin không tự khớp Cephalexin."""
    rules = [
        rule(
            code="DA1",
            type="drug_allergy",
            condition={"ingredient_ids": ["ing-amox"], "allergy_names": ["Penicillin"]},
        )
    ]
    drugs = [drug("Cephalexin 500mg", ing_ids=["ing-cefa"])]
    patient = PatientContext(allergy_ingredient_names=["Penicillin"])
    res = run_checks(rules, drugs, patient)
    assert res.status == STATUS_NO_ALERTS_IN_SCOPE


def test_allergy_only_matches_exact_name():
    """Dị ứng khai 'Penicillin V' không khớp 'Penicillin' (so khớp chính xác, không suy diễn)."""
    rules = [
        rule(
            code="DA1",
            type="drug_allergy",
            condition={"ingredient_ids": [], "allergy_names": ["Penicillin"]},
        )
    ]
    drugs = [drug("Amoxicillin 500mg", ing_ids=["ing-amox"])]
    patient = PatientContext(allergy_ingredient_names=["Penicillin V"])
    res = run_checks(rules, drugs, patient)
    assert res.status == STATUS_NO_ALERTS_IN_SCOPE


# ---------------- drug_condition ----------------

def test_condition_missing_lab_is_insufficient_data():
    rules = [
        rule(
            code="DC1",
            type="drug_condition",
            condition={"drug_names": ["Metformin"], "lab_op": "<", "lab_threshold": 45},
            required_data=["crcl"],
        )
    ]
    drugs = [drug("Metformin 500mg")]
    res = run_checks(rules, drugs, PatientContext())
    assert res.status == STATUS_INSUFFICIENT_DATA
    assert res.missing_data == ["crcl"]
    assert res.alerts == []


def test_condition_below_threshold_alerts():
    rules = [
        rule(
            code="DC1",
            type="drug_condition",
            condition={"drug_names": ["Metformin"], "lab_op": "<", "lab_threshold": 45},
            required_data=["crcl"],
        )
    ]
    drugs = [drug("Metformin 500mg")]
    res = run_checks(rules, drugs, PatientContext(labs={"crcl": "38"}))
    assert res.status == STATUS_HAS_ALERTS
    assert res.alerts[0].detail["crcl"] == "38"


def test_condition_above_threshold_no_alert():
    rules = [
        rule(
            code="DC1",
            type="drug_condition",
            condition={"drug_names": ["Metformin"], "lab_op": "<", "lab_threshold": 45},
            required_data=["crcl"],
        )
    ]
    drugs = [drug("Metformin 500mg")]
    res = run_checks(rules, drugs, PatientContext(labs={"crcl": "70"}))
    assert res.status == STATUS_NO_ALERTS_IN_SCOPE


# ---------------- trạng thái ngoài phạm vi / thất bại ----------------

def test_all_drugs_out_of_scope():
    drugs = [EngineDrug(raw_name="Thuốc dân gian ABC", drug_id=None, name=None)]
    res = run_checks([rule()], drugs, PatientContext())
    assert res.status == STATUS_OUT_OF_SCOPE
    assert res.out_of_scope == ["Thuốc dân gian ABC"]


def test_bad_lab_value_marks_failed_not_alert():
    """Giá trị lab không đọc được → trạng thái failed, KHÔNG im lặng, KHÔNG cảnh báo giả."""
    rules = [
        rule(
            code="DC1",
            type="drug_condition",
            condition={"drug_names": ["Metformin"], "lab_op": "<", "lab_threshold": 45},
            required_data=["crcl"],
        )
    ]
    drugs = [drug("Metformin 500mg")]
    res = run_checks(rules, drugs, PatientContext(labs={"crcl": "không đọc được"}))
    assert res.status == STATUS_FAILED
    assert res.alerts == []


# ---------------- nhiều cảnh báo + quy tắc draft ----------------

def test_multiple_alerts_collected():
    rules = [
        rule(code="DD1"),
        rule(
            code="DC1",
            type="drug_condition",
            condition={"drug_names": ["ThuocA"], "lab_op": "<", "lab_threshold": 45},
            required_data=["crcl"],
        ),
    ]
    drugs = [drug("ThuocA"), drug("ThuocB")]
    res = run_checks(rules, drugs, PatientContext(labs={"crcl": "30"}))
    assert res.status == STATUS_HAS_ALERTS
    assert {a.rule_code for a in res.alerts} == {"DD1", "DC1"}


def test_draft_rule_never_alerts():
    rules = [rule(status="draft")]
    drugs = [drug("ThuocA"), drug("ThuocB")]
    res = run_checks(rules, drugs, PatientContext())
    assert res.status == STATUS_NO_ALERTS_IN_SCOPE
    assert res.alerts == []
