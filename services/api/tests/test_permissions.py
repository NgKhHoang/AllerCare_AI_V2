"""Integration test API phân quyền — nhóm "Phân quyền" README mục 14.

Chạy trên DB đã seed (xem README: alembic upgrade head && python -m app.seed_data).
"""
from fastapi.testclient import TestClient

from tests.conftest import auth_header, login


def test_login_success_and_me(client: TestClient):
    token = login(client, "patient1", "patient123")
    r = client.get("/api/v1/auth/me", headers=auth_header(token))
    assert r.status_code == 200
    me = r.json()
    assert me["username"] == "patient1"
    assert me["role"] == "patient"


def test_login_wrong_password(client: TestClient):
    r = client.post("/api/v1/auth/login", data={"username": "patient1", "password": "sai-mat-khau"})
    assert r.status_code == 401


def test_access_without_token(client: TestClient):
    r = client.get("/api/v1/patients/assigned")
    assert r.status_code == 401


def test_patient_cannot_view_other_profile(client: TestClient):
    """Người bệnh không xem chéo hồ sơ người khác."""
    p1 = login(client, "patient1", "patient123")
    p2 = login(client, "patient2", "patient123")

    # patient1 lấy hồ sơ của chính mình
    r = client.get("/api/v1/patients/me/profile", headers=auth_header(p1))
    assert r.status_code == 200
    profile1_id = r.json()["id"]

    # patient2 cố đọc hồ sơ của patient1 qua id
    r = client.get(f"/api/v1/patients/{profile1_id}", headers=auth_header(p2))
    assert r.status_code == 403

    # patient2 cố thêm thuốc vào hồ sơ patient1
    r = client.post(
        f"/api/v1/patients/{profile1_id}/medications",
        json={"raw_name": "Thuốc lạ"},
        headers=auth_header(p2),
    )
    assert r.status_code == 403


def test_doctor_only_sees_assigned_patients(client: TestClient):
    """Bác sĩ chỉ xem ca được phân công."""
    d1 = login(client, "doctor1", "doctor123")
    r = client.get("/api/v1/patients/assigned", headers=auth_header(d1))
    assert r.status_code == 200
    names = [row["full_name"] for row in r.json()]
    # doctor1 phụ trách các ca giả lập + case01/02/03/07/08/09 (mở rộng theo data/demo/cases.json)
    allowed = {
        "Lê Văn Cường", "Phạm Thị Dung", "Hoàng Minh Đức", "Vũ Thị Giang", "Đỗ Quốc Huy", "Lý Thanh Jame",
        "NGUYỄN THỊ NGUYỆT", "NGUYỄN KÈO", "LANG THANH BÌNH", "NGUYỄN VĂN ĐÊ", "LÒ TUẤN ĐẠT", "TRƯƠNG QUỐC CHÍNH",
    }
    assert all(n in allowed for n in names)
    # doctor2 không có ca nào của doctor1
    d2 = login(client, "doctor2", "doctor123")
    r2 = client.get("/api/v1/patients/assigned", headers=auth_header(d2))
    names2 = {row["full_name"] for row in r2.json()}
    assert "Lê Văn Cường" not in names2  # patient1 thuộc doctor1


def test_doctor_cannot_access_unassigned_profile(client: TestClient):
    d2 = login(client, "doctor2", "doctor123")
    p1 = login(client, "patient1", "patient123")
    profile1_id = client.get("/api/v1/patients/me/profile", headers=auth_header(p1)).json()["id"]
    r = client.get(f"/api/v1/patients/{profile1_id}", headers=auth_header(d2))
    assert r.status_code == 403


def test_patient_cannot_run_safety_check(client: TestClient):
    """Kiểm tra an toàn thuốc là việc của bác sĩ/dược sĩ."""
    p1 = login(client, "patient1", "patient123")
    profile_id = client.get("/api/v1/patients/me/profile", headers=auth_header(p1)).json()["id"]
    r = client.post("/api/v1/safety-checks", json={"profile_id": profile_id}, headers=auth_header(p1))
    assert r.status_code == 403


def test_patient_cannot_change_rule_status(client: TestClient):
    p1 = login(client, "patient1", "patient123")
    r = client.get("/api/v1/rules", headers=auth_header(p1))
    assert r.status_code == 403
