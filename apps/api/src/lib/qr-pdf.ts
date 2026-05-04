import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { generateQrPng } from './qrcode.js';

export interface QrPdfOptions {
  url: string;
  coupleNames: string;
  eventDate?: string;
  callToAction?: string;
}

const PT_PER_MM = 2.834645669;
const A6_WIDTH = 105 * PT_PER_MM;
const A6_HEIGHT = 148 * PT_PER_MM;

function centerX(text: string, fontSize: number, font: import('pdf-lib').PDFFont): number {
  const w = font.widthOfTextAtSize(text, fontSize);
  return (A6_WIDTH - w) / 2;
}

export async function generateQrPdf(opts: QrPdfOptions): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([A6_WIDTH, A6_HEIGHT]);

  const titleFont = await pdf.embedFont(StandardFonts.TimesRomanItalic);
  const bodyFont = await pdf.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdf.embedFont(StandardFonts.HelveticaBold);

  const ink = rgb(0.18, 0.16, 0.14);
  const muted = rgb(0.45, 0.42, 0.38);

  const titleSize = 28;
  const titleY = A6_HEIGHT - 28 * PT_PER_MM;
  page.drawText(opts.coupleNames, {
    x: centerX(opts.coupleNames, titleSize, titleFont),
    y: titleY,
    size: titleSize,
    font: titleFont,
    color: ink,
  });

  if (opts.eventDate) {
    const dateSize = 11;
    page.drawText(opts.eventDate, {
      x: centerX(opts.eventDate, dateSize, bodyFont),
      y: titleY - 7 * PT_PER_MM,
      size: dateSize,
      font: bodyFont,
      color: muted,
    });
  }

  const qrPng = await generateQrPng(opts.url, 600);
  const qrImage = await pdf.embedPng(qrPng);
  const qrSize = 70 * PT_PER_MM;
  const qrX = (A6_WIDTH - qrSize) / 2;
  const qrY = (A6_HEIGHT - qrSize) / 2 - 8 * PT_PER_MM;
  page.drawImage(qrImage, { x: qrX, y: qrY, width: qrSize, height: qrSize });

  const cta = opts.callToAction ?? 'Aponte a câmera do celular';
  const ctaSize = 12;
  page.drawText(cta, {
    x: centerX(cta, ctaSize, boldFont),
    y: qrY - 9 * PT_PER_MM,
    size: ctaSize,
    font: boldFont,
    color: ink,
  });

  const sub = 'para enviar fotos e mensagem';
  const subSize = 10;
  page.drawText(sub, {
    x: centerX(sub, subSize, bodyFont),
    y: qrY - 14 * PT_PER_MM,
    size: subSize,
    font: bodyFont,
    color: muted,
  });

  return await pdf.save();
}
