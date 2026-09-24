"""API thông báo — mỗi vai trò chỉ thấy thông báo của mình (kênh riêng theo tài liệu mục 2, 6)."""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.db import get_db
from app.modules.auth.deps import CurrentUser, audit_log, get_current_user
from app.modules.triage.models import Notification

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("", summary="Danh sách thông báo của tài khoản hiện tại")
def list_notifications(
    user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[dict]:
    q = db.query(Notification).filter(
        or_(
            Notification.for_user_id == user.id,
            Notification.for_role == user.role,
        )
    )
    rows = q.order_by(Notification.created_at.desc()).limit(50).all()
    return [
        {
            "id": n.id,
            "kind": n.kind,
            "title": n.title,
            "body": n.body,
            "is_read": n.is_read,
            "created_at": n.created_at.isoformat(),
        }
        for n in rows
    ]


@router.post("/{notification_id}/read", summary="Đánh dấu một thông báo đã đọc")
def mark_read(
    notification_id: str,
    user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    n = db.get(Notification, notification_id)
    if n is None or (n.for_user_id not in (None, user.id) and n.for_role != user.role):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy thông báo")
    n.is_read = True
    n.read_at = datetime.now(timezone.utc)
    audit_log(db, user, "notification_read", "notification", n.id)
    db.commit()
    return {"id": n.id, "is_read": True}


@router.post("/read-all", summary="Đánh dấu tất cả thông báo đã đọc")
def mark_all_read(
    user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    rows = (
        db.query(Notification)
        .filter(
            or_(Notification.for_user_id == user.id, Notification.for_role == user.role),
            Notification.is_read.is_(False),
        )
        .all()
    )
    for n in rows:
        n.is_read = True
        n.read_at = datetime.now(timezone.utc)
    db.commit()
    return {"updated": len(rows)}
