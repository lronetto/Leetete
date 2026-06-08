from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import settings
from ..db.base import get_db
from ..db.models import EventConfig, Upload
from ..lib.pdf import generate_qr_pdf
from ..lib.qrcode_gen import generate_qr_png, generate_qr_svg
from ..lib.storage import storage

router = APIRouter()
GALLERY_PAGE_SIZE = 24

Db = Annotated[AsyncSession, Depends(get_db)]


@router.get("/event")
async def get_event(db: Db):
    cfg = (
        await db.execute(select(EventConfig).where(EventConfig.id == 1))
    ).scalar_one_or_none()
    if not cfg:
        raise HTTPException(404, detail="not_configured")
    return {
        "coupleNames": cfg.couple_names,
        "eventDate": cfg.event_date,
        "welcomeMessage": cfg.welcome_message,
        "galleryVisibility": cfg.gallery_visibility,
        "allowVideo": cfg.allow_video,
        "maxFileMb": cfg.max_file_mb,
        "maxVideoSeconds": cfg.max_video_seconds,
        "coverUrl": storage.public_url(cfg.cover_key) if cfg.cover_key else None,
    }


@router.get("/gallery")
async def get_gallery(
    db: Db,
    cursor: str | None = None,
    limit: Annotated[int, Query(le=60, ge=1)] = GALLERY_PAGE_SIZE,
):
    cfg = (
        await db.execute(select(EventConfig).where(EventConfig.id == 1))
    ).scalar_one_or_none()
    if not cfg or cfg.gallery_visibility != "public":
        return {"items": [], "nextCursor": None}

    cursor_val: int | None = None
    if cursor and cursor.isdigit():
        cursor_val = int(cursor)

    stmt = select(Upload).where(Upload.status == "approved")
    if cursor_val is not None:
        stmt = stmt.where(Upload.created_at < cursor_val)
    stmt = stmt.order_by(Upload.created_at.desc()).limit(limit + 1)

    rows = list((await db.execute(stmt)).scalars().all())
    has_more = len(rows) > limit
    slice_rows = rows[:limit] if has_more else rows

    items = [
        {
            "id": r.id,
            "url": storage.public_url(r.storage_key),
            "thumbnailUrl": storage.public_url(r.thumbnail_key)
            if r.thumbnail_key
            else None,
            "mimeType": r.mime_type,
            "isVideo": r.mime_type.startswith("video/"),
            "authorName": r.author_name,
            "message": r.message,
            "createdAt": r.created_at,
        }
        for r in slice_rows
    ]
    next_cursor = str(slice_rows[-1].created_at) if has_more and slice_rows else None
    return {"items": items, "nextCursor": next_cursor}


@router.get("/qrcode")
async def get_qrcode(
    request: Request,
    db: Db,
    format: str = "png",
    url: str | None = None,
):
    fmt = format.lower()
    if url:
        base = url
    elif settings.PUBLIC_BASE_URL:
        base = settings.PUBLIC_BASE_URL
    else:
        base = str(request.base_url).rstrip("/")
    target = base.rstrip("/") + "/enviar"

    if fmt == "svg":
        svg = generate_qr_svg(target)
        return Response(
            content=svg,
            media_type="image/svg+xml; charset=utf-8",
            headers={"cache-control": "public, max-age=300"},
        )

    if fmt == "pdf":
        cfg = (
            await db.execute(select(EventConfig).where(EventConfig.id == 1))
        ).scalar_one_or_none()
        pdf_bytes = generate_qr_pdf(
            target,
            cfg.couple_names if cfg else settings.COUPLE_NAMES,
            cfg.event_date if cfg else settings.EVENT_DATE,
        )
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={
                "content-disposition": 'inline; filename="qr-mesa.pdf"',
                "cache-control": "no-store",
            },
        )

    png = generate_qr_png(target, 800)
    return Response(
        content=png,
        media_type="image/png",
        headers={"cache-control": "public, max-age=300"},
    )


@router.get("/stats")
async def get_stats(db: Db):
    rows = (
        await db.execute(
            select(Upload.id, Upload.mime_type).where(Upload.status == "approved")
        )
    ).all()
    photos = sum(1 for r in rows if r.mime_type.startswith("image/"))
    videos = sum(1 for r in rows if r.mime_type.startswith("video/"))
    return {"photos": photos, "videos": videos, "total": len(rows)}
