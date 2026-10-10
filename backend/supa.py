"""Client HTTP mỏng gọi Supabase (Auth admin + PostgREST) bằng khóa bí mật."""
import httpx

from config import get_settings

_client: httpx.AsyncClient | None = None


def client() -> httpx.AsyncClient:
    global _client
    if _client is None:
        _client = httpx.AsyncClient(timeout=15)
    return _client


async def close() -> None:
    global _client
    if _client is not None:
        await _client.aclose()
        _client = None


def _secret_headers() -> dict[str, str]:
    # Khóa sb_secret_* không phải JWT nên chỉ gửi qua header apikey.
    return {"apikey": get_settings().supabase_secret_key}


async def rest_get(table: str, params: dict[str, str]) -> list[dict]:
    s = get_settings()
    r = await client().get(f"{s.supabase_url}/rest/v1/{table}", params=params, headers=_secret_headers())
    r.raise_for_status()
    return r.json()


async def auth_get_user(access_token: str) -> dict | None:
    """Xác thực JWT của người dùng với Supabase Auth. Trả về None nếu không hợp lệ."""
    s = get_settings()
    r = await client().get(
        f"{s.supabase_url}/auth/v1/user",
        headers={"apikey": s.public_key, "Authorization": f"Bearer {access_token}"},
    )
    if r.status_code != 200:
        return None
    return r.json()


async def admin_create_user(email: str, password: str, metadata: dict) -> httpx.Response:
    s = get_settings()
    return await client().post(
        f"{s.supabase_url}/auth/v1/admin/users",
        headers=_secret_headers(),
        json={"email": email, "password": password, "email_confirm": True, "user_metadata": metadata},
    )


async def admin_update_user(user_id: str, payload: dict) -> httpx.Response:
    s = get_settings()
    return await client().put(
        f"{s.supabase_url}/auth/v1/admin/users/{user_id}",
        headers=_secret_headers(),
        json=payload,
    )


async def rest_patch(table: str, params: dict[str, str], body: dict) -> httpx.Response:
    s = get_settings()
    return await client().patch(
        f"{s.supabase_url}/rest/v1/{table}", params=params, json=body, headers=_secret_headers()
    )


async def rest_post(table: str, body: dict | list[dict]) -> httpx.Response:
    s = get_settings()
    return await client().post(
        f"{s.supabase_url}/rest/v1/{table}",
        json=body,
        headers={**_secret_headers(), "Prefer": "return=minimal"},
    )


async def rest_upsert(table: str, body: dict | list[dict], on_conflict: str = "") -> httpx.Response:
    s = get_settings()
    headers = {**_secret_headers(), "Prefer": "resolution=merge-duplicates"}
    params = {"on_conflict": on_conflict} if on_conflict else {}
    r = await client().post(f"{s.supabase_url}/rest/v1/{table}", json=body, headers=headers, params=params)
    r.raise_for_status()
    return r


async def rest_delete(table: str, params: dict[str, str]) -> httpx.Response:
    """Xóa bản ghi từ PostgREST bảng chỉ định."""
    s = get_settings()
    return await client().delete(
        f"{s.supabase_url}/rest/v1/{table}",
        params=params,
        headers=_secret_headers(),
    )


async def admin_delete_user(user_id: str) -> httpx.Response:
    """Xóa user từ Supabase Auth Admin API (cascade xóa profile và dữ liệu con)."""
    s = get_settings()
    return await client().delete(
        f"{s.supabase_url}/auth/v1/admin/users/{user_id}",
        headers=_secret_headers(),
    )
