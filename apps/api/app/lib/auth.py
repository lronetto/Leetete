import hmac
import time
from typing import Annotated

import jwt
from fastapi import Cookie, HTTPException, Response

from ..config import settings

COOKIE_NAME = "wedding_admin"
SESSION_TTL = 60 * 60 * 24 * 7  # 7 days


def constant_time_eq(a: str, b: str) -> bool:
    return hmac.compare_digest(a.encode("utf-8"), b.encode("utf-8"))


def _create_token(email: str) -> str:
    payload = {
        "email": email,
        "exp": int(time.time()) + SESSION_TTL,
    }
    return jwt.encode(payload, settings.SESSION_SECRET, algorithm="HS256")


def set_session_cookie(response: Response, email: str) -> None:
    token = _create_token(email)
    response.set_cookie(
        key=COOKIE_NAME,
        value=token,
        max_age=SESSION_TTL,
        httponly=True,
        secure=settings.is_production,
        samesite="lax",
        path="/",
    )


def clear_session_cookie(response: Response) -> None:
    response.delete_cookie(COOKIE_NAME, path="/")


def get_admin_email(
    wedding_admin: Annotated[str | None, Cookie(alias=COOKIE_NAME)] = None,
) -> str:
    if not wedding_admin:
        raise HTTPException(status_code=401, detail="unauthorized")
    try:
        payload = jwt.decode(
            wedding_admin, settings.SESSION_SECRET, algorithms=["HS256"]
        )
    except jwt.PyJWTError as e:
        raise HTTPException(status_code=401, detail="unauthorized") from e
    email = payload.get("email")
    if not email or not isinstance(email, str):
        raise HTTPException(status_code=401, detail="unauthorized")
    return email
