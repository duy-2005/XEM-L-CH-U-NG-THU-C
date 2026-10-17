# Kế Hoạch Nâng Cấp: Tích Hợp GSAP Hoạt Ảnh Cao Cấp & Loại Bỏ Emoji Kiểu AI

## 1. Phân Tích Yêu Cầu & Bối Cảnh
Người dùng yêu cầu 2 trọng tâm:
1. **Loại bỏ hoàn toàn các biểu tượng cảm xúc (Emoji/Icons AI-style):**
   - Các emoji như 💊, 🩸, 🧪, 💡, 🔔, 🎉, 💉 tạo cảm giác như sản phẩm do AI sinh ngẫu nhiên, thiếu tính chuyên nghiệp y khoa.
   - Thay thế bằng **biểu tượng vector SVG y tế tối giản, sắc nét (chuẩn Apple Health / Mayo Clinic)** hoặc **phong cách Typographic tối giản, sang trọng**.
2. **Tích hợp bộ thư viện GSAP (từ `gsap-public`):**
   - Sử dụng file lõi `gsap.min.js` để tạo trải nghiệm ứng dụng mượt mà 60fps.
   - Áp dụng vào các tương tác cốt lõi:
     - Hiệu ứng chuyển Tab mượt mà (Cross-fade & Slide).
     - Hiệu ứng tải danh sách thuốc tuần tự (Stagger Entrance).
     - Hiệu ứng hoàn thành cữ thuốc (chuyển sang trạng thái trầm màu êm ái).
     - Hiệu ứng thanh tiến độ (Smooth progress tween).
     - Hiệu ứng mở/đóng Modal/Popup nhẹ nhàng.

---

## 2. Kế Hoạch Thực Hiện Chi Tiết

### Giai đoạn 1: Chuẩn bị Thư viện GSAP Offline & Caching PWA
- [ ] Sao chép `gsap.min.js` từ `/Users/acc/Downloads/gsap-public/minified/gsap.min.js` vào thư mục `frontend/`.
- [ ] Khai báo `gsap.min.js` vào `frontend/service-worker.js` để ứng dụng hoạt động 100% offline.
- [ ] Nhúng `<script src="/gsap.min.js?v=12"></script>` vào [frontend/index.html](file:///Users/acc/Bản%20gửi%20thầy%20Hải%20/frontend/index.html).

### Giai đoạn 2: Thanh lọc Giao diện - Thay Emoji bằng SVG Y Tế Tinh Tế
- [ ] Thay các emoji tại thanh điều hướng đáy (Bottom Nav): 💊, 🩸, ⚠️, 👤 thành các icon SVG vector thanh mảnh (Heroicons/Lucide).
- [ ] Bỏ các emoji trang trí ở tiêu đề: 🔔 Nhắc thuốc, 🧪 Khu vực thử nghiệm, 💡 Yêu cầu mật khẩu, 🎉 Hoàn thành.
- [ ] Tại thẻ thuốc: Bỏ emoji ⏰, 💉; thay bằng tag chữ y tế chuyên nghiệp: `Insulin`, thời gian dạng badge thanh lịch.
- [ ] Nút hành động: Dùng dấu check SVG hoặc nhãn text rõ ràng, không dùng emoji màu mè.

### Giai đoạn 3: Viết Hoạt Ảnh GSAP Tinh Tế trong `frontend/app.js`
- [ ] `animateTabTransition(oldTab, newTab)`: Chuyển tab trượt nhẹ và mờ ảo tự nhiên.
- [ ] `animateMedCards()`: Danh sách thuốc trượt lên lần lượt (stagger 0.08s) khi tải trang.
- [ ] `animateMarkDoseTaken(cardEl, btnEl)`: Hoạt ảnh xác nhận uống thuốc êm ái, chuyển nền xám nhẹ nhàng.
- [ ] `animateProgressBar(fromPct, toPct)`: GSAP tween cho thanh tiến độ tuân thủ.
- [ ] `animateModal(modalEl, isOpen)`: Hoạt ảnh phóng to/thu nhỏ nhẹ nhàng cho các hộp thoại.

### Giai đoạn 4: Kiểm thử & Nghiệm thu
- [ ] Kiểm tra cú pháp `node -c`.
- [ ] Kiểm tra độ mượt trên thiết bị di động, đảm bảo không bị giật lag.
