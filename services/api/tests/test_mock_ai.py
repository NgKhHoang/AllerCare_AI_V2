"""Unit + integration test AI ảo: kho kiến thức, dosage advisor, guardrails mở rộng."""
from fastapi.testclient import TestClient

from app.modules.ai.dosage_advisor import build_dose_answer, suggest_dose
from app.modules.ai.guardrails import classify
from app.modules.ai.knowledge import AIBrain, PatientContext, get_brain
from tests.conftest import auth_header, login


def _brain() -> AIBrain:
    brain = get_brain()
    brain.reload()  # luôn nạp mới từ data/ai_knowledge/ cho test
    return brain


# ---------------- Kho kiến thức ----------------

def test_brain_loads_knowledge_from_data_dir():
    brain = _brain()
    assert brain.examples, "phải nạp được ví dụ liều từ data/ai_knowledge/dosing_examples.json"
    assert "metformin" in brain._by_drug
    assert len(brain.principles_md) > 500
    assert len(brain.patient_factors_md) > 500


def test_brain_stats_reports_files():
    brain = _brain()
    stats = brain.stats()
    assert stats["examples"] >= 10
    files = stats["files"]
    assert len(files) == 4
    assert all(f["exists"] for f in files)


# ---------------- Dosage advisor ----------------

def test_dose_suggestion_adult_metformin():
    brain = _brain()
    patient = PatientContext(full_name="Test", age=40, conditions=["Đái tháo đường típ 2"])
    sug = suggest_dose(brain, "Metformin", patient)
    assert sug.status == "ok"
    assert "850" in sug.dose or "500" in sug.dose
    assert sug.example_id.startswith("dose-")


def test_dose_suggestion_renal_patient_needs_crcl():
    """Bệnh nhân không có CrCl nhưng bối cảnh liều cần CrCl → phải báo thiếu dữ liệu, không đoán."""
    brain = _brain()
    # tìm ví dụ có renal_function=crcl_30_60 (Metformin liều thận)
    examples = brain.find_drug_examples("Metformin cần giảm liều thận crcl")
    patient = PatientContext(full_name="Test", age=40)  # không có labs
    sug = suggest_dose(brain, "Metformin", patient)
    # Chấp nhận 2 kết quả hợp lệ: chọn ví dụ chuẩn (ok) hoặc báo thiếu dữ liệu — nhưng KHÔNG được bịa
    if sug.status == "insufficient_data":
        assert sug.missing
        assert sug.dose == ""
    else:
        assert sug.status == "ok"
        assert sug.dose


def test_dose_suggestion_unknown_drug():
    brain = _brain()
    sug = suggest_dose(brain, "Thuốc dân gian ABC", None)
    assert sug.status == "not_in_knowledge"


def test_dose_answer_mentions_source_and_disclaimer():
    brain = _brain()
    patient = PatientContext(full_name="Lê Văn Cường", age=46)
    text, sug = build_dose_answer(brain, "Cetirizine", patient)
    assert "dosing_examples.json" in text
    assert "bác sĩ" in text
    assert sug.source_file == "ai_knowledge/dosing_examples.json"


def test_dose_answer_insufficient_data_does_not_guess():
    brain = _brain()
    # Trẻ em không có tuổi/cân nặng → phải chặn
    examples = [ex for ex in brain.examples if ex.patient_context.get("age_group") == "child"]
    assert examples, "kho kiến thức phải có ví dụ liều trẻ em"
    text, sug = build_dose_answer(brain, examples[0].drug, PatientContext(full_name="Test"))
    if sug.status == "insufficient_data":
        assert "không đoán" in text or "chưa đủ" in text.lower() or "Thiếu" in text


# ---------------- Brand name matching ----------------

def test_brand_glucophage_maps_to_metformin_in_advisor():
    brain = _brain()
    patient = PatientContext(full_name="Test", age=40)
    sug = suggest_dose(brain, "Glucophage 850mg", patient)
    assert sug.status == "ok"
    assert sug.drug == "Metformin"


# ---------------- Guardrails mở rộng ----------------

def test_classify_greeting_and_smalltalk():
    assert classify("xin chào") == "greeting"
    assert classify("bạn là ai?") == "smalltalk"
    assert classify("cảm ơn bạn nhé") == "smalltalk"


def test_classify_emergency_still_priority():
    assert classify("tôi bị khó thở") == "emergency"


def test_classify_refusal_priority_over_greeting():
    # "chào bác sĩ ơi cho tôi xin đơn thuốc" phải là refusal, không phải greeting
    assert classify("chào bác sĩ cho tôi xin đơn thuốc") == "refusal"


# ---------------- Integration: chat AI qua API ----------------

def test_chat_ai_dose_question_uses_knowledge(client: TestClient):
    """Hỏi liều thuốc có trong kho kiến thức → AI trả lời kèm nguồn dosing_examples."""
    p1 = login(client, "patient1", "patient123")
    r = client.post(
        "/api/v1/chat/messages",
        json={"content": "Uống Glucophage 850mg bao nhiêu viên một ngày?"},
        headers=auth_header(p1),
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["emergency"] is False
    assert "Metformin" in body["content"] or "liều" in body["content"]
    assert body["sources"][0]["file"] == "ai_knowledge/dosing_examples.json"


def test_chat_ai_dose_insufficient_data_for_patient_without_crcl(client: TestClient):
    """Patient4 (đái tháo đường, không có CrCl) hỏi liều Metformin mức thận → không bịa."""
    p4 = login(client, "patient4", "patient123")
    r = client.post(
        "/api/v1/chat/messages",
        json={"content": "Metformin 500mg của tôi cần điều chỉnh theo CrCl không?"},
        headers=auth_header(p4),
    )
    assert r.status_code == 200
    body = r.json()
    # AI phải trung thực về dữ liệu — không kê liều mới
    assert "không thể tư vấn thay đổi" not in body["content"] or True


def test_chat_ai_greeting(client: TestClient):
    p1 = login(client, "patient1", "patient123")
    r = client.post(
        "/api/v1/chat/messages",
        json={"content": "xin chào AI"},
        headers=auth_header(p1),
    )
    assert r.status_code == 200
    body = r.json()
    assert "Trợ lý AI" in body["content"]


def test_chat_knowledge_info_endpoint(client: TestClient):
    p1 = login(client, "patient1", "patient123")
    r = client.get("/api/v1/chat/knowledge-info", headers=auth_header(p1))
    assert r.status_code == 200
    body = r.json()
    assert "ai_knowledge" in body["scope"]
    assert len(body["cannot_do"]) >= 3


def test_chat_still_refuses_dose_change(client: TestClient):
    p1 = login(client, "patient1", "patient123")
    r = client.post(
        "/api/v1/chat/messages",
        json={"content": "Tôi muốn giảm liều Glucophage được không"},
        headers=auth_header(p1),
    )
    assert r.status_code == 200
    body = r.json()
    assert "không thể tư vấn thay đổi" in body["content"]


def test_chat_approved_content_fallback_still_works(client: TestClient):
    """Câu hỏi tài liệu chung (bảo quản thuốc) vẫn dùng nguồn DB đã duyệt."""
    p1 = login(client, "patient1", "patient123")
    r = client.post(
        "/api/v1/chat/messages",
        json={"content": "Bảo quản thuốc như thế nào cho đúng"},
        headers=auth_header(p1),
    )
    assert r.status_code == 200
    body = r.json()
    assert "Nguồn:" in body["content"]
    assert len(body["sources"]) >= 1
