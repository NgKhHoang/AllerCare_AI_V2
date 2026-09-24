"""Chuẩn hóa tên thuốc: biệt dược → Drug trong danh mục.

Thuốc không nhận diện được KHÔNG bị bỏ qua — trả None để hệ thống yêu cầu xác nhận,
đúng yêu cầu "thuốc không xác định được phải yêu cầu xác nhận" của README.
"""
from sqlalchemy.orm import Session

from app.modules.medications.models import Drug


def resolve_drug(db: Session, raw_name: str) -> Drug | None:
    """Tìm thuốc theo tên (không phân biệt hoa thường, bỏ khoảng trắng thừa)."""
    name = raw_name.strip().lower()
    if not name:
        return None
    rows = db.query(Drug).filter(Drug.in_scope.is_(True)).all()
    for d in rows:
        if d.name.strip().lower() == name:
            return d
    return None
