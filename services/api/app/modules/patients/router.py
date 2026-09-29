"""API hồ sơ người bệnh — phân quyền theo từng hồ sơ, mọi khai báo gắn nhãn unverified."""
from datetime import datetime, timezone
import json
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.db import get_db
from app.modules.auth.deps import (
    CurrentUser,
    audit_log,
    get_current_user,
    get_owned_patient_profile,
)
from app.modules.patients.models import (
    AllergyRecord,
    ClinicalObservation,
    MedicationRecord,
    PatientProfile,
)
from app.modules.patients.schemas import (
    AllergyIn,
    AllergyOut,
    MedicationIn,
    MedicationOut,
    ObservationIn,
    ObservationOut,
    ProfileOut,
    TreatmentUpdateIn,
)

router = APIRouter(prefix="/patients", tags=["patients"])


@router.get("/me/profile", summary="Hồ sơ của người bệnh hiện tại")
def my_profile(
    user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ProfileOut:
    profile = db.query(PatientProfile).filter(PatientProfile.user_id == user.id).first()
    if profile is None:
        from fastapi import HTTPException, status

        raise HTTPException(status.HTTP_404_NOT_FOUND, "Chưa có hồ sơ người bệnh cho tài khoản này")
    return profile


@router.get("/{profile_id}", summary="Xem hồ sơ theo id (chính chủ hoặc bác sĩ được phân công)")
def get_profile(
    profile_id: str,
    user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ProfileOut:
    from app.modules.auth.deps import get_patient_profile_for_access

    profile = get_patient_profile_for_access(profile_id, user, db)
    audit_log(db, user, "view_profile", "patient_profile", profile.id)
    db.commit()
    return profile


@router.put("/{profile_id}/treatment", summary="Cập nhật Loại bệnh đang điều trị, trạng thái và mốc tái khám")
def update_treatment(
    profile_id: str,
    data: TreatmentUpdateIn,
    user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ProfileOut:
    import json
    from app.modules.auth.deps import get_patient_profile_for_access
    from app.modules.triage.models import Notification
    from app.modules.audit.models import new_id

    profile = get_patient_profile_for_access(profile_id, user, db)

    # Thêm loại bệnh mới nếu có new_condition_name
    if data.new_condition_name and data.new_condition_name.strip():
        new_name = data.new_condition_name.strip()
        current_list = []
        if profile.chronic_conditions:
            try:
                parsed = json.loads(profile.chronic_conditions)
                if isinstance(parsed, list):
                    current_list = parsed
            except Exception:
                current_list = []
        
        new_cond = {
            "id": f"cond_{len(current_list)+1}_{int(datetime.now(timezone.utc).timestamp())}",
            "name": new_name,
            "status": data.treatment_status or "active",
            "start_date": data.treatment_start_date or datetime.now(timezone.utc).strftime("%Y-%m-%d"),
            "followup_date": data.followup_date,
            "note": data.admission_note or "",
        }
        current_list.append(new_cond)
        profile.chronic_conditions = json.dumps(current_list, ensure_ascii=False)
        if not profile.diagnosis or profile.diagnosis == "Đang cập nhật":
            profile.diagnosis = new_name
            profile.treatment_status = data.treatment_status or "active"
            profile.treatment_start_date = data.treatment_start_date
            profile.followup_date = data.followup_date
            profile.admission_note = data.admission_note
    else:
        if data.diagnosis is not None:
            profile.diagnosis = data.diagnosis.strip() if data.diagnosis else None
        if data.treatment_status is not None:
            profile.treatment_status = data.treatment_status.strip()
        if data.treatment_start_date is not None:
            profile.treatment_start_date = data.treatment_start_date.strip() if data.treatment_start_date else None
        if data.followup_date is not None:
            profile.followup_date = data.followup_date.strip() if data.followup_date else None
        if data.admission_note is not None:
            profile.admission_note = data.admission_note.strip() if data.admission_note else None
        if data.chronic_conditions is not None:
            if isinstance(data.chronic_conditions, list):
                profile.chronic_conditions = json.dumps(data.chronic_conditions, ensure_ascii=False)
            else:
                profile.chronic_conditions = data.chronic_conditions

        # Nếu có condition_id cụ thể khác primary, cập nhật mục đó trong chronic_conditions
        if data.condition_id and data.condition_id != "primary" and profile.chronic_conditions:
            try:
                parsed = json.loads(profile.chronic_conditions)
                if isinstance(parsed, list):
                    updated = False
                    for c in parsed:
                        if isinstance(c, dict) and c.get("id") == data.condition_id:
                            if data.diagnosis:
                                c["name"] = data.diagnosis
                            if data.treatment_status:
                                c["status"] = data.treatment_status
                            if data.treatment_start_date:
                                c["start_date"] = data.treatment_start_date
                            if data.followup_date:
                                c["followup_date"] = data.followup_date
                            if data.admission_note is not None:
                                c["note"] = data.admission_note
                            updated = True
                            break
                    if updated:
                        profile.chronic_conditions = json.dumps(parsed, ensure_ascii=False)
            except Exception:
                pass

    # Nếu bác sĩ cập nhật thì gửi thông báo đến người bệnh
    if user.role in ("doctor", "pharmacist"):
        doc_name = user.full_name or user.username
        st_map = {
            "active": "Đang điều trị",
            "transferred": "Đã chuyển viện",
            "completed": "Kết thúc điều trị",
        }
        notif = Notification(
            id=new_id(),
            for_user_id=profile.user_id,
            for_role="patient",
            patient_profile_id=profile.id,
            kind="treatment_updated",
            title="🩺 Cập nhật phác đồ điều trị từ Bác sĩ",
            body=f"Bác sĩ {doc_name} đã cập nhật tiến trình điều trị: {profile.diagnosis or 'Phác đồ mới'}. Trạng thái: {st_map.get(profile.treatment_status, 'Đang điều trị')}. Mốc tái khám: {profile.followup_date or 'Theo hẹn'}.",
        )
        db.add(notif)

    audit_log(db, user, "update_treatment", "patient_profile", profile.id, f"status={profile.treatment_status}")
    db.commit()
    db.refresh(profile)
    return ProfileOut.model_validate(profile)


@router.get("/{profile_id}/timeline", summary="Lấy dữ liệu Cây timeline ngang quá trình điều trị")
def get_treatment_timeline(
    profile_id: str,
    user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    import json
    from app.modules.auth.deps import get_patient_profile_for_access
    from app.modules.consultations.models import Appointment

    profile = get_patient_profile_for_access(profile_id, user, db)
    meds = (
        db.query(MedicationRecord)
        .filter(MedicationRecord.patient_profile_id == profile.id)
        .order_by(MedicationRecord.created_at.asc())
        .all()
    )
    allergies = (
        db.query(AllergyRecord)
        .filter(AllergyRecord.patient_profile_id == profile.id)
        .all()
    )
    appointments = (
        db.query(Appointment)
        .filter(Appointment.patient_user_id == profile.user_id)
        .order_by(Appointment.scheduled_at.asc())
        .all()
    )

    st_map = {
        "active": "Đang điều trị",
        "transferred": "Đã chuyển viện",
        "completed": "Kết thúc điều trị",
    }

    start_date = profile.treatment_start_date or (profile.created_at.strftime("%Y-%m-%d") if profile.created_at else "2026-09-01")
    followup_date = profile.followup_date
    if not followup_date and appointments:
        future_appts = [a for a in appointments if a.status in ("pending", "confirmed")]
        if future_appts:
            followup_date = future_appts[0].scheduled_at[:10]

    # Xây dựng danh sách các loại bệnh đang điều trị (Conditions List)
    conditions_list = []
    if profile.diagnosis:
        conditions_list.append({
            "id": "primary",
            "name": profile.diagnosis,
            "status": profile.treatment_status or "active",
            "status_label": st_map.get(profile.treatment_status, "Đang điều trị"),
            "start_date": start_date,
            "followup_date": followup_date,
            "note": profile.admission_note or "",
        })

    if profile.chronic_conditions:
        try:
            parsed = json.loads(profile.chronic_conditions)
            if isinstance(parsed, list):
                for idx, c in enumerate(parsed):
                    if isinstance(c, dict):
                        c_name = c.get("name") or c.get("diagnosis")
                        if c_name and c_name != profile.diagnosis:
                            c_status = c.get("status", "active")
                            conditions_list.append({
                                "id": c.get("id") or f"cond_{idx+1}",
                                "name": c_name,
                                "status": c_status,
                                "status_label": st_map.get(c_status, "Đang điều trị"),
                                "start_date": c.get("start_date") or start_date,
                                "followup_date": c.get("followup_date") or followup_date,
                                "note": c.get("note", ""),
                            })
                    elif isinstance(c, str) and c.strip():
                        c_str = c.strip()
                        if c_str != profile.diagnosis:
                            conditions_list.append({
                                "id": f"cond_{idx+1}",
                                "name": c_str,
                                "status": "active",
                                "status_label": "Đang điều trị",
                                "start_date": start_date,
                                "followup_date": followup_date,
                                "note": "",
                            })
        except Exception:
            pass

    if not conditions_list:
        conditions_list.append({
            "id": "primary",
            "name": "Bệnh lý chung / Theo dõi chuyên khoa",
            "status": profile.treatment_status or "active",
            "status_label": st_map.get(profile.treatment_status, "Đang điều trị"),
            "start_date": start_date,
            "followup_date": followup_date,
            "note": profile.admission_note or "",
        })

    milestones = []

    # Mốc 1: Bắt đầu điều trị
    milestones.append({
        "step": 1,
        "type": "start",
        "date": start_date,
        "title": "Bắt đầu điều trị",
        "diagnosis": profile.diagnosis or "Theo dõi & điều trị chuyên khoa",
        "badge": "Khởi đầu",
        "badge_cls": "badge badge-info",
        "description": f"Chẩn đoán: {profile.diagnosis or 'Chưa nhập'}. Bác sĩ tiếp nhận ca bệnh.",
        "icon": "🚩",
    })

    # Mốc 2: Các mốc sử dụng thuốc
    med_items = []
    for m in meds:
        if m.is_current:
            med_items.append({
                "id": m.id,
                "name": m.raw_name,
                "dose": m.dose or "Theo chỉ định",
                "timing": m.timing or "8h sáng và 20h tối",
                "frequency": m.frequency or "Hàng ngày",
                "prescriber": m.prescriber or m.source_label or "Bác sĩ kê",
                "verification": m.verification,
                "status": m.status,
            })

    med_date = meds[0].start_date if (meds and meds[0].start_date) else start_date
    milestones.append({
        "step": 2,
        "type": "medications",
        "date": med_date,
        "title": f"Phác đồ thuốc ({len(med_items)} loại đang dùng)",
        "badge": "Đang dùng",
        "badge_cls": "badge badge-ok",
        "items": med_items,
        "description": "Tuân thủ uống thuốc đúng liều và thời điểm chỉ định.",
        "icon": "💊",
    })

    # Mốc 3: Mốc tái khám
    milestones.append({
        "step": 3,
        "type": "followup",
        "date": followup_date or "Dự kiến 2-4 tuần",
        "title": "Mốc tái khám định kỳ",
        "badge": "Tái khám",
        "badge_cls": "badge badge-warning" if followup_date else "badge badge-neutral",
        "description": f"Lịch hẹn khám và đánh giá lại đáp ứng thuốc cùng Bác sĩ điều trị. Ngày: {followup_date or 'Cần hẹn lịch'}",
        "icon": "🗓️",
    })

    return {
        "profile_id": profile.id,
        "full_name": profile.full_name,
        "diagnosis": profile.diagnosis or "Đang cập nhật",
        "treatment_status": profile.treatment_status or "active",
        "treatment_status_label": st_map.get(profile.treatment_status, "Đang điều trị"),
        "treatment_start_date": start_date,
        "followup_date": followup_date,
        "admission_note": profile.admission_note,
        "conditions": conditions_list,
        "active_medications": med_items,
        "allergies": [{"id": a.id, "substance": a.substance, "severity": a.severity, "reaction": a.reaction, "verification": a.verification} for a in allergies],
        "milestones": milestones,
    }



@router.get("/{profile_id}/medications", summary="Danh sách thuốc của hồ sơ")
def list_medications(
    profile_id: str,
    user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[MedicationOut]:
    from app.modules.auth.deps import get_patient_profile_for_access

    profile = get_patient_profile_for_access(profile_id, user, db)
    meds = (
        db.query(MedicationRecord)
        .filter(MedicationRecord.patient_profile_id == profile.id)
        .order_by(MedicationRecord.created_at.desc())
        .all()
    )
    return [MedicationOut.model_validate(m) for m in meds]


@router.post("/{profile_id}/medications", status_code=201, summary="Khai báo thuốc — mọi nguồn (WHO reconciliation)")
def add_medication(
    profile_id: str,
    data: MedicationIn,
    user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> MedicationOut:
    """Người bệnh khai thuốc hoặc Bác sĩ/Dược sĩ thêm thuốc dự kiến / kê đơn."""
    from app.modules.auth.deps import get_assigned_patient_profile, get_owned_patient_profile

    if user.role in ("doctor", "pharmacist", "nurse"):
        profile = get_assigned_patient_profile(profile_id, user, db)
        is_doc = user.role == "doctor"
    else:
        profile = get_owned_patient_profile(profile_id, user, db)
        is_doc = False

    verification = "verified" if (is_doc and not data.is_planned) else "unverified"
    source_label = data.source_label or (f"Kê bởi {user.full_name or 'Bác sĩ'}" if is_doc else "Khai báo bởi người bệnh")

    med = MedicationRecord(
        patient_profile_id=profile.id,
        raw_name=data.raw_name.strip(),
        is_current=data.is_current,
        is_planned=data.is_planned,
        dose=data.dose,
        route=data.route,
        frequency=data.frequency,
        timing=data.timing,
        start_date=data.start_date,
        prescriber=data.prescriber or (user.full_name if is_doc else None),
        status=data.status or ("active" if data.is_current else "stopped"),
        stop_reason=data.stop_reason,
        last_reaction=data.last_reaction,
        image_url=data.image_url,
        verification=verification,
        reported_by_user_id=user.id,
        source_label=source_label,
    )
    db.add(med)
    audit_log(db, user, "add_medication", "medication_record", None, f"profile={profile.id}")
    db.commit()
    db.refresh(med)
    return MedicationOut.model_validate(med)


@router.post("/{profile_id}/medications/{medication_id}/stop", summary="Ngừng một thuốc (ghi lý do)")
def stop_medication(
    profile_id: str,
    medication_id: str,
    reason: str | None = None,
    user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    from app.modules.auth.deps import get_assigned_patient_profile, get_owned_patient_profile

    if user.role in ("doctor", "pharmacist", "nurse"):
        profile = get_assigned_patient_profile(profile_id, user, db)
    else:
        profile = get_owned_patient_profile(profile_id, user, db)

    med = db.get(MedicationRecord, medication_id)
    if med is None or med.patient_profile_id != profile.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy thuốc")
    med.is_current = False
    med.status = "stopped"
    med.stop_reason = (reason or f"Ngừng theo chỉ định của {user.full_name or user.role}")[:200]
    audit_log(db, user, "stop_medication", "medication_record", med.id, med.stop_reason)
    db.commit()
    return {"id": med.id, "status": med.status, "stop_reason": med.stop_reason}


@router.get("/{profile_id}/observations", summary="Dòng thời gian triệu chứng/xét nghiệm")
def list_observations(
    profile_id: str,
    user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[ObservationOut]:
    from app.modules.auth.deps import get_patient_profile_for_access

    profile = get_patient_profile_for_access(profile_id, user, db)
    obs = (
        db.query(ClinicalObservation)
        .filter(ClinicalObservation.patient_profile_id == profile.id)
        .order_by(ClinicalObservation.occurred_at.desc())
        .all()
    )
    return [ObservationOut.model_validate(o) for o in obs]


@router.post("/{profile_id}/observations", status_code=201, summary="Khai báo triệu chứng/xét nghiệm")
def add_observation(
    profile_id: str,
    data: ObservationIn,
    user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ObservationOut:
    from app.modules.auth.deps import get_assigned_patient_profile, get_owned_patient_profile

    if user.role in ("doctor", "pharmacist", "nurse"):
        profile = get_assigned_patient_profile(profile_id, user, db)
    else:
        profile = get_owned_patient_profile(profile_id, user, db)

    obs = ClinicalObservation(
        patient_profile_id=profile.id,
        kind=data.kind,
        label=data.label.strip(),
        value=data.value,
        unit=data.unit,
        occurred_at=data.occurred_at,
        image_url=data.image_url,
        status="sent",
        verification="unverified",
        reported_by_user_id=user.id,
    )
    db.add(obs)
    audit_log(db, user, "add_observation", "clinical_observation", None, f"profile={profile.id}")
    db.commit()
    db.refresh(obs)
    return ObservationOut.model_validate(obs)


@router.get("/{profile_id}/allergies", summary="Tiền sử dị ứng của hồ sơ")
def list_allergies(
    profile_id: str,
    user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[AllergyOut]:
    from app.modules.auth.deps import get_patient_profile_for_access

    profile = get_patient_profile_for_access(profile_id, user, db)
    rows = (
        db.query(AllergyRecord)
        .filter(AllergyRecord.patient_profile_id == profile.id)
        .order_by(AllergyRecord.created_at.desc())
        .all()
    )
    return [AllergyOut.model_validate(a) for a in rows]


@router.delete("/{profile_id}/medications/{medication_id}", summary="Xóa một thuốc khỏi hồ sơ")
def delete_medication(
    profile_id: str,
    medication_id: str,
    user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    from app.modules.auth.deps import get_assigned_patient_profile, get_owned_patient_profile

    if user.role in ("doctor", "pharmacist", "nurse"):
        profile = get_assigned_patient_profile(profile_id, user, db)
    else:
        profile = get_owned_patient_profile(profile_id, user, db)

    med = db.get(MedicationRecord, medication_id)
    if med is None or med.patient_profile_id != profile.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy thuốc")
    raw_name = med.raw_name
    db.delete(med)
    audit_log(db, user, "delete_medication", "medication_record", medication_id, f"deleted {raw_name}")
    db.commit()
    return {"status": "ok", "deleted_id": medication_id, "message": f"Đã xóa thuốc {raw_name}"}


@router.post("/{profile_id}/allergies", status_code=201, summary="Khai báo tiền sử dị ứng")
def add_allergy(
    profile_id: str,
    data: AllergyIn,
    user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AllergyOut:
    from app.modules.auth.deps import get_assigned_patient_profile, get_owned_patient_profile

    if user.role in ("doctor", "pharmacist", "nurse"):
        profile = get_assigned_patient_profile(profile_id, user, db)
        is_doc = user.role == "doctor"
    else:
        profile = get_owned_patient_profile(profile_id, user, db)
        is_doc = False

    allergy = AllergyRecord(
        patient_profile_id=profile.id,
        substance=data.substance.strip(),
        reaction=data.reaction,
        severity=data.severity or "medium",
        verification="verified" if is_doc else "unverified",
        reported_by_user_id=user.id,
        verified_by_user_id=user.id if is_doc else None,
        onset_date=data.onset_date,
    )
    db.add(allergy)
    audit_log(db, user, "add_allergy", "allergy_record", None, f"profile={profile.id}, substance={data.substance}")
    db.commit()
    db.refresh(allergy)
    return AllergyOut.model_validate(allergy)


@router.delete("/{profile_id}/allergies/{allergy_id}", summary="Xóa một tiền sử dị ứng")
def delete_allergy(
    profile_id: str,
    allergy_id: str,
    user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    from app.modules.auth.deps import get_assigned_patient_profile, get_owned_patient_profile

    if user.role in ("doctor", "pharmacist", "nurse"):
        profile = get_assigned_patient_profile(profile_id, user, db)
    else:
        profile = get_owned_patient_profile(profile_id, user, db)

    alg = db.get(AllergyRecord, allergy_id)
    if alg is None or alg.patient_profile_id != profile.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy tiền sử dị ứng")
    substance = alg.substance
    db.delete(alg)
    audit_log(db, user, "delete_allergy", "allergy_record", allergy_id, f"deleted {substance}")
    db.commit()
    return {"status": "ok", "deleted_id": allergy_id, "message": f"Đã xóa tiền sử dị ứng {substance}"}
