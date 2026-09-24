"""Seed dữ liệu — đọc toàn bộ từ thư mục `data/` ở gốc repo.

Chạy: python -m app.seed_data
Nạp: tài khoản (demo/accounts.json), danh mục thuốc (catalog/*.json),
nguồn kiến thức + quy tắc an toàn (safety/*.json), ca người bệnh (demo/cases.json).

Đường dẫn data/ có thể ghi đè bằng biến môi trường DATA_DIR.
"""
import json
from datetime import datetime, timezone

from sqlalchemy import text

from app.data_loader import (
    load_demo_accounts,
    load_demo_cases,
    load_drugs,
    load_ingredients,
    load_knowledge_sources,
    load_safety_rules,
)
from app.db import SessionLocal
from app.modules.audit.models import new_id
from app.modules.auth.security import hash_password
from app.modules.medications.models import Drug, DrugIngredient, Ingredient
from app.modules.patients.models import (
    AllergyRecord,
    CareAssignment,
    ClinicalObservation,
    MedicationRecord,
    PatientProfile,
    User,
)
from app.modules.safety.knowledge_models import KnowledgeSource, SafetyRule

# Triệu chứng mẫu kèm ca (không có trong data/ để giữ cases.json gọn)
EXTRA_SYMPTOMS = {
    "patient1": {
        "label": "Ngứa vùng cẳng chân về đêm",
        "occurred_at": "2026-09-19 21:30",
        "status": "sent",
    },
}


def run() -> None:
    db = SessionLocal()
    try:
        # Xóa dữ liệu cũ (theo thứ tự phụ thuộc) — seed là thao tác tạo lại từ đầu
        for t in [
            "alert_reviews", "alerts", "safety_checks", "chat_messages", "chat_sessions",
            "consultation_rooms", "appointments", "clinical_observations", "medication_records",
            "allergy_records", "patient_profiles", "care_assignments", "drug_ingredients",
            "drugs", "ingredients", "safety_rules", "knowledge_sources", "audit_events", "users",
        ]:
            db.execute(text(f"TRUNCATE TABLE {t} CASCADE"))

        # ---------------- Users (từ data/demo/accounts.json) ----------------
        users: dict[str, User] = {}
        caregiver_links: list[tuple[str, str]] = []  # (caregiver_username, patient_username)
        for acc in load_demo_accounts():
            u = User(
                id=new_id(),  # gán tường minh cho khóa ngoại phía dưới
                username=acc["username"],
                password_hash=hash_password(acc["password"]),
                full_name=acc["full_name"],
                role=acc["role"],
            )
            db.add(u)
            users[acc["username"]] = u
            if acc.get("care_for"):
                caregiver_links.append((acc["username"], acc["care_for"]))
        db.flush()

        # Ủy quyền người nhà → người bệnh
        from app.modules.patients.models import CaregiverLink

        for caregiver_username, patient_username in caregiver_links:
            if caregiver_username in users and patient_username in users:
                db.add(CaregiverLink(caregiver_user_id=users[caregiver_username].id, patient_user_id=users[patient_username].id))
        db.flush()

        # ---------------- Ingredients (từ data/catalog/ingredients.json) ----------------
        ings: dict[str, Ingredient] = {}
        for ing in load_ingredients():
            obj = Ingredient(id=new_id(), name=ing["name"], atc_code=ing.get("atc_code"))
            db.add(obj)
            ings[ing["name"]] = obj
        db.flush()

        # ---------------- Drugs (từ data/catalog/drugs.json) ----------------
        drugs: dict[str, Drug] = {}
        source_seed = KnowledgeSource(title="Danh mục thuốc demo", publisher="AllerCare", version="1.0")
        db.add(source_seed)
        db.flush()
        for d in load_drugs():
            obj = Drug(
                id=new_id(),
                name=d["name"],
                strength=d.get("strength"),
                form=d.get("form"),
                is_combination=len(d.get("ingredients", [])) > 1,
                in_scope=d.get("in_scope", True),
                source_id=source_seed.id,
            )
            db.add(obj)
            drugs[d["name"]] = obj
            for ing_name in d.get("ingredients", []):
                ing = ings.get(ing_name)
                if ing is None:
                    # hoạt chất chưa có trong catalog → tạo nhanh (không có ATC)
                    ing = Ingredient(name=ing_name)
                    db.add(ing)
                    ings[ing_name] = ing
                db.add(DrugIngredient(drug_id=obj.id, ingredient_id=ing.id, amount=None))
        db.flush()

        # ---------------- Knowledge sources (từ data/safety/knowledge_sources.json) ----------------
        sources: dict[str, KnowledgeSource] = {}
        for s in load_knowledge_sources():
            obj = KnowledgeSource(
                title=s["title"],
                publisher=s["publisher"],
                version=s["version"],
                published_date=s.get("published_date"),
                license_note=s.get("license_note"),
                content=s.get("content"),
            )
            db.add(obj)
            sources[s["title"]] = obj
        db.flush()

        # ---------------- Safety rules (từ data/safety/safety_rules.json) ----------------
        for r in load_safety_rules():
            src = sources.get(r.get("source_title", ""))
            if src is None:
                # quy tắc phải có nguồn — gắn vào nguồn đầu tiên nếu thiếu
                src = next(iter(sources.values()))
            db.add(
                SafetyRule(
                    code=r["code"],
                    rule_version=r.get("rule_version", "1.0"),
                    rule_type=r["rule_type"],
                    title=r["title"],
                    message=r["message"],
                    severity=r["severity"],
                    status=r.get("status", "approved"),
                    condition_json=json.dumps(r.get("condition", {}), ensure_ascii=False),
                    required_data_json=json.dumps(r.get("required_data", [])),
                    source_id=src.id,
                    approved_by="DS. Nguyễn Thị Em" if r.get("status", "approved") == "approved" else None,
                    next_review_date="2027-01-01",
                    created_at=datetime.now(timezone.utc),
                )
            )

        # ---------------- Patients (từ data/demo/cases.json) ----------------
        symptom_done = set()
        for case in load_demo_cases():
            u = users[case["username"]]
            doctor = users.get(case.get("doctor", "doctor1"), users["doctor1"])
            p = PatientProfile(
                id=new_id(),
                user_id=u.id,
                full_name=case["name"],
                dob=case.get("dob"),
                gender=case.get("gender"),
                chronic_conditions=json.dumps(case.get("conditions", []), ensure_ascii=False),
                diagnosis=case.get("diagnosis"),
                admission_note=case.get("admission_note"),
                assigned_doctor_id=doctor.id,
            )
            db.add(p)
            db.flush()  # INSERT profile trước để các bản ghi con thỏa mãn khóa ngoại
            db.add(CareAssignment(doctor_id=doctor.id, patient_user_id=u.id))
            for allergy in case.get("allergies", []):
                db.add(
                    AllergyRecord(
                        patient_profile_id=p.id,
                        substance=allergy["substance"],
                        reaction=allergy.get("reaction"),
                        severity=allergy.get("severity"),
                        verification=allergy.get("verification", "unverified"),
                        reported_by_user_id=u.id,
                        verified_by_user_id=doctor.id if allergy.get("verification") == "verified" else None,
                    )
                )
            for med in case.get("meds", []):
                db.add(
                    MedicationRecord(
                        patient_profile_id=p.id,
                        raw_name=med["raw_name"],
                        is_current=med.get("is_current", True),
                        is_planned=med.get("is_planned", False),
                        frequency=med.get("frequency"),
                        route=med.get("route", "uống"),
                        timing=med.get("timing"),
                        start_date=med.get("start_date"),
                        prescriber=med.get("source"),
                        verification=med.get("verification", "unverified"),
                        source_label=med.get("source", "Khai báo bởi người bệnh"),
                        reported_by_user_id=u.id,
                    )
                )
            for lab in case.get("labs", []):
                db.add(
                    ClinicalObservation(
                        patient_profile_id=p.id,
                        kind="lab",
                        label=lab["label"],
                        value=lab.get("value"),
                        unit=lab.get("unit"),
                        occurred_at="2026-09-19 08:00",
                        status="seen",
                        verification="unverified",
                        reported_by_user_id=u.id,
                    )
                )
            # Triệu chứng mẫu cho bác sĩ có việc xem
            sym = EXTRA_SYMPTOMS.get(case["username"])
            if sym and case["username"] not in symptom_done:
                db.add(
                    ClinicalObservation(
                        patient_profile_id=p.id,
                        kind="symptom",
                        label=sym["label"],
                        value=None,
                        unit=None,
                        occurred_at=sym["occurred_at"],
                        status=sym["status"],
                        verification="unverified",
                        reported_by_user_id=u.id,
                    )
                )
                symptom_done.add(case["username"])

        db.commit()
        counts = {
            "users": db.query(User).count(),
            "drugs": db.query(Drug).count(),
            "ingredients": db.query(Ingredient).count(),
            "rules": db.query(SafetyRule).count(),
            "sources": db.query(KnowledgeSource).count(),
            "patient_profiles": db.query(PatientProfile).count(),
            "medications": db.query(MedicationRecord).count(),
            "allergies": db.query(AllergyRecord).count(),
        }
        print("Seed hoàn tất (từ thư mục data/):", counts)
    finally:
        db.close()


if __name__ == "__main__":
    run()
