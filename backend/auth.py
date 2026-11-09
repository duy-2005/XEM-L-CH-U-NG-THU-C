"""Xác thực JWT Supabase và kiểm tra quyền admin cho mọi endpoint bảo vệ."""
import hashlib
import re
import time
from dataclasses import dataclass

from fastapi import Depends, Header, HTTPException, status

import supa

_UUID = re.compile(r"^[0-9a-fA-F-]{36}$")
# Kiểm tra cấu trúc JWT chuẩn (3 phần Base64URL bắt đầu bằng eyJ) trước khi gọi mạng sang Supabase
_JWT_RE = re.compile(r"^eyJ[A-Za-z0-9_-]{10,1024}\.eyJ[A-Za-z0-9_-]{10,2048}\.[A-Za-z0-9_-]{10,1024}$")

_AUTH_CACHE_TTL = 15.0  # giây
_AUTH_CACHE_MAX = 256
_auth_cache: dict[str, tuple[float, "CurrentUser"]] = {}


@dataclass
class CurrentUser:
    id: str
    role: str
    email: str = ""
    full_name: str = ""
    email_confirmed: bool = False
    is_approved: bool = False
    approval_status: str = "none"


def invalidate_auth_cache(user_id: str | None = None) -> None:
    """Xóa bộ đệm xác thực khi trạng thái tài khoản / quyền admin thay đổi."""
    if user_id is None:
        _auth_cache.clear()
        return
    keys_to_del = [k for k, (_, u) in _auth_cache.items() if u.id == user_id]
    for k in keys_to_del:
        _auth_cache.pop(k, None)


async def current_user(authorization: str | None = Header(default=None)) -> CurrentUser:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Chưa đăng nhập")
    token = authorization[7:].strip()
    if not _JWT_RE.match(token):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Phiên đăng nhập không hợp lệ")

    now = time.monotonic()
    token_key = hashlib.sha256(token.encode("utf-8")).hexdigest()
    cached = _auth_cache.get(token_key)
    if cached is not None:
        exp, cached_user = cached
        if now < exp:
            return cached_user
        _auth_cache.pop(token_key, None)

    user = await supa.auth_get_user(token)
    if not user or not _UUID.match(user.get("id", "")):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Phiên đăng nhập không hợp lệ")
    
    rows = await supa.rest_get(
        "profiles",
        {"id": f"eq.{user['id']}", "select": "*"},
    )
    if not rows:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Không tìm thấy hồ sơ")
    
    p = rows[0]
    email = user.get("email") or p.get("email") or ""
    email_confirmed = bool(user.get("email_confirmed_at") or user.get("confirmed_at"))
    is_approved_val = p.get("is_approved")
    if is_approved_val is None:
        is_approved = (p.get("role") == "admin")
    else:
        is_approved = bool(is_approved_val)
    approval_status = p.get("approval_status") or ("approved" if is_approved else "none")
    full_name = p.get("full_name") or ""
    
    cur = CurrentUser(
        id=user["id"],
        role=p["role"],
        email=email,
        full_name=full_name,
        email_confirmed=email_confirmed,
        is_approved=is_approved,
        approval_status=approval_status,
    )

    if len(_auth_cache) >= _AUTH_CACHE_MAX:
        # Dọn các mục đã hết hạn hoặc mục cũ nhất
        expired_keys = [k for k, (exp, _) in _auth_cache.items() if now >= exp]
        for k in expired_keys:
            _auth_cache.pop(k, None)
        if len(_auth_cache) >= _AUTH_CACHE_MAX:
            _auth_cache.pop(next(iter(_auth_cache)), None)

    _auth_cache[token_key] = (now + _AUTH_CACHE_TTL, cur)
    return cur


async def require_admin(user: CurrentUser = Depends(current_user)) -> CurrentUser:
    if user.role != "admin":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Chỉ dành cho bác sĩ/dược sĩ")
    if not user.is_approved:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "Tài khoản quản trị chưa được phê duyệt. Vui lòng bấm 'Gửi yêu cầu xin duyệt' hoặc liên hệ quản trị viên chính.",
        )
    return user
