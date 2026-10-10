# Danh Sách Nhiệm Vụ Triển Khai (Todo List)

## Giai đoạn 1: Cơ sở Dữ liệu & Cấu hình Nền tảng
- [x] **Task 1.1: Migration Database cho `is_first_login` & RLS**
  - **Mô tả:** Cập nhật `sql/01_schema.sql` thêm cột `is_first_login boolean not null default true` vào `profiles`, cấp quyền update `is_first_login` cho bệnh nhân và trigger bảo vệ.
  - **Tiêu chí nghiệm thu:** Bảng `profiles` có cột `is_first_login`; bệnh nhân có thể update cờ này sau khi đổi mật khẩu; RLS không bị vi phạm.
- [x] **Task 1.2: Bổ sung thư viện & biến môi trường VAPID / Alert**
  - **Mô tả:** Cập nhật `requirements.txt` (thêm `pywebpush`, `cryptography`), bổ sung `DOCTOR_ALERT_EMAIL` và xử lý VAPID key trong `backend/config.py` và `.env.example`.
  - **Tiêu chí nghiệm thu:** Cài đặt dependencies không lỗi; `config.py` đọc đúng VAPID keys và `doctor_alert_email`.

### Checkpoint 1: Database và môi trường sẵn sàng. (Đạt)

---

## Giai đoạn 2: Xác thực & Quản lý Đăng nhập (Tính năng 1 & 2)
- [x] **Task 2.1: Admin Google OAuth & Hệ thống Phê duyệt Quản trị viên (Approval Workflow)**
  - **Mô tả:**
    - Cung cấp nút "Đăng nhập với Google" qua Google OAuth Supabase trên `admin.html`.
    - Phân quyền: Cột `is_approved`, `approval_status` trong `profiles`. Hàm RLS `is_admin()` và backend `require_admin` chặn người dùng chưa được duyệt.
    - Màn hình `#view-approval` cho tài khoản chưa duyệt với nút "Gửi yêu cầu xin duyệt" (`POST /api/admin/request-approval`).
    - Phê duyệt 2 chiều:
      1. Email link 1-click có ký số HMAC 48h (`GET /api/admin/approve-account?token=...`).
      2. Tab "🛡️ Duyệt Admin" trực tiếp trong `admin.html` (`GET /api/admin/pending-approvals`, `POST /api/admin/approve-user`).
  - **Tiêu chí nghiệm thu:** Đăng nhập Google mượt mà; tài khoản chưa duyệt bị chặn vào Dashboard; gửi email duyệt tới Super Admin; duyệt qua email hoặc dashboard thành công và gửi mail chúc mừng.
- [x] **Task 2.2: Persistent Login & Bắt buộc Đổi Mật khẩu với `is_first_login`**
  - **Mô tả:** Trong `frontend/app.js`, đảm bảo Supabase client duy trì phiên lâu dài (`persistSession: true`); khi đăng nhập kiểm tra `is_first_login`. Nếu `true`, chuyển thẳng tới form đổi mật khẩu; đổi thành công thì cập nhật `is_first_login = false`.
  - **Tiêu chí nghiệm thu:** Đóng trình duyệt mở lại vẫn giữ đăng nhập; tài khoản mới bắt buộc đổi mật khẩu mới vào được app.

### Checkpoint 2: Xác thực Google OAuth, phê duyệt quản trị viên và phiên đăng nhập bệnh nhân hoàn tất. (Đạt)

---

## Giai đoạn 3: Trải nghiệm Bệnh nhân (Tính năng 3 & 4)
- [x] **Task 3.1: Ngôn ngữ ADR Dễ hiểu & Neo Hành vi**
  - **Mô tả:** Cập nhật `frontend/common.js` và `frontend/index.html` thay các thuật ngữ lâm sàng ("Hạ đường huyết", "Phát ban", "Tiêu chảy") thành các mô tả triệu chứng dân dã dễ hiểu, và thêm các neo hành vi vào 3 mức độ nhẹ, vừa, nặng.
  - **Tiêu chí nghiệm thu:** Giao diện hiển thị đúng thuật ngữ; gửi báo cáo lưu đúng dữ liệu; admin dashboard hiển thị mượt mà.
- [x] **Task 3.2: Logic Quá hạn Thuốc 1 Tiếng & Cho Phép Uống Bù**
  - **Mô tả:** Trong `frontend/app.js` và `backend/notifier.py`, kiểm tra thời gian hiện tại so với giờ cữ thuốc. Nếu quá 60 phút mà chưa uống, tự động đánh dấu "Bỏ lỡ"; khi bệnh nhân uống bù và bấm vào thẻ, hệ thống chuyển trạng thái về "Đã dùng" (`taken`) và xóa cảnh báo.
  - **Tiêu chí nghiệm thu:** Thẻ thuốc sau 1 tiếng hiển thị "Bỏ lỡ"; bấm uống bù cập nhật thành công thành "Đã uống".

### Checkpoint 3: Giao diện bệnh nhân thân thiện và logic tuân thủ thuốc thông minh. (Đạt)

---

## Giai đoạn 4: Quản trị & Xóa Dữ liệu (Tính năng 5)
- [x] **Task 4.1: API Xóa Bệnh nhân & Đơn thuốc (Cascade Delete)**
  - **Mô tả:** Tạo endpoint `DELETE /api/admin/patients/{patient_id}` và `DELETE /api/admin/prescriptions/{prescription_id}` trong `backend/main.py`. Kiểm tra quyền admin và thực hiện xóa cascade triệt để.
  - **Tiêu chí nghiệm thu:** Xóa bệnh nhân dọn sạch hồ sơ, đơn thuốc và lịch sử; xóa đơn thuốc dọn sạch daily_logs tương ứng.
- [x] **Task 4.2: Giao diện Nút Xóa trên Admin Dashboard**
  - **Mô tả:** Trong `frontend/admin.html` và `frontend/admin.js`, thêm nút "Xóa" cạnh mỗi bệnh nhân và nút "Xóa đơn" cạnh mỗi đơn thuốc, có hộp thoại xác nhận trước khi xóa.
  - **Tiêu chí nghiệm thu:** Thao tác xóa hoạt động trơn tru từ giao diện admin, có xác nhận phòng ngừa xóa nhầm.

### Checkpoint 4: Admin quản lý và dọn dẹp dữ liệu an toàn. (Đạt)

---

## Giai đoạn 5: Cảnh báo Thời gian Thực (Tính năng 6 & 7)
- [x] **Task 5.1: Gửi Email Cảnh báo Khẩn cấp qua Gmail SMTP**
  - **Mô tả:** Trong `backend/main.py` và `backend/notifier.py`, tạo pipeline tiếp nhận ADR / Đường huyết từ bệnh nhân (`/api/patient/adr`, `/api/patient/blood-sugar`); nếu có ADR hoặc Đường huyết > 13.9 mmol/L, kích hoạt gửi email khẩn cấp đến Bác sĩ với template HTML y tế cảnh báo.
  - **Tiêu chí nghiệm thu:** Bệnh nhân ghi nhận chỉ số cao (>13.9) hoặc gửi ADR -> Bác sĩ nhận được email khẩn cấp chứa đầy đủ thông tin.
- [x] **Task 5.2: Triển khai Web Push Notifications với VAPID**
  - **Mô tả:**
    - Backend: Dùng `pywebpush` gửi push payload bảo mật với VAPID keys; thêm endpoint đăng ký subscription `POST /api/admin/push-subscription`.
    - Frontend: `admin.html` + `admin.js` thêm nút đăng ký thông báo; `service-worker.js` xử lý hiển thị push và định tuyến click về trang quản trị.
  - **Tiêu chí nghiệm thu:** Bác sĩ bật thông báo -> Khi có ca khẩn cấp, máy tính/điện thoại bác sĩ nhận ngay thông báo đẩy trên màn hình.

### Checkpoint 5: Toàn bộ 7 tính năng đã hoàn thành và kiểm thử thành công! (Đạt)
