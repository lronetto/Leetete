import type { Context, Next } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { sign, verify } from 'hono/jwt';
import type { Bindings } from '../env.js';

const COOKIE = 'wedding_admin';
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

interface SessionPayload {
  email: string;
  exp: number;
}

export async function requireAdmin(c: Context<Bindings>, next: Next) {
  const token = getCookie(c, COOKIE);
  if (!token) return c.json({ error: 'unauthorized' }, 401);
  try {
    const payload = (await verify(
      token,
      c.env.SESSION_SECRET,
      'HS256',
    )) as unknown as SessionPayload;
    if (!payload.email) return c.json({ error: 'unauthorized' }, 401);
    c.set('adminEmail', payload.email);
    await next();
  } catch {
    return c.json({ error: 'unauthorized' }, 401);
  }
}

export async function createSession(c: Context<Bindings>, email: string) {
  const exp = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  const token = await sign({ email, exp }, c.env.SESSION_SECRET, 'HS256');
  const secure = c.env.NODE_ENV === 'production';
  setCookie(c, COOKIE, token, {
    httpOnly: true,
    secure,
    sameSite: 'Lax',
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  });
}

export function destroySession(c: Context<Bindings>) {
  deleteCookie(c, COOKIE, { path: '/' });
}

export async function timingSafeEqual(a: string, b: string): Promise<boolean> {
  if (a.length !== b.length) return false;
  const enc = new TextEncoder();
  const aBytes = enc.encode(a);
  const bBytes = enc.encode(b);
  let result = 0;
  for (let i = 0; i < aBytes.length; i++) result |= aBytes[i]! ^ bBytes[i]!;
  return result === 0;
}
