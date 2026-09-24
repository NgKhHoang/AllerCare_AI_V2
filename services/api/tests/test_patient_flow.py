"""Integration test luồng người bệnh: khai báo thuốc, dị ứng, triệu chứng + bác sĩ xử lý."""
from fastapi.testclient import TestClient

from tests.conftest import auth_header, login


def test_patient_reports_and_doctor_sees(client: TestClient):
    """Luồng nghiệp vụ chính mục 7 README: người bệnh nhập → bác sĩ xem → đánh dấu đã xem."""
    p1 = login(client, "patient1", "patient123")
    d1 = login(client, "doctor1", "doctor123")
    pid = client.get("/api/v1/patients/me/profile", headers=auth_header(p1)).json()["id"]

    # 1) Người bệnh khai báo thuốc + triệu chứng
    r = client.post(
        f"/api/v1/patients/{pid}/medications",
        json={"raw_name": "Efferalgan 500mg", "is_current": True, "frequency": "1 viên khi cần"},
        headers=auth_header(p1),
    )
    assert r.status_code == 201, r.text
    med = r.json()
    # Dữ liệu tự khai phải là unverified + ghi rõ nguồn
    assert med["verification"] == "unverified"
    assert med["source_label"] == "Khai báo bởi người bệnh"

    r = client.post(
        f"/api/v1/patients/{pid}/observations",
        json={"kind": "symptom", "label": "Phát ban nhẹ sau khi uống thuốc", "occurred_at": "2026-09-20 20:00"},
        headers=auth_header(p1),
    )
    assert r.status_code == 201
    obs = r.json()
    assert obs["status"] == "sent"
    assert obs["verification"] == "unverified"

    # 2) Bác sĩ thấy trong danh sách ca có cập nhật chưa xem
    r = client.get("/api/v1/patients/assigned", headers=auth_header(d1))
    row = next(x for x in r.json() if x["profile_id"] == pid)
    assert row["unseen_updates"] >= 1

    # 3) Bác sĩ đánh dấu đã xem
    r = client.post(
        f"/api/v1/patients/{pid}/observations/{obs['id']}/status",
        json={"status": "seen"},
        headers=auth_header(d1),
    )
    assert r.status_code == 200
    assert r.json()["status"] == "seen"

    # 4) Bác sĩ xác minh thuốc
    r = client.post(
        f"/api/v1/patients/{pid}/verify-medication/{med['id']}",
        json={"verify": True},
        headers=auth_header(d1),
    )
    assert r.status_code == 200
    assert r.json()["verification"] == "verified"


def test_unverified_data_never_auto_verified(client: TestClient):
    """Khai báo dị ứng mới luôn unverified cho tới khi bác sĩ xác minh."""
    p2 = login(client, "patient2", "patient123")
    d1 = login(client, "doctor1", "doctor123")
    pid = client.get("/api/v1/patients/me/profile", headers=auth_header(p2)).json()["id"]

    r = client.post(
        f"/api/v1/patients/{pid}/allergies",
        json={"substance": "Cefixime", "reaction": "D гибa nghi ngờ"},
        headers=auth_header(p2),
    )
    assert r.status_code == 201
    allergy = r.json()
    assert allergy["verification"] == "unverified"

    # Dị ứng unverified KHÔNG được dùng để cảnh báo MedSafe
    # (engine chỉ dùng verified allergies — kiểm tra qua kết quả kiểm tra)
    r = client.post("/api/v1/safety-checks", json={"profile_id": pid}, headers=auth_header(d1))
    assert r.status_code == 201

    # Bác sĩ xác minh
    r = client.post(
        f"/api/v1/patients/{pid}/verify-allergy/{allergy['id']}",
        json={"verify": True},
        headers=auth_header(d1),
    )
    assert r.status_code == 200
    assert r.json()["verification"] == "verified"


def test_patient_lists_own_data(client: TestClient):
    p1 = login(client, "patient1", "patient123")
    pid = client.get("/api/v1/patients/me/profile", headers=auth_header(p1)).json()["id"]

    meds = client.get(f"/api/v1/patients/{pid}/medications", headers=auth_header(p1))
    assert meds.status_code == 200
    assert isinstance(meds.json(), list) and len(meds.json()) >= 1

    obs = client.get(f"/api/v1/patients/{pid}/observations", headers=auth_header(p1))
    assert obs.status_code == 200

    alg = client.get(f"/api/v1/patients/{pid}/allergies", headers=auth_header(p1))
    assert alg.status_code == 200
    assert any(a["substance"] == "Penicillin" for a in alg.json())
