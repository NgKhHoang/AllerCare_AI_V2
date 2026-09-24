"""Service chạy kiểm tra an toàn thuốc: gom dữ liệu → chuẩn hóa → engine → lưu snapshot.

Snapshot input/result là bất biến; AI không tham gia quyết định cảnh báo.
"""
import json

from sqlalchemy.orm import Session

from app.modules.medications.models import Drug
from app.modules.medications.normalize import resolve_drug
from app.modules.patients.models import (
    AllergyRecord,
    ClinicalObservation,
    MedicationRecord,
    PatientProfile,
)
from app.modules.safety.engine import (
    EngineAlert,
    EngineDrug,
    EngineResult,
    PatientContext,
    run_checks,
)
from app.modules.safety.knowledge_models import SafetyRule
from app.modules.safety.check_models import Alert, SafetyCheck


def _lab_key(label: str) -> str:
    return label.strip().lower().replace(" ", "")


def build_patient_context(db: Session, profile: PatientProfile) -> PatientContext:
    """Chỉ dùng dữ liệu đã xác minh cho cảnh báo dị ứng; labs lấy từ observations kind=lab."""
    allergies = (
        db.query(AllergyRecord)
        .filter(
            AllergyRecord.patient_profile_id == profile.id,
            AllergyRecord.verification == "verified",
        )
        .all()
    )
    allergy_names = [a.substance.strip() for a in allergies if a.substance.strip()]

    conditions: list[str] = []
    if profile.chronic_conditions:
        try:
            conditions = list(json.loads(profile.chronic_conditions))
        except json.JSONDecodeError:
            conditions = []

    labs: dict[str, str] = {}
    obs = (
        db.query(ClinicalObservation)
        .filter(
            ClinicalObservation.patient_profile_id == profile.id,
            ClinicalObservation.kind == "lab",
        )
        .order_by(ClinicalObservation.occurred_at.desc())
        .all()
    )
    for o in obs:
        key = _lab_key(o.label)
        if key and key not in labs and o.value is not None:
            labs[key] = o.value

    return PatientContext(
        allergy_ingredient_names=allergy_names,
        chronic_conditions=conditions,
        labs=labs,
    )


def collect_medications(
    db: Session, profile: PatientProfile, medication_ids: list[str] | None = None
) -> list[MedicationRecord]:
    """Mặc định kiểm tra TẤT CẢ thuốc đang dùng + dự kiến; cho phép chọn danh sách cụ thể."""
    q = db.query(MedicationRecord).filter(MedicationRecord.patient_profile_id == profile.id)
    if medication_ids:
        q = q.filter(MedicationRecord.id.in_(medication_ids))
    return q.all()


def to_engine_drugs(db: Session, meds: list[MedicationRecord]) -> list[EngineDrug]:
    drugs: list[EngineDrug] = []
    for m in meds:
        resolved: Drug | None = resolve_drug(db, m.raw_name) if m.drug_id is None else db.get(Drug, m.drug_id)
        if resolved is None:
            drugs.append(EngineDrug(raw_name=m.raw_name, drug_id=None, name=None))
            continue
        links = resolved.ingredients
        drugs.append(
            EngineDrug(
                raw_name=m.raw_name,
                drug_id=resolved.id,
                name=resolved.name,
                ingredient_ids=[li.ingredient_id for li in links],
                ingredient_names=[li.ingredient.name for li in links],
                # UM001: thuốc đang dùng nhưng chưa được bác sĩ xác minh
                is_unverified=(m.verification != "verified" and m.is_current),
                frequency=m.frequency,
                dose=m.dose,
                status=m.status or "active",
            )
        )
    return drugs


def load_rules(db: Session) -> list[dict]:
    rules = db.query(SafetyRule).filter(SafetyRule.status == "approved").all()
    out = []
    for r in rules:
        try:
            cond = json.loads(r.condition_json)
            required = json.loads(r.required_data_json or "[]")
        except json.JSONDecodeError:
            raise ValueError(f"Quy tắc {r.code} v{r.rule_version} có JSON điều kiện không hợp lệ — kiểm tra thất bại thay vì bỏ sót")
        out.append(
            {
                "id": r.id,
                "code": r.code,
                "version": r.rule_version,
                "type": r.rule_type,
                "message": r.message,
                "severity": r.severity,
                "status": r.status,
                "condition": cond,
                "required_data": required,
                "source_title": r.source.title if r.source else "N/A",
                "source_version": r.source.version if r.source else "N/A",
            }
        )
    return out


def run_safety_check(
    db: Session,
    profile: PatientProfile,
    requested_by_user_id: str,
    medication_ids: list[str] | None = None,
) -> SafetyCheck:
    """Chạy kiểm tra và lưu SafetyCheck + Alert. Trả về SafetyCheck vừa tạo."""
    meds = collect_medications(db, profile, medication_ids)
    engine_drugs = to_engine_drugs(db, meds)
    patient = build_patient_context(db, profile)
    rules = load_rules(db)

    result: EngineResult = run_checks(rules, engine_drugs, patient)

    input_snapshot = {
        "medications": [
            {
                "id": m.id,
                "raw_name": m.raw_name,
                "drug_id": next((d.drug_id for d in engine_drugs if d.raw_name == m.raw_name), None),
                "dose": m.dose,
                "route": m.route,
                "frequency": m.frequency,
                "verification": m.verification,
            }
            for m in meds
        ],
        "patient": {
            "verified_allergies": patient.allergy_ingredient_names,
            "chronic_conditions": patient.chronic_conditions,
            "labs": patient.labs,
        },
        "checked_scope": result.checked_scope,
    }

    check = SafetyCheck(
        patient_profile_id=profile.id,
        requested_by_user_id=requested_by_user_id,
        result_status=result.status,
        input_snapshot=json.dumps(input_snapshot, ensure_ascii=False),
        result_json="placeholder",
    )
    db.add(check)
    db.flush()  # lấy check.id

    alerts_payload = []
    for a in result.alerts:
        alert = Alert(
            safety_check_id=check.id,
            rule_id=a.rule_id,
            rule_code=a.rule_code,
            rule_version=a.rule_version,
            severity=a.severity,
            message=a.message,
            source_title=a.source_title,
            source_version=a.source_version,
            detail_json=json.dumps(a.detail, ensure_ascii=False),
        )
        db.add(alert)
        alerts_payload.append(
            {
                "rule_code": a.rule_code,
                "rule_version": a.rule_version,
                "severity": a.severity,
                "message": a.message,
                "source": f"{a.source_title} (v{a.source_version})",
                "detail": a.detail,
            }
        )

    result_payload = {
        "status": result.status,
        "alerts": alerts_payload,
        "out_of_scope": result.out_of_scope,
        "missing_data": result.missing_data,
        "checked_scope": result.checked_scope,
        "note": _status_note(result.status),
    }
    check.result_json = json.dumps(result_payload, ensure_ascii=False)
    db.flush()
    return check


def _status_note(status: str) -> str:
    return {
        "has_alerts": "Có cảnh báo — xem căn cứ và ghi nhận quyết định.",
        "no_alerts_in_scope": "Chưa phát hiện cảnh báo trong phạm vi đã kiểm tra — không đồng nghĩa an toàn.",
        "insufficient_data": "Chưa đủ dữ liệu — cần bổ sung thông tin còn thiếu trước khi kết luận.",
        "out_of_scope": "Ngoài phạm vi hỗ trợ — thuốc/quy tắc chưa có trong danh mục.",
        "failed": "Kiểm tra thất bại — không hiển thị như đã kiểm tra thành công.",
    }.get(status, "")
