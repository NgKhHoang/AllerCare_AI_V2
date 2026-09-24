"""Unit test guardrails chatbot."""
from app.modules.ai.guardrails import classify


def test_emergency_detected():
    for msg in ["Tôi bị khó thở lắm", "Con tôi sưng môi sau khi uống thuốc", "bị sốc phản vệ"]:
        assert classify(msg) == "emergency", msg


def test_refusal_dose_change():
    for msg in ["Tôi muốn giảm liều được không", "Có nên tăng liều không", "tăng liều lên 2 viên"]:
        assert classify(msg) == "refusal", msg


def test_refusal_prescription_request():
    assert classify("bác sĩ ơi cho tôi xin đơn thuốc mới") == "refusal"
    assert classify("nên mua thuốc gì cho ngứa") == "refusal"


def test_handoff_detected():
    for msg in ["Tôi muốn gặp bác sĩ", "muốn nói chuyện với nhân viên y tế"]:
        assert classify(msg) == "handoff", msg


def test_in_scope_question():
    assert classify("Uống thuốc khi quên liều thì làm sao ạ") == "in_scope"
    assert classify("Bảo quản thuốc thế nào cho đúng") == "in_scope"


def test_out_of_scope_or_empty():
    assert classify("") == "out_of_scope"
    assert classify("Thủ tướng nước Mỹ là ai") == "in_scope"  # sẽ bị lọc ở bước truy xuất nguồn
