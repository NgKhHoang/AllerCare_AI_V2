"""Test đối soát thuốc (WHO reconciliation), ảnh tổn thương, quy tắc liều, AI tóm tắt.

Theo tài liệu CHI TIẾT mục 2, 5, 6:
- Người bệnh khai thuốc từ MỌI nguồn + ảnh toa → unverified, chờ bác sĩ xác nhận.
- Người nhà ủy quyền khai thay được; không ủy quyền thì bị chặn.
- Cảnh báo sai/trùng liều (DL001), bỏ liều/dùng không đều (DL002).
- AI tóm tắt diễn biến cho bác sĩ — chỉ tổng hợp dữ liệu hệ thống.
"""
from fastapi.testclient import TestClient

from tests.conftest import auth_header, login


def _pid(client: TestClient, token: str) -> str:
    r = client.get("/api/v1/patients/me/profile", headers=auth_header(token))
    assert r.status_code == 200, r.text
    return r.json()["id"]


# ---------------- Đối soát thuốc: mọi nguồn + ảnh toa ----------------

def test_patient_declares_medication_from_any_source(client: TestClient):
    token = login(client, "patient6", "patient123")
    pid = _pid(client, token)
    r = client.post(
        f"/api/v1/patients/{pid}/medications",
        json={
            "raw_name": "Thuốc bổ xương khớp (không rõ tên)",
            "is_current": True,
            "dose": "1 viên/ngày",
            "timing": "8h và 20h",
            "start_date": "2026-09-20",
            "prescriber": "Tự mua",
            "source_label": "Thực phẩm chức năng",
            "image_url": "toa-01.jpg",
            "frequency": "1 viên/ngày",
        },
        headers=auth_header(token),
    )
    assert r.status_code == 201, r.text
    med = r.json()
    assert med["verification"] == "unverified"
    assert med["source_label"] == "Thực phẩm chức năng"
    assert med["image_url"] == "toa-01.jpg"
    assert med["timing"] == "8h và 20h"
    assert med["status"] == "active"

    # Bác sĩ thấy thuốc mới + xác nhận đưa vào hồ sơ chính thức
    doc = login(client, "doctor2", "doctor123")
    lst = client.get("/api/v1/patients/assigned", headers=auth_header(doc))
    target = next(p for p in lst.json() if p["profile_id"] == pid)
    assert target["profile_id"] == pid
    ok = client.post(
        f"/api/v1/patients/{pid}/verify-medication/{med['id']}",
        json={"verify": True},
        headers=auth_header(doc),
    )
    assert ok.status_code == 200 and ok.json()["verification"] == "verified"


def test_patient_can_stop_medication_with_reason(client: TestClient):
    token = login(client, "patient6", "patient123")
    pid = _pid(client, token)
    meds = client.get(f"/api/v1/patients/{pid}/medications", headers=auth_header(token)).json()
    assert meds, "patient6 phải có thuốc từ test trước (chạy cùng session)"
    med = meds[0]
    r = client.post(
        f"/v1/patients/{pid}/medications/{med['id']}/stop".replace("/v1", "/api/v1"),
        params={"reason": "Uống xong bị ngứa"},
        headers=auth_header(token),
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["status"] == "stopped"
    assert "ngứa" in body["stop_reason"]


# ---------------- Người nhà ủy quyền ----------------

def test_caregiver_declares_medication_for_linked_patient(client: TestClient):
    """family1 ủy quyền cho case01 — khai thuốc thay được; hồ sơ khác bị chặn."""
    cg = login(client, "family1", "family123")
    doc = login(client, "doctor1", "doctor123")
    lst = client.get("/api/v1/patients/assigned", headers=auth_header(doc))
    case01 = next(p for p in lst.json() if p["username"] == "case01")
    case09 = next(p for p in lst.json() if p["username"] == "case09")

    # Khai thay case01: được
    r = client.post(
        f"/api/v1/patients/{case01['profile_id']}/medications",
        json={"raw_name": "Kem dưỡng ẩm (người nhà mua)", "is_current": True, "source_label": "Tự mua"},
        headers=auth_header(cg),
    )
    assert r.status_code == 201, r.text
    assert r.json()["verification"] == "unverified"

    # Khai thay case09: bị chặn
    r2 = client.post(
        f"/api/v1/patients/{case09['profile_id']}/medications",
        json={"raw_name": "Thuốc lạ", "is_current": True},
        headers=auth_header(cg),
    )
    assert r2.status_code == 403


# ---------------- Quy tắc liều DL001 / DL002 ----------------

def test_dose_error_rule_fires(client: TestClient):
    """Người bệnh khai cách dùng 'uống gấp đôi' → DL001 cảnh báo."""
    token = login(client, "patient7", "patient123")
    pid = _pid(client, token)
    client.post(
        f"/api/v1/patients/{pid}/medications",
        json={
            "raw_name": "Paracetamol 500mg",
            "is_current": True,
            "frequency": "quên liều nên uống gấp đôi 2 viên",
            "source_label": "Tự mua",
        },
        headers=auth_header(token),
    )
    doc = login(client, "doctor2", "doctor123")
    check = client.post(
        "/api/v1/safety-checks", json={"profile_id": pid}, headers=auth_header(doc)
    )
    assert check.status_code in (200, 201), check.text
    result = check.json()["result"]
    assert result["status"] == "has_alerts"
    assert any(a["rule_code"] == "DL001" for a in result["alerts"])


def test_dose_missed_rule_fires(client: TestClient):
    """Thuốc khai ở trạng thái 'irregular' (dùng không đều) → DL002 cảnh báo."""
    token = login(client, "patient3", "patient123")
    pid = _pid(client, token)
    client.post(
        f"/api/v1/patients/{pid}/medications",
        json={
            "raw_name": "Warfarin 3mg",
            "is_current": True,
            "status": "irregular",
            "source_label": "Bệnh viện/phòng khám khác",
        },
        headers=auth_header(token),
    )
    doc = login(client, "doctor1", "doctor123")
    check = client.post(
        "/api/v1/safety-checks", json={"profile_id": pid}, headers=auth_header(doc)
    )
    assert check.status_code in (200, 201), check.text
    result = check.json()["result"]
    assert result["status"] == "has_alerts"
    assert any(a["rule_code"] == "DL002" for a in result["alerts"])


# ---------------- Ảnh tổn thương da + AI tóm tắt ----------------

def test_observation_with_image_and_ai_summary(client: TestClient):
    token = login(client, "patient1", "patient123")
    pid = _pid(client, token)

    # Người bệnh gửi triệu chứng kèm ảnh tổn thương
    r = client.post(
        f"/api/v1/patients/{pid}/observations",
        json={
            "kind": "symptom",
            "label": "Vết rash ở cẳng chân lan rộng",
            "occurred_at": "2026-09-22 20:30",
            "image_url": "anh-tot-thuong-01.jpg",
        },
        headers=auth_header(token),
    )
    assert r.status_code == 201, r.text
    assert r.json()["image_url"] == "anh-tot-thuong-01.jpg"

    # Bác sĩ chạy AI tóm tắt — phải tổng hợp được ảnh + nguồn thuốc
    doc = login(client, "doctor1", "doctor123")
    s = client.get(f"/api/v1/patients/{pid}/ai-summary", headers=auth_header(doc))
    assert s.status_code == 200, s.text
    body = s.json()
    assert "summary" in body and "highlights" in body
    assert any("[kèm ảnh]" in line for line in body["symptoms"])
    assert body["disclaimer"]

    # Điều dưỡng cũng xem được tóm tắt; người bệnh không được
    nurse = login(client, "nurse1", "nurse123")
    assert client.get(f"/api/v1/patients/{pid}/ai-summary", headers=auth_header(nurse)).status_code == 200
    assert client.get(f"/api/v1/patients/{pid}/ai-summary", headers=auth_header(token)).status_code == 403
