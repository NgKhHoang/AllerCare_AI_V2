"""API hướng dẫn dùng thuốc (tài liệu CHI TIẾT mục 4).

Quy trình an toàn bắt buộc:
Toa thuốc của bác sĩ → AI soạn hướng dẫn dễ hiểu (draft) → bác sĩ duyệt (approved,
gửi người bệnh + người nhà) → người bệnh bấm "Tôi đã hiểu cách sử dụng thuốc".
Chọn "Chưa hiểu" → hệ thống tự chuyển câu hỏi cho bác sĩ/điều dưỡng.

AI KHÔNG được: tự thay đổi liều, thêm/bỏ thuốc, đề nghị ngừng thuốc, viết hướng
dẫn khác với toa đã duyệt — nội dung AI soạn bám sát MedicationRecord gốc.
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
    get_owned_patient_profile,
    require_roles,
)
from app.modules.notifications.models import Notification
from app.modules.patients.models import MedicationRecord, PatientProfile
from app.modules.triage.models import MedicationGuide

router = APIRouter(prefix="/guides", tags=["guides"])


class GuideOut(BaseModel):
    id: str
    profile_id: str
    medication_id: str | None
    content: dict
    status: str
    acknowledgment: str
    created_at: str

    @classmethod
    def of(cls, g: "MedicationGuide") -> "GuideOut":
        return cls(
            id=g.id,
            profile_id=g.patient_profile_id,
            medication_id=g.medication_id,
            content=json.loads(g.content_json),
            status=g.status,
            acknowledgment=g.acknowledgment,
            created_at=g.created_at.isoformat(),
        )


class AckIn(BaseModel):
    acknowledgment: str = Field(pattern="^(understood|not_understood)$")


def _draft_from_medication(m: MedicationRecord) -> dict:
    """AI soạn nội dung dễ hiểu từ toa gốc — KHÔNG thêm/bớt/sửa liều.

    Nguồn tên/mục đích: danh mục thuốc + hoạt chất trong hệ thống (không bịa).
    """
    purpose_map = {
        "Paracetamol": "giảm đau, hạ sốt",
        "Amoxicillin": "điều trị nhiễm khuẩn (kháng sinh)",
        "Amoxicillin/Acid clavulanic": "điều trị nhiễm khuẩn (kháng sinh phối hợp)",
        "Ceftriaxone": "điều trị nhiễm khuẩn (kháng sinh tiêm)",
        "Methylprednisolon": "chống viêm, giảm phản ứng dị ứng",
        "Deflazacort": "chống viêm, ức chế miễn dịch",
        "Fexofenadine": "giảm ngứa, dị ứng (kháng histamin)",
        "Rupatadine": "giảm ngứa, dị ứng (kháng histamin)",
        "Esomeprazole": "giảm tiết axit dạ dày (trào ngược)",
        "Omeprazole": "giảm tiết axit dạ dày",
        "Metformin": "điều trị đái tháo đường típ 2",
        "Fusidic acid": "kháng sinh bôi da (viêm da mủ)",
        "Bisoprolol": "điều trị tăng huyết áp/bệnh tim",
        "Losartan": "điều trị tăng huyết áp",
        "Trimetazidine": "bổ trợ điều trị bệnh tim mạch",
        "Clopidogrel": "chống kết tập tiểu cầu (phòng nghẽn mạch)",
        "Ezetimibe/Simvastatin": "giảm mỡ máu",
        "Gabapentin": "giảm đau thần kinh",
        "Zinc": "bổ sung kẽm hỗ trợ phục hồi da",
        "Sodium chloride": "dung dịch truyền phối hợp thuốc",
        "Epinaphrine": "cấp cứu phản vệ",
    }
    ingredient = "không rõ"
    if m.drug_id and m.drug and m.drug.ingredients:
        ingredient = m.drug.ingredients[0].ingredient.name
    purpose = purpose_map.get(ingredient, "điều trị theo chỉ định của bác sĩ")

    return {
        "drug_name": m.raw_name,
        "ingredient": ingredient,
        "purpose": purpose,
        "dose": m.dose or "theo toa bác sĩ",
        "timing": m.timing or m.frequency or "theo hướng dẫn bác sĩ",
        "howto": f"Đường dùng: {m.route or 'uống'}. Uống đúng liều, đúng giờ; quên liều không uống gấp đôi để bù.",
        "warnings": [
            "Không tự tăng/giảm liều hoặc ngừng thuốc khi đã đỡ.",
            "Dùng đủ liệu trình nếu là kháng sinh.",
            "Bảo quản nơi khô mát, tránh nắng, để xa tầm tay trẻ em.",
        ],
        "warning_signs": [
            "Nổi mẩn, ngứa nhiều, sưng mặt/môi — NGỪNG thuốc và liên hệ ngay.",
            "Khó thở, phù môi lưỡi — GỌI 115 NGAY.",
        ],
        "followup": "Tái khám đúng lịch trong mục Lịch hẹn. Có thắc mắc hỏi mục Hỏi đáp AI.",
        "source_label": m.source_label or "Toa thuốc trong hệ thống",
    }


@router.post("/draft/{medication_id}", status_code=201, summary="AI soạn bản nháp hướng dẫn từ toa (bác sĩ/dược sĩ)")
def draft_guide(
    medication_id: str,
    user: CurrentUser = Depends(require_roles("doctor", "pharmacist")),
    db: Session = Depends(get_db),
) -> GuideOut:
    med = db.get(MedicationRecord, medication_id)
    if med is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy thuốc")
    get_assigned_patient_profile(med.patient_profile_id, user, db)  # kiểm tra quyền

    # Trùng bản nháp chưa duyệt → trả lại bản cũ
    existing = (
        db.query(MedicationGuide)
        .filter(
            MedicationGuide.medication_id == med.id,
            MedicationGuide.status == "draft",
        )
        .first()
    )
    if existing:
        return GuideOut.of(existing)

    content = _draft_from_medication(med)
    g = MedicationGuide(
        patient_profile_id=med.patient_profile_id,
        medication_id=med.id,
        content_json=json.dumps(content, ensure_ascii=False),
        ai_draft_note="AI soạn từ toa gốc — chưa duyệt, chưa gửi người bệnh.",
        status="draft",
    )
    db.add(g)
    audit_log(db, user, "draft_guide", "medication_guide", None, f"med={med.id}")
    db.commit()
    db.refresh(g)
    return GuideOut.of(g)


@router.post("/{guide_id}/approve", summary="Bác sĩ duyệt hướng dẫn → gửi người bệnh + người nhà")
def approve_guide(
    guide_id: str,
    user: CurrentUser = Depends(require_roles("doctor")),
    db: Session = Depends(get_db),
) -> GuideOut:
    g = db.get(MedicationGuide, guide_id)
    if g is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy hướng dẫn")
    profile = get_assigned_patient_profile(g.patient_profile_id, user, db)
    if g.status == "approved":
        return GuideOut.of(g)

    g.status = "approved"
    g.approved_by_user_id = user.id
    content = json.loads(g.content_json)

    db.add(Notification(
        for_role="patient", for_user_id=profile.user_id, patient_profile_id=profile.id,
        kind="guide_approved",
        title=f"Hướng dẫn dùng thuốc: {content.get('drug_name', '')}",
        body="Bác sĩ đã duyệt hướng dẫn dùng thuốc mới. Vào mục Hướng dẫn để xem và xác nhận 'Tôi đã hiểu'.",
    ))
    caregivers = db.execute(
        __import__("sqlalchemy").text(
            "SELECT caregiver_user_id FROM caregiver_links WHERE patient_user_id=:p AND active"
        ),
        {"p": profile.user_id},
    ).scalars().all()
    for cid in caregivers:
        db.add(Notification(
            for_role="caregiver", for_user_id=cid, patient_profile_id=profile.id,
            kind="guide_approved",
            title=f"Hướng dẫn dùng thuốc mới cho người thân: {content.get('drug_name', '')}",
            body="Bác sĩ đã duyệt hướng dẫn dùng thuốc. Vui lòng nhắc người thân xác nhận đã hiểu.",
        ))
    audit_log(db, user, "approve_guide", "medication_guide", g.id)
    db.commit()
    db.refresh(g)
    return GuideOut.of(g)


@router.get("/mine", summary="Hướng dẫn đã duyệt dành cho người bệnh hiện tại")
def my_guides(
    user: CurrentUser = Depends(require_roles("patient")),
    db: Session = Depends(get_db),
) -> list[GuideOut]:
    profile = db.query(PatientProfile).filter(PatientProfile.user_id == user.id).first()
    if profile is None:
        return []
    rows = (
        db.query(MedicationGuide)
        .filter(
            MedicationGuide.patient_profile_id == profile.id,
            MedicationGuide.status == "approved",
        )
        .order_by(MedicationGuide.created_at.desc())
        .all()
    )
    return [GuideOut.of(g) for g in rows]


@router.get("/profile/{profile_id}", summary="Xem hướng dẫn của hồ sơ (bác sĩ/điều dưỡng/dược sĩ)")
def profile_guides(
    profile_id: str,
    user: CurrentUser = Depends(require_roles("doctor", "nurse", "pharmacist")),
    db: Session = Depends(get_db),
) -> list[GuideOut]:
    from app.modules.auth.deps import get_patient_profile_for_access

    profile = get_patient_profile_for_access(profile_id, user, db)
    rows = (
        db.query(MedicationGuide)
        .filter(MedicationGuide.patient_profile_id == profile.id)
        .order_by(MedicationGuide.created_at.desc())
        .all()
    )
    return [GuideOut.of(g) for g in rows]


@router.post("/{guide_id}/acknowledge", summary="Người bệnh xác nhận: Tôi đã hiểu / Chưa hiểu cách dùng thuốc")
def acknowledge(
    guide_id: str,
    data: AckIn,
    user: CurrentUser = Depends(require_roles("patient")),
    db: Session = Depends(get_db),
) -> dict:
    profile = get_owned_patient_profile.__wrapped__ if hasattr(get_owned_patient_profile, "__wrapped__") else None
    prof = db.query(PatientProfile).filter(PatientProfile.user_id == user.id).first()
    if prof is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Chưa có hồ sơ")
    g = db.get(MedicationGuide, guide_id)
    if g is None or g.patient_profile_id != prof.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy hướng dẫn của bạn")
    if g.status != "approved":
        raise HTTPException(status.HTTP_409_CONFLICT, "Hướng dẫn chưa được bác sĩ duyệt")

    g.acknowledgment = data.acknowledgment
    g.acknowledged_at = __import__("datetime").datetime.now(__import__("datetime").timezone.utc)
    content = json.loads(g.content_json)

    if data.acknowledgment == "not_understood":
        # Tự chuyển câu hỏi cho bác sĩ + điều dưỡng (tài liệu mục 4)
        db.add(Notification(
            for_role="doctor", for_user_id=prof.assigned_doctor_id, patient_profile_id=prof.id,
            kind="guide_ack",
            title=f"Người bệnh CHƯA HIỂU hướng dẫn: {content.get('drug_name', '')}",
            body=f"{prof.full_name} bấm 'Chưa hiểu' cách dùng thuốc này. Cần liên hệ giải thích lại.",
        ))
        db.add(Notification(
            for_role="nurse", for_user_id=None, patient_profile_id=prof.id,
            kind="guide_ack",
            title=f"Người bệnh cần hỗ trợ giải thích thuốc: {content.get('drug_name', '')}",
            body=f"{prof.full_name} chưa hiểu cách dùng — liên hệ hướng dẫn lại.",
        ))
        db.add(Notification(
            for_role="patient", for_user_id=prof.user_id, patient_profile_id=prof.id,
            kind="guide_ack",
            title="Đã chuyển câu hỏi của bạn cho bác sĩ/điều dưỡng",
            body="Nhân viên y tế sẽ liên hệ giải thích lại cách dùng thuốc sớm nhất.",
        ))
    audit_log(db, user, "guide_ack", "medication_guide", g.id, f"ack={data.acknowledgment}")
    db.commit()
    return {"id": g.id, "acknowledgment": g.acknowledgment}
