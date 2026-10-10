# HƯỚNG DẪN TRIỂN KHAI HỆ THỐNG LÊN CLOUD (PUBLIC CHO BỆNH NHÂN)

Tài liệu này hướng dẫn chi tiết từng bước để đưa hệ thống **Ứng dụng Nhắc thuốc Đái tháo đường & Theo dõi ADR** từ máy tính cá nhân lên môi trường Internet (Cloud) để bệnh nhân và bác sĩ có thể truy cập 24/7 từ điện thoại hoặc máy tính.

---

## 1. TỔNG QUAN KIẾN TRÚC TRIỂN KHAI

Hệ thống được thiết kế dạng **All-in-One**:
- Backend FastAPI (Python 3.12) vừa cung cấp API, vừa phục vụ trực tiếp giao diện Frontend PWA (`/` cho bệnh nhân và `/admin.html` cho bác sĩ).
- Do đó, bạn **chỉ cần triển khai 1 dịch vụ duy nhất** (1 Web Service / 1 Docker Container).
- Cơ sở dữ liệu và xác thực đã chạy sẵn trên **Supabase Cloud**, bạn không cần cài đặt lại database.

---

## 2. CHUẨN BỊ MÃ NGUỒN LÊN GITHUB

Để các nền tảng Cloud có thể tự động tải và cập nhật mã nguồn, bạn cần đưa code lên GitHub cá nhân:

1. Mở Terminal tại thư mục dự án và chạy các lệnh sau:
   ```bash
   git init
   git add .
   git commit -m "Khoi tao he thong nhac thuoc va theo doi ADR"
   git branch -M main
   ```
2. Vào [GitHub.com](https://github.com), tạo một **New Repository** mới (đặt tên ví dụ: `nhac-thuoc-dtd`, nên chọn chế độ **Private** để bảo mật).
3. Liên kết và đẩy code lên:
   ```bash
   git remote add origin https://github.com/TÊN_GITHUB_CỦA_BẠN/nhac-thuoc-dtd.git
   git push -u origin main
   ```
*(Lưu ý: File `.gitignore` đã được cấu hình tự động loại bỏ file `.env`, mật khẩu sẽ không bao giờ bị lộ lên GitHub).*

---

## 3. CÁCH 1: TRIỂN KHAI LÊN RENDER.COM (KHUYÊN DÙNG - DỄ NHẤT & CÓ GÓI FREE)

[Render.com](https://render.com) là nền tảng máy chủ đám mây phổ biến nhất hiện nay, cung cấp sẵn tên miền HTTPS miễn phí và tự động triển khai lại mỗi khi bạn cập nhật code.

### Bước 1: Tạo Web Service
1. Đăng ký/Đăng nhập vào [Render.com](https://render.com) bằng tài khoản GitHub.
2. Tại bảng điều khiển (Dashboard), nhấn **New +** -> Chọn **Web Service**.
3. Chọn repository `nhac-thuoc-dtd` bạn vừa đẩy lên GitHub.

### Bước 2: Thiết lập thông số chạy
Điền các thông tin sau:
- **Name**: `nhac-thuoc-dtd` (hoặc tên tùy thích).
- **Region**: `Singapore` (để tốc độ về Việt Nam nhanh nhất).
- **Branch**: `main`
- **Runtime**: `Python 3`
- **Build Command**: `pip install -r requirements.txt`
- **Start Command**: `uvicorn main:app --app-dir backend --host 0.0.0.0 --port $PORT`
- **Instance Type**: Chọn gói **Free** (hoặc gói Starter $7/tháng nếu muốn chạy 24/7 không bao giờ ngủ).

### Bước 3: Cấu hình Biến môi trường (Environment Variables)
Kéo xuống mục **Environment Variables**, bấm **Add Environment Variable** và thêm các khóa sau (lấy giá trị từ file `.env` hiện tại của bạn):

| Key | Giá trị |
| :--- | :--- |
| `SUPABASE_URL` | *URL Supabase của bạn (ví dụ: https://sbejexjtbdhaphrpbmra.supabase.co)* |
| `SUPABASE_SECRET_KEY` | *Khóa bí mật sb_secret_... của bạn* |
| `SUPABASE_PUBLISHABLE_KEY` | *Khóa công khai sb_publishable_... của bạn* |
| `GMAIL_USER` | `damduy800@gmail.com` |
| `GMAIL_APP_PASSWORD` | `hxixitwkrkszvwnk` |
| `DOCTOR_ALERT_EMAIL` | `damduy800@gmail.com` |
| `VAPID_PUBLIC_KEY` | `BA44fPa2speh-4U6ekxP7qyNK-KhVqisJNsNu3DXwvEKyNFQIu6MzuaIdqA4kjRRf3TlcMc53hvzubgsfkePNr0` |
| `VAPID_PRIVATE_KEY` | `deOKFKXYAQSwmSKnKsz6NjR7k2AF3LA661kHyUyi9tc` |
| `VAPID_SUBJECT` | `mailto:damduy800@gmail.com` |
| `APP_URL` | `https://TÊN-APP-CỦA-BẠN.onrender.com` *(chính là URL mà Render cấp ở đầu trang)* |
| `ALLOWED_ORIGINS` | `https://TÊN-APP-CỦA-BẠN.onrender.com` |
| `CRON_SECRET` | *Một chuỗi ký tự bí mật tùy bạn đặt (ví dụ: `duy_cron_secret_2026`)* |

### Bước 4: Hoàn tất & Lấy link sử dụng
- Nhấn nút **Create Web Service**. Render sẽ bắt đầu cài đặt và sau 2 - 3 phút bạn sẽ nhận được đường link chính thức dạng:
  👉 **`https://nhac-thuoc-dtd.onrender.com`**
- Bệnh nhân có thể mở link này trên điện thoại (Chrome/Safari), bấm "Thêm vào màn hình chính" để cài đặt PWA.
- Bác sĩ truy cập `https://nhac-thuoc-dtd.onrender.com/admin.html` để quản lý.

> **💡 Mẹo giữ server Render Free luôn thức & gửi nhắc thuốc đúng giờ:**
> - Bản Free của Render sẽ tự động ngủ sau 15 phút nếu không có ai truy cập.
> - Bạn chỉ cần vào trang web miễn phí [cron-job.org](https://cron-job.org):
>   - Tạo một cron job ping vào: `https://TÊN-APP.onrender.com/health` mỗi **10 phút/lần**.
>   - Việc này vừa giúp server thức 24/24, vừa hoàn toàn miễn phí!

---

## 4. CÁCH 2: TRIỂN KHAI LÊN RAILWAY.APP (KHÔNG BỊ SLEEP)

1. Đăng nhập [Railway.app](https://railway.app) bằng GitHub.
2. Chọn **New Project** -> **Deploy from GitHub repo** -> Chọn `nhac-thuoc-dtd`.
3. Railway sẽ tự động phát hiện `Dockerfile` đã được tạo sẵn trong dự án.
4. Vào tab **Variables** -> Nhập các biến môi trường giống như bảng ở Cách 1.
5. Vào tab **Settings** -> Mục **Networking** -> Bấm **Generate Domain** để nhận đường link HTTPS công khai.
6. Cập nhật biến `APP_URL` thành domain vừa tạo.

---

## 5. CÁCH 3: TRIỂN KHAI LÊN VPS RIÊNG (UBUNTU DOCKER)

Nếu bạn hoặc Trường/Bệnh viện có máy chủ VPS riêng:

1. Đăng nhập SSH vào VPS:
   ```bash
   ssh root@dia_chi_ip_vps
   ```
2. Cài đặt Docker (nếu chưa có):
   ```bash
   curl -fsSL https://get.docker.com | sh
   ```
3. Tải mã nguồn về VPS:
   ```bash
   git clone https://github.com/TÊN_GITHUB/nhac-thuoc-dtd.git
   cd nhac-thuoc-dtd
   ```
4. Tạo file cấu hình `.env`:
   ```bash
   cp .env.example .env
   nano .env
   # Điền thông tin Supabase, Gmail và APP_URL = https://domain_cua_ban
   ```
5. Khởi động hệ thống với Docker Compose:
   ```bash
   docker compose up -d --build
   ```
6. Cấu hình Nginx reverse proxy trỏ port 80/443 vào port `8000` và cài SSL miễn phí bằng Certbot.

---

## 6. KIỂM TRA SAU KHI TRIỂN KHAI THÀNH CÔNG

Sau khi đã có link công khai:
1. Mở link trên điện thoại: Kiểm tra giao diện và bấm cài đặt ứng dụng vào màn hình chính.
2. Thử tạo đơn thuốc và kích hoạt một cữ thuốc: Kiểm tra xem email gửi về Gmail có chứa nút **`✓ BẤM VÀO ĐÂY: TÔI ĐÃ UỐNG`** với đường link trỏ đến tên miền Cloud mới hay không.
3. Nhấn nút trong email từ điện thoại và kiểm tra xem hệ thống đã tự động ghi nhận thành công hay chưa.
