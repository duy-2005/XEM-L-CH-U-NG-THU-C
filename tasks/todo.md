# Danh Sách Nhiệm Vụ Triển Khai (Todo List)

## Giai đoạn 1: Sửa lỗi cập nhật hồ sơ khi đổi mật khẩu
- [x] **Task 1: Cập nhật hàm `onChangePassword` trong `frontend/app.js`**
  - **Mô tả:** Thay đổi payload gửi lên `profiles` thành payload tương thích linh hoạt: luôn cập nhật `must_change_password: false`, chỉ kèm `is_first_login: false` nếu thuộc tính này có trong `profile`.
  - **Tiêu chí nghiệm thu:** Không bị lỗi PGRST204 400 từ Supabase; cập nhật profile thành công sau khi đổi mật khẩu.

## Giai đoạn 2: Bổ sung nút Return / Thoát ra ở màn hình Đặt mật khẩu mới
- [x] **Task 2: Thêm nút Return trong `frontend/index.html`**
  - **Mô tả:** Bổ sung nút quay lại "← Quay lại đăng nhập" bên dưới nút "Lưu mật khẩu" trong form `#force-pw-form` ở `#view-change-pw`.
  - **Tiêu chí nghiệm thu:** Giao diện cân đối, nút nổi bật, dễ bấm trên màn hình điện thoại.
- [x] **Task 3: Gắn sự kiện đăng xuất và điều hướng cho nút Return trong `frontend/app.js`**
  - **Mô tả:** Bắt sự kiện click nút `#force-pw-back`, gọi `await sb.auth.signOut()`, xóa form và chuyển sang `showView('login')`.
  - **Tiêu chí nghiệm thu:** Nhấn nút sẽ thoát ngay về màn hình đăng nhập an toàn.

## Checkpoint Nghiệm thu
- [x] Chạy kiểm thử tự động / kiểm tra cú pháp mã nguồn
- [x] Xác nhận luồng: Bệnh nhân đăng nhập lần đầu -> có thể bấm Return thoát ra ngoài, hoặc nhập mật khẩu mới và lưu thành công không còn lỗi đỏ.
