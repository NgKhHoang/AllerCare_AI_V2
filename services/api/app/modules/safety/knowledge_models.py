"""Kho kiến thức: nguồn tài liệu và quy tắc an toàn có phiên bản, trạng thái duyệt."""
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base
from app.modules.audit.models import new_id


class KnowledgeSource(Base):
    """Nguồn tài liệu được phép dùng làm căn cứ (giả lập cho demo)."""

    __tablename__ = "knowledge_sources"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    title: Mapped[str] = mapped_column(String(200))
    publisher: Mapped[str] = mapped_column(String(120))
    version: Mapped[str] = mapped_column(String(40))
    published_date: Mapped[str | None] = mapped_column(String(20), nullable=True)
    license_note: Mapped[str | None] = mapped_column(String(300), nullable=True)
    content: Mapped[str | None] = mapped_column(Text, nullable=True)  # dùng cho RAG/tra cứu


class SafetyRule(Base):
    """Quy tắc an toàn: điều kiện kích hoạt, dữ liệu bắt buộc, mức độ, nguồn, duyệt.

    rule_type: drug_drug | duplicate_ingredient | drug_allergy | drug_condition
    severity: high | medium | low
    status: approved | draft  (chỉ rule approved dùng cho cảnh báo thực)
    condition_json: điều kiện kích hoạt dạng JSON (xem safety/engine.py)
    """

    __tablename__ = "safety_rules"
    __table_args__ = (UniqueConstraint("code", "rule_version", name="uq_rule_code_version"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    code: Mapped[str] = mapped_column(String(60), index=True)
    rule_version: Mapped[str] = mapped_column(String(20), default="1.0")
    rule_type: Mapped[str] = mapped_column(String(30), index=True)
    title: Mapped[str] = mapped_column(String(200))
    message: Mapped[str] = mapped_column(Text)
    severity: Mapped[str] = mapped_column(String(10))
    status: Mapped[str] = mapped_column(String(10), default="approved")  # approved | draft
    condition_json: Mapped[str] = mapped_column(Text)  # JSON điều kiện
    required_data_json: Mapped[str] = mapped_column(Text, default="[]")  # dữ liệu bắt buộc
    source_id: Mapped[str] = mapped_column(ForeignKey("knowledge_sources.id"))
    source: Mapped["KnowledgeSource"] = relationship()  # dùng để hiển thị căn cứ nguồn
    approved_by: Mapped[str | None] = mapped_column(String(120), nullable=True)
    next_review_date: Mapped[str | None] = mapped_column(String(20), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
