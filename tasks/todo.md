# Danh Sách Nhiệm Vụ Triển Khai (Todo List)

## Giai đoạn 1: Ràng Buộc Mật Khẩu Chữ & Số
- [x] **Task 1: Cập nhật hàm `validateNewPassword()` trong `frontend/common.js`**
  - **Mô tả:** Bắt buộc mật khẩu có ít nhất 1 chữ cái và 1 chữ số, từ 6 ký tự trở lên.
  - **Tiêu chí nghiệm thu:** Đặt mật khẩu chỉ có số hoặc chỉ có chữ sẽ bị chặn với thông báo lỗi rõ ràng.
- [x] **Task 2: Hiển thị dòng hướng dẫn yêu cầu mật khẩu trên giao diện `frontend/index.html`**
  - **Mô tả:** Thêm dòng ghi chú: *"Yêu cầu: Từ 6 ký tự trở lên, bao gồm cả chữ và số (ví dụ: Matkhau123)"* tại cả 2 form đổi mật khẩu.
  - **Tiêu chí nghiệm thu:** Người dùng thấy rõ yêu cầu trước khi gõ.

## Giai đoạn 2: Tách Cụm Nút Thử Nghiệm Sang Ô Riêng Biệt
- [x] **Task 3: Dọn dẹp thanh cữ thuốc `#patient-push-box` tại Tab Hôm nay**
  - **Mô tả:** Bỏ 2 nút thử nghiệm khỏi Tab Hôm nay, chỉ giữ lại nút chính "Bật/Tắt chuông".
  - **Tiêu chí nghiệm thu:** Màn hình Hôm nay gọn gàng, không bị rối mắt bởi các nút test.
- [x] **Task 4: Tạo Card riêng "Khu vực Thử nghiệm Chức năng" trong Tab Tài khoản**
  - **Mô tả:** Tạo card riêng chứa nút "🔔 Thử rung chuông" và "📧 Thử gửi Email" kèm hướng dẫn.
  - **Tiêu chí nghiệm thu:** Các nút test nằm gọn trong ô riêng biệt ở Tab Tài khoản.

## Giai đoạn 3: Kiểm thử & Phân tích Cơ Chế Ghi Nhớ Thiết Bị
- [x] **Task 5: Kiểm tra cú pháp mã nguồn và kiểm thử hoạt động**
  - **Mô tả:** Chạy `node -c` xác thực file JS.
- [x] **Task 6: Giải thích chi tiết cơ chế ghi nhớ thiết bị cho người dùng**
