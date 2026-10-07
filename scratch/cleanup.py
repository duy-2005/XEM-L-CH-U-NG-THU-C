import httpx
from dotenv import dotenv_values
e = dotenv_values(".env"); H = {"apikey": e["SUPABASE_SECRET_KEY"]}
r = httpx.get(e["SUPABASE_URL"] + "/auth/v1/admin/users?per_page=200", headers=H).json()
for u in r.get("users", []):
    em = u.get("email", "")
    if em.startswith("tmpadmin") or (em.endswith("@benhnhan.local") and em.startswith("t") and "-" not in em and len(em.split("@")[0]) == 7):
        httpx.delete(e["SUPABASE_URL"] + "/auth/v1/admin/users/" + u["id"], headers=H); print("xóa", em)
print("còn lại:", [u["email"] for u in httpx.get(e["SUPABASE_URL"] + "/auth/v1/admin/users?per_page=200", headers=H).json().get("users", [])])
