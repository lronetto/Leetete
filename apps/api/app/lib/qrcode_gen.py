import io

import qrcode
from qrcode.constants import ERROR_CORRECT_M
from qrcode.image.svg import SvgPathImage


def _make(text: str, box_size: int = 10) -> qrcode.QRCode:
    qr = qrcode.QRCode(
        version=None,
        error_correction=ERROR_CORRECT_M,
        box_size=box_size,
        border=2,
    )
    qr.add_data(text)
    qr.make(fit=True)
    return qr


def generate_qr_png(text: str, size: int = 800) -> bytes:
    # box_size is per-module pixels; estimate to hit target output size
    qr = _make(text, box_size=1)
    modules = qr.modules_count + qr.border * 2
    box_size = max(4, size // modules)
    qr = _make(text, box_size=box_size)
    img = qr.make_image(fill_color="black", back_color="white")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def generate_qr_svg(text: str) -> str:
    qr = _make(text, box_size=10)
    img = qr.make_image(image_factory=SvgPathImage)
    buf = io.BytesIO()
    img.save(buf)
    return buf.getvalue().decode("utf-8")
