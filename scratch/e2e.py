"""Kiểm thử đầu-cuối với Supabase thật (tạo user tạm rồi xóa). Chạy: .venv/bin/python scratch/e2e.py"""
import asyncio, os, sys, uuid
sys.path.insert(0, "backend")
import httpx
from dotenv import dotenv_values

env = dotenv_values(".env")
URL, SEC, PUB = env["SUPABASE_URL"], env["SUPABASE_SECRET_KEY"], env["SUPABASE_PUBLISHABLE_KEY"]
API = "http://127.0.0.1:8000"
S = {"apikey": SEC}
ok = True


def check(name, cond):
    global ok
    print(("PASS " if cond else "FAIL ") + name)
    ok &= bool(cond)


async def login(c, email, pw):
    r = await c.post(f"{URL}/auth/v1/token?grant_type=password", headers={"apikey": PUB}, json={"email": email, "password": pw})
    return r.json().get("access_token")


async def main():
    tag = uuid.uuid4().hex[:6]
    admin_email, admin_pw = f"tmpadmin{tag}@example.com", "Adm1n-Test-" + tag
    code = f"T{tag}".upper()
    created = []
    async with httpx.AsyncClient(timeout=20) as c:
      try:
        await run(c, tag, admin_email, admin_pw, code, created)
      finally:
        for uid in created:
            await c.delete(f"{URL}/auth/v1/admin/users/{uid}", headers=S)
    print("TẤT CẢ ĐẠT" if ok else "CÓ LỖI")


async def run(c, tag, admin_email, admin_pw, code, created):
    if True:
        # tạo admin tạm
        r = await c.post(f"{URL}/auth/v1/admin/users", headers=S, json={"email": admin_email, "password": admin_pw, "email_confirm": True})
        aid = r.json()["id"]; created.append(aid)
        r = await c.patch(f"{URL}/rest/v1/profiles?id=eq.{aid}", headers=S, json={"role": "admin", "full_name": "Admin Test", "must_change_password": False})
        check("promote admin via service key", r.status_code in (200, 204))
        atoken = await login(c, admin_email, admin_pw)
        AH = {"Authorization": f"Bearer {atoken}"}

        r = await c.post(f"{API}/api/admin/patients", headers=AH, json={"patient_code": code, "full_name": "Bệnh Nhân Test", "phone": "0900000000"})
        check("admin tạo bệnh nhân 201", r.status_code == 201)
        pid = r.json()["id"]; created.append(pid)
        r = await c.post(f"{API}/api/admin/patients", headers=AH, json={"patient_code": code, "full_name": "Trùng"})
        check("trùng mã → 409", r.status_code == 409)

        ptoken = await login(c, f"{code.lower()}@benhnhan.local", "123456")
        check("bệnh nhân đăng nhập bằng mã + 123456", bool(ptoken))
        PH = {"Authorization": f"Bearer {ptoken}"}
        r = await c.get(f"{API}/api/admin/alerts", headers=PH)
        check("bệnh nhân gọi API admin → 403", r.status_code == 403)
        r = await c.get(f"{API}/api/admin/alerts", headers=AH)
        check("admin gọi alerts → 200", r.status_code == 200)
        r = await c.get(f"{API}/api/admin/stats/adr", headers=AH)
        check("admin stats → 200", r.status_code == 200)

        PR = {"apikey": PUB, "Authorization": f"Bearer {ptoken}", "Content-Type": "application/json", "Prefer": "return=representation"}
        AR = {"apikey": PUB, "Authorization": f"Bearer {atoken}", "Content-Type": "application/json", "Prefer": "return=representation"}

        r = await c.post(f"{URL}/rest/v1/prescriptions", headers=PR, json={"patient_id": pid, "drug_name": "X"})
        check("bệnh nhân KHÔNG tự kê đơn", r.status_code in (401, 403))
        r = await c.post(f"{URL}/rest/v1/prescriptions", headers=AR, json={"patient_id": pid, "drug_name": "Metformin", "dosage": "500mg", "frequency": ["sang", "toi"], "created_by": aid})
        check("admin kê đơn", r.status_code == 201)
        rx = r.json()[0]["id"]

        r = await c.patch(f"{URL}/rest/v1/profiles?id=eq.{pid}", headers=PR, json={"role": "admin"})
        check("bệnh nhân KHÔNG tự nâng role", r.status_code in (401, 403) or r.json() == [] or "message" in r.text)
        prof = (await c.get(f"{URL}/rest/v1/profiles?id=eq.{pid}&select=role", headers=S)).json()
        check("role vẫn là patient", prof[0]["role"] == "patient")

        r = await c.post(f"{URL}/rest/v1/daily_logs", headers=PR, json={"patient_id": pid, "prescription_id": rx, "time_slot": "sang", "status": "taken"})
        check("bệnh nhân ghi 'đã uống'", r.status_code == 201)
        r = await c.post(f"{URL}/rest/v1/blood_sugar_logs", headers=PR, json={"patient_id": pid, "level": 6.5, "time_of_day": "fasting"})
        check("ghi đường huyết", r.status_code == 201)
        r = await c.post(f"{URL}/rest/v1/adr_reports", headers=PR, json={"patient_id": pid, "symptoms": ["Chóng mặt"], "severity": "nang", "description": "test"})
        check("gửi ADR nặng", r.status_code == 201)
        r = await c.post(f"{URL}/rest/v1/adr_reports", headers=PR, json={"patient_id": aid, "symptoms": ["Đau đầu"], "severity": "nhe"})
        check("KHÔNG ghi ADR thay người khác", r.status_code in (401, 403))

        r = await c.get(f"{API}/api/admin/alerts", headers=AH)
        check("alerts có ADR nặng", any(a["severity"] == "nang" for a in r.json()["adr"]))
        r = await c.get(f"{URL}/rest/v1/adr_reports?select=id", headers=PR)
        check("bệnh nhân chỉ thấy ADR của mình", all(True for _ in r.json()) and len(r.json()) == 1)

        r = await c.post(f"{API}/api/admin/patients/{pid}/reset-password", headers=AH)
        check("reset password 200", r.status_code == 200)



asyncio.run(main())
