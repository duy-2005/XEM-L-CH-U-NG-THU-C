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
- [x] Đã hoàn thành 100%

---

## 6. Giai đoạn 13: Hộp Thoại Nhắc Duyệt Chuông Khi Đổi Thiết Bị (Device Push Permission Onboarding Modal)
- **Bối cảnh & Vấn đề:** Khi người dùng chuyển sang máy mới / trình duyệt mới (ví dụ từ laptop sang điện thoại hoặc đổi thiết bị), quyền thông báo chưa được duyệt nên hệ thống không thể rung chuông nhắc uống thuốc. Người dùng dễ quên bấm nút nhỏ bên dưới.
- **Giải pháp UX:**
  - Thiết kế Hộp thoại Modal nổi bật chính giữa màn hình với lớp nền làm mờ tập trung chú ý ngay sau khi vào app.
  - Cảnh báo rõ lý do: Thiết bị này chưa được cấp quyền thông báo đẩy -> nguy cơ bỏ lỡ cữ thuốc.
  - Nút chính: **"Duyệt thông báo ngay"** -> Yêu cầu cấp quyền và kích hoạt Web Push ngay lập tức.
  - Nút phụ: **"Bỏ qua (Để sau)"** -> Tạm ẩn trong phiên làm việc hiện tại (`sessionStorage`), mở lại ứng dụng phiên sau sẽ tiếp tục nhắc nhở.
- [x] Đã hoàn thành 100%

---

## 7. Giai đoạn 14: Tối Ưu Hóa & Dọn Dẹp Mã Nguồn Dư Thừa (Dead Code Cleanup)
- **Bối cảnh & Vấn đề:** Hệ thống sau nhiều giai đoạn nâng cấp tồn tại một số đoạn mã dự phòng (fallback) không còn cần thiết, các cờ trạng thái trùng lặp (`must_change_password` và `is_first_login`), và thẻ kỹ thuật lâm sàng `[NO_MAKEUP]` chưa được lọc sạch khi gửi email cho bệnh nhân.
- **Giải pháp:**
  - Thống nhất cờ bắt buộc đổi mật khẩu thành 1 chuẩn duy nhất `must_change_password` trên toàn bộ hệ thống (`sql/01_schema.sql`, `backend/main.py`, `frontend/app.js`).
  - Dọn sạch các khối `try/catch` lồng nhau phức tạp trong các hàm phê duyệt admin và đặt lại mật khẩu trong `backend/main.py`.
  - Cập nhật hàm `get_clean_instruction` trong `backend/notifier.py` lọc bỏ cả thẻ `[NO_MAKEUP]` để nội dung email bệnh nhân luôn trong sáng, chuẩn y khoa.
  - Lưu trực tiếp giá trị `allow_makeup` vào cột bảng `prescriptions` trong cơ sở dữ liệu khi kê đơn.
  - Bump phiên bản Service Worker lên `dtd-shell-v18` và cập nhật thẻ asset version `?v=18`.
- [x] Đã hoàn thành 100%
---

## 8. Giai đoạn 15: Tinh Giản Cài Đặt Chung & Loại Bỏ Hoàn Toàn Tính Năng Gmail/Nhắc Thủ Công Dư Thừa
- **Bối cảnh & Yêu cầu:** 
  1. Người dùng yêu cầu loại bỏ 3 khối tính năng không còn phù hợp trên giao diện Admin: "Trạng thái cấu hình Gmail SMTP", "Thử nghiệm gửi email", và "Kích hoạt gửi nhắc thủ công".
  2. Gom tính năng "Cài đặt khung giờ nhắc" thành tab chuyên biệt "Cài đặt chung" (General Settings).
  3. Dọn dẹp triệt để mã nguồn backend dư thừa liên quan đến các tính năng đã bỏ.
- **Giải pháp & Thực thi:**
  - **Giao diện (`frontend/admin.html`):** Đổi tên tab menu từ "Lịch nhắc" sang "Cài đặt chung" kèm icon bánh răng thiết lập. Loại bỏ bố cục 2 cột chứa các ô trạng thái Gmail, form gửi thử email và khối kích hoạt thủ công. Thiết kế lại phần "Khung giờ nhắc thuốc mặc định (Giờ VN)" trong card căn giữa sang trọng, tinh tế.
  - **Frontend Logic (`frontend/admin.js`):** Xóa các event listener và handler `onTestEmail()`, `onTriggerReminders()`. Đơn giản hóa `loadReminderSettings()` chỉ tập trung render các input chỉnh giờ.
  - **Backend API (`backend/main.py`):** Xóa bỏ các schema `TestEmailReq`, `TriggerReminderReq` cùng hai endpoints `@app.post("/api/admin/test-email")` và `@app.post("/api/admin/reminders/trigger")`.
---

## 9. Giai đoạn 16: Quản Lý Lịch Sử Bỏ Lỡ Thuốc Từng Bệnh Nhân & Biểu Đồ Thống Kê Giám Sát Tuân Thủ
- **Bối cảnh & Yêu cầu:**
  1. Khi nhiều bệnh nhân bỏ lỡ thuốc trong ngày, danh sách cảnh báo bị dồn ứ, bác sĩ khó kiểm soát riêng rẽ từng bệnh nhân đã bỏ lỡ những ngày nào. Yêu cầu thêm ô lịch sử bỏ lỡ theo ngày vào hồ sơ bệnh nhân.
  2. Nâng cấp màn hình thống kê (ảnh 3) với hệ thống biểu đồ trực quan (Chart.js) giúp bác sĩ nắm bắt ngay tỷ lệ tuân thủ, xu hướng theo ngày, top bệnh nhân bỏ lỡ và phản ứng phụ ADR.
- **Giải pháp & Thực thi:**
  - **Backend (`backend/main.py`):**
    - Endpoint `GET /api/admin/patients/{patient_id}/missed-history`: Lấy toàn bộ nhật ký bỏ lỡ của bệnh nhân kèm thông tin đơn thuốc và lý do.
    - Endpoint `GET /api/admin/stats/overview`: Tính toán các chỉ số tuân thủ, chuỗi thời gian biến thiên theo ngày, danh sách top bệnh nhân bỏ lỡ nhiều nhất và thống kê ADR.
  - **Frontend Giao diện (`frontend/admin.html`):**
    - Thêm modal `#dlg-missed-history` có bộ lọc thời gian và phân nhóm thẻ theo ngày.
    - Thêm nút "📋 Lịch sử bỏ lỡ" trong bảng bệnh nhân và khối "Lịch sử bỏ lỡ gần đây" trong modal chi tiết bệnh nhân.
    - Thiết kế lại trang `#v-stats` với 4 thẻ KPI và 5 canvas biểu đồ Chart.js (Doughnut tuân thủ, Bar biến thiên theo ngày, Horizontal Bar top bỏ lỡ, Doughnut mức độ ADR, Horizontal Bar triệu chứng).
  - **Frontend Logic (`frontend/admin.js`):**
    - Viết hàm `openMissedHistory(patient)` nhóm cữ bỏ lỡ theo ngày kèm lý do chi tiết.
    - Viết hàm `renderMissedList()` có ô tìm kiếm lọc nhanh bệnh nhân và click vào tên bệnh nhân để mở ngay lịch sử.
    - Viết hàm `loadStats()` khởi tạo các biểu đồ Chart.js tương tác, click vào thanh bệnh nhân mở ngay hồ sơ.
  - **Cache & Kiểm thử:** Bump Service Worker lên `dtd-shell-v20`, tài nguyên `?v=20`, kiểm tra cú pháp Python và JS đạt 100% không lỗi.
- [x] Đã hoàn thành 100%
