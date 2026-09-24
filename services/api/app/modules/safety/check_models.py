"""SafetyCheck: bản chụp dữ liệu tại lúc kiểm tra. Alert: cảnh báo. Review: quyết định bác sĩ."""
from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base
from app.modules.audit.models import new_id


def _now() -> datetime:
    return datetime.now(timezone.utc)


class SafetyCheck(Base):
    """Bản ghi một lần kiểm tra — snapshot bất biến của dữ liệu đầu vào và kết quả.

    result_status: has_alerts | no_alerts_in_scope | insufficient_data | out_of_scope | failed
    """

    __tablename__ = "safety_checks"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    patient_profile_id: Mapped[str] = mapped_column(ForeignKey("patient_profiles.id"), index=True)
    requested_by_user_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    result_status: Mapped[str] = mapped_column(String(30))
    input_snapshot: Mapped[str] = mapped_column(Text)  # JSON: drugs + patient data tại lúc kiểm tra
    result_json: Mapped[str] = mapped_column(Text)  # JSON: alerts + scope + missing data
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class Alert(Base):
    """Cảnh báo sinh từ quy tắc — luôn có nguồn và phiên bản quy tắc."""

    __tablename__ = "alerts"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    safety_check_id: Mapped[str] = mapped_column(ForeignKey("safety_checks.id"), index=True)
    rule_id: Mapped[str | None] = mapped_column(ForeignKey("safety_rules.id"), nullable=True)
    rule_code: Mapped[str] = mapped_column(String(60))
    rule_version: Mapped[str] = mapped_column(String(20))
    severity: Mapped[str] = mapped_column(String(10))  # high | medium | low
    message: Mapped[str] = mapped_column(Text)
    source_title: Mapped[str] = mapped_column(String(200))
    source_version: Mapped[str] = mapped_column(String(40))
    detail_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class Review(Base):
    """Bác sĩ ghi nhận: reviewed | action_taken | dismissed_with_reason"""

    __tablename__ = "alert_reviews"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    alert_id: Mapped[str] = mapped_column(ForeignKey("alerts.id"), index=True)
    reviewer_user_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    decision: Mapped[str] = mapped_column(String(30))  # reviewed | action_taken | dismissed_with_reason
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
