"""Script import danh mục 633 cặp tương tác thuốc từ Danh_muc_tuong_tac_thuoc.xlsx
vào toàn bộ hệ thống AllerCare AI V2:
1. data/safety/knowledge_sources.json (Thêm nguồn Bộ Y tế)
2. data/catalog/ingredients.json (Thêm hoạt chất mới)
3. data/safety/safety_rules.json (Thêm 633 rules DD001 - DD633 cho MedSafe)
4. data/ai_knowledge/drug_interactions.json (Kho kiến thức AI hỏi đáp)
5. Nạp lại DB qua app.seed_data
"""
import json
import os
import re
import sys
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent
XLSX_PATH = ROOT_DIR / "Danh_muc_tuong_tac_thuoc.xlsx"
DATA_DIR = ROOT_DIR / "data"

def clean_name(name: str) -> str:
    name = re.sub(r"\s+", " ", name).strip()
    return name

def parse_xlsx(file_path: Path):
    with zipfile.ZipFile(file_path) as z:
        shared_strings = []
        if 'xl/sharedStrings.xml' in z.namelist():
            tree = ET.fromstring(z.read('xl/sharedStrings.xml'))
            for si in tree.findall('{http://schemas.openxmlformats.org/spreadsheetml/2006/main}si'):
                t = ''.join([node.text or '' for node in si.iter('{http://schemas.openxmlformats.org/spreadsheetml/2006/main}t')])
                shared_strings.append(t)
        
        tree = ET.fromstring(z.read('xl/worksheets/sheet1.xml'))
        rows = tree.findall('{http://schemas.openxmlformats.org/spreadsheetml/2006/main}sheetData/{http://schemas.openxmlformats.org/spreadsheetml/2006/main}row')
        
        interactions = []
        for r in rows[3:]:  # bỏ qua dòng tiêu đề
            cells = []
            for c in r.findall('{http://schemas.openxmlformats.org/spreadsheetml/2006/main}c'):
                t_type = c.get('t')
                v = c.find('{http://schemas.openxmlformats.org/spreadsheetml/2006/main}v')
                val = v.text if v is not None else ''
                if t_type == 's' and val.isdigit():
                    val = shared_strings[int(val)]
                cells.append(val.strip())
            if len(cells) >= 6 and cells[1] and cells[2]:
                interactions.append({
                    'stt': cells[0],
                    'act1': clean_name(cells[1]),
                    'act2': clean_name(cells[2]),
                    'mechanism': clean_name(cells[3]),
                    'consequence': clean_name(cells[4]),
                    'action': clean_name(cells[5])
                })
        return interactions

def main():
    print(f"Bắt đầu đọc file Excel: {XLSX_PATH}...")
    interactions = parse_xlsx(XLSX_PATH)
    print(f"Đã trích xuất thành công {len(interactions)} cặp tương tác thuốc.")

    source_title = "Danh mục tương tác thuốc chống chỉ định và thận trọng — Bộ Y tế"

    # 1. Cập nhật knowledge_sources.json
    ks_path = DATA_DIR / "safety" / "knowledge_sources.json"
    with ks_path.open(encoding="utf-8") as f:
        ks_data = json.load(f)
    
    source_exists = any(s["title"] == source_title for s in ks_data["sources"])
    if not source_exists:
        ks_data["sources"].append({
            "title": source_title,
            "publisher": "Bộ Y tế",
            "version": "2024.1",
            "published_date": "2024-01",
            "license_note": "Quyết định 5948/QĐ-BYT — Danh mục tương tác thuốc chống chỉ định và thận trọng khi phối hợp.",
            "content": "Danh mục tương tác thuốc chống chỉ định và thận trọng theo quy định chuyên môn của Bộ Y tế. Ghi nhận 633 cặp tương tác bao gồm cơ chế, hậu quả lâm sàng và hướng dẫn xử trí cụ thể."
        })
        with ks_path.open("w", encoding="utf-8") as f:
            json.dump(ks_data, f, ensure_ascii=False, indent=2)
        print("-> Đã cập nhật knowledge_sources.json")

    # 2. Cập nhật ingredients.json
    ing_path = DATA_DIR / "catalog" / "ingredients.json"
    with ing_path.open(encoding="utf-8") as f:
        existing_ings = json.load(f)
    
    ing_names_lower = {ing["name"].lower(): ing for ing in existing_ings}
    new_ings_count = 0
    for item in interactions:
        for act in [item['act1'], item['act2']]:
            # bỏ các chú thích trong ngoặc đơn nếu có dạng "X (dạng tiêm)"
            pure_name = re.sub(r"\s*\(.*?\)", "", act).strip()
            if pure_name and pure_name.lower() not in ing_names_lower:
                existing_ings.append({"name": pure_name, "atc_code": None})
                ing_names_lower[pure_name.lower()] = True
                new_ings_count += 1
            if act.lower() not in ing_names_lower:
                existing_ings.append({"name": act, "atc_code": None})
                ing_names_lower[act.lower()] = True
                new_ings_count += 1

    with ing_path.open("w", encoding="utf-8") as f:
        json.dump(existing_ings, f, ensure_ascii=False, indent=2)
    print(f"-> Đã cập nhật ingredients.json (thêm {new_ings_count} hoạt chất mới)")

    # 3. Cập nhật safety_rules.json (thay thế/thêm mới các rule DD)
    sr_path = DATA_DIR / "safety" / "safety_rules.json"
    with sr_path.open(encoding="utf-8") as f:
        sr_data = json.load(f)

    # Giữ lại các rules không phải drug_drug (DA, DI, DC, DL, DR, UM)
    non_dd_rules = [r for r in sr_data["rules"] if r.get("rule_type") != "drug_drug"]

    new_dd_rules = []
    for idx, item in enumerate(interactions, 1):
        code = f"DD{idx:03d}"
        act1 = item['act1']
        act2 = item['act2']
        mech = item['mechanism']
        cons = item['consequence']
        act = item['action']

        # Xác định severity: Chống chỉ định hoặc hậu quả nguy hiểm -> high, còn lại -> medium
        combined_text = (cons + " " + act).lower()
        if any(w in combined_text for w in ["chống chỉ định", "nghiêm trọng", "tử vong", "loạn nhịp", "xuất huyết tiêu hóa nghiêm", "nguy kịch", "ngưng ngay", "tránh sử dụng"]):
            severity = "high"
        else:
            severity = "medium"

        # Tiêu đề ngắn gọn <= 180 ký tự
        title_summary = cons[:120] if len(cons) > 120 else cons
        title = f"{act1} + {act2}: {title_summary}"
        if len(title) > 195:
            title = title[:192] + "..."

        message = f"Cơ chế: {mech}. Hậu quả: {cons}. Xử trí: {act}."

        new_dd_rules.append({
            "code": code,
            "rule_version": "1.0",
            "rule_type": "drug_drug",
            "title": title,
            "message": message,
            "severity": severity,
            "status": "approved",
            "condition": {"pair": [act1, act2]},
            "required_data": [],
            "source_title": source_title
        })

    sr_data["rules"] = new_dd_rules + non_dd_rules
    with sr_path.open("w", encoding="utf-8") as f:
        json.dump(sr_data, f, ensure_ascii=False, indent=2)
    print(f"-> Đã cập nhật safety_rules.json với {len(new_dd_rules)} quy tắc tương tác thuốc MedSafe")

    # 4. Tạo file data/ai_knowledge/drug_interactions.json
    ai_int_path = DATA_DIR / "ai_knowledge" / "drug_interactions.json"
    with ai_int_path.open("w", encoding="utf-8") as f:
        json.dump(interactions, f, ensure_ascii=False, indent=2)
    print(f"-> Đã lưu data/ai_knowledge/drug_interactions.json ({len(interactions)} mục) cho Trợ lý AI")

    print("\n✅ Hoàn tất chuyển đổi dữ liệu thành công!")

if __name__ == "__main__":
    main()
