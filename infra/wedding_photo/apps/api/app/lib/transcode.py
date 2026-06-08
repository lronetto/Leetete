import io
import logging

import pillow_heif
from PIL import Image, ImageOps

pillow_heif.register_heif_opener()

logger = logging.getLogger(__name__)

HEIC_MIMES = {"image/heic", "image/heif"}


def is_heic(mime_type: str) -> bool:
    return mime_type.lower() in HEIC_MIMES


def heic_to_jpeg(heic_bytes: bytes, quality: int = 88) -> bytes:
    """Decode HEIC, apply EXIF rotation, re-encode as JPEG.

    Raises on any decode/encode failure so the caller can decide whether
    to keep the HEIC fallback.
    """
    img = Image.open(io.BytesIO(heic_bytes))
    img = ImageOps.exif_transpose(img)
    if img.mode not in ("RGB", "L"):
        img = img.convert("RGB")
    out = io.BytesIO()
    img.save(out, format="JPEG", quality=quality, optimize=True, progressive=True)
    return out.getvalue()


def swap_extension_to_jpg(key: str) -> str:
    lower = key.lower()
    if lower.endswith(".heic"):
        return key[: -len(".heic")] + ".jpg"
    if lower.endswith(".heif"):
        return key[: -len(".heif")] + ".jpg"
    return key + ".jpg"
