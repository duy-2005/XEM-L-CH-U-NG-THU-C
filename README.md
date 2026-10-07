# XEM-L-CH-U-NG-THU-C
## Hệ thống Nhắc nhở Tuân thủ Dùng thuốc & Báo cáo ADR Chủ động ở Bệnh nhân Đái tháo đường

Ứng dụng web tiến bộ (PWA) hỗ trợ bệnh nhân đái tháo đường theo dõi lịch uống thuốc/tiêm insulin, ghi nhận chỉ số đường huyết, báo cáo biến cố bất lợi của thuốc (ADR), cùng bảng điều khiển dành cho bác sĩ/dược sĩ lâm sàng.

---

### ✨ Tính năng nổi bật

1. **Bệnh nhân (Mobile-First PWA)**:
   - Nhắc lịch dùng thuốc từng khung giờ (Sáng, Trưa, Chiều, Tối, Trước ngủ).
   - Xác nhận nhanh đã uống/đã tiêm thuốc hoặc ghi nhận lý do quên thuốc.
   - **Xác nhận 1-chạm qua Email**: Bệnh nhân chỉ cần nhấn nút trong Email để ghi nhận vào hệ thống mà không cần đăng nhập app.
   - Báo cáo biến cố bất lợi của thuốc (ADR) nhanh chóng.
   - Theo dõi và lưu trữ chỉ số đường huyết (đói / sau ăn).
   - Hỗ trợ cài đặt trực tiếp vào màn hình chính điện thoại (PWA offline-ready).

2. **Bác sĩ & Quản trị viên (Desktop Dashboard)**:
   - Quản lý danh sách bệnh nhân và tạo đơn thuốc (thuốc uống, insulin, tần suất).
   - Tùy chỉnh linh hoạt khung giờ nhắc thuốc tự động trên giao diện web.
   - Hệ thống tự động gửi email nhắc thuốc theo lịch đã cấu hình.
   - Giám sát cảnh báo ADR theo thời gian thực và đánh giá ca phản ứng có hại của thuốc.
   - Thống kê tỷ lệ tuân thủ và xuất báo cáo.

---

### 🛠️ Công nghệ sử dụng

- **Frontend**: HTML5, Vanilla JavaScript, CSS3, Service Worker (PWA).
- **Backend**: FastAPI (Python 3.12 async), Uvicorn.
- **Cơ sở dữ liệu & Xác thực**: Supabase (PostgreSQL, Row-Level Security, GoTrue Auth).
- **Email Thông báo**: Gmail SMTP tích hợp chữ ký số HMAC-SHA256 bảo mật.
- **Đóng gói & Triển khai**: Docker, Docker Compose, Render, Railway.

---

### 🚀 Hướng dẫn chạy thử nghiệm cục bộ

1. **Cài đặt môi trường Python**:
   ```bash
   python3 -m venv .venv
   source .venv/bin/activate
   pip install -r requirements.txt
   ```

2. **Cấu hình biến môi trường**:
   - Sao chép file mẫu: `cp .env.example .env`
   - Điền các thông tin kết nối Supabase và tài khoản Gmail.

3. **Khởi chạy ứng dụng**:
   ```bash
   uvicorn main:app --app-dir backend --host 0.0.0.0 --port 8000
   ```
   - Truy cập giao diện bệnh nhân: `http://localhost:8000/`
   - Truy cập giao diện bác sĩ: `http://localhost:8000/admin.html`
