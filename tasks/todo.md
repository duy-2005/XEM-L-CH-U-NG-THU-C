# Danh Sách Nhiệm Vụ Triển Khai (Todo List)

## Giai đoạn 1: Giao diện Kê Đơn Tùy Chỉnh Giờ (Frontend Admin)
- [x] **Task 1: Cập nhật giao diện chọn giờ trong `frontend/admin.html`**
  - **Mô tả:** Thay thế khu vực checkbox bằng bộ chọn giờ: `<input type="time">`, nút "Thêm giờ", các nút chọn nhanh (`+ 07:00`, `+ 11:30`, `+ 16:30`, `+ 19:00`, `+ 21:30`), và danh sách mốc giờ đã chọn dưới dạng tag có nút xóa ✕.
  - **Tiêu chí nghiệm thu:** Bác sĩ chọn được giờ bất kỳ hoặc bấm nút nhanh, mốc giờ xuất hiện trong danh sách tags.

- [x] **Task 2: Xử lý logic chọn giờ và lưu đơn trong `frontend/admin.js`**
  - **Mô tả:** Quản lý state danh sách giờ (`selectedTimes`). Ánh xạ giờ sang các slot cữ tương ứng (`sang`, `trua`, `chieu`, `toi`, `truoc_ngu`). Lưu `[TIMES:06:30,19:00]` vào `instruction` và hiển thị trực quan trong danh sách đơn thuốc.
  - **Tiêu chí nghiệm thu:** Lưu đơn thuốc thành công vào Supabase với mốc giờ tùy chỉnh.

## Giai đoạn 2: Trải nghiệm Xem Lịch Thuốc của Bệnh Nhân (Frontend Patient App)
- [x] **Task 3: Hàm trích xuất giờ `parsePrescriptionTimes()` trong `frontend/common.js`**
  - **Mô tả:** Hàm bóc tách chuỗi `[TIMES:06:30,19:00]` để lấy danh sách giờ cụ thể cho từng cữ thuốc; hỗ trợ tương thích ngược với đơn cũ.
  - **Tiêu chí nghiệm thu:** Đơn có giờ tùy chỉnh trả về đúng giờ; đơn cũ trả về giờ mặc định.

- [x] **Task 4: Hiển thị mốc giờ trên thẻ thuốc và sắp xếp thứ tự trong `frontend/app.js`**
  - **Mô tả:** Thẻ thuốc của bệnh nhân hiển thị rõ ràng: `⏰ 06:30 · Cữ sáng`. Sắp xếp danh sách thuốc trong ngày theo đúng mốc giờ thời gian thực tế.
  - **Tiêu chí nghiệm thu:** Bệnh nhân thấy rõ mốc giờ 06:30 và thuốc được xếp theo trình tự thời gian từ sớm đến muộn.

## Giai đoạn 3: Hệ Thống Nhắc Nhở Tự Động Theo Giờ Từng Thuốc (Backend)
- [x] **Task 5: Nâng cấp `check_and_send_reminders()` trong `backend/notifier.py`**
  - **Mô tả:** Tiến trình ngầm so khớp giờ hiện tại với giờ cụ thể của từng loại thuốc. Nếu trùng khớp, gửi thông báo Web Push và Email nhắc thuốc đúng phút.
  - **Tiêu chí nghiệm thu:** Đúng giờ hẹn của từng thuốc, hệ thống phát thông báo nhắc thuốc cụ thể.

## Checkpoint Nghiệm thu
- [x] Kiểm tra cú pháp Javascript và Python (`node -c`, `python3 -m py_compile`)
- [x] Sẵn sàng kiểm thử thêm đơn thuốc tùy chỉnh giờ và nhắc nhở đúng phút
