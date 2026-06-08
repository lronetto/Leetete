import io

from reportlab.lib.colors import Color
from reportlab.lib.pagesizes import A6
from reportlab.lib.units import mm
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen.canvas import Canvas

from .qrcode_gen import generate_qr_png


def generate_qr_pdf(
    url: str, couple_names: str, event_date: str | None = None
) -> bytes:
    buf = io.BytesIO()
    width, height = A6
    c = Canvas(buf, pagesize=A6)

    ink = Color(0.18, 0.16, 0.14)
    muted = Color(0.45, 0.42, 0.38)

    # Title
    title_size = 28
    c.setFillColor(ink)
    c.setFont("Times-Italic", title_size)
    title_y = height - 28 * mm
    title_w = c.stringWidth(couple_names, "Times-Italic", title_size)
    c.drawString((width - title_w) / 2, title_y, couple_names)

    # Date
    if event_date:
        c.setFillColor(muted)
        c.setFont("Helvetica", 11)
        dw = c.stringWidth(event_date, "Helvetica", 11)
        c.drawString((width - dw) / 2, title_y - 7 * mm, event_date)

    # QR
    qr_png = generate_qr_png(url, 800)
    qr_img = ImageReader(io.BytesIO(qr_png))
    qr_size = 70 * mm
    qr_x = (width - qr_size) / 2
    qr_y = (height - qr_size) / 2 - 8 * mm
    c.drawImage(qr_img, qr_x, qr_y, qr_size, qr_size, preserveAspectRatio=True)

    # CTA
    cta = "Aponte a câmera do celular"
    c.setFillColor(ink)
    c.setFont("Helvetica-Bold", 12)
    cw = c.stringWidth(cta, "Helvetica-Bold", 12)
    c.drawString((width - cw) / 2, qr_y - 9 * mm, cta)

    sub = "para enviar fotos e mensagem"
    c.setFillColor(muted)
    c.setFont("Helvetica", 10)
    sw = c.stringWidth(sub, "Helvetica", 10)
    c.drawString((width - sw) / 2, qr_y - 14 * mm, sub)

    c.showPage()
    c.save()
    return buf.getvalue()
