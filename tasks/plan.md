# Kế Hoạch Triển Khai: Ràng Buộc Mật Khẩu Chữ & Số, Gom Cụm Nút Test & Giải Thích Cơ Chế Ghi Nhớ Thiết Bị

## 1. Tổng quan & Mục tiêu

Thực hiện 3 nội dung theo yêu cầu của người dùng:

1. **Ràng buộc Mật khẩu Mới bao gồm cả CHỮ và SỐ:**
   - Cập nhật hàm `validateNewPassword` để bắt buộc mật khẩu phải có ít nhất 1 chữ cái (`[a-zA-Z]`) và ít nhất 1 chữ số (`[0-9]`), độ dài tối thiểu 6 ký tự.
   - Thêm dòng chú thích/hướng dẫn rõ ràng ngay dưới các ô nhập mật khẩu: *"Yêu cầu: Từ 6 ký tự trở lên, bao gồm cả chữ cái và chữ số (ví dụ: Matkhau123)"* ở cả 2 form (Lần đầu đăng nhập bắt buộc đổi và Đổi mật khẩu trong Tab Tài khoản).
2. **Tách cụm nút Thử nghiệm (Test) ra khỏi lịch nhắc thuốc:**
   - Dọn sạch giao diện thẻ cữ thuốc `#patient-push-box` ở tab **"Hôm nay"**: Chỉ giữ lại nút bật/tắt chuông chính để bệnh nhân không bị rối mắt.
   - Chuyển toàn bộ các nút thử nghiệm (*"📧 Thử gửi Email"* và *"🧪 Thử chuông"*) sang một **Hộp thoại/Card kiểm tra chức năng riêng biệt** trong Tab **"Tài khoản"** (*"🧪 Khu vực thử nghiệm & Kiểm tra thông báo"*).
3. **Giải thích cặn kẽ cơ chế Kỹ thuật: "Hệ thống nhớ thiết bị đăng nhập như thế nào?":**
   - Phân tích cơ chế Session JWT trong `localStorage` của trình duyệt.
   - Phân tích cơ chế Định danh Thiết bị đẩy (Device Push Endpoint) qua bảng `push_subscriptions`.

---

## 2. Kế Hoạch Nhiệm Vụ (Task List)

### Giai đoạn 1: Ràng Buộc Mật Khẩu Chữ & Số
- [ ] **Task 1: Cập nhật `validateNewPassword()` trong `frontend/common.js`**
  - Kiểm tra regex có chữ cái và chữ số.
- [ ] **Task 2: Thêm dòng hướng dẫn yêu cầu mật khẩu trên giao diện `frontend/index.html`**
  - Hiển thị dòng ghi chú ở `#force-pw-form` và `#pw-form`.

### Giai đoạn 2: Tách Cụm Nút Thử Nghiệm Sang Ô Riêng Biệt
- [ ] **Task 3: Dọn dẹp thẻ `#patient-push-box` tại Tab Hôm nay (`frontend/index.html`)**
  - Xóa 2 nút test khỏi thanh cữ thuốc, chỉ giữ nút chính "Bật chuông".
- [ ] **Task 4: Tạo Card "Khu vực Thử nghiệm & Kiểm tra" trong Tab Tài khoản (`frontend/index.html` & `frontend/app.js`)**
  - Gom các nút thử email và thử chuông vào ô riêng biệt, có giải thích rõ ràng đây là khu vực dành cho người dùng/bác sĩ test thử.

### Giai đoạn 3: Phân Tích & Giải Thích Cơ Chế Ghi Nhớ Thiết Bị
- [ ] **Task 5: Trình bày chi tiết cơ chế nhận diện và lưu vết thiết bị đăng nhập**

---

## 3. Rủi ro & Giải pháp phòng ngừa
| Rủi ro | Giải pháp |
|---|---|
| Bệnh nhân đặt mật khẩu quá phức tạp rồi quên | Đưa ví dụ gợi ý dễ nhớ (chữ + số quen thuộc, vd: `thuoc123`), có hỗ trợ bác sĩ đặt lại mật khẩu từ Admin |
| Chuyển nút test khiến người dùng không tìm thấy | Đặt trong Tab Tài khoản với tiêu đề nổi bật có icon `🧪` rõ nét |
