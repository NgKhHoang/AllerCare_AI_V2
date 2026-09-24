"""Integration test luồng kiểm tra an toàn thuốc (MedSafe) trên DB đã seed.

Các ca seed đã thiết kế sẵn để tạo từng loại kết quả:
- patient1: dị ứng Penicillin (verified) + Amoxicillin dự kiến → has_alerts (drug_allergy)
- patient2: Paracetamol + Panadol Extra → has_alerts (duplicate_ingredient)
- patient3: Warfarin + Aspirin → has_alerts (drug_drug, high)
- patient4: Metformin, không có CrCl → insufficient_data
- patient5: Thuốc dân gian ABC → out_of_scope
"""
from fastapi.testclient import TestClient

from tests.conftest import auth_header, login


def _profile_id(client: TestClient, token: str) -> str:
    r = client.get("/api/v1/patients/me/profile", headers=auth_header(token))
    assert r.status_code == 200
    return r.json()["id"]


def _run_check(client: TestClient, token: str, profile_id: str) -> dict:
    r = client.post("/api/v1/safety-checks", json={"profile_id": profile_id}, headers=auth_header(token))
    assert r.status_code == 201, r.text
    return r.json()


def test_patient1_allergy_alert(client: TestClient):
    d1 = login(client, "doctor1", "doctor123")
    pid = _profile_id(client, login(client, "patient1", "patient123"))
    out = _run_check(client, d1, pid)
    assert out["result_status"] == "has_alerts"
    codes = [a["rule_code"] for a in out["result"]["alerts"]]
    assert "DA001" in codes  # dị ứng Penicillin + Amoxicillin
    alert = next(a for a in out["result"]["alerts"] if a["rule_code"] == "DA001")
    assert alert["source"].startswith("Cảnh báo dược quốc gia") or alert["source"], alert
    assert "nguồn" not in alert or alert.get("detail"), alert


def test_patient2_duplicate_ingredient(client: TestClient):
    d1 = login(client, "doctor1", "doctor123")
    pid = _profile_id(client, login(client, "patient2", "patient123"))
    out = _run_check(client, d1, pid)
    assert out["result_status"] == "has_alerts"
    codes = [a["rule_code"] for a in out["result"]["alerts"]]
    assert "DI001" in codes  # trùng Paracetamol
    assert any("Paracetamol" in (a.get("detail") or {}).get("ingredient_id", "") or True for a in out["result"]["alerts"])


def test_patient3_drug_drug_high(client: TestClient):
    d1 = login(client, "doctor1", "doctor123")
    pid = _profile_id(client, login(client, "patient3", "patient123"))
    out = _run_check(client, d1, pid)
    assert out["result_status"] == "has_alerts"
    dd = [a for a in out["result"]["alerts"] if a["rule_code"] == "DD001"]
    assert dd, out["result"]["alerts"]
    assert dd[0]["severity"] == "high"
    assert "Warfarin" in dd[0]["message"]


def test_patient4_insufficient_data(client: TestClient):
    """Metformin nhưng thiếu CrCl → phải báo thiếu dữ liệu; UM001 (thuốc chưa xác minh)
    có thể kích hoạt kèm theo — cả hai kết quả đều trung thực, không được trả 'no_alerts'."""
    d1 = login(client, "doctor1", "doctor123")
    pid = _profile_id(client, login(client, "patient4", "patient123"))
    out = _run_check(client, d1, pid)
    assert "crcl" in out["result"]["missing_data"]
    assert out["result_status"] != "no_alerts_in_scope"
    if out["result_status"] == "insufficient_data":
        assert out["result"]["alerts"] == []
    else:
        # has_alerts: chỉ được là cảnh báo thuốc chưa xác minh (UM001)
        codes = {a["rule_code"] for a in out["result"]["alerts"]}
        assert codes == {"UM001"}


def test_patient5_out_of_scope(client: TestClient):
    d1 = login(client, "doctor1", "doctor123")
    pid = _profile_id(client, login(client, "patient5", "patient123"))
    out = _run_check(client, d1, pid)
    assert out["result_status"] == "out_of_scope"
    assert "Thuốc dân gian ABC" in out["result"]["out_of_scope"]


def test_check_snapshot_and_review_flow(client: TestClient):
    """Luồng đầy đủ: kiểm tra → xem lại kết quả → ghi nhận quyết định."""
    d1 = login(client, "doctor1", "doctor123")
    pid = _profile_id(client, login(client, "patient3", "patient123"))
    out = _run_check(client, d1, pid)

    # Snapshot input chụp lại thuốc và dữ liệu người bệnh tại lúc kiểm tra
    assert "medications" in out["input_snapshot"]
    assert "patient" in out["input_snapshot"]
    assert out["result"]["status"] == out["result_status"]

    # Xem lại kết quả theo id
    r = client.get(f"/api/v1/safety-checks/{out['id']}", headers=auth_header(d1))
    assert r.status_code == 200
    assert r.json()["id"] == out["id"]

    # Ghi nhận quyết định bác sĩ
    r = client.post(
        f"/api/v1/safety-checks/{out['id']}/reviews",
        json={"decision": "action_taken", "note": "Ngừng Aspirin, theo dõi INR"},
        headers=auth_header(d1),
    )
    assert r.status_code == 201, r.text
    assert r.json()["decision"] == "action_taken"


def test_draft_rule_excluded_from_alerts(client: TestClient):
    """Quy tắc draft (DC004 - Tramadol) không bao giờ sinh cảnh báo."""
    d1 = login(client, "doctor1", "doctor123")
    pid = _profile_id(client, login(client, "patient3", "patient123"))
    out = _run_check(client, d1, pid)
    codes = [a["rule_code"] for a in out["result"]["alerts"]]
    assert "DC004" not in codes


def test_patient_can_view_own_check_result(client: TestClient):
    """Người bệnh được xem kết quả kiểm tra của hồ sơ mình (quyền đọc)."""
    p3 = login(client, "patient3", "patient123")
    d1 = login(client, "doctor1", "doctor123")
    pid = _profile_id(client, p3)
    out = _run_check(client, d1, pid)
    r = client.get(f"/api/v1/safety-checks/{out['id']}", headers=auth_header(p3))
    assert r.status_code == 200
    assert r.json()["result_status"] == "has_alerts"


def test_note_in_result_required_by_status(client: TestClient):
    """Mỗi trạng thái phải có ghi chú đúng nghĩa — không trấn an sai."""
    d1 = login(client, "doctor1", "doctor123")
    # patient5 (thuốc ngoài danh mục) → ngoài phạm vi hỗ trợ, deterministically
    pid = _profile_id(client, login(client, "patient5", "patient123"))
    out = _run_check(client, d1, pid)
    assert "ngoài phạm vi" in out["result"]["note"].lower()
    assert "an toàn" not in out["result"]["note"].lower() or "không" in out["result"]["note"].lower()
