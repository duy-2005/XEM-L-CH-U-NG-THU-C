# Danh sách việc

## Giai đoạn 1: Nền tảng
- [x] **T1 (M) SQL schema + RLS** (`sql/01_schema.sql`): 5 bảng + `push_subscriptions`, `reminder_log`; cột `frequency`, `must_change_password`; trigger chặn đổi `role`; hàm `is_admin()`.
- [x] **T2 (M) Khung FastAPI** (`backend/`): cấu hình, xác thực JWT + `require_admin`, CORS chặt, security headers, rate limit, phục vụ file tĩnh khi chạy local.

### Checkpoint 1: chạy được backend + DB, RLS đúng.

## Giai đoạn 2: Tính năng (lát cắt dọc)
- [x] **T3 (M) Admin tạo bệnh nhân + đăng nhập mã BN**: `POST /api/admin/patients` (mã BN, họ tên, sđt, email tùy chọn, mật khẩu 123456, ép đổi).
- [x] **T4 (M) PWA** (`manifest.json`, `service-worker.js`, icon): cache shell, không cache API/dữ liệu y tế.
- [x] **T5 (L→2 phần) App bệnh nhân**: (a) đăng nhập/đổi mật khẩu + dashboard thuốc theo khung giờ + Đã uống/Bỏ lỡ; (b) form đường huyết + Chart.js 7 ngày + form ADR.
- [x] **T6 (M) Admin dashboard**: Alert Center (ADR nặng, thuốc bỏ lỡ), danh sách bệnh nhân, thêm đơn thuốc, thống kê ADR.

### Checkpoint 2: luồng đầu-cuối bệnh nhân ↔ admin chạy được.

## Giai đoạn 3: Thông báo & triển khai
- [x] **T7 (M) Nhắc thuốc**: Chạy tiến trình ngầm kiểm tra đúng giờ mỗi phút, email Gmail SMTP, cấu hình giờ linh hoạt qua .env, nút test & gửi thủ công trên Admin Dashboard.
- [ ] **T8 (S) Triển khai & rà soát bảo mật**: hướng dẫn Cloudflare Pages + Render + cron; audit dependency; xoay khóa `sb_secret`.

### Checkpoint 3: toàn bộ tiêu chí đạt, sẵn sàng dùng thật.
