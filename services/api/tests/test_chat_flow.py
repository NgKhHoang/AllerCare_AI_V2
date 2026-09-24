"""Integration test chatbot giới hạn + lịch hẹn + phòng video."""
from datetime import datetime, timedelta

from fastapi.testclient import TestClient

from tests.conftest import auth_header, login


def _future_slot(days_ahead: int = 1, hour: str = "10:00") -> str:
    """Ngày hẹn trong tương lai gần (tránh test 422 do lịch quá khứ)."""
    return (datetime.now() + timedelta(days=days_ahead)).strftime(f"%Y-%m-%d {hour}")


# ---------------- Chatbot ----------------

def test_chat_answers_from_approved_source(client: TestClient):
    p1 = login(client, "patient1", "patient123")
    r = client.post(
        "/api/v1/chat/messages",
        json={"content": "Bảo quản thuốc như thế nào cho đúng"},
        headers=auth_header(p1),
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["emergency"] is False
    assert "Nguồn:" in body["content"]
    assert len(body["sources"]) >= 1
    assert body["sources"][0]["version"]


def test_chat_emergency_replies_115(client: TestClient):
    p1 = login(client, "patient1", "patient123")
    r = client.post(
        "/api/v1/chat/messages",
        json={"content": "Tôi bị khó thở và sưng môi sau khi uống thuốc"},
        headers=auth_header(p1),
    )
    assert r.status_code == 200
    body = r.json()
    assert body["emergency"] is True
    assert "115" in body["content"]


def test_chat_refuses_dose_change(client: TestClient):
    p1 = login(client, "patient1", "patient123")
    r = client.post(
        "/api/v1/chat/messages",
        json={"content": "Tôi muốn giảm liều Glucophage được không"},
        headers=auth_header(p1),
    )
    assert r.status_code == 200
    body = r.json()
    assert "không thể tư vấn thay đổi thuốc" in body["content"]


def test_chat_handoff_to_staff(client: TestClient):
    p1 = login(client, "patient1", "patient123")
    r = client.post(
        "/api/v1/chat/messages",
        json={"content": "Tôi muốn gặp bác sĩ trực tiếp"},
        headers=auth_header(p1),
    )
    assert r.status_code == 200
    body = r.json()
    assert body["handoff"] is True


def test_chat_session_isolation(client: TestClient):
    """Tin nhắn của người này không xem được bởi người khác."""
    p1 = login(client, "patient1", "patient123")
    p2 = login(client, "patient2", "patient123")
    r = client.post("/api/v1/chat/messages", json={"content": "hello"}, headers=auth_header(p1))
    session_id = r.json()["session_id"]
    r2 = client.get(f"/api/v1/chat/messages?session_id={session_id}", headers=auth_header(p2))
    assert r2.status_code == 403


def test_doctor_cannot_use_patient_chat(client: TestClient):
    d1 = login(client, "doctor1", "doctor123")
    r = client.post("/api/v1/chat/messages", json={"content": "hi"}, headers=auth_header(d1))
    assert r.status_code == 403


# ---------------- Lịch hẹn + video ----------------

def _first_doctor_id(client: TestClient, token: str) -> str:
    profile = client.get("/api/v1/patients/me/profile", headers=auth_header(token)).json()
    return profile["assigned_doctor_id"]


def test_appointment_flow_end_to_end(client: TestClient):
    p1 = login(client, "patient1", "patient123")
    d1 = login(client, "doctor1", "doctor123")
    doctor_id = _first_doctor_id(client, p1)

    # Người bệnh tạo yêu cầu hẹn
    r = client.post(
        "/api/v1/appointments",
        json={"doctor_user_id": doctor_id, "scheduled_at": _future_slot(1), "reason": "Tái khám ngứa cẳng chân"},
        headers=auth_header(p1),
    )
    assert r.status_code == 201, r.text
    appt = r.json()
    assert appt["status"] == "requested"

    # Người ngoài không join được
    p2 = login(client, "patient2", "patient123")
    r = client.post(f"/api/v1/appointments/{appt['id']}/join", headers=auth_header(p2))
    assert r.status_code == 403

    # Chưa confirm thì không join được
    r = client.post(f"/api/v1/appointments/{appt['id']}/join", headers=auth_header(p1))
    assert r.status_code == 409

    # Bác sĩ xác nhận → phòng được tạo
    r = client.post(f"/api/v1/appointments/{appt['id']}/confirm", headers=auth_header(d1))
    assert r.status_code == 200
    assert r.json()["status"] == "confirmed"

    # Bác sĩ khác không confirm được lịch của doctor1
    d2 = login(client, "doctor2", "doctor123")
    r2 = client.post(
        "/api/v1/appointments",
        json={"doctor_user_id": _first_doctor_id(client, p1), "scheduled_at": _future_slot(2, "09:00")},
        headers=auth_header(p1),
    )
    appt2 = r2.json()
    # doctor2 không phải bác sĩ của lịch này → confirm phải bị chặn
    r = client.post(f"/api/v1/appointments/{appt2['id']}/confirm", headers=auth_header(d2))
    assert r.status_code == 403

    # Join thành công với quyền đúng
    r = client.post(f"/api/v1/appointments/{appt['id']}/join", headers=auth_header(p1))
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["recording_disabled"] is True
    assert body["room_code"]  # room_code ngẫu nhiên, không chứa tên/mã người bệnh
    assert "Lê Văn Cường" not in body["room_url"]

    # Hủy lịch thứ 2
    r = client.post(f"/api/v1/appointments/{appt2['id']}/cancel", headers=auth_header(p1))
    assert r.status_code == 200
    assert r.json()["status"] == "cancelled"


def test_join_returns_livekit_token(monkeypatch, client: TestClient):
    """Khi cấu hình LiveKit đủ, /join trả về token video hợp lệ gắn đúng phòng."""
    from app.config import get_settings

    monkeypatch.setenv("LIVEKIT_URL", "wss://livekit.test/livekit")
    monkeypatch.setenv("LIVEKIT_API_KEY", "testkey")
    monkeypatch.setenv("LIVEKIT_API_SECRET", "testsecret")
    get_settings.cache_clear()
    try:
        p1 = login(client, "patient1", "patient123")
        d1 = login(client, "doctor1", "doctor123")
        doctor_id = _first_doctor_id(client, p1)
        r = client.post(
            "/api/v1/appointments",
            json={"doctor_user_id": doctor_id, "scheduled_at": _future_slot(3, "11:00")},
            headers=auth_header(p1),
        )
        appt = r.json()
        r = client.post(f"/api/v1/appointments/{appt['id']}/confirm", headers=auth_header(d1))
        assert r.status_code == 200

        r = client.post(f"/api/v1/appointments/{appt['id']}/join", headers=auth_header(p1))
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["token"], "Phải có LiveKit token khi đã cấu hình"
        assert body["room_url"] == "wss://livekit.test/livekit"

        import jwt as pyjwt

        claims = pyjwt.decode(body["token"], "testsecret", algorithms=["HS256"])
        assert claims["video"]["room"] == body["room_code"]
        assert claims["video"]["roomJoin"] is True
        assert claims["video"]["recorder"] is False
        assert claims["sub"]
    finally:
        get_settings.cache_clear()


def test_join_without_livekit_config_has_no_token(client: TestClient):
    """Chưa cấu hình LiveKit → token None, không sập endpoint (chế độ demo cũ)."""
    p1 = login(client, "patient1", "patient123")
    d1 = login(client, "doctor1", "doctor123")
    doctor_id = _first_doctor_id(client, p1)
    r = client.post(
        "/api/v1/appointments",
        json={"doctor_user_id": doctor_id, "scheduled_at": _future_slot(4, "14:00")},
        headers=auth_header(p1),
    )
    appt = r.json()
    client.post(f"/api/v1/appointments/{appt['id']}/confirm", headers=auth_header(d1))
    r = client.post(f"/api/v1/appointments/{appt['id']}/join", headers=auth_header(p1))
    assert r.status_code == 200
    body = r.json()
    assert body["token"] is None
    assert body["room_code"]


def test_patient_cannot_book_past_appointment(client: TestClient):
    p1 = login(client, "patient1", "patient123")
    doctor_id = _first_doctor_id(client, p1)
    r = client.post(
        "/api/v1/appointments",
        json={"doctor_user_id": doctor_id, "scheduled_at": "2020-01-01 10:00"},
        headers=auth_header(p1),
    )
    assert r.status_code == 422


def test_patient_cannot_book_other_doctor(client: TestClient):
    p1 = login(client, "patient1", "patient123")
    d2 = client.get("/api/v1/auth/me", headers=auth_header(login(client, "doctor2", "doctor123"))).json()
    r = client.post(
        "/api/v1/appointments",
        json={"doctor_user_id": d2["id"], "scheduled_at": _future_slot(1)},
        headers=auth_header(p1),
    )
    assert r.status_code == 403
