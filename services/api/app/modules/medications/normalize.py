"""Chuẩn hóa tên thuốc: biệt dược → Drug trong danh mục.

Thuốc không nhận diện được KHÔNG bị bỏ qua — trả None để hệ thống yêu cầu xác nhận,
đúng yêu cầu "thuốc không xác định được phải yêu cầu xác nhận" của README.
"""
from sqlalchemy.orm import Session

from app.modules.medications.models import Drug


def resolve_drug(db: Session, raw_name: str) -> Drug | None:
    """Tìm thuốc theo tên (không phân biệt hoa thường, bỏ khoảng trắng thừa, hỗ trợ hàm lượng kèm theo)."""
    name = raw_name.strip().lower()
    if not name:
        return None
    rows = db.query(Drug).filter(Drug.in_scope.is_(True)).all()
    # 1. Khớp chính xác tuyệt đối
    for d in rows:
        if d.name.strip().lower() == name:
            return d
    # 2. Khớp tiền tố/chứa tên thuốc (VD: "Warfarin 3mg" hoặc "Cefaclor 250mg")
    for d in rows:
        d_name = d.name.strip().lower()
        if d_name and (d_name in name or name in d_name):
            return d
    return None

