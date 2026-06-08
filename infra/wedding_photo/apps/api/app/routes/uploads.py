import asyncio
import time
from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db.base import get_db
from ..db.models import EventConfig, Upload
from ..lib.ids import hash_ip, upload_id
from ..lib.storage import storage
from ..lib.transcode import heic_to_jpeg, is_heic, swap_extension_to_jpg
from ..schemas.api import UploadConfirmIn, UploadInitIn

router = APIRouter()

SINGLE_PUT_MAX = 50 * 1024 * 1024
PART_SIZE = 10 * 1024 * 1024
KEY_PREFIX = "uploads"
IP_HASH_SALT = "wedding-uploads-v1"

Db = Annotated[AsyncSession, Depends(get_db)]


def _ext_from(filename: str, mime_type: str) -> str:
    dot = filename.rfind(".")
    if dot >= 0 and dot < len(filename) - 1:
        ext = filename[dot + 1 :].lower()
        if len(ext) <= 6 and ext.isalnum():
            return ext
    return {
        "image/jpeg": "jpg",
        "image/png": "png",
        "image/webp": "webp",
        "image/heic": "heic",
        "image/heif": "heif",
        "image/gif": "gif",
        "video/mp4": "mp4",
        "video/quicktime": "mov",
        "video/webm": "webm",
    }.get(mime_type.lower(), "bin")


def _build_key(uid: str, filename: str, mime: str) -> str:
    now = datetime.now(UTC)
    ext = _ext_from(filename, mime)
    return f"{KEY_PREFIX}/{now.year}/{now.month:02d}/{uid}.{ext}"


def _client_ip(request: Request) -> str:
    h = request.headers
    if cf := h.get("cf-connecting-ip"):
        return cf
    xff = h.get("x-forwarded-for")
    if xff:
        first = xff.split(",")[0].strip()
        if first:
            return first
    if real := h.get("x-real-ip"):
        return real
    return "unknown"


def _now_ms() -> int:
    return int(time.time() * 1000)


@router.post("/init")
async def init_upload(body: UploadInitIn, request: Request, db: Db):
    cfg = (
        await db.execute(select(EventConfig).where(EventConfig.id == 1))
    ).scalar_one_or_none()
    if not cfg:
        raise HTTPException(500, detail="not_configured")

    is_video = body.mimeType.startswith("video/")
    if is_video and not cfg.allow_video:
        raise HTTPException(400, detail="video_not_allowed")
    if body.sizeBytes > cfg.max_file_mb * 1024 * 1024:
        raise HTTPException(
            400, detail={"error": "file_too_large", "maxFileMb": cfg.max_file_mb}
        )
    if (
        is_video
        and body.durationSeconds is not None
        and body.durationSeconds > cfg.max_video_seconds
    ):
        raise HTTPException(
            400,
            detail={
                "error": "video_too_long",
                "maxVideoSeconds": cfg.max_video_seconds,
            },
        )

    uid = upload_id()
    key = _build_key(uid, body.filename, body.mimeType)
    ip_h = hash_ip(_client_ip(request), IP_HASH_SALT)

    if body.sizeBytes <= SINGLE_PUT_MAX:
        presigned = storage.presign_put(key, body.mimeType, expires_in=900)
        db.add(
            Upload(
                id=uid,
                storage_key=key,
                mime_type=body.mimeType,
                size_bytes=body.sizeBytes,
                duration_seconds=body.durationSeconds,
                author_name=(body.authorName or "").strip() or None,
                message=(body.message or "").strip() or None,
                status="pending",
                source="guest",
                ip_hash=ip_h,
                created_at=_now_ms(),
            )
        )
        await db.commit()
        return {
            "uploadId": uid,
            "storageKey": key,
            "mode": "single",
            "putUrl": presigned["url"],
            "putHeaders": presigned["headers"],
        }

    part_count = (body.sizeBytes + PART_SIZE - 1) // PART_SIZE
    multipart = await storage.init_multipart(
        key, body.mimeType, part_count, expires_in=3600 * 6
    )

    db.add(
        Upload(
            id=uid,
            storage_key=key,
            mime_type=body.mimeType,
            size_bytes=body.sizeBytes,
            duration_seconds=body.durationSeconds,
            author_name=(body.authorName or "").strip() or None,
            message=(body.message or "").strip() or None,
            status="pending",
            source="guest",
            ip_hash=ip_h,
            provider_upload_id=multipart["upload_id"],
            created_at=_now_ms(),
        )
    )
    await db.commit()

    return {
        "uploadId": uid,
        "storageKey": key,
        "mode": "multipart",
        "multipart": {
            "providerUploadId": multipart["upload_id"],
            "partSize": multipart["part_size"],
            "partUrls": multipart["part_urls"],
        },
    }


@router.post("/{upload_id}/confirm")
async def confirm_upload(upload_id: str, body: UploadConfirmIn, db: Db):
    row = (
        await db.execute(select(Upload).where(Upload.id == upload_id))
    ).scalar_one_or_none()
    if not row:
        raise HTTPException(404, detail="not_found")
    if row.status == "approved":
        return {"ok": True, "alreadyApproved": True}

    cfg = (
        await db.execute(select(EventConfig).where(EventConfig.id == 1))
    ).scalar_one_or_none()
    if not cfg:
        raise HTTPException(500, detail="not_configured")

    if body.multipart:
        if body.multipart.providerUploadId != row.provider_upload_id:
            raise HTTPException(400, detail="multipart_mismatch")
        await storage.complete_multipart(
            row.storage_key,
            body.multipart.providerUploadId,
            [{"partNumber": p.partNumber, "etag": p.etag} for p in body.multipart.parts],
        )

    head = await storage.head(row.storage_key)
    if head is None:
        raise HTTPException(400, detail="not_uploaded")

    # Transparently transcode HEIC to JPEG so the gallery renders in any
    # browser. Falls back to the original on any failure so an upload is
    # never lost; admin can re-upload manually if needed.
    if is_heic(row.mime_type):
        try:
            src_bytes = await storage.get_bytes(row.storage_key)
            jpeg_bytes = await asyncio.to_thread(heic_to_jpeg, src_bytes)
            new_key = swap_extension_to_jpg(row.storage_key)
            await storage.put_bytes(new_key, jpeg_bytes, "image/jpeg")
            if new_key != row.storage_key:
                await storage.delete(row.storage_key)
            row.storage_key = new_key
            row.mime_type = "image/jpeg"
            row.size_bytes = len(jpeg_bytes)
        except Exception as e:  # noqa: BLE001
            print(f"[transcode] HEIC->JPEG failed for {row.storage_key}: {e}")

    final_status = "pending" if cfg.moderation == "pre" else "approved"
    row.status = final_status
    row.approved_at = _now_ms() if final_status == "approved" else None
    await db.commit()
    return {"ok": True, "status": final_status}


@router.post("/{upload_id}/abort")
async def abort_upload(upload_id: str, db: Db):
    row = (
        await db.execute(select(Upload).where(Upload.id == upload_id))
    ).scalar_one_or_none()
    if not row:
        raise HTTPException(404, detail="not_found")
    if row.provider_upload_id:
        await storage.abort_multipart(row.storage_key, row.provider_upload_id)
    await db.delete(row)
    await db.commit()
    return {"ok": True}
