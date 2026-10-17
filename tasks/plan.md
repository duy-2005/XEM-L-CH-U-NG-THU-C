# Kế Hoạch Tái Thiết Kế Giao Diện Hệ Thống (UI/UX Redesign)
Dựa trên tiêu chuẩn **Anthropic Frontend Design** & **UI-UX Pro Max (Swiss Medical Minimalism)**

## 1. Mục Tiêu & Phạm Vi (Scope)
- **Mục tiêu:** Nâng cấp toàn diện thẩm mỹ giao diện người bệnh và quản trị viên từ phong cách cơ bản thành một ứng dụng y tế cao cấp chuẩn quốc tế (tương tự Apple Health, Mayo Clinic, One Medical).
- **Phạm vi bảo toàn (CRITICAL):**
  - **GIỮ NGUYÊN 100% chức năng:** Tất cả các ID phần tử HTML (`#btn-patient-push`, `#med-list`, `#sugar-form`, `#logout-btn`, `#pw-form`,...), logic sự kiện, kết nối cơ sở dữ liệu Supabase và backend API.
  - **GIỮ NGUYÊN các hiệu ứng GSAP đã làm:** Hoạt ảnh chuyển tab, stagger nạp thẻ thuốc, hiệu ứng tiến độ, tương tác nút bấm.
  - **CHỈ THAY ĐỔI:** Hệ thống CSS tokens (`frontend/styles.css`), bố cục thẻ card, bảng màu y tế cao cấp, typography, độ tương phản và phân cấp thị giác trong `frontend/index.html` và `frontend/admin.html`.

---

## 2. Các Tiêu Chuẩn Thiết Kế Y Tế Cốt Lõi Áp Dụng

### A. Hệ thống màu sắc (Color Tokens - Clinical Trust)
- **Nền chính (Canvas):** `#f8fafc` (Slate 50) nhẹ nhàng, tinh sạch, không chói mắt.
- **Màu chủ đạo (Primary Medical Teal):**
  - Brand Deep: `#0f766e` (Teal 700) – Đậm đà, uy tín, tin cậy.
  - Brand Vibrant: `#0d9488` (Teal 600) – Tạo điểm nhấn hành động.
  - Brand Surface: `#f0fdfa` (Teal 50) – Nền mềm cho các khối thông tin nổi bật.
- **Độ tương phản chữ (Typography Contrast):**
  - Text Primary: `#0f172a` (Slate 900) – Tối ưu cho người lớn tuổi / mắt kém.
  - Text Secondary: `#475569` (Slate 600) – Rõ ràng, không bị mờ nhạt.
- **Trạng thái cữ thuốc:**
  - Chưa dùng / Sắp tới: Thẻ trắng nổi bật viền slate mỏng (`#e2e8f0`).
  - Đang đến giờ uống: Viền xanh y tế `#0d9488`, chỉ báo nhịp thở pulse dịu mắt.
  - Đã uống xong: Nền xám trầm dịu `#f1f5f9`, viền `#cbd5e1`, nút xám nhạt vô hiệu hóa chống bấm nhầm.
  - Bỏ lỡ / Quá giờ: Nền đỏ hồng phấn nhẹ nhàng `#fff1f2`, cảnh báo dịu mắt không gây hoảng loạn.

### B. Typography & Bố cục (Layout & Hierarchy)
- **Phông chữ:** `Plus Jakarta Sans` cho tiêu đề (hiện đại, nhân văn) kết hợp `Inter` cho dữ liệu số đo đường huyết và liều thuốc (chính xác, dễ đọc).
- **Chạm bấm chuẩn công thái học:** Mọi nút bấm (CTA) đạt chiều cao tối thiểu $48\text{px}$ – $52\text{px}$, khoảng cách chạm rộng rãi để người cao tuổi bấm chính xác không bị trượt.
- **Lược bỏ "SaaS-card kit" rập khuôn:** Sử dụng các đường viền tinh xảo (1px border), bề mặt đổ bóng tự nhiên nhiều lớp (`soft multi-layered shadows`), không dùng viền quá to hay bóng xám đen nhân tạo.

---

## 3. Kế Hoạch Triển Khai Từng Bước (Roadmap)

### Giai đoạn 1: Khảo sát & Phỏng vấn ý kiến người dùng (Interview 100%)
- [ ] Phỏng vấn người dùng về phong cách tổng thể mong muốn (Tối giản thanh lịch Swiss Medical hay Giao diện thẻ hiện đại có chiều sâu).
- [ ] Xác nhận tông màu Header và bảng màu cữ thuốc.

### Giai đoạn 2: Tái cấu trúc Hệ Thống Design Tokens trong `frontend/styles.css`
- [ ] Chuẩn hóa biến màu `--bg`, `--card`, `--text-main`, `--text-muted`, `--border`.
- [ ] Tinh chỉnh hệ thống đổ bóng `var(--shadow-card)`, `var(--shadow-hover)`.
- [ ] Hoàn thiện trạng thái cữ thuốc `.card-taken`, `.card-current-slot`, `.card-missed`.

### Giai đoạn 3: Tinh chỉnh Giao diện Màn hình Người bệnh (`frontend/index.html`)
- [ ] Nâng cấp Header: Thiết kế bố cục phẳng sang trọng, huy hiệu trạng thái điều trị gọn gàng.
- [ ] Nâng cấp Thẻ tiến độ uống thuốc: Thiết kế thanh % tinh xảo dạng pill y tế.
- [ ] Nâng cấp Thẻ thuốc trong `frontend/app.js`: Phân cấp thông tin tên thuốc, liều lượng, giờ uống rõ ràng hơn nữa.
- [ ] Nâng cấp Form đường huyết & Form triệu chứng: Ô nhập liệu lớn, hiển thị số đo to rõ ràng.
- [ ] Nâng cấp Thanh điều hướng đáy (Bottom Nav): Thiết kế thanh kính mờ (frosted glass) chuẩn iOS Native.

### Giai đoạn 4: Tinh chỉnh Giao diện Bác sĩ (`frontend/admin.html`)
- [ ] Đồng bộ phong cách thẻ bệnh nhân, bảng chỉ số đường huyết và form kê đơn.

### Giai đoạn 5: Kiểm thử Toàn diện & Xác thực
- [x] Kiểm tra tính toàn vẹn của tất cả các luồng bấm, đăng nhập, nạp dữ liệu, đồng bộ offline.
- [x] Kiểm tra responsive trên các kích thước màn hình điện thoại (iPhone SE, iPhone 14/15/16, Android, iPad).

---

## 4. Giai đoạn 11: Tinh Chỉnh Theo Yêu Cầu Người Dùng Mới Nhất
- [x] **Nhiệm vụ 1: Thay thế Avatar & Icon PWA hệ thống** (Đã hoàn thành)
- [x] **Nhiệm vụ 2: Tối giản màn hình đăng nhập** (Đã hoàn thành)
- [x] **Nhiệm vụ 3: Tinh chỉnh thiết kế thẻ cữ thuốc** (Đã hoàn thành)

---

## 5. Giai đoạn 12: Thiết Lập An Toàn Dược Lâm Sàng – Quy Tắc Quên Liều (Clinical Missed Dose Protocol)
- **Mục tiêu Dược học:** Ngăn chặn nguy cơ **hạ đường huyết kịch phát (Severe Hypoglycemia)** do uống bù / tiêm bù quá giờ đối với các thuốc ĐTĐ kích thích tiết insulin (Sulfonylurea, Meglitinide) hoặc Insulin trước bữa ăn.
- **Nhiệm vụ 1: Cấu hình kê đơn tại trang Bác sĩ (`frontend/admin.html` & `frontend/admin.js`):**
  - Thêm tùy chọn chỉ định xử trí khi quên liều:
    - `[x] Cho phép uống bù nếu quên trong 1 tiếng` (mặc định cho thuốc thông thường)
    - `[ ] Bỏ qua liều, KHÔNG ĐƯỢC uống bù nếu quá 1 tiếng` (khuyến cáo cho Sulfonylurea, Insulin ăn).
  - Lưu trữ và mã hóa an toàn vào metadata đơn thuốc (`[NO_MAKEUP]` trong `instruction` và trường `allow_makeup`).
  - Hiển thị nhãn cảnh báo an toàn trên danh sách đơn thuốc để bác sĩ dễ dàng theo dõi.
- **Nhiệm vụ 2: Cảnh báo & Điều hướng tại app Bệnh nhân (`frontend/app.js`):**
  - Kiểm tra điều kiện `canPrescriptionMakeUp(p)`:
    - Nếu thuốc **KHÔNG CHO PHÉP UỐNG BÙ** và đã quá 1 tiếng:
      - Ẩn hoàn toàn nút "Uống bù ngay".
      - Hiển thị khung cảnh báo an toàn chuẩn dược sĩ: *"Bạn đã quên thuốc quá 1 tiếng. Với loại thuốc này, vui lòng bỏ qua liều, tuyệt đối không được uống lại để tránh nguy cơ hạ đường huyết nguy hiểm. Hãy chờ đến cữ kế tiếp!"*
      - Thẻ chuyển sang trạng thái đã ghi nhận bỏ qua.
    - Nếu thuốc **CHO PHÉP UỐNG BÙ**: Vẫn giữ nút "Uống bù ngay" như bình thường.
- **Nhiệm vụ 3: Phỏng vấn Dược sĩ lâm sàng & Người dùng:**
  - Khảo sát các chi tiết về câu chữ cảnh báo và hành vi mặc định khi kê đơn.


