import time
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy import delete, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import settings
from ..db.base import get_db
from ..db.models import EventConfig, Upload
from ..lib.auth import (
    clear_session_cookie,
    constant_time_eq,
    get_admin_email,
    set_session_cookie,
)
from ..lib.storage import storage
from ..schemas.api import (
    AdminBulk,
    AdminUploadUpdate,
    EventConfigUpdate,
    LoginIn,
)

router = APIRouter()
ADMIN_PAGE_SIZE = 30

Db = Annotated[AsyncSession, Depends(get_db)]
Admin = Annotated[str, Depends(get_admin_email)]


def _now_ms() -> int:
    return int(time.time() * 1000)


# ---------- Auth (unauthenticated) ----------


@router.post("/login")
async def login(body: LoginIn, response: Response):
    email = body.email.lower()
    if email not in settings.admin_emails_list:
        raise HTTPException(401, detail="unauthorized")
    if not constant_time_eq(body.password, settings.ADMIN_PASSWORD):
        raise HTTPException(401, detail="unauthorized")
    set_session_cookie(response, email)
    return {"ok": True, "email": email}


@router.post("/logout")
async def logout(response: Response):
    clear_session_cookie(response)
    return {"ok": True}


# ---------- Authenticated ----------


@router.get("/me")
async def me(email: Admin):
    return {"email": email}


@router.get("/event")
async def get_event(_: Admin, db: Db):
    cfg = (
        await db.execute(select(EventConfig).where(EventConfig.id == 1))
    ).scalar_one_or_none()
    if not cfg:
        raise HTTPException(404, detail="not_configured")
    return {
        "coupleNames": cfg.couple_names,
        "eventDate": cfg.event_date,
        "coverKey": cfg.cover_key,
        "coverUrl": storage.public_url(cfg.cover_key) if cfg.cover_key else None,
        "galleryVisibility": cfg.gallery_visibility,
        "moderation": cfg.moderation,
        "maxFileMb": cfg.max_file_mb,
        "allowVideo": cfg.allow_video,
        "maxVideoSeconds": cfg.max_video_seconds,
        "welcomeMessage": cfg.welcome_message,
        "updatedAt": cfg.updated_at,
    }


_EVENT_COL_MAP = {
    "coupleNames": "couple_names",
    "eventDate": "event_date",
    "coverKey": "cover_key",
    "galleryVisibility": "gallery_visibility",
    "moderation": "moderation",
    "maxFileMb": "max_file_mb",
    "allowVideo": "allow_video",
    "maxVideoSeconds": "max_video_seconds",
    "welcomeMessage": "welcome_message",
}


@router.patch("/event")
async def patch_event(body: EventConfigUpdate, _: Admin, db: Db):
    incoming = body.model_dump(exclude_unset=True)
    updates: dict[str, object] = {
        _EVENT_COL_MAP[k]: v for k, v in incoming.items() if k in _EVENT_COL_MAP
    }
    if not updates:
        return {"ok": True, "noop": True}
    updates["updated_at"] = _now_ms()
    await db.execute(
        update(EventConfig).where(EventConfig.id == 1).values(**updates)
    )
    await db.commit()
    return {"ok": True}


@router.get("/uploads")
async def list_uploads(
    _: Admin,
    db: Db,
    status: str | None = None,
    kind: str | None = None,
    q: str | None = None,
    cursor: str | None = None,
    limit: Annotated[int, Query(ge=1, le=100)] = ADMIN_PAGE_SIZE,
):
    stmt = select(Upload)
    if status in {"pending", "approved", "rejected"}:
        stmt = stmt.where(Upload.status == status)
    if cursor and cursor.isdigit():
        stmt = stmt.where(Upload.created_at < int(cursor))
    if kind == "photo":
        stmt = stmt.where(Upload.mime_type.like("image/%"))
    elif kind == "video":
        stmt = stmt.where(Upload.mime_type.like("video/%"))
    if q and q.strip():
        pattern = f"%{q.strip()}%"
        stmt = stmt.where(
            or_(
                Upload.author_name.ilike(pattern),
                Upload.message.ilike(pattern),
            )
        )
    stmt = stmt.order_by(Upload.created_at.desc()).limit(limit + 1)

    rows = list((await db.execute(stmt)).scalars().all())
    has_more = len(rows) > limit
    slice_rows = rows[:limit] if has_more else rows

    cfg = (
        await db.execute(select(EventConfig).where(EventConfig.id == 1))
    ).scalar_one_or_none()
    cover_key = cfg.cover_key if cfg else None

    items = [
        {
            "id": r.id,
            "url": storage.public_url(r.storage_key),
            "thumbnailUrl": storage.public_url(r.thumbnail_key)
            if r.thumbnail_key
            else None,
            "storageKey": r.storage_key,
            "mimeType": r.mime_type,
            "isVideo": r.mime_type.startswith("video/"),
            "sizeBytes": r.size_bytes,
            "durationSeconds": r.duration_seconds,
            "authorName": r.author_name,
            "message": r.message,
            "status": r.status,
            "source": r.source,
            "createdAt": r.created_at,
            "approvedAt": r.approved_at,
            "isCover": cover_key == r.storage_key,
        }
        for r in slice_rows
    ]
    next_cursor = str(slice_rows[-1].created_at) if has_more and slice_rows else None
    return {"items": items, "nextCursor": next_cursor}


@router.patch("/uploads/{upload_id}")
async def patch_upload(
    upload_id: str, body: AdminUploadUpdate, _: Admin, db: Db
):
    incoming = body.model_dump(exclude_unset=True)
    if not incoming:
        return {"ok": True, "noop": True}
    snake = {"authorName": "author_name", "message": "message"}
    updates: dict[str, object | None] = {}
    for k, v in incoming.items():
        if k in snake:
            updates[snake[k]] = v.strip() or None if isinstance(v, str) else v
    if not updates:
        return {"ok": True, "noop": True}
    res = await db.execute(
        update(Upload)
        .where(Upload.id == upload_id)
        .values(**updates)
        .returning(Upload.id)
    )
    await db.commit()
    if res.scalar_one_or_none() is None:
        raise HTTPException(404, detail="not_found")
    return {"ok": True}


@router.post("/uploads/{upload_id}/approve")
async def approve(upload_id: str, _: Admin, db: Db):
    res = await db.execute(
        update(Upload)
        .where(Upload.id == upload_id)
        .values(status="approved", approved_at=_now_ms())
        .returning(Upload.id)
    )
    await db.commit()
    if res.scalar_one_or_none() is None:
        raise HTTPException(404, detail="not_found")
    return {"ok": True}


@router.post("/uploads/{upload_id}/reject")
async def reject(upload_id: str, _: Admin, db: Db):
    res = await db.execute(
        update(Upload)
        .where(Upload.id == upload_id)
        .values(status="rejected", approved_at=None)
        .returning(Upload.id)
    )
    await db.commit()
    if res.scalar_one_or_none() is None:
        raise HTTPException(404, detail="not_found")
    return {"ok": True}


@router.post("/uploads/{upload_id}/cover")
async def set_cover(upload_id: str, _: Admin, db: Db):
    row = (
        await db.execute(select(Upload).where(Upload.id == upload_id))
    ).scalar_one_or_none()
    if not row:
        raise HTTPException(404, detail="not_found")
    await db.execute(
        update(EventConfig)
        .where(EventConfig.id == 1)
        .values(cover_key=row.storage_key, updated_at=_now_ms())
    )
    await db.commit()
    return {"ok": True}


@router.delete("/event/cover")
async def clear_cover(_: Admin, db: Db):
    await db.execute(
        update(EventConfig)
        .where(EventConfig.id == 1)
        .values(cover_key=None, updated_at=_now_ms())
    )
    await db.commit()
    return {"ok": True}


@router.delete("/uploads/{upload_id}")
async def delete_upload(upload_id: str, _: Admin, db: Db):
    row = (
        await db.execute(select(Upload).where(Upload.id == upload_id))
    ).scalar_one_or_none()
    if not row:
        raise HTTPException(404, detail="not_found")

    storage_key = row.storage_key
    thumb_key = row.thumbnail_key

    await storage.delete(storage_key)
    if thumb_key:
        await storage.delete(thumb_key)
    await db.delete(row)

    cfg = (
        await db.execute(select(EventConfig).where(EventConfig.id == 1))
    ).scalar_one_or_none()
    if cfg and cfg.cover_key == storage_key:
        await db.execute(
            update(EventConfig).where(EventConfig.id == 1).values(cover_key=None)
        )
    await db.commit()
    return {"ok": True}


@router.post("/uploads/bulk")
async def bulk(body: AdminBulk, _: Admin, db: Db):
    if body.action == "delete":
        rows = list(
            (await db.execute(select(Upload).where(Upload.id.in_(body.ids))))
            .scalars()
            .all()
        )
        for r in rows:
            await storage.delete(r.storage_key)
        await db.execute(delete(Upload).where(Upload.id.in_(body.ids)))

        cfg = (
            await db.execute(select(EventConfig).where(EventConfig.id == 1))
        ).scalar_one_or_none()
        if cfg and any(r.storage_key == cfg.cover_key for r in rows):
            await db.execute(
                update(EventConfig).where(EventConfig.id == 1).values(cover_key=None)
            )
    else:
        new_status = "approved" if body.action == "approve" else "rejected"
        approved_at = _now_ms() if new_status == "approved" else None
        await db.execute(
            update(Upload)
            .where(Upload.id.in_(body.ids))
            .values(status=new_status, approved_at=approved_at)
        )

    await db.commit()
    return {"ok": True, "count": len(body.ids)}


@router.get("/stats")
async def stats(_: Admin, db: Db):
    rows = (
        await db.execute(
            select(Upload.status, Upload.mime_type, Upload.size_bytes)
        )
    ).all()
    counts = {
        "total": len(rows),
        "approved": 0,
        "pending": 0,
        "rejected": 0,
        "photos": 0,
        "videos": 0,
        "totalBytes": 0,
    }
    for r in rows:
        counts[r.status] = counts.get(r.status, 0) + 1
        if r.mime_type.startswith("image/"):
            counts["photos"] += 1
        elif r.mime_type.startswith("video/"):
            counts["videos"] += 1
        counts["totalBytes"] += r.size_bytes
    return counts


@router.get("/export.zip")
async def export_zip(_: Admin):
    raise HTTPException(501, detail="not_implemented_yet")


@router.post("/imports")
async def imports(_: Admin):
    raise HTTPException(501, detail="not_implemented_yet")
