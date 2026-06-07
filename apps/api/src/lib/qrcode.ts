import QRCode from 'qrcode';

export async function generateQrPng(text: string, size = 512): Promise<Uint8Array> {
  const dataUrl = await QRCode.toDataURL(text, {
    errorCorrectionLevel: 'M',
    margin: 2,
    width: size,
  });
  const base64 = dataUrl.split(',')[1] ?? '';
  return Uint8Array.from(Buffer.from(base64, 'base64'));
}

export function generateQrSvg(text: string): Promise<string> {
  return QRCode.toString(text, {
    type: 'svg',
    errorCorrectionLevel: 'M',
    margin: 2,
  });
}
