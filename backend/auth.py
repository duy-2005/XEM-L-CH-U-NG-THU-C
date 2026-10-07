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


async def current_user(authorization: str | None = Header(default=None)) -> CurrentUser:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Chưa đăng nhập")
    user = await supa.auth_get_user(authorization[7:].strip())
    if not user or not _UUID.match(user.get("id", "")):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Phiên đăng nhập không hợp lệ")
    rows = await supa.rest_get("profiles", {"id": f"eq.{user['id']}", "select": "role"})
    if not rows:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Không tìm thấy hồ sơ")
    return CurrentUser(id=user["id"], role=rows[0]["role"])


async def require_admin(user: CurrentUser = Depends(current_user)) -> CurrentUser:
    if user.role != "admin":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Chỉ dành cho bác sĩ/dược sĩ")
    return user
