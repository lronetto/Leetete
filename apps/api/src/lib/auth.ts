import type { Context, Next } from 'hono';
import type { Bindings } from '../env.js';

interface AccessJwtPayload {
  email?: string;
  sub?: string;
  aud?: string | string[];
  exp?: number;
  iat?: number;
}

interface JwtHeader {
  alg: string;
  kid: string;
  typ?: string;
}

export async function requireAdmin(c: Context<Bindings>, next: Next) {
  const token = c.req.header('cf-access-jwt-assertion');
  if (!token) return c.json({ error: 'unauthorized' }, 401);

  const payload = await verifyAccessJwt(token, c.env.CF_ACCESS_TEAM, c.env.CF_ACCESS_AUD);
  if (!payload?.email) return c.json({ error: 'unauthorized' }, 401);

  const allowed = c.env.ALLOWED_ADMIN_EMAILS.split(',').map((s) => s.trim().toLowerCase());
  if (!allowed.includes(payload.email.toLowerCase())) {
    return c.json({ error: 'forbidden' }, 403);
  }
  c.set('adminEmail', payload.email);
  await next();
}

async function verifyAccessJwt(
  token: string,
  team: string,
  expectedAud: string,
): Promise<AccessJwtPayload | null> {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [headerB64, payloadB64, sigB64] = parts as [string, string, string];

  let header: JwtHeader;
  let payload: AccessJwtPayload;
  try {
    header = JSON.parse(b64urlDecodeString(headerB64)) as JwtHeader;
    payload = JSON.parse(b64urlDecodeString(payloadB64)) as AccessJwtPayload;
  } catch {
    return null;
  }

  const audOk = Array.isArray(payload.aud)
    ? payload.aud.includes(expectedAud)
    : payload.aud === expectedAud;
  if (!audOk) return null;
  if (payload.exp && payload.exp * 1000 < Date.now()) return null;

  const certsRes = await fetch(`https://${team}/cdn-cgi/access/certs`);
  if (!certsRes.ok) return null;
  const certs = (await certsRes.json()) as { keys: Array<JsonWebKey & { kid?: string }> };
  const jwk = certs.keys.find((k) => k.kid === header.kid);
  if (!jwk) return null;

  const cryptoKey = await crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify'],
  );
  const data = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
  const valid = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    b64urlDecode(sigB64),
    data,
  );
  return valid ? payload : null;
}

function b64urlDecode(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  const b64 = (s + pad).replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function b64urlDecodeString(s: string): string {
  return new TextDecoder().decode(b64urlDecode(s));
}
