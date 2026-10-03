"""Kiểm thử phân quyền RBAC hệ thống tin nhắn & cuộc gọi trực tiếp."""
from fastapi.testclient import TestClient

from app.main import app
from app.modules.auth.security import create_access_token


def get_token(username: str, role: str, user_id: str) -> str:
    return create_access_token({"sub": user_id, "username": username, "role": role})


def auth_header(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def login(client: TestClient, username: str, password: str = "doctor123") -> str:
    res = client.post(
        "/api/v1/auth/login",
        data={"username": username, "password": password},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    assert res.status_code == 200, res.text
    return res.json()["access_token"]


def test_messages_rbac_patient_vs_doctor():
    with TestClient(app) as client:
        # 1. Đăng nhập doctor1 (Bác sĩ phụ trách)
        doc1_token = login(client, "doctor1", "doctor123")
        doc1_me = client.get("/api/v1/auth/me", headers=auth_header(doc1_token)).json()

        # 2. Đăng nhập doctor2 (Bác sĩ khác)
        doc2_token = login(client, "doctor2", "doctor123")
        doc2_me = client.get("/api/v1/auth/me", headers=auth_header(doc2_token)).json()

        # 3. Đăng nhập patient1 (Người bệnh do doctor1 phụ trách)
        pat1_token = login(client, "patient1", "patient123")
        pat1_me = client.get("/api/v1/auth/me", headers=auth_header(pat1_token)).json()

        # 4. Kiểm tra danh bạ của doctor1: Có thể thấy tất cả mọi người
        doc1_contacts = client.get("/api/v1/messages/contacts", headers=auth_header(doc1_token))
        assert doc1_contacts.status_code == 200
        contacts_doc1 = doc1_contacts.json()
        assert len(contacts_doc1) > 1
        contact_usernames = [c["username"] for c in contacts_doc1]
        assert "patient1" in contact_usernames
        assert "doctor2" in contact_usernames

        # 5. Kiểm tra danh bạ của patient1: CHỈ thấy bác sĩ đang phụ trách (doctor1)
        pat1_contacts = client.get("/api/v1/messages/contacts", headers=auth_header(pat1_token))
        assert pat1_contacts.status_code == 200
        contacts_pat1 = pat1_contacts.json()
        assert len(contacts_pat1) >= 1
        # Toàn bộ danh bạ của patient1 phải là bác sĩ điều trị phụ trách
        pat1_doc_ids = [c["id"] for c in contacts_pat1]
        assert doc1_me["id"] in pat1_doc_ids
        assert doc2_me["id"] not in pat1_doc_ids

        # 6. Người bệnh nhắn tin cho Bác sĩ phụ trách -> THÀNH CÔNG
        res_ok = client.post(
            f"/api/v1/messages/{doc1_me['id']}",
            headers=auth_header(pat1_token),
            json={"content": "Em chào Bác sĩ An ạ!"},
        )
        assert res_ok.status_code == 200
        assert res_ok.json()["content"] == "Em chào Bác sĩ An ạ!"

        # 7. Người bệnh cố ý nhắn tin cho Bác sĩ khác (không phụ trách) -> BỊ TỪ CHỐI 403
        res_forbidden = client.post(
            f"/api/v1/messages/{doc2_me['id']}",
            headers=auth_header(pat1_token),
            json={"content": "Chào bác sĩ Bình!"},
        )
        assert res_forbidden.status_code == 403
        assert "chỉ có thể liên lạc với Bác sĩ đang phụ trách" in res_forbidden.json()["detail"]

        # 8. Người bệnh cố ý gọi điện cho Bác sĩ khác -> BỊ TỪ CHỐI 403
        call_forbidden = client.post(
            "/api/v1/messages/call/token",
            headers=auth_header(pat1_token),
            json={"target_user_id": doc2_me["id"], "call_type": "voice"},
        )
        assert call_forbidden.status_code == 403
