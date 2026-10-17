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

## Giai đoạn 4: Trải Nghiệm Thẻ Thuốc Đã Uống
- [x] **Task 7: Làm tối màu và vô hiệu hóa nút bấm đối với cữ thuốc đã uống**
  - **Mô tả:** Thẻ thuốc đã uống chuyển sang màu xám trầm, giảm độ sáng (opacity 0.72), nút chuyển xám và disabled, ngăn người dùng bấm nhầm.

## Giai đoạn 5: Tích Hợp GSAP từ `gsap-public`
- [x] **Task 8: Sao chép `gsap.min.js` vào `frontend/` và cấu hình PWA offline**
  - **Mô tả:** Copy từ `/Users/acc/Downloads/gsap-public/minified/gsap.min.js` vào `frontend/gsap.min.js`, thêm vào cache của Service Worker và nhúng vào `index.html`.
  - **Tiêu chí nghiệm thu:** `window.gsap` khả dụng ngay cả khi mất mạng.

## Giai đoạn 6: Thay Thế Emoji Kiểu AI Bằng Icon Vector SVG Y Tế
- [x] **Task 9: Thay thế emoji thanh điều hướng đáy và các tiêu đề chính**
  - **Mô tả:** Thay thế 💊, 🩸, ⚠️, 👤, 🔔, 🧪, 💡 bằng icon SVG vector chuẩn Apple Health / Heroicons thanh lịch.
  - **Tiêu chí nghiệm thu:** Giao diện chuyên nghiệp, không còn các emoji hoạt hình gây cảm giác AI.
- [x] **Task 10: Thay thế emoji trong thẻ thuốc và hộp thoại**
  - **Mô tả:** Bỏ ⏰, 💉, 🎉; thay bằng badge icon đồng hồ SVG, nhãn y khoa tinh giản, và checkmark chuẩn.

## Giai đoạn 7: Thiết Kế Hiệu Ứng GSAP Tinh Tế & Sang Trọng
- [x] **Task 11: Hoạt ảnh chuyển Tab mượt mà (Cross-fade & Slide)**
  - **Mô tả:** Dùng GSAP làm hiệu ứng chuyển giữa Hôm nay, Đường huyết, Tác dụng phụ, Tài khoản một cách êm ái.
- [x] **Task 12: Hoạt ảnh xuất hiện thẻ thuốc tuần tự (Stagger Entrance)**
  - **Mô tả:** Khi mở app hoặc chọn ngày, các thẻ thuốc trượt nhẹ từ dưới lên cách nhau 0.05s.
- [x] **Task 13: Hoạt ảnh xác nhận uống thuốc và thanh tiến độ**
  - **Mô tả:** Khi bấm uống thuốc, thẻ chuyển màu xám êm dịu và thanh % lướt mượt mà với GSAP tween.

## Giai đoạn 8: Kiểm Thử & Nghiệm Thu
- [x] **Task 14: Kiểm tra cú pháp và trải nghiệm người dùng trên trình duyệt**

## Giai đoạn 9: Phỏng Vấn & Định Hướng Phong Cách Thiết Kế Mới
- [x] **Task 15: Phỏng vấn sở thích thẩm mỹ của người dùng để hiểu 100% mong muốn**
  - **Mô tả:** Hỏi người dùng lựa chọn phong cách trực quan (Swiss Medical tinh giản hay Modern Card chiều sâu), bảng màu Header và độ tương phản.
  - **Tiêu chí nghiệm thu:** Đã chốt: Phong cách Swiss Medical tinh giản, Header phẳng Clean Clinic sang trọng, đồng bộ cả Patient & Admin.

## Giai đoạn 10: Tái Thiết Kế Giao Diện Theo Chuẩn Y Tế Cao Cấp
- [x] **Task 16: Tinh chỉnh Design Tokens và CSS Variables (`frontend/styles.css`)**
  - **Mô tả:** Nâng cấp đổ bóng đa tầng, đường viền 1px tinh xảo, màu chữ WCAG AAA, bo góc hiện đại.
- [x] **Task 17: Nâng cấp bố cục hiển thị màn hình bệnh nhân (`frontend/index.html`)**
  - **Mô tả:** Làm lại header phẳng sang trọng, thanh tiến độ thuốc, khung đo đường huyết và thẻ báo cáo triệu chứng.
- [x] **Task 18: Tinh chỉnh giao diện trang bác sĩ (`frontend/admin.html`)**
  - **Mô tả:** Đồng bộ thiết kế trang quản trị viên/bác sĩ chuẩn phòng khám quốc tế.
- [x] **Task 19: Kiểm thử thẩm mỹ trên thiết bị di động và kiểm tra tính toàn vẹn chức năng**
  - **Mô tả:** Đã kiểm tra cú pháp node -c toàn bộ file JS, bảo toàn 100% ID DOM, sự kiện và tương tác.
