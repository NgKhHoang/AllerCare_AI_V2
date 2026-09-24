"""API Quality Dashboard (lãnh đạo khoa) + Quản trị hệ thống (admin).

- Leader: CHỈ số liệu tổng hợp ẩn danh — không truy cập nội dung lâm sàng từng ca.
- Admin: quản lý tài khoản (khóa/mở), xem nhật ký hệ thống — không tự xem dữ liệu lâm sàng.
"""
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.db import get_db
from app.modules.auth.deps import CurrentUser, audit_log, require_roles
from app.modules.patients.models import User
from app.modules.safety.check_models import Alert, Review, SafetyCheck
from app.modules.triage.models import Notification, SuspectRanking, TriageAssessment

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/quality", summary="Chỉ số chất lượng an toàn người bệnh (lãnh đạo khoa)")
def quality_dashboard(
    user: CurrentUser = Depends(require_roles("leader")),
    db: Session = Depends(get_db),
) -> dict:
    now = datetime.now()
    week_ago = now - timedelta(days=7)

    triage_total = db.query(func.count(TriageAssessment.id)).scalar() or 0
    triage_by_level = dict(
        db.query(TriageAssessment.level, func.count(TriageAssessment.id))
        .group_by(TriageAssessment.level)
        .all()
    )
    triage_week = (
        db.query(func.count(TriageAssessment.id))
        .filter(TriageAssessment.created_at >= week_ago)
        .scalar() or 0
    )

    checks_total = db.query(func.count(SafetyCheck.id)).scalar() or 0
    checks_by_status = dict(
        db.query(SafetyCheck.result_status, func.count(SafetyCheck.id))
        .group_by(SafetyCheck.result_status)
        .all()
    )

    alerts_by_severity = dict(
        db.query(Alert.severity, func.count(Alert.id))
        .group_by(Alert.severity)
        .all()
    )
    alerts_by_code = dict(
        db.query(Alert.rule_code, func.count(Alert.id))
        .group_by(Alert.rule_code)
        .all()
    )

    # Thời gian phản hồi trung bình: alert → review
    reviews = db.query(Review).all()
    response_times = []
    for r in reviews:
        a = db.get(Alert, r.alert_id)
        if a and a.created_at and r.created_at:
            delta = (r.created_at - a.created_at).total_seconds() / 3600
            response_times.append(delta)
    avg_response_hours = round(sum(response_times) / len(response_times), 1) if response_times else None

    suspects_total = db.query(func.count(SuspectRanking.id)).scalar() or 0
    suspects_confirmed = (
        db.query(func.count(SuspectRanking.id))
        .filter(SuspectRanking.status == "confirmed")
        .scalar() or 0
    )

    return {
        "triage": {
            "total": triage_total,
            "by_level": triage_by_level,  # red/yellow/green
            "last_7_days": triage_week,
        },
        "safety_checks": {
            "total": checks_total,
            "by_status": checks_by_status,
        },
        "alerts": {
            "by_severity": alerts_by_severity,  # high/medium/low
            "top_rules": sorted(alerts_by_code.items(), key=lambda x: -x[1])[:10],
        },
        "response_time": {
            "avg_hours_to_review": avg_response_hours,
            "reviews_total": len(reviews),
        },
        "suspect_rankings": {
            "total": suspects_total,
            "confirmed": suspects_confirmed,
        },
        "note": "Số liệu tổng hợp ẩn danh cho quản lý chất lượng — không chứa dữ liệu lâm sàng từng ca.",
    }


# ----------------------------- Admin -----------------------------

admin_router = APIRouter(prefix="/admin", tags=["admin"])


@admin_router.get("/users", summary="Danh sách tài khoản (admin)")
def list_users(
    user: CurrentUser = Depends(require_roles("admin")),
    db: Session = Depends(get_db),
) -> list[dict]:
    rows = db.query(User).order_by(User.role, User.username).all()
    return [
        {
            "id": u.id,
            "username": u.username,
            "full_name": u.full_name,
            "role": u.role,
            "is_active": u.is_active,
            "created_at": u.created_at.isoformat(),
        }
        for u in rows
    ]


@admin_router.post("/users/{user_id}/active", summary="Khóa/mở tài khoản (admin)")
def set_user_active(
    user_id: str,
    is_active: bool,
    user: CurrentUser = Depends(require_roles("admin")),
    db: Session = Depends(get_db),
) -> dict:
    target = db.get(User, user_id)
    if target is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy tài khoản")
    if target.id == user.id:
        raise HTTPException(status.HTTP_409_CONFLICT, "Không thể tự khóa tài khoản mình")
    target.is_active = is_active
    audit_log(db, user, "set_user_active", "user", target.id, f"active={is_active}")
    db.commit()
    return {"id": target.id, "is_active": target.is_active}


@admin_router.get("/audit-log", summary="Nhật ký hệ thống (admin, không chứa dữ liệu lâm sàng)")
def audit_log_view(
    user: CurrentUser = Depends(require_roles("admin")),
    db: Session = Depends(get_db),
) -> list[dict]:
    from app.modules.audit.models import AuditEvent

    rows = db.query(AuditEvent).order_by(AuditEvent.created_at.desc()).limit(100).all()
    return [
        {
            "id": r.id,
            "username": r.username,
            "action": r.action,
            "object_type": r.object_type,
            "object_id": r.object_id,
            "detail": r.detail,
            "created_at": r.created_at.isoformat(),
        }
        for r in rows
    ]
