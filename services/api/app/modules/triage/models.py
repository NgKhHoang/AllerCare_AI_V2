"""Models cho TriageGuard AI, hướng dẫn thuốc, thông báo, xếp hạng tác nhân nghi ngờ.

Nguyên tắc an toàn (tài liệu CHI TIẾT):
- Mức ĐỎ: cảnh báo cấp cứu hiển thị NGAY cho người bệnh + báo bác sĩ/điều dưỡng/người nhà — KHÔNG chờ duyệt.
- Mức VÀNG/ gợi ý AI (xếp hạng nghi ngờ, tóm tắt): chờ bác sĩ/điều dưỡng xác nhận.
- Hướng dẫn dùng thuốc: chỉ nội dung bác sĩ DUYỆT mới gửi tới người bệnh.
"""
from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base
from app.modules.audit.models import new_id


def _now() -> datetime:
    return datetime.now(timezone.utc)


class TriageAssessment(Base):
    """Kết quả phân luồng TriageGuard cho một lần khai báo triệu chứng.

    level: green | yellow | red
    status: pending (chờ NVYT xác nhận) | confirmed | dismissed
    AI chỉ PHÂN LUỒNG BAN ĐẦU theo quy tắc khoa phê duyệt — không chẩn đoán.
    """

    __tablename__ = "triage_assessments"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    patient_profile_id: Mapped[str] = mapped_column(ForeignKey("patient_profiles.id"), index=True)
    observation_id: Mapped[str | None] = mapped_column(ForeignKey("clinical_observations.id"), nullable=True)
    message: Mapped[str] = mapped_column(Text)  # nội dung người bệnh khai
    level: Mapped[str] = mapped_column(String(10))  # green | yellow | red
    reason: Mapped[str] = mapped_column(Text)  # vì sao phân luồng mức này (căn cứ quy tắc)
    matched_rules: Mapped[str | None] = mapped_column(Text, nullable=True)  # JSON list nhãn từ khóa
    rules_version: Mapped[str] = mapped_column(String(20), default="1.0")
    status: Mapped[str] = mapped_column(String(20), default="pending")  # pending | confirmed | dismissed
    confirmed_by_user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class SuspectRanking(Base):
    """Xếp hạng tác nhân nghi ngờ gây phản ứng dị ứng/phản vệ (MedSafe + WHO causality).

    rank: 1 = nghi ngờ cao nhất. score: điểm sắp xếp (tổng hợp yếu tố WHO).
    WHO: kết quả thường chỉ đạt 'possible'/'probable' — luôn cần bác sĩ xác nhận
    trước khi ghi vào hồ sơ dị ứng chính thức.
    status: pending | confirmed (đã ghi hồ sơ dị ứng) | dismissed
    """

    __tablename__ = "suspect_rankings"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    patient_profile_id: Mapped[str] = mapped_column(ForeignKey("patient_profiles.id"), index=True)
    reaction_description: Mapped[str] = mapped_column(Text)  # mô tả phản ứng + thời điểm khởi phát
    ranked_json: Mapped[str] = mapped_column(Text)  # JSON list [{rank, drug, score, reasons[], source}]
    basis_version: Mapped[str] = mapped_column(String(40), default="WHO-2013.1")  # nguồn căn cứ
    status: Mapped[str] = mapped_column(String(20), default="pending")
    confirmed_by_user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class ObservationSummary(Base):
    """Tóm tắt diễn biến do AI tổng hợp (tài liệu CHI TIẾT mục 2).

    AI chỉ TỔNG HỢP từ dữ liệu đã có trong hệ thống (triệu chứng, thuốc, phân luồng) —
    không tự bịa. Bác sĩ dùng để nắm nhanh, vẫn phải xem dữ liệu gốc.
    """

    __tablename__ = "observation_summaries"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    patient_profile_id: Mapped[str] = mapped_column(ForeignKey("patient_profiles.id"), index=True)
    content_json: Mapped[str] = mapped_column(Text)  # {summary, highlights, counts, generated_at}
    generated_by: Mapped[str] = mapped_column(String(40), default="mock-ai")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class MedicationGuide(Base):
    """Hướng dẫn dùng thuốc dễ hiểu do AI soạn — chỉ gửi người bệnh sau khi bác sĩ duyệt.

    status: draft (AI soạn, chưa duyệt) | approved (đã gửi người bệnh) | revoked
    acknowledgment: none | understood | not_understood (nút 'Tôi đã hiểu cách sử dụng thuốc')
    not_understood → tự tạo thông báo chuyển bác sĩ/điều dưỡng (tài liệu mục 4).
    """

    __tablename__ = "medication_guides"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    patient_profile_id: Mapped[str] = mapped_column(ForeignKey("patient_profiles.id"), index=True)
    medication_id: Mapped[str | None] = mapped_column(ForeignKey("medication_records.id"), nullable=True)
    content_json: Mapped[str] = mapped_column(Text)  # JSON: name, purpose, dose, timing, howto, warnings, signs, followup
    ai_draft_note: Mapped[str | None] = mapped_column(Text, nullable=True)  # chú thích AI soạn từ toa nào
    status: Mapped[str] = mapped_column(String(20), default="draft")  # draft | approved | revoked
    drafted_by: Mapped[str | None] = mapped_column(String(20), default="ai-draft")  # ai soạn: ai-draft | user id
    approved_by_user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    acknowledgment: Mapped[str] = mapped_column(String(20), default="none")
    acknowledged_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class Notification(Base):
    """Thông báo nội bộ: chuyển tiếp cảnh báo/giải đáp giữa người bệnh — NVYT — người nhà.

    for_role: vai trò nhận (doctor | nurse | caregiver | patient | pharmacist | leader)
    for_user_id: nhận cụ thể (null = tất cả user của for_role liên quan ca)
    kind: triage_red | triage_yellow | guide_ack | suspect_confirmed | med_added | handoff | system
    """

    __tablename__ = "notifications"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    for_role: Mapped[str | None] = mapped_column(String(20), nullable=True, index=True)
    for_user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    patient_profile_id: Mapped[str | None] = mapped_column(ForeignKey("patient_profiles.id"), nullable=True)
    kind: Mapped[str] = mapped_column(String(40))
    title: Mapped[str] = mapped_column(String(200))
    body: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_read: Mapped[bool] = mapped_column(Boolean, default=False)
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
