"""Lịch hẹn, phòng video và hội thoại chatbot giới hạn."""
from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base
from app.modules.audit.models import new_id


def _now() -> datetime:
    return datetime.now(timezone.utc)


class Appointment(Base):
    """Lịch hẹn. status: requested | confirmed | done | cancelled"""

    __tablename__ = "appointments"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    patient_user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    doctor_user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    scheduled_at: Mapped[str] = mapped_column(String(20))  # YYYY-MM-DD HH:MM
    status: Mapped[str] = mapped_column(String(20), default="requested")
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class ConsultationRoom(Base):
    """Phòng video. room_code không chứa tên/mã người bệnh (ngẫu nhiên)."""

    __tablename__ = "consultation_rooms"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    appointment_id: Mapped[str] = mapped_column(ForeignKey("appointments.id"), unique=True, index=True)
    room_code: Mapped[str] = mapped_column(String(60), unique=True)
    allow_recording: Mapped[bool] = mapped_column(Boolean, default=False)  # luôn False trong MVP
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class ChatSession(Base):
    """Hội thoại chatbot của một người bệnh."""

    __tablename__ = "chat_sessions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    patient_user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class ChatMessage(Base):
    """Tin nhắn. role: patient | assistant | handoff (đã chuyển cho nhân viên y tế)."""

    __tablename__ = "chat_messages"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    session_id: Mapped[str] = mapped_column(ForeignKey("chat_sessions.id"), index=True)
    role: Mapped[str] = mapped_column(String(20))
    content: Mapped[str] = mapped_column(Text)
    sources_json: Mapped[str | None] = mapped_column(Text, nullable=True)  # nguồn truy xuất thật
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
