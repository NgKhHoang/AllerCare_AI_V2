"""TriageGuard AI API — phân luồng xanh/vàng/đỏ + xếp hạng tác nhân nghi ngờ.

Luồng (tài liệu CHI TIẾT mục 1, 3):
- Người bệnh khai triệu chứng → engine phân luồng theo quy tắc khoa duyệt.
- ĐỎ: hiển thị cấp cứu ngay cho người bệnh + thông báo bác sĩ/điều dưỡng/người nhà — không chờ duyệt.
- VÀNG: vào hàng đợi NVYT, chờ xác nhận.
- XANH: lưu hồ sơ theo dõi.
- Xếp hạng tác nhân nghi ngờ: AI xếp hạng theo WHO → bác sĩ xác nhận → tự ghi hồ sơ dị ứng (unverified).
"""
import json

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.db import get_db
from app.modules.auth.deps import CurrentUser, audit_log, get_current_user, require_roles
from app.modules.consultations.models import Appointment, ConsultationRoom
from app.modules.notifications.models import Notification
from app.modules.patients.models import AllergyRecord, MedicationRecord, PatientProfile
from app.modules.triage.engine import assess
from app.modules.triage.models import SuspectRanking, TriageAssessment
from app.modules.triage.suspect_engine import SuspectCandidate, build_summary, rank_suspects

router = APIRouter(prefix="/triage", tags=["triage"])


class TriageIn(BaseModel):
    message: str = Field(min_length=1, max_length=2000, description="Nội dung khai báo triệu chứng")
    profile_id: str | None = Field(default=None, description="Bỏ trống khi người bệnh tự khai")


class TriageOut(BaseModel):
    id: str
    level: str
    reason: str
    action_patient: str
    matched_labels: list[str]
    status: str
    created_at: str

    @classmethod
    def of(cls, t: "TriageAssessment") -> "TriageOut":
        return cls(
            id=t.id,
            level=t.level,
            reason=t.reason,
            action_patient=_action_for(t.level),
            matched_labels=json.loads(t.matched_rules or "[]"),
            status=t.status,
            created_at=t.created_at.isoformat(),
        )


class ConfirmIn(BaseModel):
    decision: str = Field(pattern="^(confirmed|dismissed)$")
    note: str | None = Field(default=None, max_length=500)


class SuspectIn(BaseModel):
    profile_id: str
    reaction_description: str = Field(min_length=1, max_length=2000, description="Mô tả phản ứng + thời điểm khởi phát")
    previous_episode_drugs: list[str] = Field(default_factory=list, description="Thuốc của lần phản ứng trước (toa cũ)")


def _action_for(level: str) -> str:
    return {
        "red": "GỌI CẤP CỨU 115 hoặc đến cơ sở y tế gần nhất NGAY LẬP TỨC",
        "yellow": "Liên hệ bác sĩ sớm qua mục Lịch hẹn hoặc Hỏi đáp AI — không chờ quá 24 giờ",
        "green": "Tiếp tục theo dõi, ghi nhận triệu chứng và uống thuốc đúng chỉ định",
    }.get(level, "")


def _profile_for_patient_or_caregiver(db: Session, user: CurrentUser, profile_id: str | None) -> PatientProfile:
    """Người bệnh tự khai trên hồ sơ mình; người nhà khai thay hồ sơ được ủy quyền."""
    if user.role == "patient":
        profile = db.query(PatientProfile).filter(PatientProfile.user_id == user.id).first()
        if profile is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Chưa có hồ sơ người bệnh cho tài khoản này")
        return profile
    if user.role == "caregiver":
        if not profile_id:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Người nhà cần chỉ định hồ sơ được ủy quyền")
        profile = db.get(PatientProfile, profile_id)
        if profile is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy hồ sơ")
        link = db.execute(
            __import__("sqlalchemy").text(
                "SELECT 1 FROM caregiver_links WHERE caregiver_user_id=:c AND patient_user_id=:p AND active"
            ),
            {"c": user.id, "p": profile.user_id},
        ).first()
        if link is None:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Bạn chưa được ủy quyền theo dõi hồ sơ này")
        return profile
    raise HTTPException(status.HTTP_403_FORBIDDEN, "Chỉ người bệnh/người nhà ủy quyền được khai báo")


def _notify(db: Session, profile: PatientProfile, kind: str, title: str, body: str, level: str) -> None:
    """Tạo thông báo cho đúng người theo mức phân luồng (tài liệu mục 6)."""
    if level == "red":
        targets = [("doctor", profile.assigned_doctor_id), ("nurse", None), ("patient", profile.user_id)]
        # người nhà ủy quyền
        caregiver_ids = db.execute(
            __import__("sqlalchemy").text(
                "SELECT caregiver_user_id FROM caregiver_links WHERE patient_user_id=:p AND active"
            ),
            {"p": profile.user_id},
        ).scalars().all()
        targets += [("caregiver", cid) for cid in caregiver_ids]
    elif level == "yellow":
        targets = [("doctor", profile.assigned_doctor_id), ("nurse", None)]
    else:
        targets = [("doctor", profile.assigned_doctor_id)]
    for role, uid in targets:
        db.add(Notification(for_role=role, for_user_id=uid, patient_profile_id=profile.id, kind=kind, title=title, body=body))


@router.post("", status_code=201, summary="Gửi triệu chứng → TriageGuard phân luồng ban đầu")
def submit_triage(
    data: TriageIn,
    user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> TriageOut:
    profile = _profile_for_patient_or_caregiver(db, user, data.profile_id)

    # Ngữ cảnh nguy cơ: phản vệ đã xác minh + tái dùng thuốc nghi ngờ (dùng lại thuốc trùng dị ứng)
    high_sev_allergy = (
        db.query(AllergyRecord)
        .filter(
            AllergyRecord.patient_profile_id == profile.id,
            AllergyRecord.verification == "verified",
            AllergyRecord.severity == "high",
        )
        .first()
    )
    prior_anaphylaxis = high_sev_allergy is not None

    rechallenge_suspect = False
    if prior_anaphylaxis:
        allergy_name = high_sev_allergy.substance.strip().lower()
        meds = (
            db.query(MedicationRecord)
            .filter(MedicationRecord.patient_profile_id == profile.id, MedicationRecord.is_current.is_(True))
            .all()
        )
        rechallenge_suspect = any(
            allergy_name in m.raw_name.lower() for m in meds
        )

    result = assess(data.message, prior_anaphylaxis=prior_anaphylaxis, rechallenge_suspect=rechallenge_suspect)

    record = TriageAssessment(
        patient_profile_id=profile.id,
        message=data.message,
        level=result.level,
        reason=result.reason,
        matched_rules=json.dumps(result.matched_labels, ensure_ascii=False),
        rules_version=result.rules_version,
        status="pending" if result.level in ("yellow",) else "confirmed",
    )
    db.add(record)
    db.flush()

    _notify(
        db, profile,
        kind=f"triage_{result.level}",
        title=f"[{result.level.upper()}] Phân luồng triệu chứng — {profile.full_name}",
        body=f"{data.message}\n\nPhân luồng: {result.reason}",
        level=result.level,
    )
    audit_log(db, user, "triage_submit", "triage_assessment", record.id, f"level={result.level}")
    db.commit()

    return TriageOut.of(record)


@router.get("/mine", summary="Lịch sử phân luồng của người bệnh hiện tại")
def my_triage(
    user: CurrentUser = Depends(require_roles("patient")),
    db: Session = Depends(get_db),
) -> list[dict]:
    profile = db.query(PatientProfile).filter(PatientProfile.user_id == user.id).first()
    if profile is None:
        return []
    rows = (
        db.query(TriageAssessment)
        .filter(TriageAssessment.patient_profile_id == profile.id)
        .order_by(TriageAssessment.created_at.desc())
        .limit(30)
        .all()
    )
    out = []
    for t in rows:
        d = TriageOut.of(t).model_dump()
        d["message"] = t.message
        out.append(d)
    return out


@router.get("/queue", summary="Hàng đợi phân luồng cần NVYT xác nhận (điều dưỡng/bác sĩ)")
def triage_queue(
    user: CurrentUser = Depends(require_roles("nurse", "doctor")),
    db: Session = Depends(get_db),
) -> list[dict]:
    rows = (
        db.query(TriageAssessment, PatientProfile)
        .join(PatientProfile, PatientProfile.id == TriageAssessment.patient_profile_id)
        .filter(TriageAssessment.level == "yellow", TriageAssessment.status == "pending")
        .order_by(TriageAssessment.created_at.desc())
        .limit(50)
        .all()
    )
    return [
        {
            "id": t.id,
            "profile_id": p.id,
            "patient_name": p.full_name,
            "message": t.message,
            "reason": t.reason,
            "matched_labels": json.loads(t.matched_rules or "[]"),
            "status": t.status,
            "created_at": t.created_at.isoformat(),
        }
        for t, p in rows
    ]


@router.post("/{triage_id}/confirm", summary="Xác nhận/từ chối kết quả phân luồng (điều dưỡng/bác sĩ)")
def confirm_triage(
    triage_id: str,
    data: ConfirmIn,
    user: CurrentUser = Depends(require_roles("nurse", "doctor")),
    db: Session = Depends(get_db),
) -> dict:
    t = db.get(TriageAssessment, triage_id)
    if t is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy phân luồng")
    t.status = data.decision
    t.confirmed_by_user_id = user.id
    audit_log(db, user, "triage_confirm", "triage_assessment", t.id, f"{data.decision}")
    db.commit()
    return {"id": t.id, "status": t.status}


# ------------------------------------------------------------------
# Xếp hạng tác nhân nghi ngờ (MedSafe — mục 1 tài liệu CHI TIẾT)
# ------------------------------------------------------------------

@router.post("/suspect-ranking", status_code=201, summary="Xếp hạng tác nhân nghi ngờ gây phản ứng (AI gợi ý — bác sĩ xác nhận)")
def create_suspect_ranking(
    data: SuspectIn,
    user: CurrentUser = Depends(require_roles("doctor", "pharmacist", "nurse")),
    db: Session = Depends(get_db),
) -> dict:
    from app.modules.auth.deps import get_assigned_patient_profile

    profile = get_assigned_patient_profile(data.profile_id, user, db)

    meds = (
        db.query(MedicationRecord)
        .filter(MedicationRecord.patient_profile_id == profile.id)
        .order_by(MedicationRecord.created_at.desc())
        .all()
    )
    if not meds:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Hồ sơ chưa có thuốc nào để xếp hạng")

    verified_allergies = [
        a.substance.strip().lower()
        for a in db.query(AllergyRecord)
        .filter(AllergyRecord.patient_profile_id == profile.id, AllergyRecord.verification == "verified")
        .all()
    ]
    prev_set = {d.strip().lower() for d in data.previous_episode_drugs if d.strip()}

    candidates: list[SuspectCandidate] = []
    for m in meds:
        name_l = m.raw_name.strip().lower()
        src = (m.source_label or "").lower()
        candidates.append(
            SuspectCandidate(
                name=m.raw_name,
                taken_before_reaction=True,  # đang dùng trước/nhân dịp khởi phát (demo: mặc định đúng)
                in_both_episodes=any(p and (p in name_l or name_l in p) for p in prev_set),
                matches_known_allergy=any(a and (a in name_l or any(w in name_l for w in a.split())) for a in verified_allergies if a),
                is_otc_or_self_bought=("tự mua" in src or "otc" in src or "tpcn" in src),
                alternative_cause=False,
            )
        )

    # Toa cũ (lần phản ứng trước): thuốc KHÔNG còn trong danh sách hiện tại vẫn phải
    # được xếp hạng — đây chính là tác nhân hay bị bỏ sót (VD: Cefaclor đã xuất viện).
    covered = {c.name.strip().lower() for c in candidates}
    desc_l = data.reaction_description.lower()
    for prev in sorted(prev_set):
        if any(prev in n or n in prev for n in covered):
            continue  # đã có ứng viên trùng từ toa hiện tại
        retaken_in_this_episode = prev in desc_l  # toa cũ được dùng lại trong lần phản ứng này
        candidates.append(
            SuspectCandidate(
                name=prev,
                taken_before_reaction=True,
                in_both_episodes=retaken_in_this_episode,
                matches_known_allergy=any(
                    a and (a in prev or any(w in prev for w in a.split()))
                    for a in verified_allergies
                    if a
                ),
                is_otc_or_self_bought=False,
                alternative_cause=False,
            )
        )

    scores = rank_suspects(candidates, data.reaction_description)
    summary = build_summary(scores)

    record = SuspectRanking(
        patient_profile_id=profile.id,
        reaction_description=data.reaction_description,
        ranked_json=json.dumps(
            [
                {
                    "rank": s.rank,
                    "drug": s.name,
                    "score": s.score,
                    "level": s.level,
                    "reasons": s.reasons,
                    "source": s.source,
                }
                for s in scores
            ],
            ensure_ascii=False,
        ),
        status="pending",
    )
    db.add(record)
    _notify(
        db, profile,
        kind="suspect_ranking",
        title=f"[Xếp hạng nghi ngờ] {profile.full_name}",
        body=summary,
        level="yellow",
    )
    audit_log(db, user, "suspect_ranking", "suspect_ranking", record.id)
    db.commit()

    return {
        "id": record.id,
        "summary": summary,
        "ranking": json.loads(record.ranked_json),
        "status": record.status,
    }


@router.post("/suspect-ranking/{ranking_id}/confirm", summary="Bác sĩ xác nhận nghi ngờ → tự ghi hồ sơ dị ứng (unverified)")
def confirm_suspect(
    ranking_id: str,
    user: CurrentUser = Depends(require_roles("doctor")),
    db: Session = Depends(get_db),
) -> dict:
    r = db.get(SuspectRanking, ranking_id)
    if r is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy kết quả xếp hạng")
    from app.modules.auth.deps import get_assigned_patient_profile

    profile = get_assigned_patient_profile(r.patient_profile_id, user, db)

    ranked = json.loads(r.ranked_json)
    top = ranked[0] if ranked else None
    allergy = None
    if top:
        # Ghi hồ sơ dị ứng NHÃN UNVERIFIED — bác sĩ xác minh riêng trước khi dùng cảnh báo
        allergy = AllergyRecord(
            patient_profile_id=profile.id,
            substance=top["drug"],
            reaction=f"Nghi ngờ theo xếp hạng AI: {r.reaction_description[:300]}",
            severity=None,
            verification="unverified",
            reported_by_user_id=user.id,
        )
        db.add(allergy)
    r.status = "confirmed"
    r.confirmed_by_user_id = user.id

    db.add(Notification(
        for_role="patient", for_user_id=profile.user_id, patient_profile_id=profile.id,
        kind="suspect_confirmed",
        title="Bác sĩ đã ghi nhận tác nhân nghi ngờ vào hồ sơ",
        body=f"Tác nhân nghi ngờ ưu tiên: {top['drug'] if top else '—'}. Vui lòng trao đổi bác sĩ trước khi dùng lại thuốc này.",
    ))
    audit_log(db, user, "suspect_confirm", "suspect_ranking", r.id)
    db.commit()
    return {"id": r.id, "status": r.status, "allergy_record_id": allergy.id if allergy else None}
