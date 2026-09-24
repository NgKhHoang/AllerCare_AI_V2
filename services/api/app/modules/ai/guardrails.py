"""Guardrails cho chat AI: giới hạn phạm vi, từ chối yêu cầu nguy hiểm, phát hiện khẩn cấp.

Nguyên tắc README:
- AI chỉ trò chuyện trong phạm vi hướng dẫn sử dụng + kho kiến thức data/ai_knowledge/.
- Từ chối yêu cầu tự đổi thuốc/liều; chuyển nhân viên y tế khi cần.
- KHÔNG xử lý phản vệ cấp — luôn hướng dẫn gọi cấp cứu 115.
- AI không quyết định cảnh báo; không kê đơn; không chẩn đoán.
"""
import re

EMERGENCY_PATTERNS = [
    r"khó thở",
    r"thở khò khè",
    r"sưng (mặt|môi|lưỡi|cổ họng)",
    r"phản vệ",
    r"sốc phản vệ",
    r"mất ý thức",
    r"co giật",
    r"đau ngực dữ dội",
]

REFUSAL_PATTERNS = [
    r"(tăng|giảm|đổi|thay|bỏ|ngừng|hủy)\s+(liều|thuốc)",
    r"(uống|dùng)\s+(thêm|gấp)\s*\d*",
    r"nên\s+(kê|cho)\s+(thuốc|đơn)",
    r"(cho|xin)\s+tôi\s+(xin\s+)?(đơn|thuốc)",
    r"xin\s+(đơn|thuốc)",
    r"thay\s+thế\s+thuốc",
    r"tôi\s+nên\s+uống\s+gì\s+để\s+khỏi",
    r"mua\s+thuốc\s+gì",
    r"kê\s+hồ\s+cho\s+tôi",
]

HANDOFF_PATTERNS = [
    r"gặp\s+bác\s+sĩ",
    r"nói\s+chuyện\s+với\s+(bác\s+sĩ|nhân\s+viên)",
    r"muốn\s+nói\s+trực\s+tiếp",
    r"không\s+hiểu\s+hướng\s+dẫn",
    r"nói\s+chuyện\s+với\s+dược\s+sĩ",
]

EMERGENCY_REPLY = (
    "Đây có thể là dấu hiệu khẩn cấp. Vui lòng GỌI CẤU CỨU 115 hoặc đến cơ sở y tế gần nhất NGAY LẬP TỨC. "
    "Mình là trợ lý AI nên không thể hỗ trợ xử trí phản vệ cấp — cấp cứu phải qua kênh y tế khẩn cấp 115."
)

REFUSAL_REPLY = (
    "Ừm, phần này mình là Trợ lý AI nên không thể tư vấn thay đổi thuốc, liều hoặc kê đơn — "
    "quyết định đó thuộc về bác sĩ phụ trách của bạn. "
    "Nhưng mình có thể kể cho bạn nghe cách bác sĩ chia liều trong kho kiến thức của mình, "
    "hoặc bạn đặt lịch hẹn với bác sĩ trong mục Lịch hẹn nhé 😊"
)

HANDOFF_REPLY = (
    "Ok nhé! Mình đã ghi lại yêu cầu của bạn và chuyển cho bác sĩ phụ trách. "
    "Bạn sẽ nhận được phản hồi trong mục Thông báo. "
    "Trong lúc chờ, nếu có gì khẩn cấp (khó thở, sưng mặt, phản vệ) thì gọi 115 ngay nhé!"
)

OUT_OF_SCOPE_REPLY = (
    "Câu này hơi ngoài phạm vi mình được phép trả lời rồi 😅 Mình chỉ trò chuyện được về cách dùng thuốc "
    "và cách bác sĩ chia liều dựa trên kho kiến thức của hệ thống thôi. "
    "Bạn đang thắc mắc về thuốc nào không? Còn nếu cần tư vấn đầy đủ hơn thì đặt lịch hẹn với bác sĩ nhé."
)

GREETING_PATTERNS = [
    r"^(xin\s+chào|chào|hello|hi|alo|hey)",
    r"^chào\s+(bạn|bot|ai|anh|chị|em)",
]

SMALL_TALK_PATTERNS = [
    r"bạn\s+(là\s+ai|tên\s+gì|làm\s+được\s+gì|có\s+làm\s+được)",
    r"bạn\s+là\s+(bác\s+sĩ|người|robot|ai|máy)\s*",
    r"(cảm\s+ơn|thank)",
]


def classify(message: str) -> str:
    """Phân loại tin nhắn: emergency | refusal | handoff | greeting | smalltalk | in_scope."""
    text = message.lower().strip()
    if not text:
        return "out_of_scope"
    for p in EMERGENCY_PATTERNS:
        if re.search(p, text):
            return "emergency"
    for p in REFUSAL_PATTERNS:
        if re.search(p, text):
            return "refusal"
    for p in HANDOFF_PATTERNS:
        if re.search(p, text):
            return "handoff"
    for p in GREETING_PATTERNS:
        if re.search(p, text):
            return "greeting"
    for p in SMALL_TALK_PATTERNS:
        if re.search(p, text):
            return "smalltalk"
    return "in_scope"
