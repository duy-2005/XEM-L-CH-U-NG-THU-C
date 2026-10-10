"""FastAPI - cầu nối bảo mật cho các tác vụ đặc quyền của ứng dụng ĐTĐ/ADR."""
import logging
import re
import uuid
from collections import Counter
from contextlib import asynccontextmanager
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from fastapi import BackgroundTasks, Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, EmailStr, Field, field_validator
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

import supa
from auth import CurrentUser, current_user, require_admin
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


class PushSubscriptionIn(BaseModel):
    endpoint: str = Field(min_length=10, max_length=1000)
    p256dh: str = Field(min_length=10, max_length=500)
    auth: str = Field(min_length=10, max_length=500)


class PatientAdrCreate(BaseModel):
    symptoms: list[str] = Field(min_length=1, max_length=12)
    severity: str = Field(pattern=r"^(nhe|vua|nang)$")
    description: str | None = Field(default=None, max_length=1000)


class PatientBloodSugarCreate(BaseModel):
    level: float = Field(gt=0, le=50)
    time_of_day: str = Field(pattern=r"^(fasting|after_meal)$")


class ApproveUserPayload(BaseModel):
    user_id: str = Field(min_length=32, max_length=36)
    action: str = Field(pattern=r"^(approve|reject)$")


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
        "slot_times": get_custom_slot_times(),
        "vapid_public_key": s.vapid_public_key,
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
    await supa.rest_patch("profiles", {"id": f"eq.{patient_id}"}, {"must_change_password": True, "is_first_login": True})
    log.info("admin=%s đặt lại mật khẩu bệnh nhân %s", admin.id, patient_id)
    return {"ok": True, "default_password": s.default_patient_password}


@app.delete("/api/admin/patients/{patient_id}")
@limiter.limit("20/minute")
async def delete_patient(request: Request, patient_id: str, admin: CurrentUser = Depends(require_admin)):
    try:
        uuid.UUID(patient_id)
    except ValueError:
        raise HTTPException(422, "ID không hợp lệ")

    rows = await supa.rest_get("profiles", {"id": f"eq.{patient_id}", "select": "role,patient_code,full_name"})
    if not rows or rows[0]["role"] != "patient":
        raise HTTPException(404, "Không tìm thấy bệnh nhân cần xóa")

    patient_info = rows[0]
    # 1. Xóa Auth user -> Tự động cascade xóa profile và toàn bộ dữ liệu phụ thuộc
    del_res = await supa.admin_delete_user(patient_id)
    if del_res.status_code >= 400:
        # Dự phòng: dọn sạch profiles nếu auth user không tồn tại
        await supa.rest_delete("profiles", {"id": f"eq.{patient_id}"})

    log.info("admin=%s đã xóa bệnh nhân id=%s code=%s", admin.id, patient_id, patient_info.get("patient_code"))
    return {
        "ok": True,
        "message": f"Đã xóa bệnh nhân {patient_info.get('full_name')} ({patient_info.get('patient_code')}) thành công",
    }


@app.delete("/api/admin/prescriptions/{prescription_id}")
@limiter.limit("30/minute")
async def delete_prescription(request: Request, prescription_id: str, admin: CurrentUser = Depends(require_admin)):
    try:
        uuid.UUID(prescription_id)
    except ValueError:
        raise HTTPException(422, "ID không hợp lệ")

    rows = await supa.rest_get("prescriptions", {"id": f"eq.{prescription_id}", "select": "id,drug_name,patient_id"})
    if not rows:
        raise HTTPException(404, "Không tìm thấy đơn thuốc")

    drug_name = rows[0].get("drug_name", "Thuốc")
    # Xóa đơn thuốc -> Cascade xóa daily_logs và reminder_log liên quan
    del_res = await supa.rest_delete("prescriptions", {"id": f"eq.{prescription_id}"})
    if del_res.status_code >= 400:
        raise HTTPException(502, "Lỗi khi xóa đơn thuốc")

    log.info("admin=%s đã xóa đơn thuốc %s id=%s", admin.id, drug_name, prescription_id)
    return {"ok": True, "message": f"Đã xóa đơn thuốc {drug_name}"}


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


@app.post("/api/admin/push-subscription")
async def save_push_subscription(body: PushSubscriptionIn, admin: CurrentUser = Depends(require_admin)):
    """Lưu Web Push subscription của thiết bị Bác sĩ vào cơ sở dữ liệu."""
    try:
        await supa.rest_upsert(
            "push_subscriptions",
            {
                "user_id": admin.id,
                "endpoint": body.endpoint,
                "p256dh": body.p256dh,
                "auth": body.auth,
            },
            on_conflict="endpoint",
        )
        return {"ok": True, "message": "Đã lưu đăng ký thông báo đẩy thành công"}
    except Exception as e:
        log.error("Lỗi lưu push subscription: %s", e)
        raise HTTPException(500, "Không thể lưu thông báo đẩy")


# ---------------------------------------------------------------- admin approval workflow
@app.post("/api/admin/request-approval")
@limiter.limit("10/minute")
async def request_admin_approval(
    request: Request,
    background_tasks: BackgroundTasks,
    user: CurrentUser = Depends(current_user),
):
    """Bác sĩ/Dược sĩ đăng nhập bằng Google nhưng chưa được duyệt bấm gửi yêu cầu xin cấp quyền."""
    if user.role == "admin" and user.is_approved:
        return {"status": "already_approved", "message": "Tài khoản của bạn đã có quyền Quản trị viên."}

    now_iso = datetime.now(notifier.VN_TZ).isoformat()
    await supa.rest_update(
        "profiles",
        {"id": f"eq.{user.id}"},
        {
            "approval_status": "pending",
            "approval_requested_at": now_iso,
        },
    )

    # Sinh token ký số HMAC (có hạn 48 giờ)
    token = notifier.generate_admin_approval_token(user.id, user.email)

    # Gửi email tới Super Admin trong background
    background_tasks.add_task(
        notifier.send_admin_approval_request_email,
        user.full_name,
        user.email,
        token,
    )

    # Gửi Web Push thông báo tới thiết bị admin
    background_tasks.add_task(
        notifier.send_alert_push_to_admins,
        "🛡️ Yêu cầu duyệt Admin mới",
        f"{user.full_name or user.email} đang xin cấp quyền Quản trị viên",
        "/admin.html",
    )

    return {
        "status": "pending",
        "message": "Đã gửi yêu cầu phê duyệt thành công. Vui lòng chờ Quản trị viên chính kiểm tra và phê duyệt.",
    }


@app.get("/api/admin/approve-account", response_class=HTMLResponse)
async def approve_account_via_email(
    token: str,
    background_tasks: BackgroundTasks,
):
    """Liên kết 1-click trong email để Super Admin phê duyệt tài khoản."""
    data = notifier.verify_admin_approval_token(token)
    if not data:
        return HTMLResponse(
            status_code=400,
            content="""<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Liên kết không hợp lệ</title></head>
<body style="font-family:'Segoe UI',sans-serif;background:#fff1f2;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;">
  <div style="background:white;padding:36px;border-radius:18px;max-width:480px;text-align:center;box-shadow:0 10px 25px rgba(225,29,72,0.15);border-top:6px solid #e11d48;">
    <div style="font-size:48px;margin-bottom:12px;">❌</div>
    <h1 style="color:#be123c;font-size:22px;margin:0 0 12px 0;">Liên Kết Không Hợp Lệ Hoặc Đã Hết Hạn</h1>
    <p style="color:#64748b;font-size:14px;line-height:1.6;">
      Mã xác nhận phê duyệt đã hết hạn (sau 48h) hoặc không chính xác. Vui lòng kiểm tra lại.
    </p>
    <a href="/admin.html" style="display:inline-block;margin-top:20px;background:#e11d48;color:white;text-decoration:none;padding:12px 24px;border-radius:12px;font-weight:700;">
      Vào Trang Quản Trị →
    </a>
  </div>
</body>
</html>""",
        )

    uid = data["uid"]
    email = data["em"]
    rows = await supa.rest_get("profiles", {"id": f"eq.{uid}", "select": "id,full_name,email,is_approved"})
    user_name = rows[0].get("full_name", "") if rows else ""

    now_iso = datetime.now(notifier.VN_TZ).isoformat()
    await supa.rest_update(
        "profiles",
        {"id": f"eq.{uid}"},
        {
            "role": "admin",
            "is_approved": True,
            "approval_status": "approved",
            "approved_at": now_iso,
            "must_change_password": False,
        },
    )

    # Gửi email chúc mừng tới người dùng
    if email:
        background_tasks.add_task(notifier.send_admin_approval_success_email, user_name, email)

    return HTMLResponse(
        content=f"""<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Phê duyệt thành công</title></head>
<body style="font-family:'Segoe UI',sans-serif;background:#f0fdfa;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;">
  <div style="background:white;padding:36px;border-radius:18px;max-width:480px;text-align:center;box-shadow:0 10px 25px rgba(13,148,136,0.15);border-top:6px solid #10b981;">
    <div style="font-size:48px;margin-bottom:12px;">🎉</div>
    <h1 style="color:#065f46;font-size:22px;margin:0 0 12px 0;">Phê Duyệt Thành Công!</h1>
    <p style="color:#334155;font-size:15px;line-height:1.6;">
      Tài khoản <strong>{email}</strong> đã được cấp quyền Quản trị viên (Bác sĩ/Dược sĩ).
    </p>
    <a href="/admin.html" style="display:inline-block;margin-top:20px;background:#0d9488;color:white;text-decoration:none;padding:14px 28px;border-radius:12px;font-weight:700;">
      Vào Trang Quản Trị →
    </a>
  </div>
</body>
</html>"""
    )


@app.get("/api/admin/pending-approvals")
async def list_pending_approvals(admin: CurrentUser = Depends(require_admin)):
    """Lấy danh sách các tài khoản đang chờ duyệt quyền Admin."""
    try:
        rows = await supa.rest_get(
            "profiles",
            {
                "approval_status": "eq.pending",
                "select": "*",
            },
        )
        return {"pending": rows}
    except Exception:
        return {"pending": []}


@app.post("/api/admin/approve-user")
async def approve_or_reject_user(
    body: ApproveUserPayload,
    background_tasks: BackgroundTasks,
    admin: CurrentUser = Depends(require_admin),
):
    """Phê duyệt hoặc từ chối yêu cầu cấp quyền Admin trực tiếp từ Dashboard."""
    rows = await supa.rest_get("profiles", {"id": f"eq.{body.user_id}", "select": "id,full_name,email"})
    if not rows:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy tài khoản")

    target_user = rows[0]
    now_iso = datetime.now(notifier.VN_TZ).isoformat()

    if body.action == "approve":
        await supa.rest_update(
            "profiles",
            {"id": f"eq.{body.user_id}"},
            {
                "role": "admin",
                "is_approved": True,
                "approval_status": "approved",
                "approved_at": now_iso,
                "must_change_password": False,
            },
        )
        if target_user.get("email"):
            background_tasks.add_task(
                notifier.send_admin_approval_success_email,
                target_user.get("full_name", ""),
                target_user["email"],
            )
        return {"status": "ok", "message": f"Đã phê duyệt quyền Admin cho {target_user.get('email', body.user_id)}."}
    else:
        await supa.rest_update(
            "profiles",
            {"id": f"eq.{body.user_id}"},
            {
                "is_approved": False,
                "approval_status": "rejected",
            },
        )
        return {"status": "ok", "message": "Đã từ chối yêu cầu."}


# ---------------------------------------------------------------- patient endpoints (gửi ADR & Đường huyết)
@app.post("/api/patient/adr", status_code=201)
@limiter.limit("20/minute")
async def submit_patient_adr(
    request: Request,
    body: PatientAdrCreate,
    bg: BackgroundTasks,
    user: CurrentUser = Depends(current_user),
):
    """Bệnh nhân báo cáo phản ứng bất thường (ADR) -> Lưu và gửi cảnh báo tới Bác sĩ."""
    cur_date = datetime.now(VN_TZ).date().isoformat()
    adr_row = {
        "patient_id": user.id,
        "date": cur_date,
        "symptoms": body.symptoms,
        "severity": body.severity,
        "description": body.description,
        "is_reviewed": False,
    }
    r = await supa.rest_post("adr_reports", adr_row)
    if r.status_code >= 400:
        raise HTTPException(502, "Không thể lưu báo cáo triệu chứng")

    # Lấy tên và mã bệnh nhân để hiển thị cảnh báo
    prof_rows = await supa.rest_get("profiles", {"id": f"eq.{user.id}", "select": "full_name,patient_code"})
    p_name = prof_rows[0].get("full_name") if prof_rows else "Bệnh nhân"
    p_code = prof_rows[0].get("patient_code") if prof_rows else "—"

    sev_map = {"nhe": "Nhẹ", "vua": "Vừa", "nang": "NẶNG"}
    alert_title = f"Báo cáo ADR ({sev_map.get(body.severity, body.severity)})"
    details = f"Triệu chứng: {', '.join(body.symptoms)}."
    if body.description:
        details += f" Chi tiết: {body.description}"

    bg.add_task(
        notifier.trigger_critical_alerts,
        alert_title=alert_title,
        patient_name=p_name,
        patient_code=p_code,
        details=details,
        recorded_time=datetime.now(VN_TZ).strftime("%H:%M:%S %d/%m/%Y"),
    )

    return {"ok": True, "message": "Đã gửi báo cáo triệu chứng tới Bác sĩ thành công"}


@app.post("/api/patient/blood-sugar", status_code=201)
@limiter.limit("30/minute")
async def submit_patient_blood_sugar(
    request: Request,
    body: PatientBloodSugarCreate,
    bg: BackgroundTasks,
    user: CurrentUser = Depends(current_user),
):
    """Bệnh nhân ghi nhận chỉ số đường huyết -> Lưu và phát cảnh báo khẩn nếu vượt ngưỡng nguy hiểm."""
    cur_date = datetime.now(VN_TZ).date().isoformat()
    sugar_row = {
        "patient_id": user.id,
        "date": cur_date,
        "level": body.level,
        "time_of_day": body.time_of_day,
    }
    r = await supa.rest_post("blood_sugar_logs", sugar_row)
    if r.status_code >= 400:
        raise HTTPException(502, "Không thể lưu chỉ số đường huyết")

    # Kiểm tra ngưỡng nguy hiểm: > 13.9 mmol/L (250 mg/dL) hoặc hạ đường huyết < 3.9 mmol/L
    is_high = body.level > 13.9
    is_low = body.level < 3.9

    if is_high or is_low:
        prof_rows = await supa.rest_get("profiles", {"id": f"eq.{user.id}", "select": "full_name,patient_code"})
        p_name = prof_rows[0].get("full_name") if prof_rows else "Bệnh nhân"
        p_code = prof_rows[0].get("patient_code") if prof_rows else "—"
        tod_text = "Lúc đói (Sáng sớm)" if body.time_of_day == "fasting" else "Sau ăn 2 giờ"

        if is_high:
            alert_title = f"ĐƯỜNG HUYẾT CAO NGUY HIỂM ({body.level} mmol/L)"
            details = f"Chỉ số: {body.level} mmol/L (> 13.9 mmol/L ~ 250 mg/dL). Thời điểm: {tod_text}."
        else:
            alert_title = f"HẠ ĐƯỜNG HUYẾT NGUY HIỂM ({body.level} mmol/L)"
            details = f"Chỉ số: {body.level} mmol/L (< 3.9 mmol/L - nguy cơ hôn mê). Thời điểm: {tod_text}."

        bg.add_task(
            notifier.trigger_critical_alerts,
            alert_title=alert_title,
            patient_name=p_name,
            patient_code=p_code,
            details=details,
            recorded_time=datetime.now(VN_TZ).strftime("%H:%M:%S %d/%m/%Y"),
        )

    return {"ok": True, "message": "Đã lưu chỉ số đường huyết"}


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
