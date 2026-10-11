# Kế hoạch Triển khai: Nâng cấp 7 Tính năng Y tế & Cảnh giới Dược (ADR & ĐTĐ)

## 1. Tổng quan
Hệ thống quản lý tuân thủ dùng thuốc & theo dõi phản ứng có hại (ADR) cho bệnh nhân đái tháo đường đang hoạt động với stack FastAPI + Supabase + Vanilla JS PWA.
Kế hoạch này thực hiện nâng cấp toàn diện 7 tính năng mới theo yêu cầu:
1. **Admin Email Verification**: Bắt buộc Bác sĩ/Dược sĩ phải xác thực email trước khi truy cập dashboard.
2. **Persistent Login & Forced Password Change**: Duy trì đăng nhập cho bệnh nhân và ép đổi mật khẩu ở lần đăng nhập đầu qua cờ `is_first_login`.
3. **Patient-Friendly ADR Terminology**: Thay thế thuật ngữ lâm sàng bằng ngôn ngữ đời sống dễ hiểu kèm neo hành vi cho mức độ nghiêm trọng.
4. **Medication Overdue & Recovery Logic**: Quá hạn 1 tiếng tự động chuyển trạng thái "Missed" (Bỏ lỡ); cho phép bệnh nhân bấm uống bù để chuyển về "Taken".
5. **Delete Functionality for Admin**: Thêm nút xóa và API DELETE cho Bệnh nhân & Đơn thuốc với xóa theo dòng (cascade).
6. **Real-time Critical Alerts via Email**: Gửi email khẩn cấp cho Bác sĩ khi có ADR hoặc Đường huyết nguy hiểm (> 13.9 mmol/L).
7. **Direct Device Push Notifications**: Gửi thông báo đẩy Web Push (chuẩn VAPID/`pywebpush`) trực tiếp đến màn hình thiết bị của Bác sĩ.

---

## 2. Mô hình Đe dọa An ninh (STRIDE Threat Model)

| Ranh giới tin cậy | Mối đe dọa (STRIDE) | Rủi ro cụ thể | Biện pháp phòng ngừa (Hardening) |
|---|---|---|---|
| **Google OAuth → Admin Login** | **Elevation of Privilege (Leo thang đặc quyền)** | Bất kỳ ai có tài khoản Google cũng có thể bấm đăng nhập và cố truy cập dashboard quản trị | Mặc định mọi tài khoản Google mới đều có role='patient' và `is_approved = false`. RLS (`is_admin()`) và backend `require_admin` đều chặn tuyệt đối nếu chưa được phê duyệt. |
| **Email 1-Click Link Approval** | **Tampering / Spoofing / Replay Attack** | Giả mạo link duyệt, brute-force token duyệt hoặc dùng lại link đã hết hạn | Token phê duyệt được ký bằng HMAC-SHA256 với secret key của server; payload chứa user_id, action, exp (48h); so sánh constant-time `compare_digest`. Sau khi duyệt, cập nhật trạng thái `approved` ngăn tái sử dụng. |
| **Client → Request Approval** | **Denial of Service (Spam/Flooding)** | Người dùng spam bấm nút "Xin duyệt" khiến hòm thư admin bị tràn ngập email | Kiểm tra trạng thái: chỉ cho phép gửi khi `approval_status != 'pending'`; rate-limit thời gian giữa các lần xin duyệt (tối thiểu 5 phút). |
| **Client → FastAPI (Xóa bệnh nhân / đơn thuốc)** | **Elevation of Privilege / Tampering** | Kẻ xấu gọi API xóa dữ liệu trái phép hoặc IDOR | Chỉ cho phép `require_admin` + kiểm tra `is_approved = true`; kiểm tra UUID hợp lệ; cascade delete qua Supabase Admin API an toàn. |
| **Client → FastAPI (Báo cáo ADR & Đường huyết)** | **Tampering / Injection / DoS** | Gửi số liệu đường huyết âm, cực đoan hoặc nội dung ADR độc hại (XSS) | Dùng Pydantic Schema kiểm tra kiểu, khoảng giá trị (`level > 0 and level <= 50`), escape văn bản, rate limit (`slowapi`). |
| **FastAPI → SMTP / Web Push** | **Information Disclosure / Tampering** | Lộ VAPID private key hoặc mật khẩu Gmail; spam push | Khóa VAPID & SMTP chỉ lưu trong `.env` backend; rate limit gửi cảnh báo; không bao giờ phơi bày private key ra API public. |
| **Client → Supabase (`is_first_login`)** | **Bypass Password Change** | Bệnh nhân gửi payload cố tình đổi `is_first_login = false` mà không đổi mật khẩu | Kiểm tra đổi mật khẩu qua Supabase Auth API trước, sau đó mới cập nhật cờ `is_first_login`. RLS chỉ cho phép bệnh nhân sửa cờ của chính họ. |

---

## 3. Kiến trúc Chi tiết từng Tính năng

### Tính năng 1: Admin Google OAuth & Hệ thống Phê duyệt Quản trị viên (Admin Approval System)
- **Đăng nhập bằng Google OAuth:**
  - Trên `admin.html`, tích hợp nút "Đăng nhập với Google" gọi `sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin + '/admin.html' } })`.
- **Phân quyền và Kiểm tra Trạng thái:**
  - Thêm các cột vào `profiles`:
    - `is_approved boolean not null default false`
    - `approval_status text not null default 'none' check (approval_status in ('none','pending','approved','rejected'))`
    - `approval_requested_at timestamptz`
    - `approved_at timestamptz`
  - Hàm RLS `public.is_admin()` cập nhật điều kiện: `role = 'admin' and is_approved is true`.
  - Backend `require_admin` kiểm tra: `user.role == 'admin' and user.is_approved is True`.
- **Luồng Xin Duyệt (Request Approval):**
  - Khi người dùng đăng nhập bằng Google nhưng chưa được duyệt (`is_approved == false`):
    - Giao diện chuyển sang màn hình `#view-approval` hiển thị thông báo chưa được cấp quyền.
    - Người dùng bấm nút **"Gửi yêu cầu xin duyệt"**.
    - Frontend gọi `POST /api/admin/request-approval` (xác thực Bearer token).
    - Backend cập nhật `approval_status = 'pending'`, ghi nhận thời gian yêu cầu.
    - Backend tạo token ký số HMAC (48h) và gửi email khẩn tới Super Admin (`DOCTOR_ALERT_EMAIL`) kèm thông tin: Tên, Email Google, Thời gian, và link duyệt trực tiếp.
    - Đồng thời bắn Web Push cảnh báo tới thiết bị Admin hiện có.
- **2 Phương thức Phê duyệt:**
  - **Phương thức 1 (Qua Email 1-click):** Endpoint `GET /api/admin/approve-account?token=...` xác thực HMAC token. Khi Super Admin click link trong email, hệ thống tự động cập nhật tài khoản thành `role = 'admin'`, `is_approved = true`, `approval_status = 'approved'`, gửi email chúc mừng tới người dùng và hiển thị trang HTML thông báo thành công.
  - **Phương thức 2 (Trực tiếp trong Dashboard):** Thêm tab `🛡️ Duyệt Admin` trong `admin.html`. Super Admin xem danh sách đang chờ duyệt (`GET /api/admin/pending-approvals`) và bấm nút `[Phê duyệt]` hoặc `[Từ chối]` (`POST /api/admin/approve-user`).

### Tính năng 2: Persistent Login & Forced Password Change
- **Database:** Thêm cột `is_first_login boolean not null default true` vào bảng `profiles`.
- **Frontend (`app.js`):** Supabase client giữ session bền vững qua `localStorage` (`persistSession: true`).
- Khi đăng nhập/khởi động app, kiểm tra `profile.is_first_login`. Nếu `true`, buộc hiển thị `#view-change-pw`.
- Khi đổi mật khẩu thành công qua `sb.auth.updateUser({ password })`, cập nhật `profiles.is_first_login = false` (và `must_change_password = false`), sau đó mới cho vào app chính.

### Tính năng 3: Patient-Friendly ADR Terminology (UI Update)
- Cập nhật danh sách triệu chứng trong `frontend/common.js` và `frontend/index.html`:
  - "Hạ đường huyết" -> `"Bủn rủn, vã mồ hôi, đói lả"`
  - "Phát ban" -> `"Nổi mẩn đỏ, ngứa ngáy"`
  - "Tiêu chảy" -> `"Đi ngoài nhiều lần"`
- Cập nhật nhãn mức độ:
  - `"Nhẹ (Hơi khó chịu, vẫn sinh hoạt bình thường)"`
  - `"Vừa (Khá mệt, phải nghỉ ngơi)"`
  - `"Nặng (Rất nghiêm trọng, cần gọi bác sĩ)"`
- Admin dashboard hiển thị tương thích cả thuật ngữ mới lẫn cũ.

### Tính năng 4: Medication Overdue & Recovery Logic
- **Định nghĩa quá hạn:** Căn cứ vào giờ của cữ thuốc (`reminder_time_*`). Nếu thời gian hiện tại > giờ cữ thuốc + 60 phút và bệnh nhân chưa bấm "Đã uống" (`taken`):
  - Giao diện `app.js` tự động gán nhãn trạng thái `"missed"` (Bỏ lỡ / Quá hạn) và đổi màu thẻ thuốc.
- **Uống bù (Recovery):** Thẻ thuốc bị "Missed" vẫn giữ nút hoặc cho phép click để xác nhận `"Đã uống"`. Khi bệnh nhân bấm vào, gọi upsert `daily_logs` với `status: 'taken'`, gỡ bỏ cảnh báo bỏ lỡ ngay lập tức.
- **Backend cron/worker:** Kiểm tra định kỳ, nếu quá hạn 1 tiếng mà chưa có bản ghi thì tự động đồng bộ `status = 'missed'`.

### Tính năng 5: Delete Functionality for Admin (Cascade)
- **Backend endpoints:**
  - `DELETE /api/admin/patients/{patient_id}`: Gọi Supabase Admin API xóa auth user -> Database trigger / foreign key cascade xóa tự động profile, đơn thuốc, nhật ký, báo cáo ADR, đường huyết.
  - `DELETE /api/admin/prescriptions/{prescription_id}`: Xóa bản ghi đơn thuốc trong `prescriptions` -> cascade xóa `daily_logs` và `reminder_log`.
- **Frontend (`admin.html` + `admin.js`):**
  - Thêm nút "Xóa" màu đỏ kèm modal xác nhận an toàn bên cạnh mỗi Bệnh nhân trong bảng danh sách.
  - Thêm nút "Xóa đơn" bên cạnh mỗi đơn thuốc trong modal chi tiết bệnh nhân.

### Tính năng 6: Real-time Critical Alerts via Email
- **Backend (`main.py` & `notifier.py`):**
  - Cấu hình `DOCTOR_ALERT_EMAIL` trong `.env` (fallback về email admin hoặc `GMAIL_USER`).
  - Khi có báo cáo ADR mới (đặc biệt là mức độ Nặng) hoặc Đường huyết > 13.9 mmol/L (250 mg/dL):
    Kích hoạt `BackgroundTasks` gửi email khẩn cấp với giao diện HTML y tế nổi bật, ghi rõ: Tên bệnh nhân, Mã BN, Chỉ số / Triệu chứng, Thời gian báo cáo và đường dẫn truy cập dashboard.
  - Endpoint `POST /api/patient/adr` và `POST /api/patient/blood-sugar` xử lý lưu và kích hoạt cảnh báo bất đồng bộ.

### Tính năng 7: Direct Device Push Notifications (Web Push VAPID)
- **Thư viện:** `pywebpush` + `cryptography`.
- **Lưu trữ:** Bảng `push_subscriptions` trong Supabase liên kết với `user_id` của Admin.
- **Frontend (`admin.html` + `admin.js` + `service-worker.js`):**
  - Nút đăng ký nhận thông báo đẩy trên header của Admin dashboard.
  - Sử dụng Notification API + PushManager để tạo subscription với `VAPID_PUBLIC_KEY`.
  - Gửi subscription lên `POST /api/admin/push-subscription`.
  - `service-worker.js` hiển thị notification kèm âm thanh/rung, icon cảnh báo, khi click sẽ mở hoặc chuyển đến `admin.html`.
- **Backend trigger:** Khi có ADR Nặng hoặc Đường huyết > 13.9 mmol/L, cùng lúc với email, gửi Web Push payload tới tất cả subscription của Admin.

---

## 4. Kế hoạch Nâng cấp: Cô lập & Định tuyến Thông báo Đẩy (Device-to-Account Isolated Push Architecture)

### 4.1. Vấn đề Thực tế & Rủi ro
1. **Rủi ro gửi nhầm kênh giữa Bác sĩ và Bệnh nhân:**
   - Trong `notifier.py`, hàm `send_alert_push_to_admins` đang truy vấn toàn bộ bảng `push_subscriptions` mà không lọc theo `role = 'admin'` hay `is_approved = true`. Do đó, thiết bị của bệnh nhân đã bật chuông nhắc thuốc cũng bị nhận nhầm các cảnh báo ADR/cấp cứu của Bác sĩ.
2. **Rủi ro rò rỉ thông tin khi đổi tài khoản trên cùng thiết bị (Stale Binding on Logout):**
   - Khi người dùng đăng xuất (`sb.auth.signOut()`), trình duyệt vẫn giữ Push Subscription trong Service Worker và trên database vẫn liên kết `endpoint` đó với `user_id` cũ. Nếu người khác dùng máy hoặc đăng nhập nick mới, thông báo của nick cũ vẫn bị gửi về máy.
3. **Thiếu khả năng Tắt chuông chủ động:**
   - Nút bật chuông hiện tại chỉ cho phép bật một chiều (bị khóa `pointer-events-none` sau khi bật), người dùng không thể tắt thông báo khi không muốn nhận trên thiết bị đó.

---

### 4.2. Kiến trúc Giải pháp (Targeted Isolation Architecture)

```
[Thiết bị / Trình duyệt] 
       │
       ├── Bấm Đăng nhập ────────► Tự động cập nhật: endpoint ◄──► user_id hiện tại (Device Re-binding)
       │
       ├── Bấm Đăng xuất ────────► Gọi Unsubscribe: Xóa endpoint khỏi DB + sub.unsubscribe() (Device Unbinding)
       │
       └── Bật / Tắt chuông ─────► Toggle đăng ký / hủy đăng ký linh hoạt ngay trên UI
                                                │
[Backend Notification Engine]                    ▼
       ├── Nhắc thuốc bệnh nhân:  Chỉ truy vấn push_subscriptions WHERE user_id == patient_id
       └── Cảnh báo cấp cứu Bác sĩ: Chỉ truy vấn push_subscriptions JOIN profiles WHERE role='admin' AND is_approved=true
```

---

### 4.3. Các Hạng mục Triển khai Cụ thể

#### Hạng mục 1: Backend - Cô lập Tuyệt đối Bộ lọc Thiết bị Nhận Tin
- **Sửa `send_alert_push_to_admins` trong `backend/notifier.py`:**
  - Lấy danh sách `admin_ids` có `role = 'admin'` và `is_approved = true` từ `profiles`.
  - Chỉ truy vấn các subscriptions có `user_id IN (admin_ids)`. Tuyệt đối không gửi sang thiết bị của bệnh nhân.
- **Bổ sung API Hủy đăng ký:**
  - Tạo endpoint `POST /api/push-subscription/unsubscribe` nhận `{ endpoint: string }`.
  - Xóa dòng có `endpoint` tương ứng khỏi bảng `push_subscriptions`.

#### Hạng mục 2: Frontend - Quản lý Vòng đời Thiết bị (Binding / Unbinding)
- **Đồng bộ tự động khi Đăng nhập (`app.js` & `admin.js`):**
  - Khi người dùng đăng nhập thành công vào máy: Nếu thiết bị đã có sẵn Push Subscription, tự động gửi payload lên backend cập nhật `user_id` gắn với nick vừa đăng nhập.
- **Hủy liên kết khi Đăng xuất:**
  - Khi người dùng bấm nút Đăng xuất trên `index.html` hoặc `admin.html`:
    1. Gửi request gọi `POST /api/push-subscription/unsubscribe` với `endpoint` hiện tại.
    2. Gọi `sub.unsubscribe()` trên Service Worker.
    3. Sau đó mới gọi `sb.auth.signOut()` và chuyển hướng.
- **Giao diện Bật / Tắt chuông 2 chiều (Toggle Button):**
  - Cho phép người dùng bấm nút để bật thông báo, và bấm lại nút đó để tắt thông báo bất cứ lúc nào. Hiển thị trạng thái rõ ràng: "Bật thông báo" / "✓ Đang bật (Bấm để tắt)".
## 4. Kế hoạch Kiểm thử & Nghiệm thu
1. Kiểm tra xác thực email admin (đăng nhập bằng tài khoản chưa xác thực -> bị chặn; tài khoản đã xác thực -> vào bình thường).
2. Kiểm tra tài khoản bệnh nhân lần đầu: ép đổi mật khẩu, kiểm tra cờ `is_first_login`.
3. Kiểm tra form ADR: các triệu chứng dân dã và nhãn mức độ hiển thị đúng chuẩn.
4. Kiểm tra thuốc quá giờ 1 tiếng: hiển thị "Bỏ lỡ", bấm "Đã uống" bù thành công.
5. Kiểm tra nút Xóa bệnh nhân và Xóa đơn thuốc: xác nhận xóa và kiểm tra cascade.
6. Kiểm tra gửi ADR / Đường huyết > 13.9 mmol/L: Email gửi thành công về hộp thư Bác sĩ.
7. Kiểm tra Web Push: Bác sĩ bấm bật thông báo, nhận push trực tiếp trên màn hình máy tính/điện thoại.
