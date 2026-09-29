# Kho kiến thức AI — nguyên tắc phân chia liều lượng thuốc của bác sĩ

> **Đây là thư mục duy nhất AI được phép đọc** để học cách phân chia liều lượng.
> AI KHÔNG đọc hồ sơ người bệnh khác, KHÔNG đọc mã nguồn, KHÔNG gọi Internet.
> Mọi câu trả lời của AI phải truy nguyên được về file trong thư mục này.
>
> Khi có dữ liệu thật, chỉ cần thay nội dung các file .md và .json này — không cần sửa code.

## Cấu trúc file

| File | Nội dung |
| --- | --- |
| `dosing_principles.md` | Nguyên tắc chia liều (file này) |
| `dosing_examples.json` | Ví dụ chia liều thực tế theo thuốc × bối cảnh bệnh nhân |
| `patient_factors.md` | Yếu tố bệnh nhân ảnh hưởng liều (tuổi, thận, gan, mang thai…) |
| `conversation_style.md` | Giọng điệu và khung trả lời trò chuyện |

---

## 1. Nguyên tắc chung khi bác sĩ quyết định liều

1. **Liều theo chỉ định, không theo suy diễn.** Mỗi liều phải bám vào chỉ định chính thức
   (hướng dẫn sử dụng thuốc đã duyệt, phác đồ của bệnh viện, quyết định của Bộ Y tế).
2. **Cá thể hóa theo bệnh nhân** — cùng một hoạt chất nhưng liều khác nhau giữa các bệnh nhân:
   - Trẻ em: tính theo mg/kg cân nặng (trừ một số thuốc có khoảng an toàn hẹp).
   - Người cao tuổi: bắt đầu liều thấp ("start low, go slow"), tăng từ từ.
   - Suy giảm chức năng thận (CrCl thấp): giảm liều hoặc giãn khoảng cách dùng thuốc.
   - Suy gan: tránh thuốc chuyển hóa qua gan hoặc giảm liều.
   - Phụ nữ mang thai/cho con bú: ưu tiên thuốc đã có dữ liệu an toàn.
3. **Tổng liều mỗi ngày có trần tối đa** — ví dụ Paracetamol không quá 4000mg/ngày người lớn
   khỏe mạnh (thường 3000mg/ngày với người cao tuổi hoặc suy gan nhẹ). Nhiều thuốc chứa cùng
   hoạt chất phải cộng gộp tổng liều.
4. **Khoảng cách dùng thuốc đều đặn** — liều chia 2, 3, 4 lần/ngày nhằm giữ nồng độ thuốc trong
   khoảng điều trị ổn định (trừ thuốc "khi cần" như giảm đau, kháng histamine).
5. **Thuốc có khoảng an toàn hẹp** (Warfarin, Theophyllin, Digoxin, Phenytoin…) — liều phải
   được chỉnh theo xét nghiệm theo dõi (VD: INR 2.0–3.0 với Warfarin ở rung nhĩ không van tim).
6. **Đường dùng quyết định liều** — liều uống, tiêm tĩnh mạch, xịt hít không thể hoán đổi cho nhau.
7. **Bối cảnh tương tác** — khi có 2 thuốc tương tác, bác sĩ ưu tiên: đổi thuốc → chỉnh liều
   → tăng tần suất xét nghiệm theo dõi (theo thứ tự đó nếu có thể).
8. **Không bao giờ "bù liều gấp đôi"** khi quên một liều; bỏ liều đã quên nếu gần liều kế tiếp.
9. **Mọi điều chỉnh liều phải ghi lý do** vào hồ sơ để truy nguyên.

## 2. Quy trình 6 bước bác sĩ chia liều

1. Xác định **chẩn đoán + mục tiêu điều trị**.
2. Kiểm tra **đặc điểm bệnh nhân**: tuổi, cân nặng, giới, chức năng thận/gan, dị ứng,
   thuốc đang dùng, bệnh đồng mắc, mang thai/cho con bú.
3. Chọn **liều khởi đầu** theo chỉ định chính thức, điều chỉnh theo yếu tố trên.
4. Kiểm tra **tương tác + trùng hoạt chất** (MedSafe) trước khi chốt.
5. Chọn **lịch dùng** (số lần/ngày, trước/sau ăn) phù hợp dược động học.
6. Lên **kế hoạch theo dõi**: xét nghiệm cần thiết, dấu hiệu cần báo lại, ngày tái khám.

## 3. Mẫu phán đoán liều theo bối cảnh (tóm tắt)

| Bối cảnh | Ảnh hưởng liều |
| --- | --- |
| Trẻ em | mg/kg/ngày, chia theo cân nặng, ưu tiên dạng uống dễ dùng |
| Người cao tuổi ≥ 65 | 50–75% liều chuẩn khởi đầu, tăng chậm |
| CrCl 30–60 ml/min | Giảm liều thuốc thải qua thận (Metformin, nhiều kháng sinh) |
| CrCl < 30 ml/min | Tránh/liều rất thấp tùy thuốc; NSAID tránh |
| Suy gan | Tránh Paracetamol liều cao, tránh NSAID |
| Mang thai | Tránh NSAID, Warfarin; ưu tiên thuốc an toàn thai kỳ |
| Đang dùng Warfarin | Tránh thêm Aspirin/NSAID nếu không bắt buộc |

> **Giới hạn của AI:** kiến thức này chỉ để AI **giải thích và tham chiếu** cách bác sĩ chia liều.
> AI không quyết định liều thay bác sĩ; mọi gợi ý liều đều phải có nguồn từ thư mục này
> và kết luận cuối cùng thuộc về bác sĩ điều trị.
