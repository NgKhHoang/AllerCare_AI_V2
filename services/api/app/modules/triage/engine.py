"""TriageGuard engine — phân luồng ban đầu 3 mức (xanh/vàng/đỏ).

Nguyên tắc (tài liệu CHI TIẾT mục 3 + quy định Bộ Y tế):
- Hàm thuần (pure function) nhận nội dung khai báo + ngữ cảnh, không đụng DB.
- Mức ĐỎ chỉ căn vào từ khóa dấu hiệu nguy hiểm trong quy tắc khoa phê duyệt
  (data/safety/triage_rules.json) — KHÔNG đoán, KHÔNG dùng AI tự do.
- Người bệnh từng có phản vệ / đang có thuốc nghi ngờ tái dùng → mức tối thiểu vàng.
- Hệ thống chỉ HỖ TRỢ phân luồng ban đầu; chẩn đoán, phân độ và xử trí phản vệ
  phải tuân theo quy định chuyên môn của Bộ Y tế.
"""
import json
import re
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path

from app.data_loader import data_dir

LEVEL_GREEN = "green"
LEVEL_YELLOW = "yellow"
LEVEL_RED = "red"

_LEVEL_ORDER = {LEVEL_GREEN: 0, LEVEL_YELLOW: 1, LEVEL_RED: 2}
_RULES_VERSION = "1.0"


@dataclass
class TriageResult:
    level: str  # green | yellow | red
    reason: str
    matched_labels: list[str] = field(default_factory=list)
    action_patient: str = ""
    rules_version: str = _RULES_VERSION


@lru_cache
def _load_rules() -> dict:
    """Nạp quy tắc phân luồng từ data/safety/triage_rules.json (khoa phê duyệt)."""
    path = data_dir() / "safety" / "triage_rules.json"
    if not path.is_file():
        raise FileNotFoundError(f"Thiếu file quy tắc phân luồng: {path}")
    with path.open(encoding="utf-8") as f:
        return json.load(f)


def reload_rules() -> dict:
    _load_rules.cache_clear()
    return _load_rules()


def _match_level(rules: dict, level: str, message: str) -> list[tuple[str, str]]:
    """Trả list (label, pattern) khớp nội dung cho một mức."""
    hits: list[tuple[str, str]] = []
    for item in rules.get(level, {}).get("patterns", []):
        try:
            if re.search(item["pattern"], message, flags=re.IGNORECASE):
                hits.append((item.get("label", item["pattern"]), item["pattern"]))
        except re.error:
            continue  # quy tắc lỗi regex không được làm sập phân luồng
    return hits


def assess(message: str, prior_anaphylaxis: bool = False, rechallenge_suspect: bool = False) -> TriageResult:
    """Phân luồng nội dung khai báo triệu chứng.

    - prior_anaphylaxis: người bệnh từng có phản vệ trước đây (allergy high đã xác minh).
    - rechallenge_suspect: đang có yếu tố tái dùng thuốc nghi ngờ (dùng lại thuốc từng gây phản ứng).
    """
    text = (message or "").strip()
    rules = _load_rules()

    # 1) MỨC ĐỎ — dấu hiệu nguy hiểm → cấp cứu ngay, không chờ duyệt
    red_hits = _match_level(rules, "red", text)
    if red_hits:
        labels = [lbl for lbl, _ in red_hits]
        return TriageResult(
            level=LEVEL_RED,
            reason=(
                "Phát hiện dấu hiệu nguy hiểm theo quy tắc phân luồng của khoa: "
                + ", ".join(labels)
                + ". Cấp cứu phải qua kênh 115 — không chờ bất kỳ xác nhận nào."
            ),
            matched_labels=labels,
            action_patient=rules.get("red", {}).get("action_patient", "GỌI 115 NGAY"),
        )

    # 2) MỨC VÀNG — triệu chứng cần bác sĩ đánh giá, hoặc ngữ cảnh nguy cơ cao
    yellow_hits = _match_level(rules, "yellow", text)
    if yellow_hits:
        labels = [lbl for lbl, _ in yellow_hits]
        return TriageResult(
            level=LEVEL_YELLOW,
            reason=(
                "Triệu chứng mới/cần bác sĩ đánh giá theo quy tắc phân luồng: "
                + ", ".join(labels)
                + ". Đưa vào danh sách cần kiểm tra của nhân viên y tế."
            ),
            matched_labels=labels,
            action_patient=rules.get("yellow", {}).get("action_patient", "Liên hệ bác sĩ sớm"),
        )

    # 3) Ngữ cảnh nguy cơ cao → nâng tối thiểu vàng dù triệu chứng nhẹ
    if prior_anaphylaxis or rechallenge_suspect:
        why = (
            "người bệnh từng có phản vệ đã xác minh" if prior_anaphylaxis else
            "có yếu tố dùng lại thuốc nghi ngờ gây phản ứng"
        )
        return TriageResult(
            level=LEVEL_YELLOW,
            reason=f"Triệu chứng không nằm nhóm đỏ/vàng nhưng {why} — nâng tối thiểu mức vàng để bác sĩ đánh giá.",
            matched_labels=[],
            action_patient=rules.get("yellow", {}).get("action_patient", "Liên hệ bác sĩ sớm"),
        )

    # 4) MỨC XANH — nhẹ, ổn định
    green_hits = _match_level(rules, "green", text)
    labels = [lbl for lbl, _ in green_hits]
    return TriageResult(
        level=LEVEL_GREEN,
        reason=(
            "Triệu chứng nhẹ/ổn định, không có dấu hiệu nguy hiểm theo quy tắc phân luồng"
            + (": " + ", ".join(labels) if labels else "")
            + ". Tiếp tục theo dõi tại nhà."
        ),
        matched_labels=labels,
        action_patient=rules.get("green", {}).get("action_patient", "Theo dõi và uống thuốc đúng chỉ định"),
    )


def max_level(a: str, b: str) -> str:
    """Chọn mức ưu tiên cao hơn giữa hai mức phân luồng."""
    return a if _LEVEL_ORDER.get(a, 0) >= _LEVEL_ORDER.get(b, 0) else b
