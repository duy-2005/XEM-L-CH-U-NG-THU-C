# Kế Hoạch Triển Khai: Tùy Chỉnh Giờ Uống Tự Do Cho Từng Thuốc (Custom Medication Times)

## 1. Tổng quan & Mục tiêu

Nâng cấp hệ thống quản lý đơn thuốc để bác sĩ/dược sĩ có thể **tự do thiết lập giờ uống cụ thể (Time Picker) cho từng loại thuốc** khi nhập đơn, thay vì bị giới hạn bởi 5 khung giờ mặc định (Sáng, Trưa, Chiều, Tối, Trước ngủ):

1. **Giao diện kê đơn linh hoạt (Admin):**
   - Bác sĩ có thể nhập bất kỳ mốc giờ nào (ví dụ: `06:30`, `14:00`, `20:15`) bằng bộ chọn giờ `<input type="time">`.
   - Có sẵn các nút gợi ý nhanh (`07:00`, `11:30`, `16:30`, `19:00`, `21:30`) để thao tác nhanh chỉ bằng 1 chạm.
   - Các mốc giờ đã chọn hiển thị dạng thẻ tag trực quan (`[ ⏰ 06:30 ✕ ]`, `[ ⏰ 19:30 ✕ ]`), có thể bấm ✕ để xóa dễ dàng.
2. **Lưu trữ & Tương thích dữ liệu (Data Compatibility):**
   - Giờ uống cụ thể được mã hóa chuẩn hóa trong đơn thuốc `[TIMES:06:30,19:30]` kèm theo hướng dẫn sử dụng.
   - Tự động ánh xạ mốc giờ vào các cữ tương ứng (`sang`, `trua`, `chieu`, `toi`, `truoc_ngu`) để đảm bảo tính toàn vẹn và tuân thủ 100% cơ sở dữ liệu Supabase mà không làm vỡ các ràng buộc quan hệ hiện có.
3. **Hiển thị trực quan cho bệnh nhân (Patient App):**
   - Trên màn hình của bệnh nhân, từng cữ thuốc sẽ hiển thị rõ mốc giờ bác sĩ đã dặn: ví dụ **"⏰ 06:30 · Sáng"** hay **"⏰ 20:15 · Tối"**.
   - Thứ tự các cữ thuốc trong ngày được tự động sắp xếp theo thứ tự thời gian từ sáng đến tối.
4. **Nhắc nhở tự động chính xác từng phút (Backend Cron Notifier):**
   - Tiến trình nhắc nhở chạy nền `reminder_worker()` mỗi phút sẽ kiểm tra giờ thực tế của từng thuốc.
   - Đúng mốc giờ chỉ định (ví dụ `06:30`), hệ thống sẽ gửi Web Push thông báo ra màn hình điện thoại và gửi Email nhắc thuốc tới bệnh nhân.

---

## 2. Danh Sách Nhiệm Vụ (Task List)

### Giai đoạn 1: Giao diện Kê Đơn Tùy Chỉnh Giờ (Frontend Admin)
- [x] **Task 1: Cập nhật giao diện chọn giờ trong `frontend/admin.html`**
  - Thay thế danh sách checkbox cũ bằng khu vực chọn mốc giờ: Time input + Nút "Thêm giờ" + Các nút gợi ý nhanh + Vùng hiển thị tags mốc giờ đã chọn.
- [x] **Task 2: Xử lý logic chọn giờ và lưu đơn trong `frontend/admin.js`**
  - Quản lý danh sách mốc giờ dạng mảng `['06:30', '19:00']`.
  - Hàm tự động phân bổ mốc giờ vào các `frequency` slot tương ứng.
  - Lưu mã hóa `[TIMES:...]` vào `instruction` và hiển thị đẹp mắt trong danh sách đơn thuốc của bệnh nhân.

### Giai đoạn 2: Trải nghiệm Xem Lịch Thuốc của Bệnh Nhân (Frontend Patient App)
- [x] **Task 3: Hàm trích xuất giờ `parsePrescriptionTimes()` trong `frontend/common.js`**
  - Nhận diện thẻ `[TIMES:...]` từ đơn thuốc, trả về mốc giờ cụ thể cho từng cữ.
- [x] **Task 4: Hiển thị mốc giờ trên thẻ thuốc và sắp xếp thứ tự trong `frontend/app.js`**
  - Hiển thị badge mốc giờ `⏰ 06:30` trên từng cữ thuốc.
  - Sắp xếp các loại thuốc trong ngày theo đúng mốc giờ thời gian thực tế.

### Giai đoạn 3: Hệ Thống Nhắc Nhở Tự Động Theo Giờ Từng Thuốc (Backend)
- [x] **Task 5: Nâng cấp `check_and_send_reminders()` trong `backend/notifier.py`**
  - Kiểm tra giờ thực tế của từng đơn thuốc theo `parse_prescription_times()`.
  - Gửi thông báo Web Push và Email đúng vào phút chỉ định của từng loại thuốc.

---

## 3. Rủi ro & Giải pháp phòng ngừa
| Rủi ro | Mức độ | Giải pháp |
|---|---|---|
| Bác sĩ chọn 2 mốc giờ cùng rơi vào 1 khung buổi (ví dụ 07:00 và 08:00) | Trung bình | Tự động cảnh báo hoặc ánh xạ mốc giờ vào các cữ kế tiếp, đảm bảo mỗi mốc giờ có 1 bản ghi riêng trong nhật ký |
| Đơn thuốc cũ trước đây không có mốc giờ cụ thể | Thấp | Tự động fallback về giờ mặc định của hệ thống (`07:00`, `11:30`, `19:00`), đảm bảo 100% tương thích ngược |
