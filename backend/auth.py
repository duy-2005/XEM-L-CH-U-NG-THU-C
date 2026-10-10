"""Xác thực JWT Supabase và kiểm tra quyền admin cho mọi endpoint bảo vệ."""
import re
from dataclasses import dataclass

from fastapi import Depends, Header, HTTPException, status

import supa

_UUID = re.compile(r"^[0-9a-fA-F-]{36}$")


@dataclass
class CurrentUser:
    id: str
    role: str
    email: str = ""
    full_name: str = ""
    email_confirmed: bool = False
    is_approved: bool = False
    approval_status: str = "none"


async def current_user(authorization: str | None = Header(default=None)) -> CurrentUser:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Chưa đăng nhập")
    user = await supa.auth_get_user(authorization[7:].strip())
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
    
    return CurrentUser(
        id=user["id"],
        role=p["role"],
        email=email,
        full_name=full_name,
        email_confirmed=email_confirmed,
        is_approved=is_approved,
        approval_status=approval_status,
    )


async def require_admin(user: CurrentUser = Depends(current_user)) -> CurrentUser:
    if user.role != "admin":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Chỉ dành cho bác sĩ/dược sĩ")
    if not user.is_approved:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "Tài khoản quản trị chưa được phê duyệt. Vui lòng bấm 'Gửi yêu cầu xin duyệt' hoặc liên hệ quản trị viên chính.",
        )
    return user
