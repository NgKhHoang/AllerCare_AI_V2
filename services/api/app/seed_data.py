"""Seed dữ liệu — đọc toàn bộ từ thư mục `data/` ở gốc repo.

Chạy: python -m app.seed_data
Nạp: tài khoản (demo/accounts.json), danh mục thuốc (catalog/*.json),
nguồn kiến thức + quy tắc an toàn (safety/*.json), ca người bệnh (demo/cases.json).

Lưu ý: Mặc định seed là AN TOÀN (chỉ nạp các bản ghi còn thiếu, KHÔNG xóa dữ liệu người dùng tạo mới).
Chỉ xóa trắng tạo lại khi có biến môi trường FORCE_RECREATE_DB=1 hoặc tham số --force.
"""
import json
import os
import sys
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
    CaregiverLink,
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
        force_recreate = os.environ.get("FORCE_RECREATE_DB") == "1" or "--force" in sys.argv
        if force_recreate:
            print("[seed_data] FORCE_RECREATE_DB được bật -> Truncate toàn bộ bảng...")
            for t in [
                "alert_reviews", "alerts", "safety_checks", "chat_messages", "chat_sessions",
                "consultation_rooms", "appointments", "clinical_observations", "medication_records",
                "allergy_records", "patient_profiles", "care_assignments", "drug_ingredients",
                "drugs", "ingredients", "safety_rules", "knowledge_sources", "audit_events", "caregiver_links", "users",
            ]:
                try:
                    db.execute(text(f"TRUNCATE TABLE {t} CASCADE"))
                except Exception:
                    pass
            db.commit()

        # ---------------- Users (từ data/demo/accounts.json) ----------------
        existing_users = {u.username: u for u in db.query(User).all()}
        users: dict[str, User] = dict(existing_users)
        caregiver_links: list[tuple[str, str]] = []  # (caregiver_username, patient_username)
        
        for acc in load_demo_accounts():
            username = acc["username"]
            if username not in users:
                u = User(
                    id=new_id(),
                    username=username,
                    password_hash=hash_password(acc["password"]),
                    full_name=acc["full_name"],
                    role=acc["role"],
                )
                db.add(u)
                users[username] = u
            if acc.get("care_for"):
                caregiver_links.append((username, acc["care_for"]))
        db.flush()

        # Ủy quyền người nhà → người bệnh
        existing_caregiver_links = set(
            (link.caregiver_user_id, link.patient_user_id) for link in db.query(CaregiverLink).all()
        )
        for caregiver_username, patient_username in caregiver_links:
            if caregiver_username in users and patient_username in users:
                c_id = users[caregiver_username].id
                p_id = users[patient_username].id
                if (c_id, p_id) not in existing_caregiver_links:
                    db.add(CaregiverLink(caregiver_user_id=c_id, patient_user_id=p_id))
                    existing_caregiver_links.add((c_id, p_id))
        db.flush()

        # ---------------- Ingredients (từ data/catalog/ingredients.json) ----------------
        existing_ings = {i.name: i for i in db.query(Ingredient).all()}
        ings: dict[str, Ingredient] = dict(existing_ings)
        for ing in load_ingredients():
            ing_name = ing["name"]
            if ing_name not in ings:
                obj = Ingredient(id=new_id(), name=ing_name, atc_code=ing.get("atc_code"))
                db.add(obj)
                ings[ing_name] = obj
        db.flush()

        # ---------------- Knowledge sources (từ data/safety/knowledge_sources.json) ----------------
        existing_sources = {s.title: s for s in db.query(KnowledgeSource).all()}
        sources: dict[str, KnowledgeSource] = dict(existing_sources)
        if "Danh mục thuốc demo" not in sources:
            source_seed = KnowledgeSource(title="Danh mục thuốc demo", publisher="AllerCare", version="1.0")
            db.add(source_seed)
            sources["Danh mục thuốc demo"] = source_seed
            db.flush()
        else:
            source_seed = sources["Danh mục thuốc demo"]

        for s in load_knowledge_sources():
            title = s["title"]
            if title not in sources:
                obj = KnowledgeSource(
                    title=title,
                    publisher=s["publisher"],
                    version=s["version"],
                    published_date=s.get("published_date"),
                    license_note=s.get("license_note"),
                    content=s.get("content"),
                )
                db.add(obj)
                sources[title] = obj
        db.flush()

        # ---------------- Drugs (từ data/catalog/drugs.json) ----------------
        existing_drugs = {d.name: d for d in db.query(Drug).all()}
        drugs: dict[str, Drug] = dict(existing_drugs)
        for d in load_drugs():
            drug_name = d["name"]
            if drug_name not in drugs:
                obj = Drug(
                    id=new_id(),
                    name=drug_name,
                    strength=d.get("strength"),
                    form=d.get("form"),
                    is_combination=len(d.get("ingredients", [])) > 1,
                    in_scope=d.get("in_scope", True),
                    source_id=source_seed.id,
                )
                db.add(obj)
                drugs[drug_name] = obj
                for ing_name in d.get("ingredients", []):
                    ing = ings.get(ing_name)
                    if ing is None:
                        ing = Ingredient(name=ing_name)
                        db.add(ing)
                        ings[ing_name] = ing
                    db.add(DrugIngredient(drug_id=obj.id, ingredient_id=ing.id, amount=None))
        db.flush()

        # ---------------- Safety rules (từ data/safety/safety_rules.json) ----------------
        existing_rules = {r.code: r for r in db.query(SafetyRule).all()}
        for r in load_safety_rules():
            rule_code = r["code"]
            if rule_code not in existing_rules:
                src = sources.get(r.get("source_title", ""))
                if src is None:
                    src = next(iter(sources.values()))
                db.add(
                    SafetyRule(
                        code=rule_code,
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
        db.flush()

        # ---------------- Patients (từ data/demo/cases.json) ----------------
        existing_profiles = {p.user_id: p for p in db.query(PatientProfile).all()}
        symptom_done = set()
        
        for case in load_demo_cases():
            username = case["username"]
            if username not in users:
                continue
            u = users[username]
            if u.id in existing_profiles:
                # Bệnh nhân đã có profile -> Giữ nguyên, không ghi đè dữ liệu đang có
                continue
                
            doctor = users.get(case.get("doctor", "doctor1"), users.get("doctor1"))
            doctor_id = doctor.id if doctor else None
            
            p = PatientProfile(
                id=new_id(),
                user_id=u.id,
                full_name=case["name"],
                dob=case.get("dob"),
                gender=case.get("gender"),
                chronic_conditions=json.dumps(case.get("conditions", []), ensure_ascii=False),
                diagnosis=case.get("diagnosis"),
                treatment_status=case.get("treatment_status", "active"),
                treatment_start_date=case.get("treatment_start_date", "2026-09-01"),
                followup_date=case.get("followup_date", "2026-10-15"),
                admission_note=case.get("admission_note"),
                assigned_doctor_id=doctor_id,
            )
            db.add(p)
            db.flush()  # INSERT profile trước để các bản ghi con thỏa mãn khóa ngoại
            if doctor_id:
                db.add(CareAssignment(doctor_id=doctor_id, patient_user_id=u.id))
                
            for allergy in case.get("allergies", []):
                db.add(
                    AllergyRecord(
                        patient_profile_id=p.id,
                        substance=allergy["substance"],
                        reaction=allergy.get("reaction"),
                        severity=allergy.get("severity"),
                        verification=allergy.get("verification", "unverified"),
                        reported_by_user_id=u.id,
                        verified_by_user_id=doctor_id if allergy.get("verification") == "verified" else None,
                    )
                )
            for med in case.get("meds", []):
                doc_name = f"BS. {doctor.full_name or doctor.username}" if doctor else "Bác sĩ điều trị"
                is_self = med.get("is_self_declared", False)
                db.add(
                    MedicationRecord(
                        patient_profile_id=p.id,
                        raw_name=med["raw_name"],
                        is_current=med.get("is_current", True),
                        is_planned=med.get("is_planned", False),
                        dose=med.get("dose"),
                        frequency=med.get("frequency"),
                        route=med.get("route", "uống"),
                        timing=med.get("timing") or ("8h sáng và 20h tối sau ăn" if med.get("is_current") else None),
                        start_date=med.get("start_date") or "2026-09-01",
                        prescriber=med.get("prescriber") or (None if is_self else doc_name),
                        verification=med.get("verification") or ("unverified" if is_self else "verified"),
                        source_label=med.get("source") or ("Khai báo bởi người bệnh" if is_self else f"Bệnh viện Thống Nhất ({doc_name})"),
                        reported_by_user_id=u.id if is_self else (doctor_id or u.id),
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
            sym = EXTRA_SYMPTOMS.get(username)
            if sym and username not in symptom_done:
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
                symptom_done.add(username)

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
        print("Seed hoàn tất (an toàn / không xóa dữ liệu mới):", counts)
    finally:
        db.close()


if __name__ == "__main__":
    run()
