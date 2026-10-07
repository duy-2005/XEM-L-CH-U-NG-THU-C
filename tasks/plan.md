# Kế hoạch triển khai: Ứng dụng Tuân thủ thuốc Đái tháo đường & Cảnh giới dược chủ động (ADR)

## Tổng quan
PWA tiếng Việt gồm **App bệnh nhân** (mobile-first, `index.html`) và **Dashboard admin** (desktop, `admin.html`).
Frontend tĩnh gọi thẳng Supabase (Auth + RLS). FastAPI là cầu nối bảo mật cho tác vụ đặc quyền: tạo bệnh nhân, thống kê ADR, nhắc thuốc (Web Push + email Gmail), cảnh báo ADR nặng.

## Quyết định kiến trúc
- **Đăng nhập bệnh nhân bằng mã BN**: email giả `ma@benhnhan.local`, mật khẩu mặc định `123456`, ép đổi ở lần đăng nhập đầu (`profiles.must_change_password`).
- **Admin tự tạo thủ công** (đổi `role` bằng SQL). Không ai tự nâng quyền được (RLS chặn sửa `role`).
- **RLS là lớp bảo vệ chính**; FastAPI là lớp thứ hai (xác thực JWT + kiểm tra role admin).
- **Khóa `sb_secret` chỉ ở backend `.env`**. Frontend chỉ dùng publishable/anon key.
- **Chịu tải lớn, miễn phí**: Cloudflare Pages (frontend) + Render/Fly free (FastAPI) + Supabase free. Bệnh nhân gọi thẳng Supabase nên FastAPI ít tải.
- **Nhắc thuốc**: cron ngoài (cron-job.org/GitHub Actions) gọi `POST /api/cron/reminders` kèm `CRON_SECRET` mỗi 5–15 phút. Cron này cũng giữ Supabase không bị tạm dừng.
- **Múi giờ** Asia/Ho_Chi_Minh; mọi ngày tính theo giờ VN.

## Mô hình đe dọa (STRIDE rút gọn)
| Ranh giới | Mối đe dọa | Biện pháp |
|---|---|---|
| Trình duyệt → Supabase | Bệnh nhân đọc/sửa dữ liệu người khác | RLS `auth.uid() = patient_id`, `with check` |
| Bệnh nhân tự nâng quyền admin | Sửa `profiles.role` | Policy cấm đổi `role`; trigger chặn |
| Trình duyệt → FastAPI | Gọi endpoint admin trái phép | Verify JWT Supabase + role=admin mỗi request |
| Dò mật khẩu `123456` | Chiếm tài khoản bệnh nhân | Ép đổi mật khẩu lần đầu, rate limit đăng nhập, mật khẩu mới ≥ 6 ký tự không phải `123456` |
| Cron endpoint | Ai đó gọi gửi spam | `CRON_SECRET` so sánh hằng thời gian |
| XSS | Ghi chú/mô tả ADR chứa script | Dùng `textContent`, không `innerHTML` với dữ liệu người dùng, CSP |
| Lộ bí mật | `sb_secret` rò rỉ | `.env` + `.gitignore`, không đưa vào frontend, xoay khóa khi xong |
| Dữ liệu y tế (nhạy cảm) | Thu thập thừa | Chỉ thu trường cần thiết; email tùy chọn; có đường xóa dữ liệu bệnh nhân |
| DoS | Spam form | Rate limit (slowapi), giới hạn kích thước/độ dài input |

## Cấu trúc thư mục dự kiến
```
/
├── .env / .env.example / .gitignore
├── sql/01_schema.sql
├── backend/ (main.py, config.py, auth.py, routers/, services/, requirements.txt)
├── frontend/ (index.html, app.js, admin.html, admin.js, manifest.json, service-worker.js, icons/, config.js)
└── tasks/ (plan.md, todo.md)
```

## Danh sách việc → xem `tasks/todo.md`

## Rủi ro & xử lý
| Rủi ro | Mức | Xử lý |
|---|---|---|
| Khóa `sb_secret` đã dán vào chat | Cao | Xoay khóa trong Supabase sau khi làm xong |
| Supabase free tạm dừng sau 7 ngày | Trung bình | Cron gọi định kỳ |
| Gmail SMTP bị chặn/giới hạn ~500/ngày | Trung bình | Dễ đổi sang Resend/Brevo (tách `email_service`) |
| iOS chỉ nhận push khi đã cài PWA (16.4+) | Trung bình | Hướng dẫn "Thêm vào MH chính" + email dự phòng |
| Render free ngủ → trễ | Thấp | Cron ping giữ thức |
| Mật khẩu mặc định yếu | Cao | Ép đổi lần đầu; admin có nút đặt lại về `123456` + ép đổi lại |

## Câu hỏi còn mở
- Cần **publishable (anon) key** của Supabase cho frontend (khác `sb_secret`). Bạn dán vào `.env` hoặc gửi tôi.
- Email Gmail + mật khẩu ứng dụng (cho bước nhắc thuốc, có thể làm sau).
