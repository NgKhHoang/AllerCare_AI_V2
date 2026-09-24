"""Hồ sơ người bệnh, tài khoản, phân công, dị ứng, thuốc, quan sát lâm sàng."""
from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base
from app.modules.audit.models import new_id


def _now() -> datetime:
    return datetime.now(timezone.utc)


class User(Base):
    """Tài khoản.

    role: patient | caregiver | doctor | nurse | pharmacist | leader | admin
    - caregiver: người nhà/người chăm sóc được ủy quyền khai báo thay người bệnh
    - nurse: điều dưỡng theo dõi hàng đợi cảnh báo, liên hệ người bệnh
    - leader: lãnh đạo khoa/quản lý chất lượng — chỉ xem số liệu tổng hợp
    - admin: quản trị hệ thống — KHÔNG tự xem nội dung lâm sàng
    """

    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    username: Mapped[str] = mapped_column(String(80), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(200))
    full_name: Mapped[str] = mapped_column(String(160))
    role: Mapped[str] = mapped_column(String(20), index=True)
    phone: Mapped[str | None] = mapped_column(String(20), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class CaregiverLink(Base):
    """Ủy quyền: người nhà (caregiver) được khai báo/theo dõi thay người bệnh."""

    __tablename__ = "caregiver_links"
    __table_args__ = (UniqueConstraint("caregiver_user_id", "patient_user_id", name="uq_caregiver_link"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    caregiver_user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    patient_user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class CareAssignment(Base):
    """Quan hệ bác sĩ — người bệnh. Là căn cứ phân quyền theo hồ sơ."""

    __tablename__ = "care_assignments"
    __table_args__ = (UniqueConstraint("doctor_id", "patient_user_id", name="uq_care_assignment"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    doctor_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    patient_user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    active: Mapped[bool] = mapped_column(Boolean, default=True)


class PatientProfile(Base):
    """Thông tin hồ sơ. user_id trỏ tới users.id của tài khoản người bệnh."""

    __tablename__ = "patient_profiles"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), unique=True, index=True)
    full_name: Mapped[str] = mapped_column(String(160))
    dob: Mapped[str | None] = mapped_column(String(10), nullable=True)  # YYYY-MM-DD
    gender: Mapped[str | None] = mapped_column(String(20), nullable=True)
    chronic_conditions: Mapped[str | None] = mapped_column(Text, nullable=True)  # JSON list
    diagnosis: Mapped[str | None] = mapped_column(Text, nullable=True)  # chẩn đoán nhập viện hiện tại
    admission_note: Mapped[str | None] = mapped_column(Text, nullable=True)  # tóm tắt nhập viện (S/O/A/P)
    assigned_doctor_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class AllergyRecord(Base):
    """Tiền sử dị ứng. verification: verified | unverified — gắn nhãn bắt buộc."""

    __tablename__ = "allergy_records"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    patient_profile_id: Mapped[str] = mapped_column(ForeignKey("patient_profiles.id"), index=True)
    substance: Mapped[str] = mapped_column(String(160))
    reaction: Mapped[str | None] = mapped_column(Text, nullable=True)
    severity: Mapped[str | None] = mapped_column(String(20), nullable=True)
    verification: Mapped[str] = mapped_column(String(20), default="unverified")
    reported_by_user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    verified_by_user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    onset_date: Mapped[str | None] = mapped_column(String(20), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class MedicationRecord(Base):
    """Thuốc trong danh sách đối soát (WHO medication reconciliation).

    Nguồn thuốc (source_label): Bệnh viện kê | BV/phòng khám khác | Tự mua | OTC |
    Thực phẩm chức năng | Đông y/thảo dược | Thuốc bôi/nhỏ/tiêm | ...
    verification: verified | unverified — unverified = chưa được bác sĩ kiểm tra.
    status: active (đang dùng) | stopped (đã ngừng) | irregular (dùng không đều)
    """

    __tablename__ = "medication_records"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    patient_profile_id: Mapped[str] = mapped_column(ForeignKey("patient_profiles.id"), index=True)
    drug_id: Mapped[str | None] = mapped_column(ForeignKey("drugs.id"), nullable=True)
    raw_name: Mapped[str] = mapped_column(String(160))  # tên người bệnh/bác sĩ nhập
    is_current: Mapped[bool] = mapped_column(Boolean, default=True)
    is_planned: Mapped[bool] = mapped_column(Boolean, default=False)  # thuốc dự kiến bác sĩ thêm
    dose: Mapped[str | None] = mapped_column(String(80), nullable=True)
    route: Mapped[str | None] = mapped_column(String(40), nullable=True)
    frequency: Mapped[str | None] = mapped_column(String(80), nullable=True)
    timing: Mapped[str | None] = mapped_column(String(120), nullable=True)  # thời điểm dùng (8h và 20h)
    start_date: Mapped[str | None] = mapped_column(String(20), nullable=True)  # ngày bắt đầu
    prescriber: Mapped[str | None] = mapped_column(String(120), nullable=True)  # người kê đơn/bệnh viện/tự mua
    status: Mapped[str] = mapped_column(String(20), default="active")  # active | stopped | irregular
    stop_reason: Mapped[str | None] = mapped_column(String(200), nullable=True)  # lý do ngừng
    last_reaction: Mapped[str | None] = mapped_column(String(300), nullable=True)  # biểu hiện sau dùng
    image_url: Mapped[str | None] = mapped_column(String(300), nullable=True)  # ảnh toa/bao bì (demo: tên file)
    verification: Mapped[str] = mapped_column(String(20), default="unverified")
    reported_by_user_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    source_label: Mapped[str | None] = mapped_column(String(120), nullable=True)  # nguồn khai báo
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class ClinicalObservation(Base):
    """Triệu chứng/xét nghiệm do người bệnh khai — unverified cho tới khi bác sĩ xác minh."""

    __tablename__ = "clinical_observations"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    patient_profile_id: Mapped[str] = mapped_column(ForeignKey("patient_profiles.id"), index=True)
    kind: Mapped[str] = mapped_column(String(40))  # symptom | lab
    label: Mapped[str] = mapped_column(String(200))
    value: Mapped[str | None] = mapped_column(String(80), nullable=True)
    unit: Mapped[str | None] = mapped_column(String(40), nullable=True)
    occurred_at: Mapped[str] = mapped_column(String(20))  # YYYY-MM-DD HH:MM
    image_url: Mapped[str | None] = mapped_column(String(300), nullable=True)  # ảnh tổn thương da (demo: tên file)
    status: Mapped[str] = mapped_column(String(20), default="sent")  # sent | seen | responded
    verification: Mapped[str] = mapped_column(String(20), default="unverified")
    reported_by_user_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
