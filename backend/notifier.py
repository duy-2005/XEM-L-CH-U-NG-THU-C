"""Dịch vụ gửi email thông báo nhắc thuốc và kiểm tra lịch uống thuốc tự động."""
import asyncio
import email.message
import hashlib
import hmac
import logging
import smtplib
from datetime import datetime
from zoneinfo import ZoneInfo

from config import get_settings, get_custom_slot_times
import supa

log = logging.getLogger("notifier")
VN_TZ = ZoneInfo("Asia/Ho_Chi_Minh")

SLOT_NAMES = {
    "sang": "Buổi Sáng",
    "trua": "Buổi Trưa",
    "chieu": "Buổi Chiều",
    "toi": "Buổi Tối",
    "truoc_ngu": "Trước Khi Ngủ",
}


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


def make_reminder_html(patient_name: str, drug_name: str, dosage: str, instruction: str, slot_name: str, is_insulin: bool, confirm_url: str = "") -> str:
    verb = "tiêm" if is_insulin else "uống"
    action_btn = ""
    if confirm_url:
        action_btn = f"""
        <div style="text-align: center; margin: 28px 0 12px 0;">
          <a href="{confirm_url}" target="_blank" style="display: inline-block; background: linear-gradient(135deg, #0d9488 0%, #059669 100%); color: #ffffff; text-decoration: none; padding: 16px 36px; border-radius: 14px; font-weight: 800; font-size: 17px; box-shadow: 0 4px 14px rgba(13,148,136,0.35);">
            ✓ BẤM VÀO ĐÂY: TÔI ĐÃ {verb.upper()}
          </a>
        </div>
        <p style="text-align: center; color: #6b7280; font-size: 13px; margin: 0 0 16px 0;">
          (Chỉ cần bấm nút trên là hệ thống tự động ghi nhận ngay, không cần đăng nhập vào app)
        </p>
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

    <div class="footer">
      Email này được gửi tự động từ Hệ thống Quản trị & Tuân thủ thuốc Đái tháo đường.
    </div>
  </div>
</body>
</html>
"""


async def check_and_send_reminders(target_slot: str | None = None, force: bool = False) -> dict:
    """
    Kiểm tra và gửi email nhắc thuốc cho khung giờ hiện tại (hoặc target_slot).
    - target_slot: 'sang', 'trua', 'chieu', 'toi', 'truoc_ngu' hoặc None (tự động theo giờ thực tế)
    - force: nếu True, gửi bất kể giờ giấc (nhưng vẫn kiểm tra xem bệnh nhân đã uống chưa)
    """
    s = get_settings()
    now_vn = datetime.now(VN_TZ)
    cur_date = now_vn.date().isoformat()
    cur_hm = now_vn.strftime("%H:%M")

    active_slot_times = get_custom_slot_times()
    # Xác định khung giờ cần gửi
    matched_slots = []
    if target_slot:
        matched_slots = [target_slot]
    elif force:
        matched_slots = list(active_slot_times.keys())
    else:
        # Tự động so sánh giờ hiện tại với các khung giờ đã cấu hình
        for slot, slot_time in active_slot_times.items():
            if cur_hm == slot_time:
                matched_slots.append(slot)

    if not matched_slots:
        return {"status": "no_matched_slot", "time": cur_hm, "sent": 0}

    sent_count = 0
    skipped_count = 0
    results = []

    for slot in matched_slots:
        slot_name = SLOT_NAMES.get(slot, slot)
        # Lấy các đơn thuốc đang hoạt động có khung giờ này
        # PostgREST cs (contains) cho array
        try:
            prescs = await supa.rest_get(
                "prescriptions",
                {
                    "select": "id,patient_id,drug_name,dosage,instruction,is_insulin,frequency,profiles!patient_id(full_name,email)",
                    "is_active": "eq.true",
                    "frequency": f"cs.{{{slot}}}",
                },
            )
        except Exception as e:
            log.error("Lỗi truy vấn prescriptions cho slot %s: %s", slot, e)
            continue

        for p in prescs:
            prof = p.get("profiles") or {}
            patient_email = (prof.get("email") or "").strip()
            if not patient_email or "@" not in patient_email:
                continue  # Bệnh nhân không đăng ký email nhận thông báo

            patient_id = p["patient_id"]
            p_id = p["id"]

            # 1. Kiểm tra bệnh nhân đã bấm 'taken' chưa
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

            # 2. Kiểm tra đã gửi email trong hôm nay cho khung giờ này chưa
            already_sent = await supa.rest_get(
                "reminder_log",
                {
                    "prescription_id": f"eq.{p_id}",
                    "date": f"eq.{cur_date}",
                    "time_slot": f"eq.{slot}",
                    "channel": "eq.email",
                    "select": "prescription_id",
                },
            )
            if already_sent:
                skipped_count += 1
                continue  # Đã gửi rồi, tránh spam

            # 3. Soạn và gửi email
            sig = generate_confirm_token(patient_id, p_id, cur_date, slot)
            confirm_url = f"{s.app_url}/api/confirm-dose?p={patient_id}&rx={p_id}&d={cur_date}&s={slot}&sig={sig}"

            subject = f"[Nhắc thuốc] Đã đến giờ dùng thuốc {slot_name} ({p['drug_name']})"
            patient_name = prof.get("full_name") or "Bệnh nhân"
            html = make_reminder_html(
                patient_name,
                p["drug_name"],
                p.get("dosage", ""),
                p.get("instruction", ""),
                slot_name,
                p.get("is_insulin", False),
                confirm_url=confirm_url,
            )
            text = f"Chào {patient_name},\nĐã đến giờ {slot_name}. Vui lòng dùng thuốc {p['drug_name']} ({p.get('dosage','')}).\nHướng dẫn: {p.get('instruction','')}\n\nBấm vào link sau để xác nhận Đã dùng thuốc: {confirm_url}"

            ok = await send_email(patient_email, subject, html, text)
            if ok:
                sent_count += 1
                # Ghi nhận vào reminder_log
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
                    log.error("Lỗi ghi reminder_log: %s", ex)

                results.append({"patient": patient_name, "drug": p["drug_name"], "slot": slot})

    return {
        "status": "ok",
        "time": cur_hm,
        "slots": matched_slots,
        "sent": sent_count,
        "skipped_already_taken_or_sent": skipped_count,
        "details": results,
    }


async def reminder_worker():
    """Tác vụ chạy ngầm kiểm tra lịch mỗi 60 giây."""
    log.info("Khởi động tiến trình chạy ngầm nhắc thuốc tự động...")
    while True:
        try:
            await check_and_send_reminders()
        except Exception as e:
            log.exception("Lỗi trong vòng lặp reminder_worker: %s", e)
        # Chờ 60 giây trước lần kiểm tra tiếp theo
        await asyncio.sleep(60)
