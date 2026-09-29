# Thư mục `data/` — toàn bộ dữ liệu của dự án

Tất cả dữ liệu (demo và thật) được tách khỏi mã nguồn tại đây. Khi có dữ liệu thật,
chỉ cần thay nội dung các file bên dưới — **không cần sửa code**, sau đó chạy lại seed.

## Cấu trúc

```
data/
├── README.md                  ← file này
├── catalog/
│   ├── ingredients.json       ← danh mục hoạt chất (tên + mã ATC)
│   └── drugs.json             ← danh mục biệt dược (hàm lượng, dạng, hoạt chất, trong/ngoài phạm vi)
├── safety/
│   ├── knowledge_sources.json ← nguồn tài liệu y tế có phiên bản (dùng cho RAG + truy nguyên)
│   └── safety_rules.json      ← quy tắc an toàn MedSafe (điều kiện, mức độ, trạng thái duyệt)
├── demo/
│   ├── accounts.json          ← tài khoản demo (seed)
│   └── cases.json             ← ca người bệnh demo (hồ sơ, dị ứng, thuốc, xét nghiệm)
└── ai_knowledge/              ← ⭐ thư mục DUY NHẤT AI được phép đọc
    ├── dosing_principles.md   ← nguyên tắc chia liều của bác sĩ
    ├── dosing_examples.json   ← ví dụ liều thực tế theo thuốc × bối cảnh bệnh nhân
    ├── patient_factors.md     ← yếu tố bệnh nhân ảnh hưởng liều (thận, gan, tuổi, thai…)
    └── conversation_style.md  ← giọng điệu + khung trả lời của AI
```

## Quy tắc của AI (backend AI ảo)

1. **AI chỉ được đọc `data/ai_knowledge/`** — không đọc thư mục khác của `data/`,
   không đọc hồ sơ người bệnh khác, không gọi Internet.
2. Mọi gợi ý liều của AI phải **trích từ `dosing_examples.json`** hoặc **nguyên tắc trong
   `dosing_principles.md` / `patient_factors.md`** — không bịa số.
3. Mọi câu trả lời phải **ghi rõ nguồn** (tên file + id ví dụ/mục).
4. Thiếu dữ liệu → trả lời "chưa đủ dữ liệu", không đoán.
5. AI không quyết định liều thay bác sĩ — chỉ giải thích và tham chiếu.

## Nhập dữ liệu thật sau này

1. Thay `catalog/*.json` bằng danh mục thuốc thật (giữ nguyên tên trường).
2. Thay `safety/*.json` bằng quy tắc + nguồn thật (gắn trạng thái `approved` sau khi dược sĩ duyệt).
3. Thay `demo/` bằng dữ liệu nhập liệu thật (hoặc bỏ seed demo, dùng API nhập liệu).
4. Thay `ai_knowledge/dosing_examples.json` bằng phác đồ liều thật của bác sĩ — AI sẽ tự
   dùng dữ liệu mới ở lần chat tiếp theo (đọc lại file mỗi khi khởi động phiên chat).

## Nạp dữ liệu

```bash
cd services/api
python -m app.seed_data        # đọc từ ../data/ (tự dò đường dẫn)
```

Đường dẫn thư mục `data/` có thể ghi đè bằng biến môi trường `DATA_DIR`.
