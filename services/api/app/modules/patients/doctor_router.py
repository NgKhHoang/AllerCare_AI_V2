"""API cho bác sĩ: danh sách ca được phân công và xác minh dữ liệu người bệnh.

Router này phải được include TRƯỚC router tổng /patients/{profile_id}
để /patients/assigned không bị nuốt bởi đường dẫn động.
"""
import json

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.db import get_db
from app.modules.auth.deps import (
    CurrentUser,
    audit_log,
    get_assigned_patient_profile,
    require_roles,
)
from app.modules.patients.models import (
    AllergyRecord,
    CareAssignment,
    ClinicalObservation,
    MedicationRecord,
    PatientProfile,
    User,
)
from app.modules.patients.schemas import ProfileOut
from app.modules.triage.models import ObservationSummary, TriageAssessment

router = APIRouter(prefix="/patients", tags=["doctor-portal"])


class VerifyIn(BaseModel):
    verify: bool = Field(description="True = xác minh, False = hủy xác minh")


class ObservationStatusIn(BaseModel):
    status: str = Field(pattern="^(seen|responded)$")


@router.get("/assigned", summary="Danh sách người bệnh được phân công cho bác sĩ hiện tại")
def list_assigned_patients(
    user: CurrentUser = Depends(require_roles("doctor")),
    db: Session = Depends(get_db),
) -> list[dict]:
    rows = (
        db.query(PatientProfile, User)
        .join(User, User.id == PatientProfile.user_id)
        .filter(PatientProfile.assigned_doctor_id == user.id)
        .order_by(PatientProfile.full_name)
        .all()
    )
    result = []
    for profile, account in rows:
        unseen = (
            db.query(ClinicalObservation)
            .filter(
                ClinicalObservation.patient_profile_id == profile.id,
                ClinicalObservation.status == "sent",
            )
            .count()
        )
        result.append(
            {
                "profile_id": profile.id,
                "full_name": profile.full_name,
                "dob": profile.dob,
                "gender": profile.gender,
                "username": account.username,
                "unseen_updates": unseen,
            }
        )
    return result


@router.post("/{profile_id}/verify-medication/{medication_id}", summary="Bác sĩ xác minh thuốc")
def verify_medication(
    profile_id: str,
    medication_id: str,
    data: VerifyIn,
    user: CurrentUser = Depends(require_roles("doctor")),
    db: Session = Depends(get_db),
) -> dict:
    profile = get_assigned_patient_profile(profile_id, user, db)
    med = db.get(MedicationRecord, medication_id)
    if med is None or med.patient_profile_id != profile.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy thuốc trong hồ sơ này")
    med.verification = "verified" if data.verify else "unverified"
    med.source_label = "Bác sĩ xác nhận" if data.verify else med.source_label
    audit_log(db, user, "verify_medication", "medication_record", med.id, f"verify={data.verify}")
    db.commit()
    return {"id": med.id, "verification": med.verification}


@router.post("/{profile_id}/verify-allergy/{allergy_id}", summary="Bác sĩ xác minh tiền sử dị ứng")
def verify_allergy(
    profile_id: str,
    allergy_id: str,
    data: VerifyIn,
    user: CurrentUser = Depends(require_roles("doctor")),
    db: Session = Depends(get_db),
) -> dict:
    profile = get_assigned_patient_profile(profile_id, user, db)
    allergy = db.get(AllergyRecord, allergy_id)
    if allergy is None or allergy.patient_profile_id != profile.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy dị ứng trong hồ sơ này")
    allergy.verification = "verified" if data.verify else "unverified"
    allergy.verified_by_user_id = user.id if data.verify else None
    audit_log(db, user, "verify_allergy", "allergy_record", allergy.id, f"verify={data.verify}")
    db.commit()
    return {"id": allergy.id, "verification": allergy.verification}


@router.post("/{profile_id}/observations/{observation_id}/status", summary="Đánh dấu đã xem/phản hồi cập nhật")
def set_observation_status(
    profile_id: str,
    observation_id: str,
    data: ObservationStatusIn,
    user: CurrentUser = Depends(require_roles("doctor")),
    db: Session = Depends(get_db),
) -> dict:
    profile = get_assigned_patient_profile(profile_id, user, db)
    obs = db.get(ClinicalObservation, observation_id)
    if obs is None or obs.patient_profile_id != profile.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy cập nhật trong hồ sơ này")
    obs.status = data.status
    audit_log(db, user, "observation_status", "clinical_observation", obs.id, f"status={data.status}")
    db.commit()
    return {"id": obs.id, "status": obs.status}


@router.get("/{profile_id}/ai-summary", summary="AI tóm tắt diễn biến cho bác sĩ (chỉ tổng hợp dữ liệu hệ thống)")
def ai_summary(
    profile_id: str,
    user: CurrentUser = Depends(require_roles("doctor", "nurse")),
    db: Session = Depends(get_db),
) -> dict:
    """AI tổng hợp: triệu chứng mới nhất, thuốc đang dùng (theo nguồn), phân luồng gần nhất,
    dị ứng đã xác minh — mỗi câu gắn nguồn dữ liệu. AI KHÔNG chẩn đoán, chỉ TỔNG HỢP."""
    profile = get_assigned_patient_profile(profile_id, user, db)

    obs = (
        db.query(ClinicalObservation)
        .filter(ClinicalObservation.patient_profile_id == profile.id)
        .order_by(ClinicalObservation.occurred_at.desc())
        .limit(10)
        .all()
    )
    meds = (
        db.query(MedicationRecord)
        .filter(MedicationRecord.patient_profile_id == profile.id)
        .all()
    )
    allergies = (
        db.query(AllergyRecord)
        .filter(AllergyRecord.patient_profile_id == profile.id)
        .all()
    )
    triages = (
        db.query(TriageAssessment)
        .filter(TriageAssessment.patient_profile_id == profile.id)
        .order_by(TriageAssessment.created_at.desc())
        .limit(5)
        .all()
    )

    # ---- Tổng hợp (mock AI thuần dữ liệu hệ thống — không bịa) ----
    symptom_lines = [
        f"- {o.occurred_at}: {o.label}" + (f" ({o.value} {o.unit})" if o.value else "")
        + (" [kèm ảnh]" if o.image_url else "")
        for o in obs
        if o.kind == "symptom"
    ]
    lab_lines = [
        f"- {o.occurred_at}: {o.label} = {o.value} {o.unit or ''}"
        for o in obs
        if o.kind == "lab" and o.value
    ]
    by_source: dict[str, list[str]] = {}
    for m in meds:
        src = m.source_label or "Không rõ nguồn"
        tag = "" if m.verification == "verified" else " (chưa xác minh)"
        stopped = f" — đã ngừng: {m.stop_reason}" if m.status == "stopped" else (" — dùng không đều" if m.status == "irregular" else "")
        by_source.setdefault(src, []).append(f"{m.raw_name}{tag}{stopped}")
    med_lines = [f"- Nguồn «{src}»: " + "; ".join(items) for src, items in by_source.items()]

    allergy_lines = [
        f"- {a.substance} ({a.verification})" + (f": {a.reaction[:80]}" if a.reaction else "")
        for a in allergies
    ]
    triage_lines = [
        f"- {t.created_at.strftime('%d/%m %H:%M')}: [{t.level.upper()}] {t.message[:80]}"
        for t in triages
    ]

    highlights: list[str] = []
    if any(a.verification == "verified" and a.severity == "high" for a in allergies):
        highlights.append("⚠ Có dị ứng mức CAO đã xác minh — rà soát mọi toa mới.")
    if any(t.level == "red" for t in triages):
        highlights.append("🚨 Có lần phân luồng ĐỎ — kiểm tra diễn biến sau cấp cứu.")
    if any(m.verification != "verified" and m.is_current for m in meds):
        highlights.append("? Có thuốc đang dùng chưa xác minh — cần xác nhận trước khi tổng liều.")
    if len(by_source) > 1:
        highlights.append(f"📋 Người bệnh dùng thuốc từ {len(by_source)} nguồn khác nhau — cần đối soát.")
    if not highlights:
        highlights.append("Không có dấu hiệu nguy cơ nổi bật trong dữ liệu gần đây.")

    summary_text = (
        f"{profile.full_name}: {len(symptom_lines)} triệu chứng, {len(meds)} thuốc "
        f"({len(by_source)} nguồn), {len(allergies)} dị ứng, {len(triages)} phân luồng gần nhất. "
        + ("Triệu chứng gần nhất: " + symptom_lines[0][2:] if symptom_lines else "Chưa có triệu chứng nào được khai.")
    )

    content = {
        "summary": summary_text,
        "highlights": highlights,
        "symptoms": symptom_lines,
        "labs": lab_lines,
        "medications_by_source": med_lines,
        "allergies": allergy_lines,
        "triage_recent": triage_lines,
        "disclaimer": "AI tổng hợp từ dữ liệu hệ thống — không chẩn đoán. Bác sĩ quyết định dựa trên dữ liệu gốc.",
    }

    saved = ObservationSummary(
        patient_profile_id=profile.id,
        content_json=json.dumps(content, ensure_ascii=False),
        generated_by="mock-ai",
    )
    db.add(saved)
    audit_log(db, user, "ai_summary", "patient_profile", profile.id)
    db.commit()
    return content
