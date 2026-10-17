"""Dịch vụ gửi email thông báo nhắc thuốc và kiểm tra lịch uống thuốc tự động."""
from __future__ import annotations
import asyncio
import base64
import email.message
import hashlib
import hmac
import json
import logging
import smtplib
import time
from datetime import datetime
from zoneinfo import ZoneInfo

from config import get_settings, get_custom_slot_times
import supa

log = logging.getLogger("notifier")
VN_TZ = ZoneInfo("Asia/Ho_Chi_Minh")

import re

SLOT_NAMES = {
    "sang": "Buổi Sáng",
    "trua": "Buổi Trưa",
    "chieu": "Buổi Chiều",
    "toi": "Buổi Tối",
    "truoc_ngu": "Trước Khi Ngủ",
}


def parse_prescription_times(p: dict) -> dict[str, str]:
    """Trích xuất mapping {slot: 'HH:MM'} từ instruction [TIMES:06:30,19:00]."""
    times = {}
    inst = p.get("instruction") or ""
    m = re.search(r"\[TIMES:([^\]]+)\]", inst)
    if m:
        t_list = [t.strip() for t in m.group(1).split(",") if t.strip()]
        freq = p.get("frequency") or []
        for idx, slot in enumerate(freq):
            if idx < len(t_list):
                times[slot] = t_list[idx]
    return times


def get_clean_instruction(instruction: str | None) -> str:
    if not instruction:
        return ""
    return re.sub(r"\[TIMES:[^\]]+\]", "", instruction).strip()



def generate_confirm_token(patient_id: str, prescription_id: str, date_str: str, time_slot: str) -> str:
    """Tạo chữ ký HMAC chống giả mạo liên kết bấm Đã uống từ email."""
    s = get_settings()
    secret = (s.supabase_secret_key or "secret-salt").encode("utf-8")
    payload = f"{patient_id}:{prescription_id}:{date_str}:{time_slot}".encode("utf-8")
    return hmac.new(secret, payload, hashlib.sha256).hexdigest()[:24]


def verify_confirm_token(patient_id: str, prescription_id: str, date_str: str, time_slot: str, token: str) -> bool:
    """Xác thực token khi bệnh nhân click vào nút trong email."""
    expected = generate_confirm_token(patient_id, prescription_id, date_str, time_slot)
    return hmac.compare_digest(expected, token)


def _send_email_sync(to_email: str, subject: str, html_body: str, text_body: str) -> bool:
    """Gửi email qua Gmail SMTP (chạy trong worker thread)."""
    s = get_settings()
    if not s.gmail_user or not s.gmail_app_password:
        log.warning("Chưa cấu hình GMAIL_USER hoặc GMAIL_APP_PASSWORD, bỏ qua gửi email đến %s", to_email)
        return False

    msg = email.message.EmailMessage()
    msg["Subject"] = subject
    msg["From"] = f"Ứng Dụng ĐTĐ <{s.gmail_user}>"
    msg["To"] = to_email
    msg.set_content(text_body)
    msg.add_alternative(html_body, subtype="html")

    try:
        with smtplib.SMTP_SSL("smtp.gmail.com", 465, timeout=15) as server:
            server.login(s.gmail_user, s.gmail_app_password.replace(" ", ""))
            server.send_message(msg)
        log.info("Đã gửi email nhắc thuốc thành công tới %s", to_email)
        return True
    except Exception as e:
        log.error("Lỗi gửi email tới %s: %s", to_email, e)
        return False


async def send_email(to_email: str, subject: str, html_body: str, text_body: str) -> bool:
    """Bọc bất đồng bộ để không chặn FastAPI event loop."""
    return await asyncio.to_thread(_send_email_sync, to_email, subject, html_body, text_body)


# ---------------------------------------------------------------- Web Push Notifications
def _send_webpush_sync(subscription_info: dict, payload_data: dict) -> bool:
    """Gửi Web Push notification theo chuẩn VAPID (chạy trong worker thread)."""
    s = get_settings()
    if not s.vapid_private_key:
        log.warning("Chưa cấu hình VAPID_PRIVATE_KEY, bỏ qua Web Push")
        return False
    import json
    from pywebpush import webpush, WebPushException
    try:
        webpush(
            subscription_info=subscription_info,
            data=json.dumps(payload_data, ensure_ascii=False),
            vapid_private_key=s.vapid_private_key,
            vapid_claims={"sub": s.vapid_subject},
            timeout=10,
        )
        log.info("Đã gửi Web Push thành công tới %s...", subscription_info.get("endpoint", "")[:36])
        return True
    except WebPushException as ex:
        log.warning("Lỗi gửi Web Push: %s", ex)
        # Nếu subscription hết hạn (404 / 410 Gone), dọn dẹp khỏi bảng push_subscriptions
        if ex.response and ex.response.status_code in (404, 410):
            endpoint = subscription_info.get("endpoint")
            if endpoint:
                asyncio.create_task(supa.rest_delete("push_subscriptions", {"endpoint": f"eq.{endpoint}"}))
        return False
    except Exception as ex:
        log.error("Lỗi không xác định khi gửi Web Push: %s", ex)
        return False


async def send_webpush(subscription_info: dict, payload_data: dict) -> bool:
    """Bọc bất đồng bộ để gửi Web Push mà không chặn event loop."""
    return await asyncio.to_thread(_send_webpush_sync, subscription_info, payload_data)


async def send_webpush_to_many(subs: list[dict], payload_data: dict) -> int:
    """Gửi Web Push đồng thời (song song / parallel) tới toàn bộ thiết bị trong cùng 1 tích tắc bằng asyncio.gather."""
    if not subs:
        return 0

    async def _send_single(sub_row: dict) -> bool:
        s_info = {
            "endpoint": sub_row["endpoint"],
            "keys": {
                "p256dh": sub_row.get("p256dh") or (sub_row.get("keys", {}).get("p256dh")),
                "auth": sub_row.get("auth") or (sub_row.get("keys", {}).get("auth")),
            },
        }
        return await send_webpush(s_info, payload_data)

    results = await asyncio.gather(*[_send_single(s) for s in subs], return_exceptions=True)
    sent = sum(1 for r in results if r is True)
    return sent


async def send_alert_push_to_admins(title: str, body: str, url: str = "/admin.html") -> int:
    """Gửi Web Push notification cảnh báo đến toàn bộ thiết bị Bác sĩ đã đăng ký (đồng thời, không đợi nhau)."""
    try:
        admin_rows = await supa.rest_get(
            "profiles",
            {"role": "eq.admin", "is_approved": "eq.true", "select": "id"},
        )
        if not admin_rows:
            log.info("Chưa có bác sĩ nào được kích hoạt để nhận Web Push.")
            return 0
        admin_ids = [r["id"] for r in admin_rows if r.get("id")]
        if not admin_ids:
            return 0

        in_filter = f"in.({','.join(admin_ids)})"
        subs = await supa.rest_get(
            "push_subscriptions",
            {"user_id": in_filter, "select": "endpoint,p256dh,auth"},
        )
        if not subs:
            log.info("Chưa có thiết bị bác sĩ nào đăng ký nhận Web Push.")
            return 0
        payload = {
            "title": title,
            "body": body,
            "url": url,
            "tag": "critical-alert",
        }
        sent = await send_webpush_to_many(subs, payload)
        log.info("Đã gửi Web Push đồng thời tới %s/%s thiết bị bác sĩ", sent, len(subs))
        return sent
    except Exception as e:
        log.error("Lỗi khi quét thiết bị bác sĩ gửi Web Push: %s", e)
        return 0


# ---------------------------------------------------------------- Cảnh báo Khẩn cấp (Email + Push)
def make_critical_alert_html(
    alert_title: str,
    patient_name: str,
    patient_code: str,
    details: str,
    recorded_time: str,
    action_url: str,
) -> str:
    """Tạo mẫu email cảnh báo y tế khẩn cấp, nổi bật và trực quan."""
    return f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body {{ font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #fff1f2; margin: 0; padding: 20px; }}
    .card {{ max-width: 560px; margin: 0 auto; background: #ffffff; border-radius: 18px; padding: 28px; box-shadow: 0 10px 25px rgba(225, 29, 72, 0.12); border-top: 6px solid #e11d48; }}
    .header {{ text-align: center; border-bottom: 2px solid #ffe4e6; padding-bottom: 16px; margin-bottom: 20px; }}
    .title {{ color: #be123c; font-size: 22px; font-weight: 800; margin: 0; letter-spacing: -0.5px; }}
    .badge {{ display: inline-block; background-color: #e11d48; color: white; padding: 5px 14px; border-radius: 999px; font-size: 13px; font-weight: 800; margin-top: 10px; text-transform: uppercase; }}
    .info-box {{ background-color: #fff5f5; border: 1.5px solid #fecdd3; border-radius: 14px; padding: 18px; margin: 18px 0; }}
    .info-row {{ display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px dashed #ffe4e6; font-size: 14px; }}
    .info-row:last-child {{ border-bottom: none; }}
    .info-label {{ color: #64748b; font-weight: 600; }}
    .info-val {{ color: #0f172a; font-weight: 700; text-align: right; }}
    .details-box {{ background: #fef2f2; border-left: 4px solid #e11d48; padding: 12px 16px; border-radius: 8px; margin: 16px 0; font-size: 14px; color: #9f1239; }}
    .action-wrap {{ text-align: center; margin: 26px 0 10px 0; }}
    .btn {{ display: inline-block; background: linear-gradient(135deg, #e11d48 0%, #be123c 100%); color: #ffffff; text-decoration: none; padding: 15px 32px; border-radius: 14px; font-weight: 800; font-size: 16px; box-shadow: 0 4px 14px rgba(225, 29, 72, 0.35); }}
    .footer {{ text-align: center; color: #94a3b8; font-size: 12px; margin-top: 24px; border-top: 1px solid #f1f5f9; padding-top: 14px; }}
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <div style="font-size: 38px; margin-bottom: 6px;">🚨</div>
      <h1 class="title">{alert_title}</h1>
      <span class="badge">Cần can thiệp y tế khẩn cấp</span>
    </div>

    <div class="info-box">
      <div class="info-row">
        <span class="info-label">Bệnh nhân:</span>
        <span class="info-val">{patient_name}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Mã bệnh nhân:</span>
        <span class="info-val">{patient_code}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Thời gian ghi nhận:</span>
        <span class="info-val">{recorded_time}</span>
      </div>
    </div>

    <div class="details-box">
      <strong>Chi tiết cảnh báo:</strong><br>
      {details}
    </div>

    <div class="action-wrap">
      <a href="{action_url}" target="_blank" class="btn">
        MỞ TRANG QUẢN TRỊ BÁC SĨ →
      </a>
    </div>

    <div class="footer">
      Email tự động phát từ Hệ thống Cảnh giới Dược & Tuân thủ thuốc Đái tháo đường.
    </div>
  </div>
</body>
</html>"""


async def send_critical_alert_email(
    alert_title: str,
    patient_name: str,
    patient_code: str,
    details: str,
    recorded_time: str,
) -> bool:
    """Gửi email cảnh báo khẩn cấp tới hộp thư Bác sĩ."""
    s = get_settings()
    recipient = s.doctor_alert_email or s.gmail_user
    if not recipient:
        log.warning("Chưa cấu hình DOCTOR_ALERT_EMAIL hoặc GMAIL_USER, bỏ qua gửi email cảnh báo!")
        return False

    action_url = f"{s.app_url}/admin.html"
    subject = f"🚨 [CẢNH BÁO KHẨN] {alert_title} - BN {patient_name} ({patient_code})"
    html_body = make_critical_alert_html(
        alert_title=alert_title,
        patient_name=patient_name,
        patient_code=patient_code,
        details=details,
        recorded_time=recorded_time,
        action_url=action_url,
    )
    text_body = f"CẢNH BÁO KHẨN:\n{alert_title}\nBệnh nhân: {patient_name} ({patient_code})\nThời gian: {recorded_time}\nChi tiết: {details}\nTruy cập ngay: {action_url}"

    return await send_email(recipient, subject, html_body, text_body)


async def trigger_critical_alerts(
    alert_title: str,
    patient_name: str,
    patient_code: str,
    details: str,
    recorded_time: str | None = None,
):
    """Gửi đồng thời cả Email tới Bác sĩ và Web Push tới các thiết bị Admin."""
    if not recorded_time:
        recorded_time = datetime.now(VN_TZ).strftime("%H:%M:%S %d/%m/%Y")

    s = get_settings()
    action_url = f"{s.app_url}/admin.html"

    # 1. Gửi Email khẩn
    email_task = asyncio.create_task(
        send_critical_alert_email(
            alert_title=alert_title,
            patient_name=patient_name,
            patient_code=patient_code,
            details=details,
            recorded_time=recorded_time,
        )
    )

    # 2. Gửi Web Push khẩn
    push_title = f"🚨 {alert_title}: {patient_name}"
    push_body = f"Mã BN: {patient_code} · {details}"
    push_task = asyncio.create_task(
        send_alert_push_to_admins(
            title=push_title,
            body=push_body,
            url=action_url,
        )
    )

    await asyncio.gather(email_task, push_task, return_exceptions=True)


# ---------------------------------------------------------------- Phê duyệt Tài khoản Admin
def generate_admin_approval_token(user_id: str, email: str, expires_in_seconds: int = 172800) -> str:
    """Tạo token ký số HMAC cho link phê duyệt admin trong email (mặc định 48h)."""
    s = get_settings()
    secret = (s.supabase_secret_key or "secret-admin-approval-key").encode("utf-8")
    payload = {
        "uid": str(user_id),
        "em": email,
        "exp": int(time.time()) + expires_in_seconds,
        "act": "approve_admin",
    }
    payload_json = json.dumps(payload, separators=(",", ":")).encode("utf-8")
    b64_payload = base64.urlsafe_b64encode(payload_json).decode("utf-8").rstrip("=")
    sig = hmac.new(secret, b64_payload.encode("utf-8"), hashlib.sha256).hexdigest()
    return f"{b64_payload}.{sig}"


def verify_admin_approval_token(token: str) -> dict | None:
    """Xác thực token phê duyệt admin từ link trong email."""
    try:
        parts = token.split(".")
        if len(parts) != 2:
            return None
        b64_payload, sig = parts
        s = get_settings()
        secret = (s.supabase_secret_key or "secret-admin-approval-key").encode("utf-8")
        expected_sig = hmac.new(secret, b64_payload.encode("utf-8"), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(sig, expected_sig):
            return None
        rem = len(b64_payload) % 4
        padded = b64_payload + ("=" * (4 - rem) if rem else "")
        data = json.loads(base64.urlsafe_b64decode(padded.encode("utf-8")).decode("utf-8"))
        if data.get("act") != "approve_admin":
            return None
        if time.time() > data.get("exp", 0):
            return None
        return data
    except Exception as e:
        log.warning("Lỗi verify approval token: %s", e)
        return None


def make_admin_approval_request_html(
    full_name: str,
    applicant_email: str,
    request_time: str,
    approve_url: str,
    dashboard_url: str,
) -> str:
    display_name = full_name.strip() or applicant_email
    return f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body {{ font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f0fdfa; margin: 0; padding: 20px; }}
    .card {{ max-width: 580px; margin: 0 auto; background: #ffffff; border-radius: 18px; padding: 28px; box-shadow: 0 10px 25px rgba(13, 148, 136, 0.12); border-top: 6px solid #0d9488; }}
    .header {{ text-align: center; border-bottom: 2px solid #ccfbf1; padding-bottom: 16px; margin-bottom: 20px; }}
    .title {{ color: #0f766e; font-size: 22px; font-weight: 800; margin: 0; }}
    .badge {{ display: inline-block; background-color: #0d9488; color: white; padding: 5px 14px; border-radius: 999px; font-size: 13px; font-weight: 800; margin-top: 10px; text-transform: uppercase; }}
    .info-box {{ background-color: #f8fafc; border: 1.5px solid #e2e8f0; border-radius: 14px; padding: 18px; margin: 20px 0; }}
    .info-row {{ display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px dashed #cbd5e1; font-size: 14px; }}
    .info-row:last-child {{ border-bottom: none; }}
    .info-label {{ color: #64748b; font-weight: 600; }}
    .info-val {{ color: #0f172a; font-weight: 700; text-align: right; }}
    .notice {{ background: #eff6ff; border-left: 4px solid #3b82f6; padding: 12px 16px; border-radius: 8px; font-size: 13px; color: #1e40af; margin-bottom: 22px; }}
    .action-wrap {{ text-align: center; margin: 24px 0 14px 0; }}
    .btn {{ display: inline-block; background: linear-gradient(135deg, #0d9488 0%, #059669 100%); color: #ffffff !important; text-decoration: none; padding: 16px 36px; border-radius: 14px; font-weight: 800; font-size: 16px; box-shadow: 0 4px 14px rgba(13, 148, 136, 0.35); }}
    .sec-link {{ display: block; margin-top: 14px; font-size: 13px; color: #0f766e; text-decoration: underline; }}
    .footer {{ text-align: center; color: #94a3b8; font-size: 12px; margin-top: 24px; border-top: 1px solid #f1f5f9; padding-top: 14px; }}
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <div style="font-size: 38px; margin-bottom: 6px;">🛡️</div>
      <h1 class="title">Yêu Cầu Cấp Quyền Quản Trị Viên</h1>
      <span class="badge">Bác sĩ / Dược sĩ</span>
    </div>

    <p style="color: #334155; font-size: 14px; line-height: 1.6;">
      Hệ thống nhận được yêu cầu cấp quyền Quản trị viên (Admin Dashboard) từ tài khoản Google sau:
    </p>

    <div class="info-box">
      <div class="info-row">
        <span class="info-label">Họ và tên:</span>
        <span class="info-val">{display_name}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Email Google:</span>
        <span class="info-val">{applicant_email}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Thời gian yêu cầu:</span>
        <span class="info-val">{request_time}</span>
      </div>
    </div>

    <div class="notice">
      💡 <strong>Bảo mật:</strong> Nếu đây đúng là Bác sĩ/Dược sĩ thuộc cơ sở của bạn, hãy bấm nút phê duyệt bên dưới (liên kết có hiệu lực trong 48 giờ). Nếu không rõ danh tính, bạn có thể bỏ qua email này.
    </div>

    <div class="action-wrap">
      <a href="{approve_url}" target="_blank" class="btn">
        ✔ PHÊ DUYỆT TÀI KHOẢN NÀY
      </a>
      <a href="{dashboard_url}" target="_blank" class="sec-link">
        Hoặc quản lý phê duyệt trong Dashboard Quản trị →
      </a>
    </div>

    <div class="footer">
      Email tự động phát từ Hệ thống Cảnh giới Dược & Tuân thủ thuốc Đái tháo đường.
    </div>
  </div>
</body>
</html>"""


def make_admin_approval_success_html(full_name: str, dashboard_url: str) -> str:
    display_name = full_name.strip() or "Quý Bác sĩ/Dược sĩ"
    return f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body {{ font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f0fdfa; margin: 0; padding: 20px; }}
    .card {{ max-width: 580px; margin: 0 auto; background: #ffffff; border-radius: 18px; padding: 28px; box-shadow: 0 10px 25px rgba(13, 148, 136, 0.12); border-top: 6px solid #10b981; text-align: center; }}
    .title {{ color: #065f46; font-size: 22px; font-weight: 800; margin: 0 0 12px 0; }}
    .btn {{ display: inline-block; background: linear-gradient(135deg, #0d9488 0%, #059669 100%); color: #ffffff !important; text-decoration: none; padding: 15px 32px; border-radius: 14px; font-weight: 800; font-size: 16px; margin: 20px 0; }}
  </style>
</head>
<body>
  <div class="card">
    <div style="font-size: 42px; margin-bottom: 8px;">🎉</div>
    <h1 class="title">Tài Khoản Đã Được Phê Duyệt</h1>
    <p style="color: #334155; font-size: 15px; line-height: 1.6;">
      Xin chào <strong>{display_name}</strong>,<br>
      Tài khoản của bạn đã được Quản trị viên cấp quyền truy cập vào <strong>Hệ thống Quản trị ĐTĐ (Bác sĩ/Dược sĩ)</strong>.
    </p>
    <div>
      <a href="{dashboard_url}" target="_blank" class="btn">
        TRUY CẬP DASHBOARD QUẢN TRỊ →
      </a>
    </div>
    <p style="color: #64748b; font-size: 13px;">
      Bây giờ bạn có thể đăng nhập bằng tài khoản Google này để bắt đầu làm việc.
    </p>
  </div>
</body>
</html>"""


async def send_admin_approval_request_email(full_name: str, applicant_email: str, token: str) -> bool:
    """Gửi email thông báo có người xin cấp quyền Admin tới Super Admin."""
    s = get_settings()
    recipient = s.doctor_alert_email or s.gmail_user
    if not recipient:
        log.warning("Chưa cấu hình DOCTOR_ALERT_EMAIL hoặc GMAIL_USER để nhận yêu cầu duyệt admin!")
        return False

    request_time = datetime.now(VN_TZ).strftime("%H:%M:%S %d/%m/%Y")
    approve_url = f"{s.app_url}/api/admin/approve-account?token={token}"
    dashboard_url = f"{s.app_url}/admin.html#approvals"
    subject = f"🛡️ [XIN PHÊ DUYỆT ADMIN] Yêu cầu cấp quyền từ {full_name or applicant_email}"
    html_body = make_admin_approval_request_html(full_name, applicant_email, request_time, approve_url, dashboard_url)
    text_body = (
        f"YÊU CẦU CẤP QUYỀN ADMIN:\nTên: {full_name}\nEmail Google: {applicant_email}\n"
        f"Thời gian: {request_time}\nPhê duyệt trực tiếp: {approve_url}\nDashboard: {dashboard_url}"
    )
    return await send_email(recipient, subject, html_body, text_body)


async def send_admin_approval_success_email(full_name: str, to_email: str) -> bool:
    """Gửi email báo tin vui tới người dùng khi tài khoản được duyệt."""
    if not to_email:
        return False
    s = get_settings()
    dashboard_url = f"{s.app_url}/admin.html"
    subject = "🎉 [THÔNG BÁO] Tài khoản của bạn đã được cấp quyền Quản trị viên"
    html_body = make_admin_approval_success_html(full_name, dashboard_url)
    text_body = f"Xin chào {full_name},\nTài khoản của bạn đã được phê duyệt quyền Quản trị viên.\nTruy cập hệ thống: {dashboard_url}"
    return await send_email(to_email, subject, html_body, text_body)


def make_reminder_html(
    patient_name: str,
    drug_name: str,
    dosage: str,
    instruction: str,
    slot_name: str,
    is_insulin: bool,
    confirm_url: str = "",
    app_url: str = "",
) -> str:
    s = get_settings()
    base_url = (app_url or s.app_url or "").rstrip("/")
    verb = "tiêm" if is_insulin else "uống"
    action_btn = ""
    if confirm_url:
        action_btn = f"""
        <div style="text-align: center; margin: 26px 0 10px 0;">
          <a href="{confirm_url}" target="_blank" style="display: inline-block; background: linear-gradient(135deg, #0d9488 0%, #059669 100%); color: #ffffff; text-decoration: none; padding: 16px 36px; border-radius: 14px; font-weight: 800; font-size: 17px; box-shadow: 0 4px 14px rgba(13,148,136,0.35);">
            ✓ BẤM VÀO ĐÂY: TÔI ĐÃ {verb.upper()}
          </a>
        </div>
        <p style="text-align: center; color: #64748b; font-size: 13px; margin: 0 0 16px 0;">
          (Chỉ cần bấm nút trên là hệ thống tự động ghi nhận ngay, không cần đăng nhập vào app)
        </p>
        """

    app_link = ""
    if base_url:
        app_link = f"""
        <div style="text-align: center; margin: 12px 0 18px 0;">
          <a href="{base_url}/" target="_blank" style="display: inline-block; background-color: #ecfeff; border: 1.5px solid #99f6e4; color: #0f766e; text-decoration: none; padding: 11px 24px; border-radius: 12px; font-weight: 700; font-size: 14px;">
            📱 Mở ứng dụng theo dõi trên điện thoại
          </a>
        </div>
        """

    return f"""
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body {{ font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f0fdfa; margin: 0; padding: 20px; }}
    .card {{ max-width: 540px; margin: 0 auto; background: #ffffff; border-radius: 16px; padding: 28px; box-shadow: 0 4px 16px rgba(13,148,136,0.12); }}
    .header {{ text-align: center; border-bottom: 2px solid #ccfbf1; padding-bottom: 16px; margin-bottom: 20px; }}
    .title {{ color: #0f766e; font-size: 20px; font-weight: bold; margin: 0; }}
    .badge {{ display: inline-block; background-color: #0d9488; color: white; padding: 4px 12px; border-radius: 999px; font-size: 13px; font-weight: 600; margin-top: 8px; }}
    .drug-box {{ background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 12px; padding: 16px; margin: 16px 0; }}
    .drug-name {{ color: #166534; font-size: 18px; font-weight: bold; margin: 0 0 4px 0; }}
    .drug-detail {{ color: #374151; font-size: 14px; margin: 4px 0; }}
    .footer {{ text-align: center; color: #6b7280; font-size: 12px; margin-top: 24px; border-top: 1px solid #f3f4f6; padding-top: 16px; }}
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <div class="title">🔔 NHẮC NHỞ DÙNG THUỐC</div>
      <div class="badge">{slot_name}</div>
    </div>
    <p>Xin chào <strong>{patient_name}</strong>,</p>
    <p>Đã đến thời gian {verb} thuốc đái tháo đường của bạn hôm nay:</p>
    
    <div class="drug-box">
      <div class="drug-name">💊 {drug_name}</div>
      <div class="drug-detail"><strong>Liều dùng:</strong> {dosage or 'Theo chỉ dẫn của bác sĩ'}</div>
      {f'<div class="drug-detail"><strong>Hướng dẫn:</strong> {instruction}</div>' if instruction else ''}
      {f'<div class="drug-detail" style="color:#d97706; font-weight:600;">💉 Lưu ý: Đây là thuốc tiêm Insulin</div>' if is_insulin else ''}
    </div>

    {action_btn}
    {app_link}

    <div class="footer">
      Email này được gửi tự động từ Hệ thống Quản trị & Tuân thủ thuốc Đái tháo đường.
    </div>
  </div>
</body>
</html>
"""


async def check_and_send_reminders(target_slot: str | None = None, force: bool = False) -> dict:
    """
    Kiểm tra và gửi thông báo nhắc thuốc (Web Push + Email) cho khung giờ hiện tại hoặc theo giờ riêng của từng thuốc.
    - target_slot: 'sang', 'trua', 'chieu', 'toi', 'truoc_ngu' hoặc None (tự động theo giờ thực tế)
    - force: nếu True, gửi bất kể giờ giấc (nhưng vẫn kiểm tra xem bệnh nhân đã uống chưa)
    """
    s = get_settings()
    now_vn = datetime.now(VN_TZ)
    cur_date = now_vn.date().isoformat()
    cur_hm = now_vn.strftime("%H:%M")

    active_slot_times = get_custom_slot_times()

    # Lấy toàn bộ đơn thuốc đang hoạt động
    try:
        prescs = await supa.rest_get(
            "prescriptions",
            {
                "select": "id,patient_id,drug_name,dosage,instruction,is_insulin,frequency,profiles!patient_id(full_name,email)",
                "is_active": "eq.true",
            },
        )
    except Exception as e:
        log.error("Lỗi truy vấn prescriptions: %s", e)
        return {"status": "query_error", "error": str(e), "sent": 0}

    sent_count = 0
    skipped_count = 0
    results = []

    for p in prescs:
        prof = p.get("profiles") or {}
        patient_id = p["patient_id"]
        p_id = p["id"]
        patient_name = prof.get("full_name") or "Bệnh nhân"
        patient_email = (prof.get("email") or "").strip()
        p_times = parse_prescription_times(p)
        clean_inst = get_clean_instruction(p.get("instruction"))

        for slot in p.get("frequency", []):
            exact_time = p_times.get(slot) or active_slot_times.get(slot, "07:00")
            slot_name = SLOT_NAMES.get(slot, slot)

            # Kiểm tra xem có khớp giờ gửi không
            should_send = False
            if target_slot:
                should_send = (slot == target_slot)
            elif force:
                should_send = True
            else:
                should_send = (cur_hm == exact_time)

            if not should_send:
                continue

            # 1. Kiểm tra bệnh nhân đã bấm 'taken' chưa
            try:
                logs = await supa.rest_get(
                    "daily_logs",
                    {
                        "prescription_id": f"eq.{p_id}",
                        "date": f"eq.{cur_date}",
                        "time_slot": f"eq.{slot}",
                        "status": "eq.taken",
                        "select": "id",
                    },
                )
                if logs:
                    skipped_count += 1
                    continue  # Đã uống rồi, không nhắc nữa
            except Exception as e_log:
                log.error("Lỗi kiểm tra daily_logs: %s", e_log)

            # 2. GỬI WEB PUSH TRỰC TIẾP ĐẾN THIẾT BỊ / ĐIỆN THOẠI BỆNH NHÂN (NẾU ĐÃ BẬT CHUÔNG)
            try:
                patient_subs = await supa.rest_get(
                    "push_subscriptions",
                    {
                        "user_id": f"eq.{patient_id}",
                        "select": "endpoint,p256dh,auth",
                    },
                )
                if patient_subs:
                    push_already_sent = await supa.rest_get(
                        "reminder_log",
                        {
                            "prescription_id": f"eq.{p_id}",
                            "date": f"eq.{cur_date}",
                            "time_slot": f"eq.{slot}",
                            "channel": "eq.push",
                            "select": "prescription_id",
                        },
                    )
                    if not push_already_sent:
                        verb = "tiêm" if p.get("is_insulin") else "uống"
                        push_title = f"🔔 Đến giờ {verb} thuốc (⏰ {exact_time} · {slot_name})"
                        push_body = f"💊 {p['drug_name']} ({p.get('dosage') or ''}). {clean_inst}".strip()
                        push_payload = {
                            "title": push_title,
                            "body": push_body,
                            "url": "/index.html",
                            "tag": f"med-{p_id}-{slot}",
                        }
                        sent_push = await send_webpush_to_many(patient_subs, push_payload)
                        if sent_push > 0:
                            sent_count += 1
                            try:
                                await supa.rest_post(
                                    "reminder_log",
                                    {
                                        "patient_id": patient_id,
                                        "prescription_id": p_id,
                                        "date": cur_date,
                                        "time_slot": slot,
                                        "channel": "push",
                                    },
                                )
                            except Exception as ex:
                                log.error("Lỗi ghi reminder_log (push): %s", ex)
                            results.append({"patient": patient_name, "drug": p["drug_name"], "slot": slot, "time": exact_time, "type": "push"})
            except Exception as e_push:
                log.error("Lỗi gửi Web Push cho bệnh nhân %s: %s", patient_id, e_push)

            # 3. GỬI EMAIL NHẮC NHỞ (NẾU CÓ ĐĂNG KÝ EMAIL)
            if patient_email and "@" in patient_email:
                try:
                    already_sent_email = await supa.rest_get(
                        "reminder_log",
                        {
                            "prescription_id": f"eq.{p_id}",
                            "date": f"eq.{cur_date}",
                            "time_slot": f"eq.{slot}",
                            "channel": "eq.email",
                            "select": "prescription_id",
                        },
                    )
                    if not already_sent_email:
                        sig = generate_confirm_token(patient_id, p_id, cur_date, slot)
                        confirm_url = f"{s.app_url}/api/confirm-dose?p={patient_id}&rx={p_id}&d={cur_date}&s={slot}&sig={sig}"
                        subject = f"[Nhắc thuốc ⏰ {exact_time}] Đã đến giờ dùng thuốc ({p['drug_name']})"
                        html = make_reminder_html(
                            patient_name,
                            p["drug_name"],
                            p.get("dosage", ""),
                            clean_inst,
                            f"{slot_name} (⏰ {exact_time})",
                            p.get("is_insulin", False),
                            confirm_url=confirm_url,
                            app_url=s.app_url,
                        )
                        text = f"Chào {patient_name},\nĐã đến giờ {slot_name} (⏰ {exact_time}). Vui lòng dùng thuốc {p['drug_name']} ({p.get('dosage','')}).\nHướng dẫn: {clean_inst}\n\n1. Bấm vào link sau để xác nhận Đã dùng thuốc: {confirm_url}\n2. Mở ứng dụng theo dõi trên điện thoại: {s.app_url}/"

                        ok = await send_email(patient_email, subject, html, text)
                        if ok:
                            sent_count += 1
                            try:
                                await supa.rest_post(
                                    "reminder_log",
                                    {
                                        "patient_id": patient_id,
                                        "prescription_id": p_id,
                                        "date": cur_date,
                                        "time_slot": slot,
                                        "channel": "email",
                                    },
                                )
                            except Exception as ex:
                                log.error("Lỗi ghi reminder_log (email): %s", ex)
                            results.append({"patient": patient_name, "drug": p["drug_name"], "slot": slot, "time": exact_time, "type": "email"})
                except Exception as e_mail:
                    log.error("Lỗi gửi email cho bệnh nhân %s: %s", patient_id, e_mail)

    return {
        "status": "ok",
        "time": cur_hm,
        "sent": sent_count,
        "skipped_already_taken": skipped_count,
        "details": results,
    }


async def check_and_mark_overdue_missed():
    """Tự động ghi nhận 'missed' cho các cữ thuốc đã quá hạn hơn 1 tiếng mà chưa uống."""
    now = datetime.now(VN_TZ)
    cur_date = now.date().isoformat()
    cur_minutes = now.hour * 60 + now.minute
    slot_times = get_custom_slot_times()

    try:
        prescs = await supa.rest_get(
            "prescriptions",
            {"is_active": "eq.true", "select": "id,patient_id,frequency,instruction"},
        )
    except Exception as e:
        log.error("Lỗi lấy đơn thuốc kiểm tra quá hạn: %s", e)
        return

    for p in prescs:
        p_id = p["id"]
        patient_id = p["patient_id"]
        p_times = parse_prescription_times(p)

        for slot in p.get("frequency", []):
            time_str = p_times.get(slot) or slot_times.get(slot, "07:00")
            try:
                h, m = map(int, time_str.split(":"))
                scheduled_minutes = h * 60 + m
                if cur_minutes < scheduled_minutes + 60:
                    continue  # Chưa quá 1 tiếng
            except Exception:
                continue

            try:
                existing = await supa.rest_get(
                    "daily_logs",
                    {
                        "prescription_id": f"eq.{p_id}",
                        "date": f"eq.{cur_date}",
                        "time_slot": f"eq.{slot}",
                        "select": "id,status",
                    },
                )
                if not existing:
                    await supa.rest_post(
                        "daily_logs",
                        {
                            "patient_id": patient_id,
                            "prescription_id": p_id,
                            "date": cur_date,
                            "time_slot": slot,
                            "status": "missed",
                            "notes": f"Hệ thống tự động ghi nhận do quá hạn 1 tiếng (Lịch: {time_str})",
                        },
                    )
            except Exception as ex:
                log.error("Lỗi tự động ghi nhận cữ thuốc quá hạn: %s", ex)


async def reminder_worker():
    """Tác vụ chạy ngầm kiểm tra lịch chuẩn xác từng phút (chống trôi thời gian khi đông người dùng)."""
    log.info("Khởi động tiến trình chạy ngầm nhắc thuốc tự động...")
    while True:
        try:
            await check_and_send_reminders()
            await check_and_mark_overdue_missed()
        except Exception as e:
            log.exception("Lỗi trong vòng lặp reminder_worker: %s", e)
        # Căn chỉnh để vòng lặp luôn thức dậy vào đúng đầu phút kế tiếp (:00 giây)
        now_sec = datetime.now(VN_TZ).second
        sleep_secs = max(5, 60 - now_sec)
        await asyncio.sleep(sleep_secs)
