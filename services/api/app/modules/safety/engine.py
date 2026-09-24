"""MedSafe rule engine — cốt lõi sản phẩm.

Thiết kế:
- Hàm thuần (pure function) nhận dữ liệu đã chuẩn hóa, không đụng DB → dễ unit test.
- Trả về đúng 5 trạng thái kết quả bắt buộc; không bao giờ trả "an toàn" khi thiếu dữ liệu/lỗi.
- AI không tham gia quyết định cảnh báo; engine chỉ đối chiếu quy tắc có nguồn, có phiên bản.
"""
from dataclasses import dataclass, field

STATUS_HAS_ALERTS = "has_alerts"
STATUS_NO_ALERTS_IN_SCOPE = "no_alerts_in_scope"
STATUS_INSUFFICIENT_DATA = "insufficient_data"
STATUS_OUT_OF_SCOPE = "out_of_scope"
STATUS_FAILED = "failed"


@dataclass
class EngineDrug:
    """Một thuốc đã chuẩn hóa (hoặc không nhận diện được)."""

    raw_name: str
    drug_id: str | None  # None = không nhận diện được → ngoài phạm vi
    name: str | None
    ingredient_ids: list[str] = field(default_factory=list)
    ingredient_names: list[str] = field(default_factory=list)
    is_unverified: bool = False  # chưa được bác sĩ xác minh (dùng cho UM001)
    frequency: str | None = None  # cách dùng tự khai (dùng cho DL001)
    dose: str | None = None
    status: str = "active"  # active | stopped | irregular (dùng cho DL002)


@dataclass
class PatientContext:
    """Ngữ cảnh người bệnh dùng cho kiểm tra thuốc–người bệnh."""

    allergy_ingredient_names: list[str] = field(default_factory=list)  # chỉ dùng allergies đã xác minh
    chronic_conditions: list[str] = field(default_factory=list)
    labs: dict[str, str] = field(default_factory=dict)  # {"crcl": "42", "eGFR": "55"}


@dataclass
class EngineAlert:
    rule_id: str | None
    rule_code: str
    rule_version: str
    rule_type: str
    severity: str
    message: str
    source_title: str
    source_version: str
    detail: dict = field(default_factory=dict)


@dataclass
class EngineResult:
    status: str
    alerts: list[EngineAlert] = field(default_factory=list)
    out_of_scope: list[str] = field(default_factory=list)
    missing_data: list[str] = field(default_factory=list)
    checked_scope: list[str] = field(default_factory=list)


def _compare(val: float, op: str, threshold: float) -> bool:
    if op == "<":
        return val < threshold
    if op == "<=":
        return val <= threshold
    if op == ">":
        return val > threshold
    if op == ">=":
        return val >= threshold
    return False


def run_checks(rules: list[dict], drugs: list[EngineDrug], patient: PatientContext) -> EngineResult:
    """Chạy 6 nhóm kiểm tra trên một danh sách thuốc.

    rules: list dict với khóa: id, code, version, type, title, message, severity,
           condition (dict), required_data (list), source_title, source_version, status
    4 nhóm gốc: drug_drug, duplicate_ingredient, drug_allergy, drug_condition.
    Bổ sung theo tài liệu CHI TIẾT mục 6: duplicate_drug (trùng biệt dược),
    unverified_medication (thuốc chưa được bác sĩ kiểm tra).
    """
    result = EngineResult(status=STATUS_NO_ALERTS_IN_SCOPE)
    result.checked_scope = [
        "drug_drug", "duplicate_ingredient", "drug_allergy", "drug_condition",
        "duplicate_drug", "unverified_medication", "dose_error", "dose_missed",
    ]

    in_scope = [d for d in drugs if d.drug_id is not None]
    out_of_scope = [d.raw_name for d in drugs if d.drug_id is None]
    if out_of_scope:
        result.out_of_scope = out_of_scope

    if not in_scope:
        result.status = STATUS_OUT_OF_SCOPE
        return result

    for rule in rules:
        if rule.get("status") != "approved":
            continue  # quy tắc chưa duyệt không sinh cảnh báo thực
        rtype = rule.get("type")
        cond = rule.get("condition") or {}
        required = rule.get("required_data") or []
        sev = rule.get("severity", "medium")

        try:
            if rtype == "drug_drug":
                pair = cond.get("pair", [])
                if len(pair) != 2:
                    continue
                a, b = pair
                names = [d.name.lower() for d in in_scope if d.name]
                # Khớp "chứa" để bắt cả biến thể biệt dược (vd: "Warfarin 3mg" chứa "Warfarin")
                has_a = any(a.lower() in n for n in names)
                has_b = any(b.lower() in n for n in names)
                if has_a and has_b:
                    result.alerts.append(
                        EngineAlert(
                            rule_id=rule.get("id"),
                            rule_code=rule["code"],
                            rule_version=rule["version"],
                            rule_type="drug_drug",
                            severity=sev,
                            message=rule["message"],
                            source_title=rule["source_title"],
                            source_version=rule["source_version"],
                            detail={"pair": pair},
                        )
                    )

            elif rtype == "duplicate_ingredient":
                ing = cond.get("ingredient_id")
                if not ing:
                    continue
                holders = [
                    d
                    for d in in_scope
                    if ing in d.ingredient_ids or ing.lower() in [n.lower() for n in d.ingredient_names]
                ]
                if len(holders) >= 2:
                    result.alerts.append(
                        EngineAlert(
                            rule_id=rule.get("id"),
                            rule_code=rule["code"],
                            rule_version=rule["version"],
                            rule_type="duplicate_ingredient",
                            severity=sev,
                            message=rule["message"],
                            source_title=rule["source_title"],
                            source_version=rule["source_version"],
                            detail={"ingredient_id": ing, "drugs": [d.name or d.raw_name for d in holders]},
                        )
                    )

            elif rtype == "drug_allergy":
                # Quy tắc chỉ chạy khi người bệnh CÓ dị ứng đã xác minh trùng với allergy_names của quy tắc.
                # Không suy diễn dị ứng chéo: chỉ khớp chính xác.
                rule_allergy_names = [n.lower() for n in cond.get("allergy_names", [])]
                patient_allergies = [n.lower() for n in patient.allergy_ingredient_names]
                has_relevant_allergy = any(a in rule_allergy_names for a in patient_allergies)
                if not has_relevant_allergy:
                    continue
                target_ings = set(cond.get("ingredient_ids", []))
                target_names = [t.lower() for t in target_ings]
                for d in in_scope:
                    hit = None
                    for idx, iid in enumerate(d.ingredient_ids):
                        iname = (d.ingredient_names[idx] if idx < len(d.ingredient_names) else "").lower()
                        # Điều kiện quy tắc có thể dùng ID hoặc tên hoạt chất — khớp cả hai
                        if iid in target_ings or (iname and iname in target_names):
                            hit = d.ingredient_names[idx] if idx < len(d.ingredient_names) and d.ingredient_names[idx] else str(iid)
                            break
                    if hit:
                        result.alerts.append(
                            EngineAlert(
                                rule_id=rule.get("id"),
                                rule_code=rule["code"],
                                rule_version=rule["version"],
                                rule_type="drug_allergy",
                                severity=sev,
                                message=rule["message"],
                                source_title=rule["source_title"],
                                source_version=rule["source_version"],
                                detail={"drug": d.name or d.raw_name, "matched_ingredient": hit},
                            )
                        )

            elif rtype == "drug_condition":
                # Quy tắc chỉ áp dụng khi thuốc liên quan có trong danh sách (nếu cấu hình).
                # Khớp "chứa" để bắt cả biến thể biệt dược (vd: "Metformin 500mg" chứa "Metformin").
                target_drugs = cond.get("drug_names") or []
                if target_drugs:
                    scope_names = [d.name.lower() for d in in_scope if d.name]
                    if not any(t.lower() in name for t in target_drugs for name in scope_names):
                        continue
                # Thiếu dữ liệu bắt buộc → ghi nhận "chưa đủ dữ liệu", KHÔNG bỏ qua im lặng
                for req in required:
                    if req not in patient.labs or patient.labs[req] in ("", None):
                        if req not in result.missing_data:
                            result.missing_data.append(req)
                if required and all(r in patient.labs and patient.labs[r] not in ("", None) for r in required):
                    op = cond.get("lab_op", "<")
                    lab_key = required[0]
                    threshold = float(cond.get("lab_threshold", 0))
                    try:
                        val = float(patient.labs[lab_key])
                    except (TypeError, ValueError):
                        raise ValueError(f"Gia tri xet nghiem {lab_key} khong doc duoc")
                    if _compare(val, op, threshold):
                        result.alerts.append(
                            EngineAlert(
                                rule_id=rule.get("id"),
                                rule_code=rule["code"],
                                rule_version=rule["version"],
                                rule_type="drug_condition",
                                severity=sev,
                                message=rule["message"],
                                source_title=rule["source_title"],
                                source_version=rule["source_version"],
                                detail={lab_key: patient.labs[lab_key], "op": op, "threshold": threshold},
                            )
                        )

                # Nhánh mới: khớp theo BỆNH NỀN (conditions) — không cần xét nghiệm
                cond_conditions = cond.get("conditions") or []
                if cond_conditions:
                    patient_conds = [c.lower() for c in patient.chronic_conditions]
                    has_condition = any(cc.lower() in patient_conds for cc in cond_conditions)
                    if has_condition:
                        target_drugs2 = cond.get("drug_names") or []
                        scope_names2 = [d.name.lower() for d in in_scope if d.name]
                        hit_drugs = sorted({
                            d.name for d in in_scope if d.name and any(t.lower() in d.name.lower() for t in target_drugs2)
                        })
                        if hit_drugs:
                            result.alerts.append(
                                EngineAlert(
                                    rule_id=rule.get("id"),
                                    rule_code=rule["code"],
                                    rule_version=rule["version"],
                                    rule_type="drug_condition",
                                    severity=sev,
                                    message=rule["message"],
                                    source_title=rule["source_title"],
                                    source_version=rule["source_version"],
                                    detail={"condition": cond_conditions[0], "drugs": hit_drugs},
                                )
                            )

            elif rtype == "duplicate_drug":
                # Trùng biệt dược: cùng một thuốc xuất hiện nhiều lần trong danh sách
                name_counts: dict[str, list[str]] = {}
                for d in in_scope:
                    if d.name:
                        name_counts.setdefault(d.name.lower(), []).append(d.name)
                for key, originals in name_counts.items():
                    if len(originals) >= 2:
                        result.alerts.append(
                            EngineAlert(
                                rule_id=rule.get("id"),
                                rule_code=rule["code"],
                                rule_version=rule["version"],
                                rule_type="duplicate_drug",
                                severity=sev,
                                message=rule["message"],
                                source_title=rule["source_title"],
                                source_version=rule["source_version"],
                                detail={"drug": originals[0], "count": len(originals)},
                            )
                        )

            elif rtype == "unverified_medication":
                # Thuốc chưa được bác sĩ kiểm tra đang dùng (tài liệu mục 6)
                if cond.get("check") == "unverified_current":
                    unverified = [d for d in in_scope if d.is_unverified]
                    if unverified:
                        result.alerts.append(
                            EngineAlert(
                                rule_id=rule.get("id"),
                                rule_code=rule["code"],
                                rule_version=rule["version"],
                                rule_type="unverified_medication",
                                severity=sev,
                                message=rule["message"],
                                source_title=rule["source_title"],
                                source_version=rule["source_version"],
                                detail={"drugs": [d.name or d.raw_name for d in unverified]},
                            )
                        )

            elif rtype == "dose_error":
                # Cảnh báo dùng sai liều hoặc trùng liều — chỉ dựa trên CÁCH DÙNG người bệnh
                # tự khai khớp mẫu sai trong quy tắc khoa duyệt (không tự suy diễn liều chuẩn).
                if cond.get("check") == "frequency_pattern":
                    patterns = [p.lower() for p in cond.get("patterns", [])]
                    hits = [
                        d for d in in_scope
                        if d.frequency and any(p in d.frequency.lower() for p in patterns)
                    ]
                    if hits:
                        result.alerts.append(
                            EngineAlert(
                                rule_id=rule.get("id"),
                                rule_code=rule["code"],
                                rule_version=rule["version"],
                                rule_type="dose_error",
                                severity=sev,
                                message=rule["message"],
                                source_title=rule["source_title"],
                                source_version=rule["source_version"],
                                detail={"drugs": [(d.name or d.raw_name) for d in hits],
                                        "frequencies": [d.frequency for d in hits]},
                            )
                        )

            elif rtype == "dose_missed":
                # Cảnh báo bỏ liều/dùng không đều — căn vào trạng thái thuốc do người bệnh khai.
                if cond.get("check") == "irregular_status":
                    irregular = [d for d in in_scope if d.status == "irregular"]
                    if irregular:
                        result.alerts.append(
                            EngineAlert(
                                rule_id=rule.get("id"),
                                rule_code=rule["code"],
                                rule_version=rule["version"],
                                rule_type="dose_missed",
                                severity=sev,
                                message=rule["message"],
                                source_title=rule["source_title"],
                                source_version=rule["source_version"],
                                detail={"drugs": [(d.name or d.raw_name) for d in irregular]},
                            )
                        )

        except Exception:
            # Lỗi engine ở một quy tắc: KHÔNG nuốt im lặng — trả trạng thái failed, xóa cảnh báo
            result.status = STATUS_FAILED
            result.alerts = []
            return result

    if result.alerts:
        result.status = STATUS_HAS_ALERTS
    elif result.missing_data:
        result.status = STATUS_INSUFFICIENT_DATA
    else:
        result.status = STATUS_NO_ALERTS_IN_SCOPE

    return result
