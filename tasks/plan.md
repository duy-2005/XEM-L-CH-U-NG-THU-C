# Kế Hoạch Triển Khai: Sửa Lỗi Đổi Mật Khẩu Lần Đầu & Bổ Sung Nút Return

## 1. Tổng quan & Phân tích nguyên nhân gốc rễ (Root Cause Analysis)

### 1.1. Sai sót gây ra lỗi "Đã đổi mật khẩu nhưng chưa cập nhật hồ sơ, vui lòng thử lại":
- **Nguyên nhân kỹ thuật:** 
  - Trong mã nguồn `frontend/app.js` (dòng 574–579), hàm `onChangePassword` thực hiện cập nhật đồng thời 2 trường:
    ```javascript
    await sb.from('profiles').update({
      is_first_login: false,
      must_change_password: false,
    }).eq('id', profile.id);
    ```
  - Tuy nhiên, trên cơ sở dữ liệu Supabase thực tế đang chạy, bảng `public.profiles` hiện chỉ có cột `must_change_password: boolean`, **chưa có cột `is_first_login`** (mã lỗi `PGRST204: Could not find the 'is_first_login' column of 'profiles' in the schema cache`).
  - Do đó, lệnh đổi mật khẩu Auth (`sb.auth.updateUser`) thì đã thành công, nhưng lệnh cập nhật profile bảng `profiles` bị Supabase từ chối (HTTP 400), dẫn đến thông báo lỗi màu đỏ trên màn hình.
- **Giải pháp xử lý:**
  - **Tầng Frontend (`frontend/app.js`):** Xử lý tương thích thông minh (Graceful Fallback). Kiểm tra xem `is_first_login` có tồn tại trong `profile` hiện tại hay không trước khi gửi lên Supabase; luôn cập nhật `must_change_password: false`. Như vậy hệ thống sẽ hoạt động mượt mà 100% ngay lập tức mà không bao giờ bị lỗi 400 nữa.
  - **Tầng Database (Tùy chọn):** Hướng dẫn bổ sung câu lệnh SQL `alter table public.profiles add column if not exists is_first_login boolean not null default true;` vào Supabase SQL Editor nếu muốn đồng bộ schema.

### 1.2. Vấn đề thiếu nút Return (Thoát ra):
- **Hiện trạng:** Màn hình `view-change-pw` chỉ có duy nhất nút "Lưu mật khẩu". Nếu người dùng nhập nhầm tài khoản, quên mật khẩu cũ hoặc gặp lỗi mạng, họ hoàn toàn bị kẹt ở màn hình này không thể quay ra đăng nhập lại.
- **Giải pháp xử lý:**
  - Bổ sung nút quay lại ở màn hình `#view-change-pw`:
    - Cách 1: Nút "← Quay lại đăng nhập" (dạng link / button phụ bên dưới nút "Lưu mật khẩu").
    - Cách 2: Nút icon mũi tên quay lại ở góc trên card form.
  - Hành động khi bấm nút: Đăng xuất phiên hiện tại (`sb.auth.signOut()`), xóa các trường mật khẩu đang nhập, và chuyển người dùng về màn hình đăng nhập (`view-login`).

---

## 2. Danh Sách Nhiệm Vụ (Task List)

### Giai đoạn 1: Sửa lỗi cập nhật hồ sơ (Fix Bug Update Profile)
- [ ] **Task 1: Cập nhật hàm `onChangePassword` trong `frontend/app.js`**
  - **Mô tả:** Đảm bảo chỉ gửi các trường tồn tại trong bảng `profiles` (kiểm tra `if ('is_first_login' in profile)`), luôn cập nhật `must_change_password: false`.
  - **Tiêu chí nghiệm thu:** Đổi mật khẩu lần đầu thành công 100%, không bị báo lỗi "chưa cập nhật hồ sơ", chuyển mượt mà vào giao diện ứng dụng chính `enterApp()`.

### Giai đoạn 2: Bổ sung nút Return / Thoát ra (Add Return / Exit Button)
- [ ] **Task 2: Thêm nút Return vào giao diện `#view-change-pw` trong `frontend/index.html`**
  - **Mô tả:** Bổ sung nút "← Quay lại đăng nhập" với phong cách y tế cao cấp, dễ bấm trên mobile.
  - **Tiêu chí nghiệm thu:** Nút hiển thị rõ ràng, cân đối, chuẩn thiết kế mobile.
- [ ] **Task 3: Gắn sự kiện xử lý nút Return trong `frontend/app.js`**
  - **Mô tả:** Khi bấm Return, gọi `sb.auth.signOut()`, dọn dẹp các ô input và chuyển về màn hình `#view-login`.
  - **Tiêu chí nghiệm thu:** Bệnh nhân bấm nút Return lập tức thoát ra màn hình đăng nhập an toàn.

### Giai đoạn 3: Kiểm thử & Nghiệm thu
- [ ] **Task 4: Kiểm thử luồng End-to-End**
  - Tạo thử / kiểm tra với tài khoản mới: kiểm tra nút Return hoạt động đúng và luồng đổi mật khẩu thành công vào được app.

---

## 3. Rủi ro & Giải pháp phòng ngừa
| Rủi ro | Mức độ | Giải pháp |
|---|---|---|
| Bệnh nhân thoát ra nhưng phiên đăng nhập Auth vẫn còn lưu | Trung bình | Khi bấm Return, bắt buộc gọi `sb.auth.signOut()` để huỷ sạch session cũ trước khi về màn hình login |
| Supabase có hay không có cột `is_first_login` | Thấp | Code frontend tự động kiểm tra key tồn tại trước khi update, tương thích cả 2 trường hợp |
