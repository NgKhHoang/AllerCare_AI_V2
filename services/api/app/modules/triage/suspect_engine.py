"""MedSafe — xếp hạng tác nhân nghi ngờ gây dị ứng/phản vệ (tài liệu CHI TIẾT mục 1).

Nguyên tắc WHO causality assessment (nguồn: WHO whocausality-assessment.pdf):
- Quan hệ thời gian giữa dùng thuốc và khởi phát phản ứng.
- Thuốc xuất hiện ở CẢ HAI lần phản ứng (tái diễn) → nghi ngờ cao nhất.
- Tiền sử dị ứng đã biết với thuốc/hoạt chất đó.
- Nguyên nhân thay thế (bệnh nền, thực phẩm, thuốc khác) làm giảm điểm.
- Kết quả thường chỉ đạt 'possible'/'probable' — rất hiếm 'certain'.

Đầu ra luôn là GỢI Ý xếp hạng kèm căn cứ; bác sĩ phải xác nhận trước khi ghi
vào hồ sơ dị ứng chính thức (status pending → confirmed).
"""
from dataclasses import dataclass, field


@dataclass
class SuspectCandidate:
    """Một thuốc ứng viên nghi ngờ."""

    name: str
    ingredient_names: list[str] = field(default_factory=list)
    taken_before_reaction: bool = False  # dùng trước thời điểm khởi phát
    in_both_episodes: bool = False  # xuất hiện ở cả lần phản ứng trước
    matches_known_allergy: bool = False  # trùng dị ứng đã xác minh
    is_otc_or_self_bought: bool = False  # tự mua/TPCN — thường bị bỏ sót
    alternative_cause: bool = False  # có nguyên nhân thay thế rõ (bệnh nền gây cùng triệu chứng)


@dataclass
class SuspectScore:
    name: str
    score: int
    rank: int
    level: str  # high | possible | low
    reasons: list[str] = field(default_factory=list)
    # nguồn căn cứ cố định — không phải AI tự bịa
    source: str = "WHO — Causality assessment of suspected adverse reactions (v2013.1)"


def rank_suspects(
    candidates: list[SuspectCandidate],
    reaction_description: str,
    reaction_timing_known: bool = True,
) -> list[SuspectScore]:
    """Chấm điểm + xếp hạng tác nhân nghi ngờ. Trả list đã sort theo score giảm dần."""
    scored: list[SuspectScore] = []

    for c in candidates:
        score = 0
        reasons: list[str] = []

        if reaction_timing_known and c.taken_before_reaction:
            score += 2
            reasons.append("Có quan hệ thời gian: dùng trước khi khởi phát phản ứng")
        if c.in_both_episodes:
            score += 4
            reasons.append("Xuất hiện ở CẢ HAI lần xảy ra phản ứng (rechallenge không chủ ý)")
        if c.matches_known_allergy:
            score += 3
            reasons.append("Trùng tiền sử dị ứng đã xác minh trong hồ sơ")
        if c.is_otc_or_self_bought:
            score += 1
            reasons.append("Thuốc tự mua/OTC — dễ bị bỏ sót khi khai báo, cần rà soát kỹ")
        if c.alternative_cause:
            score -= 2
            reasons.append("Có nguyên nhân thay thế có thể giải thích phản ứng (giảm điểm)")

        if not reasons:
            reasons.append("Không có yếu tố nghi ngờ nổi bật — theo dõi thêm")

        if score >= 5:
            level = "high"  # nghi ngờ cao / có khả năng (probable)
        elif score >= 2:
            level = "possible"  # có thể (possible)
        else:
            level = "low"

        scored.append(SuspectScore(name=c.name, score=score, rank=0, level=level, reasons=reasons))

    scored.sort(key=lambda s: (-s.score, s.name))
    for i, s in enumerate(scored, start=1):
        s.rank = i
    return scored


def build_summary(scores: list[SuspectScore]) -> str:
    """Tóm tắt dành cho bác sĩ kiểm tra (AI soạn — bác sĩ xác nhận)."""
    if not scores:
        return "Không có thuốc nào trong danh sách để xếp hạng."
    top = scores[0]
    lines = [f"Thuốc nghi ngờ ưu tiên: {top.name} (mức: {top.level}, điểm: {top.score})"]
    lines += [f"- {r}" for r in top.reasons]
    if len(scores) > 1:
        others = "; ".join(f"{s.name} ({s.level})" for s in scores[1:4])
        lines.append(f"Các tác nhân khác cần rà soát: {others}")
    lines.append(
        "Cần bác sĩ kiểm tra và xác nhận trước khi cập nhật hồ sơ dị ứng. "
        "Theo WHO, đánh giá nhân quả thường chỉ đạt mức 'có thể'/'có khả năng'."
    )
    return "\n".join(lines)
