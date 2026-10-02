"""Service chạy kiểm tra an toàn thuốc: gom dữ liệu → chuẩn hóa → engine → lưu snapshot.

Snapshot input/result là bất biến; AI không tham gia quyết định cảnh báo.
"""
import json

from sqlalchemy.orm import Session

from app.modules.medications.models import Drug
from app.modules.medications.normalize import resolve_drug
from app.modules.patients.models import (
    AllergyRecord,
    ClinicalObservation,
    MedicationRecord,
    PatientProfile,
)
from app.modules.safety.engine import (
    EngineAlert,
    EngineDrug,
    EngineResult,
    PatientContext,
    run_checks,
)
from app.modules.safety.knowledge_models import SafetyRule
from app.modules.safety.check_models import Alert, SafetyCheck


def _lab_key(label: str) -> str:
    return label.strip().lower().replace(" ", "")


def build_patient_context(db: Session, profile: PatientProfile) -> PatientContext:
    """Chỉ dùng dữ liệu đã xác minh cho cảnh báo dị ứng; labs lấy từ observations kind=lab."""
    allergies = (
        db.query(AllergyRecord)
        .filter(
            AllergyRecord.patient_profile_id == profile.id,
            AllergyRecord.verification == "verified",
        )
        .all()
    )
    allergy_names = [a.substance.strip() for a in allergies if a.substance.strip()]

    conditions: list[str] = []
    if profile.chronic_conditions:
        try:
            conditions = list(json.loads(profile.chronic_conditions))
        except json.JSONDecodeError:
            conditions = []

    labs: dict[str, str] = {}
    obs = (
        db.query(ClinicalObservation)
        .filter(
            ClinicalObservation.patient_profile_id == profile.id,
            ClinicalObservation.kind == "lab",
        )
        .order_by(ClinicalObservation.occurred_at.desc())
        .all()
    )
    for o in obs:
        key = _lab_key(o.label)
        if key and key not in labs and o.value is not None:
            labs[key] = o.value

    return PatientContext(
        allergy_ingredient_names=allergy_names,
        chronic_conditions=conditions,
        labs=labs,
    )


def collect_medications(
    db: Session, profile: PatientProfile, medication_ids: list[str] | None = None
) -> list[MedicationRecord]:
    """Mặc định kiểm tra TẤT CẢ thuốc đang dùng + dự kiến; cho phép chọn danh sách cụ thể."""
    q = db.query(MedicationRecord).filter(MedicationRecord.patient_profile_id == profile.id)
    if medication_ids:
        q = q.filter(MedicationRecord.id.in_(medication_ids))
    return q.all()


def to_engine_drugs(db: Session, meds: list[MedicationRecord]) -> list[EngineDrug]:
    drugs: list[EngineDrug] = []
    for m in meds:
        resolved: Drug | None = resolve_drug(db, m.raw_name) if m.drug_id is None else db.get(Drug, m.drug_id)
        if resolved is None or not resolved.in_scope:
            drugs.append(EngineDrug(raw_name=m.raw_name, drug_id=None, name=None))
            continue
        links = resolved.ingredients
        drugs.append(
            EngineDrug(
                raw_name=m.raw_name,
                drug_id=resolved.id,
                name=resolved.name,
                ingredient_ids=[li.ingredient_id for li in links],
                ingredient_names=[li.ingredient.name for li in links],
                # UM001: thuốc đang dùng nhưng chưa được bác sĩ xác minh
                is_unverified=(m.verification != "verified" and m.is_current),
                frequency=m.frequency,
                dose=m.dose,
                status=m.status or "active",
            )
        )
    return drugs


def load_rules(db: Session) -> list[dict]:
    rules = db.query(SafetyRule).filter(SafetyRule.status == "approved").all()
    out = []
    for r in rules:
        try:
            cond = json.loads(r.condition_json)
            required = json.loads(r.required_data_json or "[]")
        except json.JSONDecodeError:
            raise ValueError(f"Quy tắc {r.code} v{r.rule_version} có JSON điều kiện không hợp lệ — kiểm tra thất bại thay vì bỏ sót")
        out.append(
            {
                "id": r.id,
                "code": r.code,
                "version": r.rule_version,
                "type": r.rule_type,
                "message": r.message,
                "severity": r.severity,
                "status": r.status,
                "condition": cond,
                "required_data": required,
                "source_title": r.source.title if r.source else "N/A",
                "source_version": r.source.version if r.source else "N/A",
            }
        )
    return out


def run_safety_check(
    db: Session,
    profile: PatientProfile,
    requested_by_user_id: str,
    medication_ids: list[str] | None = None,
    custom_drugs: list[str] | None = None,
) -> SafetyCheck:
    """Chạy kiểm tra và lưu SafetyCheck + Alert. Trả về SafetyCheck vừa tạo."""
    meds = collect_medications(db, profile, medication_ids)
    engine_drugs = to_engine_drugs(db, meds)

    # Bổ sung custom_drugs nếu bác sĩ truyền vào
    if custom_drugs:
        for cd in custom_drugs:
            if not cd or not cd.strip():
                continue
            name = cd.strip()
            resolved = resolve_drug(db, name)
            if resolved and resolved.in_scope:
                links = resolved.ingredients
                engine_drugs.append(
                    EngineDrug(
                        raw_name=name,
                        drug_id=resolved.id,
                        name=resolved.name,
                        ingredient_ids=[li.ingredient_id for li in links],
                        ingredient_names=[li.ingredient.name for li in links],
                        is_unverified=False,
                        status="active",
                    )
                )
            else:
                engine_drugs.append(
                    EngineDrug(
                        raw_name=name,
                        drug_id=f"adhoc_{name}",
                        name=name,
                        ingredient_ids=[f"ing_{name.lower()}"],
                        ingredient_names=[name],
                        is_unverified=False,
                        status="active",
                    )
                )

    patient = build_patient_context(db, profile)
    rules = load_rules(db)

    result: EngineResult = run_checks(rules, engine_drugs, patient)

    input_snapshot = {
        "medications": [
            {
                "id": m.id,
                "raw_name": m.raw_name,
                "drug_id": next((d.drug_id for d in engine_drugs if d.raw_name == m.raw_name), None),
                "dose": m.dose,
                "route": m.route,
                "frequency": m.frequency,
                "verification": m.verification,
            }
            for m in meds
        ],
        "custom_drugs": custom_drugs or [],
        "patient": {
            "verified_allergies": patient.allergy_ingredient_names,
            "chronic_conditions": patient.chronic_conditions,
            "labs": patient.labs,
        },
        "checked_scope": result.checked_scope,
    }

    check = SafetyCheck(
        patient_profile_id=profile.id,
        requested_by_user_id=requested_by_user_id,
        result_status=result.status,
        input_snapshot=json.dumps(input_snapshot, ensure_ascii=False),
        result_json="placeholder",
    )
    db.add(check)
    db.flush()  # lấy check.id

    alerts_payload = []
    for a in result.alerts:
        alert = Alert(
            safety_check_id=check.id,
            rule_id=a.rule_id,
            rule_code=a.rule_code,
            rule_version=a.rule_version,
            severity=a.severity,
            message=a.message,
            source_title=a.source_title,
            source_version=a.source_version,
            detail_json=json.dumps(a.detail, ensure_ascii=False),
        )
        db.add(alert)
        alerts_payload.append(
            {
                "rule_code": a.rule_code,
                "rule_version": a.rule_version,
                "rule_type": a.rule_type,
                "severity": a.severity,
                "message": a.message,
                "source": f"{a.source_title} (v{a.source_version})",
                "detail": a.detail,
            }
        )

    result_payload = {
        "status": result.status,
        "alerts": alerts_payload,
        "out_of_scope": result.out_of_scope,
        "missing_data": result.missing_data,
        "checked_scope": result.checked_scope,
        "note": _status_note(result.status),
    }
    check.result_json = json.dumps(result_payload, ensure_ascii=False)
    db.flush()
    return check


def run_quick_check(
    db: Session,
    drugs: list[str],
    profile: PatientProfile | None = None,
) -> dict:
    """Kiểm tra nhanh tương tác giữa 2, 3 hoặc nhiều loại chất/thuốc + tiền sử dị ứng/bệnh nền."""
    engine_drugs: list[EngineDrug] = []
    for d in drugs:
        if not d or not d.strip():
            continue
        name = d.strip()
        resolved = resolve_drug(db, name)
        if resolved and resolved.in_scope:
            links = resolved.ingredients
            engine_drugs.append(
                EngineDrug(
                    raw_name=name,
                    drug_id=resolved.id,
                    name=resolved.name,
                    ingredient_ids=[li.ingredient_id for li in links],
                    ingredient_names=[li.ingredient.name for li in links],
                    is_unverified=False,
                    status="active",
                )
            )
        else:
            engine_drugs.append(
                EngineDrug(
                    raw_name=name,
                    drug_id=f"adhoc_{name}",
                    name=name,
                    ingredient_ids=[f"ing_{name.lower()}"],
                    ingredient_names=[name],
                    is_unverified=False,
                    status="active",
                )
            )

    if profile:
        patient = build_patient_context(db, profile)
    else:
        patient = PatientContext()

    rules = load_rules(db)
    result: EngineResult = run_checks(rules, engine_drugs, patient)

    alerts_out = [
        {
            "rule_code": a.rule_code,
            "rule_version": a.rule_version,
            "rule_type": a.rule_type,
            "severity": a.severity,
            "message": a.message,
            "source": f"{a.source_title} (v{a.source_version})",
            "detail": a.detail,
        }
        for a in result.alerts
    ]

    status_labels = {
        "has_alerts": "⚠️ CÓ CẢNH BÁO TƯƠNG TÁC / NGUY CƠ",
        "no_alerts_in_scope": "✓ CHƯA PHÁT HIỆN TƯƠNG TÁC NGUY HIỂM",
        "insufficient_data": "ℹ️ CHƯA ĐỦ DỮ LIỆU",
        "out_of_scope": "NGOÀI PHẠM VI HỖ TRỢ",
        "failed": "✕ KIỂM TRA THẤT BẠI",
    }

    return {
        "status": result.status,
        "status_label": status_labels.get(result.status, result.status),
        "alerts": alerts_out,
        "checked_drugs": [d.name or d.raw_name for d in engine_drugs],
        "patient_allergies": patient.allergy_ingredient_names,
        "patient_conditions": patient.chronic_conditions,
        "out_of_scope": result.out_of_scope,
        "missing_data": result.missing_data,
        "note": _status_note(result.status),
    }


def _status_note(status: str) -> str:
    return {
        "has_alerts": "Có cảnh báo — xem căn cứ và ghi nhận quyết định.",
        "no_alerts_in_scope": "Chưa phát hiện cảnh báo trong phạm vi đã kiểm tra — không đồng nghĩa an toàn tuyệt đối.",
        "insufficient_data": "Chưa đủ dữ liệu — cần bổ sung thông tin còn thiếu trước khi kết luận.",
        "out_of_scope": "Ngoài phạm vi hỗ trợ — thuốc/quy tắc chưa có trong danh mục.",
        "failed": "Kiểm tra thất bại — không hiển thị như đã kiểm tra thành công.",
    }.get(status, "")


def suggest_drugs(
    db: Session,
    query: str = "",
    profile: PatientProfile | None = None,
    limit: int = 15,
) -> list[dict]:
    """Gợi ý thuốc & hoạt chất thông minh dựa trên:
    1. Danh mục thuốc Bộ Y tế & Database AllerCare (Biệt dược, Hoạt chất INN)
    2. Kho 633 quy tắc tương tác thuốc Bộ Y tế
    3. Ngữ cảnh hồ sơ bệnh nhân (Thuốc đang dùng, Tiền sử dị ứng đã xác minh)
    4. AI Knowledge Brain & Gemini RAG
    """
    q = query.strip().lower()

    # 1. Thu thập bối cảnh bệnh nhân
    patient_allergies: list[str] = []
    patient_meds: list[str] = []
    if profile:
        allergies = (
            db.query(AllergyRecord)
            .filter(AllergyRecord.patient_profile_id == profile.id)
            .all()
        )
        patient_allergies = [a.substance.strip() for a in allergies if a.substance.strip()]

        med_records = (
            db.query(MedicationRecord)
            .filter(
                MedicationRecord.patient_profile_id == profile.id,
                MedicationRecord.status == "active",
            )
            .all()
        )
        patient_meds = [m.raw_name.strip() for m in med_records if m.raw_name.strip()]

    # 2. Thu thập toàn bộ danh mục thuốc & hoạt chất
    drugs = db.query(Drug).filter(Drug.in_scope == True).all()  # noqa: E712
    rules = load_rules(db)

    # Đếm số tương tác cho từng hoạt chất trong kho 633 quy tắc
    interaction_counts: dict[str, int] = {}
    for r in rules:
        if r.get("rule_type") == "drug_interaction":
            c1 = (r.get("drug1_ingredient") or "").lower()
            c2 = (r.get("drug2_ingredient") or "").lower()
            if c1:
                interaction_counts[c1] = interaction_counts.get(c1, 0) + 1
            if c2:
                interaction_counts[c2] = interaction_counts.get(c2, 0) + 1

    # Map phân loại lâm sàng mẫu & AI hints
    clinical_meta: dict[str, dict] = {
        "warfarin": {"category": "Kháng đông kháng Vitamin K", "hint": "Nguy cơ xuất huyết cao khi phối hợp NSAID, Aspirin, Clopidogrel"},
        "aspirin": {"category": "Kháng kết tập tiểu cầu / NSAID", "hint": "Thận trọng loét dạ dày, phối hợp chống đông tăng xuất huyết"},
        "clopidogrel": {"category": "Kháng kết tập tiểu cầu", "hint": "Tránh dùng cùng Omeprazole làm giảm hoạt tính chống đông"},
        "clarithromycin": {"category": "Kháng sinh nhóm Macrolid", "hint": "Ức chế mạnh CYP3A4, chống chỉ định Simvastatin/Lovastatin (tiêu cơ vân)"},
        "simvastatin": {"category": "Hạ lipid máu nhóm Statin", "hint": "Nguy cơ tiêu cơ vân cấp khi phối hợp Clarithromycin, Itraconazole"},
        "atorvastatin": {"category": "Hạ lipid máu nhóm Statin", "hint": "Theo dõi men gan và đau cơ, liều tối đa khi phối hợp thuốc ức chế protease"},
        "panadol": {"category": "Hạ sốt & Giảm đau", "hint": "Chứa Paracetamol - không dùng quá 4000mg/ngày, tránh phối hợp Efferalgan"},
        "paracetamol": {"category": "Hạ sốt & Giảm đau", "hint": "Độc tính trên gan khi quá liều hoặc dùng đồng thời nhiều biệt dược chứa Paracetamol"},
        "efferalgan": {"category": "Hạ sốt & Giảm đau", "hint": "Chứa Paracetamol viên sủi - chú ý hàm lượng Natri ở người tăng huyết áp"},
        "cefaclor": {"category": "Kháng sinh Cephalosporin thế hệ 2", "hint": "Nguy cơ dị ứng chéo với Penicillin (khoảng 5-10%)"},
        "amoxicillin": {"category": "Kháng sinh nhóm Aminopenicillin", "hint": "Chống chỉ định tuyệt đối nếu có tiền sử sốc phản vệ với Penicillin"},
        "augmentin": {"category": "Kháng sinh Amoxicillin + Acid Clavulanic", "hint": "Theo dõi chức năng gan và tiêu chảy do acid clavulanic"},
        "metformin": {"category": "Hạ đường huyết nhóm Biguanid", "hint": "Tạm ngừng trước khi chụp CT cản quang, nguy cơ nhiễm toan acid lactic"},
        "amlodipin": {"category": "Hạ áp nhóm Chẹn kênh Canxi (DHP)", "hint": "Tác dụng phụ phù mắt cá chân, ít ảnh hưởng nhịp tim"},
        "enalapril": {"category": "Hạ áp nhóm Ức chế men chuyển (ACEI)", "hint": "Nguy cơ ho khan, tăng kali máu khi phối hợp Spironolactone"},
        "losartan": {"category": "Hạ áp nhóm Chẹn thụ thể AT1 (ARB)", "hint": "Thay thế ACEI khi ho khan, theo dõi kali máu và chức năng thận"},
        "methotrexate": {"category": "Ức chế miễn dịch & Kháng ung thư", "hint": "Độc tính tủy xương & suy thận khi dùng chung NSAID (Ibuprofen, Ketoprofen)"},
        "ibuprofen": {"category": "Kháng viêm không steroid (NSAID)", "hint": "Tăng độc tính Methotrexate, giảm tác dụng hạ áp của ACEI/ARB"},
        "diclofenac": {"category": "Kháng viêm không steroid (NSAID)", "hint": "Nguy cơ tim mạch và loét đường tiêu hóa cao"},
        "ciprofloxacin": {"category": "Kháng sinh nhóm Fluoroquinolon", "hint": "Kéo dài khoảng QT khi dùng chung Amiodarone, nguy cơ viêm gân gót"},
        "levofloxacin": {"category": "Kháng sinh nhóm Fluoroquinolon", "hint": "Thận trọng trên bệnh nhân có tiền sử co giật hoặc suy thận"},
        "digoxin": {"category": "Trợ tim Glycosid", "hint": "Khoảng điều trị hẹp, hạ kali máu do lợi tiểu làm tăng độc tính Digoxin"},
        "spironolactone": {"category": "Lợi tiểu giữ Kali", "hint": "Nguy cơ tăng kali máu nguy hiểm khi phối hợp ACEI/ARB hoặc bổ sung Kali"},
        "omeprazole": {"category": "Ức chế bơm Proton (PPI)", "hint": "Giảm chuyển hóa Clopidogrel qua CYP2C19 thành dạng có hoạt tính"},
        "nexium": {"category": "Ức chế bơm Proton (Esomeprazole)", "hint": "Ức chế acid dịch vị, dùng trước ăn 30-60 phút"},
        "fexofenadine": {"category": "Kháng Histamin H1 thế hệ 2", "hint": "Không gây buồn ngủ, an toàn cho người lái xe và vận hành máy"},
        "cetirizine": {"category": "Kháng Histamin H1 thế hệ 2", "hint": "Giảm triệu chứng ngứa, mề đay, dị ứng thời tiết"},
        "loratadine": {"category": "Kháng Histamin H1 thế hệ 2", "hint": "Tác dụng kéo dài 24h, ít qua hàng rào máu não"},
    }

    candidates: list[dict] = []
    seen_names: set[str] = set()

    # Thu thập từ Tiền sử Dị ứng Bệnh nhân (Ưu tiên cảnh báo cao nhất)
    for alg in patient_allergies:
        if alg.lower() not in seen_names:
            seen_names.add(alg.lower())
            meta = clinical_meta.get(alg.lower(), {})
            candidates.append({
                "name": alg,
                "clean_name": alg,
                "strength": "",
                "form": "dị nguyên",
                "type": "allergy",
                "ingredients": [alg],
                "category": meta.get("category", "Tiền sử Dị ứng đã ghi nhận"),
                "ai_hint": "⚠️ Bệnh nhân có tiền sử dị ứng/phản vệ đã xác minh với hoạt chất này",
                "interactions_count": 99,
                "is_allergy": True,
                "is_current": False,
                "source": "Hồ sơ Tiền sử Dị ứng Bệnh nhân",
            })

    # Thu thập từ Thuốc bệnh nhân đang dùng
    for pm in patient_meds:
        if pm.lower() not in seen_names:
            seen_names.add(pm.lower())
            meta = clinical_meta.get(pm.lower(), {})
            candidates.append({
                "name": pm,
                "clean_name": pm,
                "strength": "",
                "form": "đơn thuốc",
                "type": "current_med",
                "ingredients": [pm],
                "category": meta.get("category", "Đơn thuốc điều trị hiện tại"),
                "ai_hint": "💊 Thuốc bệnh nhân đang dùng theo hồ sơ điều trị",
                "interactions_count": interaction_counts.get(pm.lower(), 0),
                "is_allergy": False,
                "is_current": True,
                "source": "Đơn thuốc Bệnh nhân",
            })

    # Thu thập từ Drugs DB
    for d in drugs:
        d_name = d.name.strip()
        if d_name.lower() in seen_names:
            continue
        seen_names.add(d_name.lower())

        ing_names = [i.ingredient.name for i in d.ingredients if i.ingredient] if d.ingredients else []
        main_ing = ing_names[0] if ing_names else d_name

        meta = clinical_meta.get(main_ing.lower()) or clinical_meta.get(d_name.lower()) or {}
        inter_count = sum(interaction_counts.get(ing.lower(), 0) for ing in ing_names) or interaction_counts.get(main_ing.lower(), 0)

        # Kiểm tra dị ứng bệnh nhân
        is_allergy = any(alg.lower() in d_name.lower() or any(alg.lower() in ing.lower() for ing in ing_names) for alg in patient_allergies)
        is_current = any(pm.lower() in d_name.lower() or d_name.lower() in pm.lower() for pm in patient_meds)


        candidates.append({
            "name": d_name,
            "clean_name": main_ing,
            "strength": d.strength or "",
            "form": d.form or "viên",
            "type": "combination" if d.is_combination else "brand",
            "ingredients": ing_names,
            "category": meta.get("category", "Dược phẩm Bộ Y tế"),
            "ai_hint": meta.get("hint", f"Có {inter_count} quy tắc tương tác cần lưu ý trong Dược thư" if inter_count > 0 else "Kiểm tra an toàn trước khi kê đơn"),
            "interactions_count": inter_count,
            "is_allergy": is_allergy,
            "is_current": is_current,
            "source": "Danh mục thuốc & Dược thư BYT",
        })

    # Thu thập từ Rules & Interactions mà chưa có trong drugs
    for substance, count in interaction_counts.items():
        sub_name = substance.title()
        if sub_name.lower() in seen_names:
            continue
        seen_names.add(sub_name.lower())

        meta = clinical_meta.get(substance.lower(), {})
        is_allergy = any(alg.lower() in substance.lower() for alg in patient_allergies)
        is_current = any(pm.lower() in substance.lower() for pm in patient_meds)

        candidates.append({
            "name": sub_name,
            "clean_name": sub_name,
            "strength": "",
            "form": "hoạt chất",
            "type": "ingredient",
            "ingredients": [sub_name],
            "category": meta.get("category", "Hoạt chất Dược thư BYT"),
            "ai_hint": meta.get("hint", f"Có {count} quy tắc tương tác trong kho 633 quy tắc BYT"),
            "interactions_count": count,
            "is_allergy": is_allergy,
            "is_current": is_current,
            "source": "633 Quy tắc Bộ Y tế",
        })

    # 3. Lọc và xếp hạng (Scoring & Ranking)
    if not q:
        def default_score(item: dict) -> tuple:
            return (
                0 if item["is_allergy"] else 1,
                0 if item["is_current"] else 1,
                -item["interactions_count"],
                item["name"],
            )
        candidates.sort(key=default_score)
        return candidates[:limit]

    # Có query tìm kiếm
    matched: list[dict] = []
    for item in candidates:
        name_l = item["name"].lower()
        clean_l = item["clean_name"].lower()
        ings_l = [ing.lower() for ing in item["ingredients"]]

        score = 999
        if name_l == q or clean_l == q:
            score = 0
        elif name_l.startswith(q) or clean_l.startswith(q):
            score = 1
        elif any(ing.startswith(q) for ing in ings_l):
            score = 2
        elif q in name_l or q in clean_l or any(q in ing for ing in ings_l):
            score = 3
        elif any(q in item.get("category", "").lower() for _ in [1]):
            score = 4

        if score < 999:
            priority_score = score
            if item["is_allergy"]:
                priority_score -= 10
            elif item["is_current"]:
                priority_score -= 5

            item_copy = dict(item)
            item_copy["match_score"] = priority_score
            matched.append(item_copy)

    matched.sort(key=lambda x: (x["match_score"], -x["interactions_count"], len(x["name"])))
    return matched[:limit]


