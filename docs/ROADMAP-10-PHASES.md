# AllerCare AI — Kế hoạch 10 Phase & Design System

> Tài liệu kế hoạch làm việc, xây dựng trên nền đặc tả `README_AllerCare AI.md` v0.1 (20/09/2026).
> Mốc chót: **25/09** nộp poster/video — **30/09** nội dung chính. Nguyên tắc: chạy được luồng đầu–cuối trước, mở rộng sau; không bỏ kiểm thử để kịp tính năng.

---

## PHẦN I — TỔNG QUAN 10 PHASE

| Phase | Tên | Đầu ra chính | Thời gian đề xuất |
| --- | --- | --- | --- |
| 1 | Khởi tạo dự án & khung repo | Scaffold frontend + backend + docs, chạy "hello" được | 20–21/09 (0.5–1 ngày) |
| 2 | Design system & bộ khung UI trắng–xanh | Thư viện token/component dùng chung 2 vai trò | 21/09 (song song Phase 1) |
| 3 | Mô hình dữ liệu & migration | Schema PostgreSQL + Alembic + seed dữ liệu giả lập | 21/09 |
| 4 | Xác thực & phân quyền | Login, vai trò, kiểm tra quyền từng hồ sơ ở backend | 21–22/09 |
| 5 | Hồ sơ & diễn biến người bệnh | Patient app: khai thuốc/triệu chứng, trạng thái cập nhật | 22/09 |
| 6 | MedSafe — rule engine & kiểm tra an toàn thuốc | 4 nhóm kiểm tra, 5 trạng thái kết quả bắt buộc | 22–23/09 (trọng tâm) |
| 7 | Portal bác sĩ & luồng duyệt cảnh báo | Danh sách ca, dòng thời gian, ghi nhận quyết định | 23/09 |
| 8 | Chatbot giới hạn & AI có kiểm soát | RAG theo quy tắc, schema JSON, chuyển câu hỏi cho nhân viên y tế | 23–24/09 |
| 9 | Lịch hẹn & video call theo lịch | Appointment + quyền phòng họ, Jitsi thử nghiệm | 24/09 |
| 10 | Kiểm thử tích hợp, demo & hồ sơ dự thi | e2e, báo cáo kiểm thử, video 3–5 phút, poster A0 | 24–25/09 |

Phụ lục linh hoạt (26–29/09): PWA cài lên màn hình chính, thống kê cảnh báo, luyện phản biện, phương án demo offline.

---

## PHẦN II — CHI TIẾT TỪNG PHASE

### Phase 1 — Khởi tạo dự án & khung repo

**Mục tiêu:** Repo sạch, cấu trúc đúng README mục 11, cả 2 app khởi động được.

Công việc:
- [ ] Tạo cấu trúc: `apps/web/`, `services/api/app/modules/{auth,patients,medications,safety,ai,consultations,audit}/`, `services/api/alembic/`, `tests/e2e/`, `data/synthetic/`, `docs/`, `infra/`.
- [ ] Frontend: Next.js + React + TypeScript, Tailwind, path alias.
- [ ] Backend: FastAPI + Pydantic, SQLAlchemy 2 + Alembic (không Prisma), cấu trúc module.
- [ ] `docker-compose.yml`: web, api, postgres; Nginx/HTTPS cho demo; `.env.example` với DATABASE_URL, AUTH_SECRET, AI_PROVIDER, AI_MODEL, AI_API_KEY, VIDEO_BASE_URL, ALLOWED_ORIGINS, DEMO_MODE.
- [ ] CI tối thiểu: typecheck + pytest chạy được.
- [ ] Health check `/healthz` cho cả web lẫn api.
- [ ] README mục 13: cập nhật hướng dẫn chạy đã kiểm chứng (Node/Python/Postgres phiên bản cụ thể).

**Nghiệm thu:** `docker compose up` chạy cả 2 app; pytest xanh; không có bí mật trong repo.

### Phase 2 — Design system & bộ khung UI (trắng–xanh)

**Mục tiêu:** Bộ token + component dùng chung, giao diện thân thiện người lớn tuổi và người bệnh.

Công việc:
- [ ] Token màu trắng–xanh (bảng ở Phần III), dark mode để sau.
- [ ] Component nền tảng: Button, Card, Input, Select, Badge (trạng thái cảnh báo), Alert, Timeline, EmptyState, Skeleton, Dialog, Toast.
- [ ] Badge trạng thái dùng đúng 5 trạng thái kết quả MedSafe — không dùng xanh lá cho "chưa phát hiện cảnh báo".
- [ ] Layout 2 vai trò: sidebar bác sĩ (desktop-first) / bottom-nav người bệnh (mobile-first).
- [ ] Tiêu chí a11y: cỡ chữ tối thiểu 16px, vùng chạm ≥ 44px, tương phản AA, nhãn tiếng Việt rõ ràng.

**Nghiệm thu:** Storybook hoặc trang catalog nội bộ; các màn hình Phase 5–7 dựng được chỉ từ component có sẵn.

### Phase 3 — Mô hình dữ liệu & migration

**Mục tiêu:** Schema đầy đủ thực thể README mục 9, có dữ liệu giả lập.

Công việc:
- [ ] Bảng: User/Role/CareAssignment, PatientProfile, AllergyRecord, MedicationRecord, ClinicalObservation, Drug/Ingredient, KnowledgeSource/SafetyRule, SafetyCheck/Alert/Review, Appointment/Consultation, ChatSession/Message, AuditEvent.
- [ ] Cột nguồn + thời gian + người xác minh trên mọi dữ liệu lâm sàng; phân biệt "không có tiền sử ghi nhận" vs "chưa khai thác" (enum rõ ràng).
- [ ] Drug có hoạt chất + hàm lượng, hỗ trợ thuốc phối hợp.
- [ ] SafetyRule: điều kiện kích hoạt, dữ liệu bắt buộc, mức độ, nguồn, phiên bản, trạng thái duyệt, ngày rà soát tiếp theo.
- [ ] Seed `data/synthetic/`: 8–10 ca giả lập (kể cả ca tiền sử dị ứng, ca thiếu dữ liệu, ca thuốc ngoài danh mục), ~50 thuốc, ~20 quy tắc có nguồn.
- [ ] Alembic migration chạy từ đầu đến hiện tại được trên DB trống.

**Nghiệm thu:** Migration + seed chạy được trên DB sạch; các ca giả lập có mã nhận biết trong demo.

### Phase 4 — Xác thực & phân quyền

**Mục tiêu:** Đăng nhập an toàn, quyền kiểm tra ở backend trên từng hồ sơ.

Công việc:
- [ ] Session/cookie bảo mật (thư viện xác thực được review), đăng xuất xóa dữ liệu phiên.
- [ ] Vai trò: người bệnh, bác sĩ, dược sĩ lâm sàng; quản trị kỹ thuật ở mức tối thiểu.
- [ ] Dependency Content-Based Access Control (Data-Based Authorization): mọi endpoint hồ sơ kiểm tra `CareAssignment`/sở hữu ở backend — không tin vai trò phía frontend.
- [ ] Middleware ghi AuditEvent: ai, thao tác gì, đối tượng nào, lúc nào.
- [ ] Rate limit + whitelist ALLOWED_ORIGINS; bí mật chỉ nằm phía server.
- [ ] Test phân quyền bắt buộc: người bệnh không xem chéo hồ sơ; bác sĩ chỉ xem ca được phân công.

**Nghiệm thu:** pytest phân quyền xanh; AuditEvent ghi đủ truy nguyên.

### Phase 5 — Hồ sơ & diễn biến người bệnh (Patient App)

**Mục tiêu:** Web responsive mobile-first cho người bệnh, đúng phạm vi 4.1.

Công việc:
- [ ] Đăng nhập → màn hình chính: bác sĩ phụ trách, lịch tái khám, hướng dẫn đã duyệt.
- [ ] Khai thuốc đang dùng (tìm từ danh mục chuẩn hóa; nếu không có → "chưa xác minh", chờ xác nhận).
- [ ] Khai tiền sử phản ứng + triệu chứng với thời điểm xuất hiện.
- [ ] Dòng thời gian diễn biến; nhãn bắt buộc "chưa được chuyên môn xác minh" trên dữ liệu tự khai.
- [ ] Trạng thái cập nhật: đã gửi / đã được xem / đã có phản hồi.
- [ ] Màn hình hỗ trợ: hướng dẫn khẩn cấp "gọi cấp cứu 115 — ứng dụng không thay kênh cấp cứu".

**Nghiệm thu:** Luồng khai báo gửi được lên backend, bác sĩ thấy trong portal; PWA manifest cơ bản.

### Phase 6 — MedSafe: rule engine & kiểm tra an toàn thuốc (trọng tâm)

**Mục tiêu:** Cốt lõi sản phẩm — đối chiếu danh sách thuốc với quy tắc có nguồn, đúng 5 trạng thái.

Công việc:
- [ ] Chuẩn hóa thuốc: biệt dược → hoạt chất, xử lý thuốc phối hợp, sai chính tả, không nhận diện được.
- [ ] Rule engine 4 nhóm kiểm tra: thuốc–thuốc, trùng hoạt chất, thuốc–tiền sử dị ứng (không tự suy diễn dị ứng chéo), thuốc–tình trạng người bệnh.
- [ ] 5 trạng thái kết quả bắt buộc: Có cảnh báo / Chưa phát hiện trong phạm vi đã kiểm tra / Chưa đủ dữ liệu (chỉ rõ thiếu gì, cũ thế nào) / Ngoài phạm vi hỗ trợ / Kiểm tra thất bại.
- [ ] Mỗi cảnh báo trả kèm: mức độ, điều kiện áp dụng, nguồn, phiên bản quy tắc, dữ liệu đầu vào.
- [ ] Cảnh báo có cấu trúc vẫn chạy được khi LLM chết — AI không phải nguồn quyết định.
- [ ] Snapshot SafetyCheck: chụp dữ liệu tại thời điểm kiểm tra, bất biến.
- [ ] API: POST /api/v1/safety-checks, GET /safety-checks/{id}, POST /safety-checks/{id}/reviews.
- [ ] pytest: đúng các tình huống nhóm "Rule engine" ở README mục 14 (có/không quy tắc, dữ liệu thiếu, đơn vị khác, dữ liệu cũ, nhiều cảnh báo).

**Nghiệm thu:** Bộ test rule engine xanh; trạng thái hiển thị đúng màu đúng nghĩa (không xanh "an toàn").

### Phase 7 — Portal bác sĩ & luồng duyệt cảnh báo

**Mục tiêu:** Luồng nghiệp vụ chính mục 7 hoàn chỉnh đầu–cuối cho bác sĩ.

Công việc:
- [ ] Danh sách người bệnh được phân công + badge cập nhật chưa xem.
- [ ] Dòng thời gian triệu chứng, thuốc, phản hồi của từng ca.
- [ ] Nhập/chọn thuốc dự kiến: xác nhận hoạt chất, hàm lượng, liều, đường dùng, tần suất.
- [ ] Chạy kiểm tra thuốc → xem cảnh báo + căn cứ gốc → (tùy chọn) bản diễn giải AI có nguồn.
- [ ] Ghi nhận quyết định: đã xem / xử lý / lý do không áp dụng — ghi vào Review.
- [ ] Gửi hướng dẫn đã duyệt về người bệnh (chỉ nội dung duyệt mới đi tiếp).
- [ ] Nhật ký kiểm tra + phản hồi lưu đầy đủ.

**Nghiệm thu:** Demo luồng: người bệnh khai → bác sĩ kiểm → cảnh báo → quyết định → hướng dẫn quay lại người bệnh, có audit truy nguyên.

### Phase 8 — Chatbot giới hạn & AI có kiểm soát

**Mục tiêu:** AI đúng vai trò mục 6 của README: trích xuất, tóm tắt, diễn giải, chatbot — không quyết định.

Công việc:
- [ ] Adapter AI (đổi provider được qua env AI_PROVIDER/AI_MODEL), schema JSON có kiểm tra đầu ra.
- [ ] RAG: chỉ truy xuất đoạn tài liệu/quy tắc được phép dùng; nguồn phải là nguồn thật trong hệ thống — từ chối nguồn do AI tự tạo.
- [ ] Chatbot người bệnh: giới hạn trong hướng dẫn sử dụng + nội dung đã duyệt; câu hỏi ngoài phạm vi → từ chối lịch sự + chuyển cho nhân viên y tế.
- [ ] Từ chối yêu cầu tự đổi thuốc/liều; không bỏ sót hay làm giảm cảnh báo gốc.
- [ ] Tóm tắt diễn biến cho bác sĩ, gắn nguồn từng câu.
- [ ] Kiểm thử: thiếu dữ liệu, ngoài phạm vi, AI timeout → fallback; lưu phiên bản model/prompt.
- [ ] Không log prompt chứa dữ liệu nhạy cảm; không tự dùng phản hồi làm dữ liệu huấn luyện.

**Nghiệm thu:** Bộ test nhóm "AI" README mục 14 xanh; chatbot từ chối đúng các câu hỏi mẫu ngoài phạm vi.

### Phase 9 — Lịch hẹn & video call theo lịch

**Mục tiêu:** Đặt lịch + vào phòng họ được kiểm soát quyền; mô phỏng rõ ràng nếu chưa có server.

Công việc:
- [ ] POST /api/v1/appointments: người bệnh yêu cầu, bác sĩ xác nhận, tra xung đột lịch.
- [ ] POST /appointments/{id}/join: kiểm tra quyền tham gia, cấp thông tin phòng tạm thời (URL không chứa tên/mã người bệnh).
- [ ] Tích hợp Jitsi (thử nghiệm, DEMO_MODE mô phỏng nếu không có máy chủ).
- [ ] Không ghi âm/ghi hình; giao diện nhắc rõ việc này.
- [ ] Xử lý lỗi video (thiết bị không camera/mic, mất mạng) với hướng dẫn thân thiện.

**Nghiệm thu:** Cuộc gọi 1–1 demo được giữa 2 tài khoản; người ngoài bị từ chối vào phòng.

### Phase 10 — Kiểm thử tích hợp, demo & hồ sơ dự thi

**Mục tiêu:** Chốt chất lượng + giao sản phẩm truyền thông đúng hạn 25/09.

Công việc:
- [ ] Playwright e2e theo vai trò: luồng người bệnh, luồng bác sĩ, truy cập chéo bị chặn, mất mạng/AI lỗi.
- [ ] Kiểm thử mobile: đọc dễ, nút dễ thao tác, quyền camera/mic, cài PWA trên thiết bị mục tiêu.
- [ ] Chạy lại bộ ca chuyên môn (tách ca chỉnh quy tắc khỏi bộ cuối), thống kê cảnh báo đúng/sai/bỏ sót.
- [ ] Báo cáo kiểm thử + giới hạn công bố rõ ràng; không dùng số giả làm kết quả thật.
- [ ] Dựng kịch bản demo 5–7 phút theo một luồng chính; phương án dự phòng khi mất mạng (dữ liệu seed, AI mock).
- [ ] Hồ sơ: poster A0, video 3–5 phút, slide, mô tả giới hạn hệ thống.
- [ ] 26–29/09: ổn định, luyện phản biện, bổ sung PWA/thống kê nếu được phép.

**Nghiệm thu:** Luồng đầu–cuối chạy được; không truy cập chéo; không trả "an toàn" khi lỗi/thiếu dữ liệu; đủ hồ sơ nộp.

---

## PHẦN III — DESIGN SYSTEM: TÔNG TRẮNG–XANH THÂN THIỆU

### Nguyên tắc thiết kế (cập nhật v2 — trắng + xanh nước biển)

1. **Trắng là nền chủ đạo** — sạch, tin cậy, như môi trường y tế.
2. **Xanh nước biển (ocean blue) là màu thương hiệu & hành động** — tươi sáng, tin cậy, tích cực; KHÔNG dùng cho trạng thái "an toàn".
3. **Màu cảnh báo tách biệt hẳn màu thương hiệu** — để người dùng không bao giờ nhầm "xanh = an toàn".
4. **Web và mobile nhìn như MỘT ứng dụng**: cùng sticky header, cùng floating bottom-nav, cùng card/badge/nút trên mọi vai trò và mọi kích thước màn hình.
4. **Dễ dùng cho người lớn tuổi**: chữ ≥ 16px, nút lớn, một việc mỗi màn hình, tiếng Việt đơn giản, luôn có nút trợ giúp.
5. **Trung thực về trạng thái**: mọi trạng thái hệ thống hiện bằng từ ngữ + màu + icon, không chỉ màu.

### Bảng màu (Token)

**Nền & bề mặt**
| Token | Mã màu | Dùng |
| --- | --- | --- |
| `bg/base` | `#FFFFFF` | Nền chính toàn app |
| `bg/subtle` | `#F0F9F4` | Nền phụ, vùng ngắn gọn, header nhẹ |
| `surface/card` | `#FFFFFF` | Card (viền `#E2EFE7` + bóng rất nhẹ) |
| `surface/hover` | `#EAF5EF` | Hover/active hàng danh sách |

**Xanh thương hiệu (brand — xanh nước biển)**
| Token | Mã màu | Dùng |
| --- | --- | --- |
| `brand/50` | `#F0F9FF` | Nền nhãn, chip |
| `brand/100` | `#E0F2FE` | Hover nhẹ, viền chip, focus ring |
| `brand/300` | `#7DD3FC` | Icon phụ, progress |
| `brand/500` | `#0284C7` | Nút chính, link, trạng thái tích cực thật (đã duyệt) |
| `brand/600` | `#0369A1` | Hover nút chính |
| `brand/700` | `#075985` | Chữ trên nền nhạt, tiêu đề phụ |
| `brand/grad` | `#0EA5E9→#0284C7` | Nút chính, logo, icon chip |

**Màu chức năng (khác biệt rõ với brand)**
| Token | Mã màu | Ý nghĩa — quy tắc bắt buộc của MedSafe |
| --- | --- | --- |
| `status/info` | `#2F6FEB` | Thông tin chung, trạng thái "đã gửi" |
| `status/warning-bg` | `#FFF6E5` / `status/warning` `#B45309` | **Có cảnh báo mức trung bình/thấp** — cam |
| `status/danger-bg` | `#FDECEC` / `status/danger` `#C0392B` | **Có cảnh báo mức cao** — đỏ |
| `status/neutral` | `#6B7280` trên `#F3F4F6` | **Chưa phát hiện cảnh báo trong phạm vi đã kiểm tra** — xám + icon kiểm tra, KHÔNG xanh |
| `status/missing` | `#8A6D1F` trên `#FBF3D9` | **Chưa đủ dữ liệu** — vàng đất |
| `status/outofscope` | `#5B6472` trên `#EDF0F3` | **Ngoài phạm vi hỗ trợ** — xám xanh |
| `status/error` | `#B3261E` trên `#FCE9E8` | **Kiểm tra thất bại** — đỏ đậm, kèm nút thử lại |
| `unverified` | `#92400E` trên `#FEF3C7`, icon chấm hỏi | Dữ liệu người bệnh tự khai "chưa được chuyên môn xác minh" |

**Chữ & viền**
| Token | Mã màu |
| --- | --- |
| `text/primary` | `#1F2937` |
| `text/secondary` | `#52606D` |
| `text/disabled` | `#9AA5B1` |
| `border/default` | `#E2EFE7` |
| `border/strong` | `#CBD5D1` |

### Typography & spacing

- Font: **Inter** hoặc **Be Vietnam Pro** (hỗ trợ tiếng Việt tốt) — UI; tiêu đề có thể dùng cùng font đậm.
- Scale: body 16px; label 14px; tiêu đề card 18–20px; tiêu đề trang 24–28px; line-height ≥ 1.5.
- Radius: 12px (card) / 10px (nút, input) / full (chip, badge).
- Bóng: rất nhẹ (`0 1px 3px rgba(16,64,40,0.06)`) — cảm giác sạch.
- Khoảng cách lưới 4px; vùng chạm tối thiểu 44×44px.

### Iconography & ngôn ngữ hình ảnh

- Bộ icon line đồng bộ (Lucide/Feather), stroke 1.5–2.
- Icon trạng thái luôn đi kèm chữ (không dùng màu/icon một mình).
- Minh họa: đường nét dịu, hình tròn mềm, tông xanh thương hiệu — dùng ở màn chào và EmptyState.
- Logo: chữ "AllerCare AI" + biểu tượng lá khiên xanh — gợi bảo vệ, an toàn, không dùng dấu cảnh báo làm logo.

### Mẫu áp dụng nhanh

**Nút:**
- Chính: nền `brand/500`, chữ trắng, hover `brand/600`.
- Phụ: nền trắng, viền `border/strong`, chữ `brand/700`.
- Nguy hiểm (hủy, xóa): nền `status/danger-bg`, chữ `status/danger` — không dùng cho hành động thương mại.

**Cảnh báo MedSafe (khối kết quả kiểm tra):**
```
[icon] CÓ CẢNH BÁO — mức cao            ← nền status/danger-bg, chữ status/danger
Thuốc A + Thuốc B: <nội dung quy tắc>
Nguồn: <tài liệu>, phiên bản <x>, ngày <y>
[Xem căn cứ gốc]  [Bác sĩ ghi nhận quyết định]
```

**Dòng thời gian người bệnh:** chấm màu `brand/300` → đã xem `brand/500` → có phản hồi `status/info`; dữ liệu tự khai luôn gắn chip `unverified`.

### Hai trải nghiệm, một hệ thống (v2 — thống nhất web & mobile)

| Khía cạnh | Người bệnh | Bác sĩ / Dược sĩ |
| --- | --- | --- |
| Điều hướng | Floating bottom-nav 4 mục: Trang chủ, Cập nhật, Hỏi đáp, Lịch hẹn | Floating bottom-nav 2 mục: Danh sách ca, Quy tắc |
| Khung | Cùng sticky header (logo + avatar + vai trò + thoát), cùng container 720px | Giống hệt người bệnh — chỉ khác nội dung và số mục nav |
| Ngôn ngữ | "Khai báo thuốc đang dùng", câu ngắn, có trợ giúp | Thuật ngữ chuyên môn + nguồn trích dẫn đầy đủ |
| Màu nhấn | `brand/grad` cho hành động chính | `brand/grad` cho hành động; cảnh báo chiếm ưu thế thị giác khi có |
| Mật độ | Thẻ lớn, stat chips, một quyết định mỗi màn | Thêm stat chips, danh sách dày hơn |

### Tránh xa

- Không xanh (lá lẫn nước biển) cho trạng thái "không phát hiện cảnh báo" hay "an toàn".
- Không icon/màu một mình mang nghĩa; không emoji thay icon trạng thái.
- Không dùng font < 14px; không viền đỏ loè loẹt ngoài ngữ cảnh lỗi.
- Không lẫn nội dung quảng cáo/thương mại vào giao diện y tế.

---

## PHẦN IV — RÀNG BUỘC CHẤT LƯỢNG XUYÊN SUỐT (áp cho mọi phase)

1. Mọi endpoint kiểm tra quyền ở backend theo từng hồ sơ (không chỉ ẩn nút UI).
2. Không bao giờ hiển thị "an toàn" khi lỗi/thiếu dữ liệu/ngoài phạm vi.
3. Dữ liệu người bệnh tự khai luôn gắn nhãn "chưa được chuyên môn xác minh".
4. Mỗi thay đổi quy tắc thuốc phải có rà soát chuyên môn + regression test.
5. Không commit bí mật, dữ liệu bệnh viện hay hồ sơ thật; log không chứa dữ liệu nhạy cảm.
6. Mỗi phase kết thúc phải chạy được demo luồng đã hứa của phase đó, kể cả ở mức thô.

---

*Người soạn: kế hoạch do AI đề xuất dựa trên README v0.1. Các mốc ngày cần nhóm xác nhận lại với ban tổ chức (README mục 16, 18).*
