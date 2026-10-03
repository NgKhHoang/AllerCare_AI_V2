"""Mô hình dữ liệu tin nhắn trực tiếp giữa các tài khoản."""
from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base
from app.modules.audit.models import new_id


def _now() -> datetime:
    return datetime.now(timezone.utc)


class DirectMessage(Base):
    """Tin nhắn trực tiếp giữa 2 người dùng (bác sĩ - bệnh nhân - điều dưỡng - dược sĩ...)."""

    __tablename__ = "direct_messages"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    sender_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    receiver_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    content: Mapped[str] = mapped_column(Text)
    attachment_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    attachment_type: Mapped[str | None] = mapped_column(String(50), nullable=True)
    is_read: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
