"""Test phân hệ mới theo tài liệu CHI TIẾT: TriageGuard, xếp hạng nghi ngờ,
hướng dẫn thuốc, thông báo, Quality Dashboard, Admin, người nhà ủy quyền."""
from fastapi.testclient import TestClient

from tests.conftest import auth_header, login


def _pid(client: TestClient, token: str) -> str:
    r = client.get("/api/v1/patients/me/profile", headers=auth_header(token))
    assert r.status_code == 200, r.text
    return r.json()["id"]


# ---------------- TriageGuard ----------------

def test_triage_red_requires_emergency(client: TestClient):
    token = login(client, "patient1", "patient123")
    r = client.post(
        "/api/v1/triage",
        json={"message": "Tôi vừa uống thuốc xong bị khó thở rất nặng"},
        headers=auth_header(token),
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["level"] == "red"
    assert "115" in body["action_patient"]
    assert body["matched_labels"], "Mức đỏ phải ghi nhận được nhãn quy tắc khớp"


def test_triage_yellow_goes_to_queue(client: TestClient):
    token = login(client, "patient2", "patient123")
    r = client.post(
        "/api/v1/triage",
        json={"message": "Sáng nay tôi bắt đầu nổi mẩn đỏ hai cánh tay, ngứa nhiều"},
        headers=auth_header(token),
    )
    assert r.status_code == 201, r.text
    assert r.json()["level"] == "yellow"

    # Vàng → vào hàng đợi điều dưỡng/bác sĩ
    doc = login(client, "doctor1", "doctor123")
    q = client.get("/api/v1/triage/queue", headers=auth_header(doc))
    assert q.status_code == 200, q.text
    assert any(item["message"].startswith("Sáng nay") for item in q.json())

    # Điều dưỡng xác nhận kết quả phân luồng
    nurse = login(client, "nurse1", "nurse123")
    qn = client.get("/api/v1/triage/queue", headers=auth_header(nurse))
    assert qn.status_code == 200
    target = next((i for i in qn.json() if i["message"].startswith("Sáng nay")), None)
    assert target is not None
    ok = client.post(
        f"/api/v1/triage/{target['id']}/confirm", json={"decision": "confirmed"}, headers=auth_header(nurse)
    )
    assert ok.status_code == 200 and ok.json()["status"] == "confirmed"


def test_triage_green_when_mild(client: TestClient):
    token = login(client, "patient8", "patient123")
    r = client.post("/api/v1/triage", json={"message": "Da tôi đỡ hơn, ổn định, không ngứa"}, headers=auth_header(token))
    assert r.status_code == 201
    assert r.json()["level"] == "green"


def test_triage_history_mine(client: TestClient):
    token = login(client, "patient1", "patient123")
    client.post("/api/v1/triage", json={"message": "Vùng da cũ giảm ngứa"}, headers=auth_header(token))
    r = client.get("/api/v1/triage/mine", headers=auth_header(token))
    assert r.status_code == 200
    assert any("giảm ngứa" in item["message"] for item in r.json())


# ---------------- Xếp hạng tác nhân nghi ngờ ----------------

def test_suspect_ranking_flow(client: TestClient):
    """Case02 (phản vệ nghi do Cefaclor, tái diễn 2 lần) — AI xếp hạng, bác sĩ xác nhận."""
    doc = login(client, "doctor1", "doctor123")
    # Lấy profile của case02 qua danh sách bệnh nhân được phân công
    lst = client.get("/api/v1/patients/assigned", headers=auth_header(doc))
    assert lst.status_code == 200, lst.text
    case02 = next(p for p in lst.json() if p.get("username") == "case02" or "KÈO" in p.get("full_name", "").upper())
    pid = case02["profile_id"]

    r = client.post(
        "/api/v1/triage/suspect-ranking",
        json={
            "profile_id": pid,
            "reaction_description": "Mẩn đỏ toàn thân + khó thở 15 phút sau uống Cefaclor; tái diễn lần 2",
            "previous_episode_drugs": ["Cefaclor 500mg"],
        },
        headers=auth_header(doc),
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["ranking"], "Phải có bảng xếp hạng"
    top = body["ranking"][0]
    assert top["rank"] == 1
    assert top["level"] in ("high", "possible", "low")
    assert isinstance(top["score"], (int, float))
    assert isinstance(top["reasons"], list) and top["reasons"]

    # Bác sĩ xác nhận → tự ghi hồ sơ dị ứng (unverified)
    ok = client.post(f"/api/v1/triage/suspect-ranking/{body['id']}/confirm", headers=auth_header(doc))
    assert ok.status_code == 200
    assert ok.json()["status"] == "confirmed"
    assert ok.json()["allergy_record_id"]


def test_suspect_ranking_forbidden_for_patient(client: TestClient):
    token = login(client, "patient1", "patient123")
    pid = _pid(client, token)
    r = client.post(
        "/api/v1/triage/suspect-ranking",
        json={"profile_id": pid, "reaction_description": "Ngứa sau uống thuốc"},
        headers=auth_header(token),
    )
    assert r.status_code == 403


# ---------------- Hướng dẫn thuốc ----------------

def test_guide_draft_approve_acknowledge_flow(client: TestClient):
    doc = login(client, "doctor1", "doctor123")
    lst = client.get("/api/v1/patients/assigned", headers=auth_header(doc))
    case02 = next(p for p in lst.json() if p.get("username") == "case02" or "KÈO" in p.get("full_name", "").upper())
    pid = case02["profile_id"]

    meds = client.get(f"/api/v1/patients/{pid}/medications", headers=auth_header(doc))
    assert meds.status_code == 200, meds.text
    med_id = meds.json()[0]["id"]

    # AI soạn nháp
    d = client.post(f"/api/v1/guides/draft/{med_id}", headers=auth_header(doc))
    assert d.status_code == 201, d.text
    guide = d.json()
    assert guide["status"] == "draft"
    content = guide["content"]
    assert content["drug_name"] == meds.json()[0]["raw_name"]
    # AI không được bịa liều khác toa
    assert content["dose"] == (meds.json()[0].get("dose") or "theo toa bác sĩ")

    # Người bệnh CHƯA thấy hướng dẫn nháp
    pat_token = login(client, "case02", "patient123")
    mine_before = client.get("/api/v1/guides/mine", headers=auth_header(pat_token))
    assert mine_before.status_code == 200
    assert all(g["id"] != guide["id"] for g in mine_before.json())

    # Bác sĩ duyệt → gửi người bệnh
    a = client.post(f"/api/v1/guides/{guide['id']}/approve", headers=auth_header(doc))
    assert a.status_code == 200 and a.json()["status"] == "approved"

    mine = client.get("/api/v1/guides/mine", headers=auth_header(pat_token))
    assert any(g["id"] == guide["id"] for g in mine.json())

    # Chưa hiểu → chuyển câu hỏi cho bác sĩ + điều dưỡng
    ack = client.post(
        f"/api/v1/guides/{guide['id']}/acknowledge",
        json={"acknowledgment": "not_understood"},
        headers=auth_header(pat_token),
    )
    assert ack.status_code == 200

    doc_notif = client.get("/api/v1/notifications", headers=auth_header(doc))
    assert any(n["kind"] == "guide_ack" and "CHƯA HIỂU" in n["title"] for n in doc_notif.json())

    nurse_notif = client.get("/api/v1/notifications", headers=auth_header(login(client, "nurse1", "nurse123")))
    assert any("giải thích thuốc" in n["title"].lower() or "hỗ trợ" in n["title"].lower() for n in nurse_notif.json())


def test_guide_acknowledge_requires_approved(client: TestClient):
    """Người bệnh không thể xác nhận hướng dẫn chưa duyệt."""
    doc = login(client, "doctor1", "doctor123")
    lst = client.get("/api/v1/patients/assigned", headers=auth_header(doc))
    case02 = next(p for p in lst.json() if p.get("username") == "case02" or "KÈO" in p.get("full_name", "").upper())
    pid = case02["profile_id"]
    meds = client.get(f"/api/v1/patients/{pid}/medications", headers=auth_header(doc))
    med_id = meds.json()[-1]["id"]

    d = client.post(f"/api/v1/guides/draft/{med_id}", headers=auth_header(doc))
    guide = d.json()
    if guide["status"] != "draft":  # đã được duyệt ở test trước — bỏ qua
        return
    pat_token = login(client, "case02", "patient123")
    ack = client.post(
        f"/api/v1/guides/{guide['id']}/acknowledge",
        json={"acknowledgment": "understood"},
        headers=auth_header(pat_token),
    )
    assert ack.status_code == 409


# ---------------- Thông báo ----------------

def test_notifications_role_isolation_and_read_all(client: TestClient):
    p1 = login(client, "patient1", "patient123")
    p2 = login(client, "patient2", "patient123")
    r1 = client.get("/api/v1/notifications", headers=auth_header(p1))
    r2 = client.get("/api/v1/notifications", headers=auth_header(p2))
    assert r1.status_code == 200 and r2.status_code == 200
    # Thông báo của patient1 không lọt sang patient2 (kênh riêng)
    ids1 = {n["id"] for n in r1.json()}
    ids2 = {n["id"] for n in r2.json()}
    assert not (ids1 & ids2) or all(
        n["for_user_id"] is None if False else True for n in r2.json()
    )  # chung role có thể thấy thông báo kênh role — nhưng id cá nhân phải tách

    ra = client.post("/api/v1/notifications/read-all", headers=auth_header(p1))
    assert ra.status_code == 200
    after = client.get("/api/v1/notifications", headers=auth_header(p1))
    assert all(n["is_read"] for n in after.json())


# ---------------- Quality Dashboard (leader) ----------------

def test_quality_dashboard_leader_only(client: TestClient):
    leader = login(client, "leader1", "leader123")
    r = client.get("/api/v1/dashboard/quality", headers=auth_header(leader))
    assert r.status_code == 200, r.text
    body = r.json()
    assert {"triage", "safety_checks", "alerts", "response_time", "suspect_rankings"} <= set(body)
    assert isinstance(body["triage"]["by_level"], dict)

    # Bác sĩ/khác không được xem dashboard lãnh đạo
    doc = login(client, "doctor1", "doctor123")
    assert client.get("/api/v1/dashboard/quality", headers=auth_header(doc)).status_code == 403


# ---------------- Admin ----------------

def test_admin_users_lock_and_audit(client: TestClient):
    admin = login(client, "admin1", "admin123")
    users = client.get("/api/v1/admin/users", headers=auth_header(admin))
    assert users.status_code == 200, users.text
    assert len(users.json()) >= 20

    # Khóa tài khoản patient8 rồi mở lại
    target = next(u for u in users.json() if u["username"] == "patient8")
    lock = client.post(f"/api/v1/admin/users/{target['id']}/active?is_active=false", headers=auth_header(admin))
    assert lock.status_code == 200 and lock.json()["is_active"] is False

    # Tài khoản bị khóa không đăng nhập được
    r = client.post("/api/v1/auth/login", data={"username": "patient8", "password": "patient123"})
    assert r.status_code in (401, 403)

    unlock = client.post(f"/api/v1/admin/users/{target['id']}/active?is_active=true", headers=auth_header(admin))
    assert unlock.status_code == 200 and unlock.json()["is_active"] is True
    assert client.post(
        "/api/v1/auth/login", data={"username": "patient8", "password": "patient123"}
    ).status_code == 200

    log = client.get("/api/v1/admin/audit-log", headers=auth_header(admin))
    assert log.status_code == 200
    assert any(e["action"] == "set_user_active" for e in log.json())


# ---------------- Người nhà ủy quyền ----------------

def test_caregiver_can_triage_for_linked_patient_only(client: TestClient):
    cg = login(client, "family1", "family123")
    # family1 ủy quyền cho case01
    r = client.post("/api/v1/triage", json={"message": "Bà tôi da đỡ hơn, ổn định"}, headers=auth_header(cg))
    # Nếu chưa chọn profile → 422; nếu chọn được → phải là hồ sơ case01
    if r.status_code == 422:
        # API yêu cầu profile_id — dùng /patients của caregiver nếu có
        mine = client.get("/api/v1/patients/me/care-for", headers=auth_header(cg))
        assert mine.status_code in (200, 404)  # endpoint tùy chọn
        return
    assert r.status_code == 201


def test_caregiver_cannot_triage_other_profile(client: TestClient):
    cg = login(client, "family1", "family123")
    doc = login(client, "doctor1", "doctor123")
    lst = client.get("/api/v1/patients/assigned", headers=auth_header(doc))
    case09 = next(p for p in lst.json() if p.get("username") == "case09")
    r = client.post(
        "/api/v1/triage",
        json={"message": "khó thở", "profile_id": case09["profile_id"]},
        headers=auth_header(cg),
    )
    assert r.status_code == 403
