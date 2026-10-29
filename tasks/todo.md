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

## Giai đoạn 11: Tinh Chỉnh Avatar, Đăng Nhập & Bố Cục Thẻ Cữ Thuốc
- [x] **Task 20: Phỏng vấn làm rõ 100% yêu cầu về thẻ thuốc và màn hình đăng nhập**
  - **Mô tả:** Đặt câu hỏi qua `ask_question` và đã chốt 100% với người dùng.
- [x] **Task 21: Cắt và thay thế bộ Avatar / Icon PWA 192x192, 512x512, apple-touch-icon**
  - **Mô tả:** Dùng `sips` chuyển đổi ảnh y tế 3D thành bộ icon PNG chuẩn 512x512, 192x192, 180x180 cho web và PWA.
- [x] **Task 22: Xóa gợi ý placeholder ở màn hình đăng nhập (`frontend/index.html`)**
  - **Mô tả:** Làm sạch các ô nhập liệu, xóa bỏ chữ mờ "Ví dụ: BN0001" và "••••••", loại bỏ badge checkmark che icon.
- [x] **Task 23: Tinh giản thẻ thuốc: khắc phục thừa số 07:00, nút Bỏ lỡ và trùng lặp Uống bù (`frontend/app.js`)**
  - **Mô tả:** Gộp badge thời gian thành `07:00 · Sáng`, ẩn nút "Bỏ lỡ" khi thẻ đã ở trạng thái bỏ lỡ, bỏ nút lặp trong khung cảnh báo vàng, chỉ giữ 1 nút "Uống bù ngay" duy nhất.
- [x] **Task 24: Kiểm thử hiển thị, xác thực cú pháp và kiểm tra PWA**
  - **Mô tả:** Đã kiểm tra cú pháp node -c thành công, bump cache Service Worker lên `dtd-shell-v15`.

## Giai đoạn 12: Thiết Lập An Toàn Dược Lâm Sàng – Quy Tắc Quên Liều (Clinical Missed Dose Protocol)
- [x] **Task 25: Phỏng vấn xác nhận 100% nguyên tắc lâm sàng và giao diện hiển thị**
  - **Mô tả:** Đã phỏng vấn qua `ask_question`, xác nhận mô hình dược lâm sàng: Mặc định bật checkbox "Cho phép uống bù nếu quên liều" (Bác sĩ bỏ chọn với nhóm kích thích tiết Insulin/Insulin bữa ăn) và phía bệnh nhân hiển thị cảnh báo đỏ/cam chống hạ đường huyết kèm nút "Đã hiểu & Bỏ qua liều này".
- [x] **Task 26: Thêm tùy chọn "Xử trí khi quên liều" trong form kê đơn Bác sĩ (`frontend/admin.html` & `frontend/admin.js`)**
  - **Mô tả:** Đã thêm checkbox `#rx-allow-makeup` trong form kê đơn Bác sĩ kèm chú thích dược lý. Tự động mã hóa thẻ an toàn `[NO_MAKEUP]` vào trường `instruction` và hiển thị huy hiệu lâm sàng tương ứng ở danh sách đơn thuốc.
- [x] **Task 27: Triển khai cảnh báo an toàn & ẩn nút uống bù đối với thuốc cấm uống bù (`frontend/app.js` & `frontend/common.js`)**
  - **Mô tả:** Đã viết hàm `canPrescriptionMakeUp()`. Phía bệnh nhân: nếu thuốc cấm uống bù và trễ > 1 tiếng hoặc ở trạng thái bỏ lỡ, hệ thống khóa hoàn toàn nút uống bù, hiển thị cảnh báo lâm sàng nổi bật (tránh nguy cơ hạ đường huyết nguy hiểm) và cung cấp nút bấm "Đã hiểu & Bỏ qua liều này" để đồng bộ dữ liệu về cho Bác sĩ.
- [x] **Task 28: Cập nhật cơ sở dữ liệu `sql/01_schema.sql`, kiểm thử luồng lâm sàng và bump cache**
  - **Mô tả:** Bổ sung cột `allow_makeup` trong `sql/01_schema.sql`, bump Service Worker lên `dtd-shell-v16`, kiểm tra cú pháp toàn bộ JS đạt 100% không lỗi.

## Giai đoạn 13: Hộp Thoại Nhắc Duyệt Chuông Khi Đổi Thiết Bị (Device Push Permission Onboarding Modal)
- [x] **Task 29: Phỏng vấn làm rõ 100% hành vi giao diện modal và nút Bỏ qua**
  - **Mô tả:** Đã phỏng vấn người dùng qua `ask_question`, chốt phương án hiển thị Hộp thoại Modal trung tâm có backdrop và ghi nhớ tạm ẩn trong phiên hiện tại (`sessionStorage`).
- [x] **Task 30: Thêm cấu trúc Modal `#dlg-push-permission` trong `frontend/index.html`**
  - **Mô tả:** Đã thiết kế dialog nổi bật giữa màn hình với icon chuông, lời nhắn nhắc nhở nguy cơ quên thuốc khi đổi máy, nút "Duyệt thông báo ngay" và "Bỏ qua (Để sau)".
- [x] **Task 31: Xử lý logic kiểm tra và kích hoạt thông báo trong `frontend/app.js`**
  - **Mô tả:** Đã bổ sung `openPushPermissionModal()`, `closePushPermissionModal()`, `enablePatientPush()`. Tự động kiểm tra khi vào app và chỉ hiện modal nếu máy chưa duyệt chuông và chưa bấm bỏ qua trong phiên hiện tại (`sessionStorage`).
- [x] **Task 32: Kiểm thử, bump cache PWA lên v17 và xác thực cú pháp**
  - **Mô tả:** Bump Service Worker lên `dtd-shell-v17`, asset tags `?v=17`, cú pháp `node -c` toàn bộ file JS kiểm tra thành công 0 lỗi.

## Giai đoạn 14: Tối Ưu Hóa & Dọn Dẹp Mã Nguồn Dư Thừa (Dead Code Cleanup)
- [x] **Task 33: Khảo sát đối chiếu toàn diện Backend, Frontend và Database**
  - **Mô tả:** Rà soát 25 endpoints trong `backend/main.py`, đối chiếu các lời gọi API từ frontend, kiểm tra logic xử lý và tham vấn ý kiến người dùng qua `ask_question`.
- [x] **Task 34: Chuẩn hóa cờ đổi mật khẩu lần đầu và loại bỏ khối try/catch dự phòng cũ**
  - **Mô tả:** Thống nhất dùng chuẩn `must_change_password` trên toàn hệ thống (`sql/01_schema.sql`, `backend/main.py`, `frontend/app.js`). Loại bỏ các khối try/catch fallback dự phòng nhiều tầng khi DB đã ổn định.
- [x] **Task 35: Chuẩn hóa lưu trữ quy tắc quên liều và làm sạch nhãn email**
  - **Mô tả:** Trong `frontend/admin.js`, lưu trực tiếp `allow_makeup` vào bảng `prescriptions`. Trong `backend/notifier.py`, mở rộng hàm `get_clean_instruction` để loại bỏ thẻ `[NO_MAKEUP]` ra khỏi nội dung email gửi bệnh nhân.
- [x] **Task 36: Kiểm thử cú pháp toàn diện, bump PWA cache lên v18**
  - **Mô tả:** Chạy `py_compile` và `node -c` xác thực 100% không lỗi cú pháp; bump cache Service Worker lên `dtd-shell-v18`.
## Giai đoạn 15: Tinh Giản Cài Đặt Chung & Loại Bỏ Hoàn Toàn Tính Năng Gmail/Nhắc Thủ Công Dư Thừa
- [x] **Task 37: Tái cấu trúc giao diện Admin sang "Cài đặt chung" (`frontend/admin.html`)**
  - **Mô tả:** Đổi tab sidebar từ "Lịch nhắc" sang "Cài đặt chung" kèm icon bánh răng thiết lập. Loại bỏ 3 khối dư thừa: "Trạng thái cấu hình Gmail SMTP", "Thử nghiệm gửi email", và "Kích hoạt gửi nhắc thủ công". Đưa cài đặt giờ nhắc mặc định vào card "Cài đặt chung" thanh lịch, cân đối.
- [x] **Task 38: Dọn dẹp logic giao diện và các event listener (`frontend/admin.js`)**
  - **Mô tả:** Xóa bỏ hoàn toàn các hàm `onTestEmail()`, `onTriggerReminders()` và các event listener liên quan. Tối ưu hàm `loadReminderSettings()` chỉ tập trung hiển thị và lưu cấu hình khung giờ.
- [x] **Task 39: Xóa bỏ các API endpoint và Pydantic schema mồ côi (`backend/main.py`)**
  - **Mô tả:** Xóa bỏ `TestEmailReq`, `TriggerReminderReq` cùng hai endpoints `@app.post("/api/admin/test-email")` và `@app.post("/api/admin/reminders/trigger")`.
## Giai đoạn 16: Quản Lý Lịch Sử Bỏ Lỡ Thuốc Từng Bệnh Nhân & Biểu Đồ Thống Kê Giám Sát Tuân Thủ
- [x] **Task 41: Bổ sung endpoint backend lấy lịch sử bỏ lỡ theo bệnh nhân & thống kê tổng quan (`backend/main.py`)**
  - **Mô tả:** Thêm `GET /api/admin/patients/{patient_id}/missed-history` lọc danh sách bỏ lỡ theo ngày và đơn thuốc. Thêm `GET /api/admin/stats/overview` tính toán tỷ lệ tuân thủ, chuỗi biến thiên theo ngày, top bệnh nhân bỏ lỡ và thống kê ADR.
- [x] **Task 42: Tích hợp hộp thoại và xem lịch sử bỏ lỡ thuốc từng bệnh nhân (`frontend/admin.html` & `frontend/admin.js`)**
  - **Mô tả:** Thêm modal `#dlg-missed-history` phân nhóm theo ngày với lý do chi tiết; thêm nút "📋 Lịch sử bỏ lỡ" ở mỗi hàng bảng bệnh nhân; thêm khối "Lịch sử bỏ lỡ thuốc gần đây" trong modal chi tiết bệnh nhân; cho phép click vào tên bệnh nhân từ màn hình cảnh báo để mở ngay lịch sử.
- [x] **Task 43: Nâng cấp màn hình Thống kê với hệ thống Biểu đồ Chart.js trực quan (`frontend/admin.html` & `frontend/admin.js`)**
  - **Mô tả:** Nhúng thư viện Chart.js; thiết kế 4 thẻ KPI tổng quan; xây dựng 5 biểu đồ (Tỷ lệ tuân thủ, Biến thiên theo ngày, Top bệnh nhân bỏ lỡ nhiều nhất, Mức độ ADR, Tần suất triệu chứng ADR) với tương tác click trực tiếp vào bệnh nhân.
- [x] **Task 44: Bump PWA cache lên v20 và kiểm tra cú pháp toàn hệ thống**
  - **Mô tả:** Bump Service Worker lên `dtd-shell-v20`, cập nhật asset tags `?v=20`, kiểm tra cú pháp Python và JS đạt 100% không lỗi.

## Giai đoạn 17: Gia Cố Bảo Mật Hệ Thống & Bảo Vệ Dữ Liệu Bệnh Nhân (Security Hardening)
- [x] **Task 45: Chặn dò quét file hệ thống & Thêm Security Request Guard (`backend/main.py`)**
  - **Mô tả:** Thêm middleware chủ động phát hiện và chặn đứng (403 Forbidden) mọi request cố tình dò quét file nhạy cảm (`.env`, `.git`, `.py`, `.sql`, `.pem`, `procfile`, v.v.), ghi log cảnh báo bảo mật.
- [x] **Task 46: Xóa bỏ các giá trị bí mật mặc định trong mã nguồn (`backend/config.py`)**
  - **Mô tả:** Loại bỏ các chuỗi nhạy cảm hardcoded (`gmail_app_password`, `vapid_private_key`, `cron_secret`) ra khỏi code; chuyển sang bắt buộc đọc từ biến môi trường `.env` hoặc Render.
- [x] **Task 47: Khóa Endpoint Unsubscribe & Thắt chặt quyền Web Push (`backend/main.py`)**
  - **Mô tả:** Bổ sung xác thực `CurrentUser = Depends(current_user)` cho endpoint `/api/push-subscription/unsubscribe`, đảm bảo chỉ chính chủ thiết bị mới có quyền gỡ subscription.
- [x] **Task 48: Nâng cao bảo mật mật khẩu bệnh nhân khởi tạo (`backend/main.py` & `frontend/admin.js`)**
  - **Mô tả:** Thay vì cố định `123456`, triển khai cơ chế sinh mật khẩu ngẫu nhiên an toàn (ví dụ: `Dtd@xxxx`) khi bác sĩ tạo hồ sơ bệnh nhân, hiển thị để bác sĩ cấp cho bệnh nhân và giữ cờ bắt buộc đổi mật khẩu.
- [x] **Task 49: Vô hiệu hóa console debug log trên môi trường Production (`frontend/common.js`)**
  - **Mô tả:** Tự động lọc sạch các câu lệnh `console.log` / `console.debug` khi ứng dụng chạy trên tên miền công khai, ngăn chặn việc đọc lén luồng xử lý nội bộ qua F12 Console.
- [x] **Task 50: Kiểm tra cú pháp toàn hệ thống và bump PWA cache lên v21**
  - **Mô tả:** Chạy `py_compile` và `node -c` xác thực 100% không lỗi; bump phiên bản PWA cache lên `dtd-shell-v21`.
