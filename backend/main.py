"""FastAPI - cầu nối bảo mật cho các tác vụ đặc quyền của ứng dụng ĐTĐ/ADR."""
import logging
import re
import uuid
from collections import Counter
from contextlib import asynccontextmanager
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, EmailStr, Field, field_validator
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

import supa
from auth import CurrentUser, require_admin
from config import ROOT, get_settings, get_custom_slot_times, save_custom_slot_times

log = logging.getLogger("app")
VN_TZ = ZoneInfo("Asia/Ho_Chi_Minh")
limiter = Limiter(key_func=get_remote_address, default_limits=["120/minute"])


import asyncio
import notifier

@asynccontextmanager
async def lifespan(_: FastAPI):
    get_settings()  # lỗi sớm nếu thiếu cấu hình
    worker_task = asyncio.create_task(notifier.reminder_worker())
    yield
    worker_task.cancel()
    await supa.close()


app = FastAPI(title="ĐTĐ - Tuân thủ thuốc & ADR", lifespan=lifespan, docs_url=None, redoc_url=None)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=get_settings().origins,  # danh sách cụ thể, không dùng "*"
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)

CSP = (
    "default-src 'self'; "
    "script-src 'self' https://cdn.tailwindcss.com https://cdn.jsdelivr.net; "
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
    "font-src 'self' https://fonts.gstatic.com; "
    "img-src 'self' data:; "
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co; "
    "worker-src 'self'; manifest-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
)


@app.middleware("http")
async def security_headers(request: Request, call_next):
    resp = await call_next(request)
    resp.headers["Content-Security-Policy"] = CSP
    resp.headers["X-Content-Type-Options"] = "nosniff"
    resp.headers["X-Frame-Options"] = "DENY"
    resp.headers["Referrer-Policy"] = "same-origin"
    resp.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    resp.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    return resp


@app.exception_handler(Exception)
async def unhandled(request: Request, exc: Exception):
    # Không lộ chi tiết nội bộ ra ngoài
    log.exception("Lỗi không xử lý: %s %s", request.method, request.url.path)
    return JSONResponse({"detail": "Lỗi máy chủ"}, status_code=500)


# ---------------------------------------------------------------- schemas
class PatientCreate(BaseModel):
    patient_code: str = Field(pattern=r"^[A-Za-z0-9_-]{3,32}$")
    full_name: str = Field(min_length=1, max_length=120)
    phone: str | None = Field(default=None, max_length=20)
    email: EmailStr | None = None

    @field_validator("full_name", "phone")
    @classmethod
    def strip(cls, v):
        return v.strip() if isinstance(v, str) else v


# ---------------------------------------------------------------- public
@app.get("/health")
async def health():
    return {"status": "ok"}


@app.get("/api/config")
async def public_config():
    """Chỉ trả về thông tin công khai cho frontend (KHÔNG có khóa bí mật)."""
    s = get_settings()
    return {
        "supabase_url": s.supabase_url,
        "supabase_key": s.supabase_publishable_key,
        "email_domain": s.patient_email_domain,
    }


# ---------------------------------------------------------------- admin
@app.post("/api/admin/patients", status_code=201)
@limiter.limit("30/minute")
async def create_patient(request: Request, body: PatientCreate, admin: CurrentUser = Depends(require_admin)):
    s = get_settings()
    code = body.patient_code.upper()
    email = f"{code.lower()}@{s.patient_email_domain}"
    meta = {
        "patient_code": code,
        "full_name": body.full_name,
        "phone": body.phone,
        "contact_email": str(body.email) if body.email else None,
    }
    r = await supa.admin_create_user(email, s.default_patient_password, meta)
    if r.status_code in (409, 422):
        raise HTTPException(409, "Mã bệnh nhân đã tồn tại")
    if r.status_code >= 400:
        log.error("Tạo user lỗi: %s", r.status_code)
        raise HTTPException(502, "Không tạo được tài khoản")
    log.info("admin=%s tạo bệnh nhân %s", admin.id, code)
    return {"id": r.json()["id"], "patient_code": code, "default_password": s.default_patient_password}


@app.post("/api/admin/patients/{patient_id}/reset-password")
@limiter.limit("30/minute")
async def reset_password(request: Request, patient_id: str, admin: CurrentUser = Depends(require_admin)):
    try:
        uuid.UUID(patient_id)
    except ValueError:
        raise HTTPException(422, "ID không hợp lệ")
    rows = await supa.rest_get("profiles", {"id": f"eq.{patient_id}", "select": "role"})
    if not rows or rows[0]["role"] != "patient":
        raise HTTPException(404, "Không tìm thấy bệnh nhân")
    s = get_settings()
    r = await supa.admin_update_user(patient_id, {"password": s.default_patient_password})
    if r.status_code >= 400:
        raise HTTPException(502, "Không đặt lại được mật khẩu")
    await supa.rest_patch("profiles", {"id": f"eq.{patient_id}"}, {"must_change_password": True})
    log.info("admin=%s đặt lại mật khẩu bệnh nhân %s", admin.id, patient_id)
    return {"ok": True, "default_password": s.default_patient_password}


@app.get("/api/admin/stats/adr")
async def adr_stats(days: int = 30, _: CurrentUser = Depends(require_admin)):
    days = max(1, min(days, 365))
    since = (datetime.now(VN_TZ) - timedelta(days=days)).date().isoformat()
    rows = await supa.rest_get(
        "adr_reports",
        {"select": "symptoms,severity,is_reviewed", "date": f"gte.{since}", "limit": "5000"},
    )
    symptoms = Counter(sym for row in rows for sym in row["symptoms"])
    return {
        "days": days,
        "total": len(rows),
        "by_severity": dict(Counter(row["severity"] for row in rows)),
        "by_symptom": dict(symptoms.most_common()),
        "unreviewed": sum(1 for row in rows if not row["is_reviewed"]),
    }


@app.get("/api/admin/alerts")
async def alerts(_: CurrentUser = Depends(require_admin)):
    """ADR chưa duyệt (nặng lên đầu) + thuốc bị bỏ lỡ 3 ngày gần nhất."""
    since = (datetime.now(VN_TZ) - timedelta(days=3)).date().isoformat()
    adr = await supa.rest_get(
        "adr_reports",
        {
            "select": "id,date,symptoms,severity,description,created_at,profiles!patient_id(full_name,patient_code)",
            "is_reviewed": "eq.false",
            "order": "created_at.desc",
            "limit": "100",
        },
    )
    adr.sort(key=lambda a: 0 if a["severity"] == "nang" else 1)
    missed = await supa.rest_get(
        "daily_logs",
        {
            "select": "id,date,time_slot,prescriptions(drug_name),profiles:patient_id(full_name,patient_code)",
            "status": "eq.missed",
            "date": f"gte.{since}",
            "order": "date.desc",
            "limit": "200",
        },
    )
    return {"adr": adr, "missed": missed}


class TestEmailReq(BaseModel):
    to_email: EmailStr

class TriggerReminderReq(BaseModel):
    slot: str | None = None
    force: bool = False


class UpdateReminderSettingsReq(BaseModel):
    slot_times: dict[str, str]


@app.get("/api/admin/reminder-settings")
async def get_reminder_settings(_: CurrentUser = Depends(require_admin)):
    s = get_settings()
    return {
        "slot_times": get_custom_slot_times(),
        "gmail_configured": bool(s.gmail_user and s.gmail_app_password),
        "gmail_user": s.gmail_user or None,
    }


@app.put("/api/admin/reminder-settings")
async def update_reminder_settings(body: UpdateReminderSettingsReq, _: CurrentUser = Depends(require_admin)):
    new_slots = save_custom_slot_times(body.slot_times)
    return {"ok": True, "slot_times": new_slots}


@app.post("/api/admin/test-email")
@limiter.limit("5/minute")
async def test_email(request: Request, body: TestEmailReq, admin: CurrentUser = Depends(require_admin)):
    s = get_settings()
    if not s.gmail_user or not s.gmail_app_password:
        raise HTTPException(400, "Chưa cấu hình GMAIL_USER và GMAIL_APP_PASSWORD trong file .env")
    ok = await notifier.send_email(
        str(body.to_email),
        "[Kiểm tra] Hệ thống Nhắc thuốc Đái tháo đường",
        f"<p>Xin chào,</p><p>Đây là email kiểm tra kết nối từ hệ thống quản trị lúc {datetime.now(VN_TZ).strftime('%H:%M:%S %d/%m/%Y')}.</p><p>Cấu hình gửi email hoạt động bình thường!</p>",
        "Email kiểm tra kết nối thành công!",
    )
    if not ok:
        raise HTTPException(502, "Gửi email thất bại. Vui lòng kiểm tra lại GMAIL_USER và GMAIL_APP_PASSWORD.")
    return {"ok": True, "message": f"Đã gửi email kiểm tra thành công tới {body.to_email}"}


@app.post("/api/admin/reminders/trigger")
async def trigger_reminders(body: TriggerReminderReq, _: CurrentUser = Depends(require_admin)):
    res = await notifier.check_and_send_reminders(target_slot=body.slot, force=body.force)
    return res


_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
_VALID_SLOTS = frozenset({"sang", "trua", "chieu", "toi", "truoc_ngu"})


@app.post("/api/cron/reminders")
@limiter.limit("10/minute")
async def cron_reminders(request: Request, slot: str | None = None, force: bool = False):
    s = get_settings()
    if not s.cron_secret:
        raise HTTPException(403, "CRON_SECRET chưa được cấu hình trên máy chủ")
    auth_hdr = request.headers.get("X-Cron-Secret", "")
    import hmac
    if not hmac.compare_digest(auth_hdr, s.cron_secret):
        raise HTTPException(401, "Sai hoặc thiếu X-Cron-Secret")
    res = await notifier.check_and_send_reminders(target_slot=slot, force=force)
    return res


@app.get("/api/confirm-dose", response_class=HTMLResponse)
@limiter.limit("30/minute")
async def confirm_dose_from_email(request: Request, p: str, rx: str, d: str, s: str, sig: str):
    # 1. Kiểm tra định dạng đầu vào chặt chẽ (chống DoS / tham số độc hại)
    if not (_UUID.match(p) and _UUID.match(rx) and _DATE_RE.match(d) and s in _VALID_SLOTS and len(sig) == 24):
        return HTMLResponse(
            """
            <!DOCTYPE html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
            <title>Liên kết không hợp lệ</title>
            <style>body{font-family:system-ui,sans-serif;background:#fff1f2;color:#9f1239;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:20px;}
            .card{background:#fff;border-radius:20px;padding:32px;max-width:440px;text-align:center;box-shadow:0 10px 25px rgba(0,0,0,0.08);}</style>
            </head><body><div class="card"><h2>⚠️ Tham số không đúng định dạng</h2><p>Đường dẫn xác nhận có tham số không hợp lệ.</p></div></body></html>
            """,
            status_code=400,
        )

    # 2. Xác thực token chữ ký điện tử HMAC
    if not notifier.verify_confirm_token(p, rx, d, s, sig):
        return HTMLResponse(
            """
            <!DOCTYPE html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
            <title>Liên kết không hợp lệ</title>
            <style>body{font-family:system-ui,sans-serif;background:#fff1f2;color:#9f1239;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:20px;}
            .card{background:#fff;border-radius:20px;padding:32px;max-width:440px;text-align:center;box-shadow:0 10px 25px rgba(0,0,0,0.08);}</style>
            </head><body><div class="card"><h2>⚠️ Liên kết không hợp lệ</h2><p>Liên kết xác nhận này không đúng hoặc đã hết hạn.</p></div></body></html>
            """,
            status_code=400,
        )

    # Ghi nhận vào daily_logs (status = taken)
    try:
        await supa.rest_upsert(
            "daily_logs",
            {
                "patient_id": p,
                "prescription_id": rx,
                "date": d,
                "time_slot": s,
                "status": "taken",
                "notes": "Xác nhận 1-chạm qua Email",
            },
            on_conflict="prescription_id,date,time_slot",
        )
    except Exception as e:
        log.error("Lỗi khi ghi nhận daily_logs qua email: %s", e)
        return HTMLResponse("Lỗi ghi nhận vào cơ sở dữ liệu", status_code=500)

    # Lấy thông tin thuốc để hiển thị đẹp mắt
    drug_name = "Thuốc"
    try:
        presc_rows = await supa.rest_get("prescriptions", {"id": f"eq.{rx}", "select": "drug_name,is_insulin"})
        if presc_rows:
            drug_name = presc_rows[0].get("drug_name", "Thuốc")
    except Exception:
        pass

    slot_name = notifier.SLOT_NAMES.get(s, s)

    return HTMLResponse(
        f"""
        <!DOCTYPE html>
        <html lang="vi">
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
          <title>Đã xác nhận dùng thuốc</title>
          <style>
            body {{
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
              background: linear-gradient(160deg, #ecfeff 0%, #f0fdf4 100%);
              color: #0f172a;
              margin: 0; padding: 24px 16px;
              min-height: 100vh; display: flex; align-items: center; justify-content: center; box-sizing: border-box;
            }}
            .card {{
              background: #ffffff;
              border-radius: 28px;
              padding: 36px 24px;
              max-width: 440px;
              width: 100%;
              text-align: center;
              box-shadow: 0 16px 36px -10px rgba(13, 148, 136, 0.25);
            }}
            .icon-wrap {{
              width: 84px; height: 84px;
              background: linear-gradient(135deg, #10b981 0%, #059669 100%);
              border-radius: 50%;
              display: flex; align-items: center; justify-content: center;
              margin: 0 auto 20px auto;
              box-shadow: 0 8px 20px rgba(16, 185, 129, 0.35);
            }}
            .icon-wrap svg {{ width: 46px; height: 46px; fill: none; stroke: #ffffff; stroke-width: 3.5; stroke-linecap: round; stroke-linejoin: round; }}
            h1 {{ color: #0f766e; font-size: 24px; font-weight: 800; margin: 0 0 12px 0; }}
            p {{ color: #475569; font-size: 15px; line-height: 1.5; margin: 0 0 20px 0; }}
            .pill {{
              background: #f0fdfa; border: 1.5px solid #99f6e4;
              border-radius: 16px; padding: 14px; margin-bottom: 24px; text-align: left;
            }}
            .pill strong {{ color: #0d9488; font-size: 17px; display: block; margin-bottom: 4px; }}
            .pill span {{ color: #64748b; font-size: 13px; }}
            .btn {{
              display: inline-block; background: #0d9488; color: #ffffff;
              text-decoration: none; padding: 14px 28px; border-radius: 14px;
              font-weight: 700; font-size: 15px; width: 100%; box-sizing: border-box;
            }}
          </style>
        </head>
        <body>
          <div class="card">
            <div class="icon-wrap">
              <svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"></polyline></svg>
            </div>
            <h1>Xác Nhận Thành Công!</h1>
            <p>Tuyệt vời! Hệ thống đã ghi nhận bạn đã dùng thuốc đúng giờ. Bác sĩ phụ trách đã nhận được dữ liệu tuân thủ của bạn.</p>
            
            <div class="pill">
              <strong>💊 {drug_name}</strong>
              <span>Khung giờ: {slot_name} · Ngày: {d}</span>
            </div>

            <a href="/" class="btn">Mở ứng dụng theo dõi</a>
          </div>
        </body>
        </html>
        """
    )


# ---------------------------------------------------------------- static (chạy local 1 lệnh)
_FRONTEND = ROOT / "frontend"
if _FRONTEND.is_dir():
    app.mount("/", StaticFiles(directory=_FRONTEND, html=True), name="frontend")
