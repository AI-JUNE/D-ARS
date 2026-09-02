import { NextResponse } from 'next/server';
import { findUser, signToken, COOKIE, SESSION_HOURS } from '@/lib/auth';
import { clientIp } from '@/lib/rateLimit';
import { audit } from '@/lib/audit';
import { unauthorized } from '@/lib/apiError';
import { consume } from '@/lib/apiLimits';
export const dynamic = 'force-dynamic';

// 브루트포스 완화. 한도는 lib/apiLimits 정책표(login: 5분 10회)에 있다.
export async function POST(req) {
  const ip = clientIp(req);
  const over = consume('login', ip, '로그인 시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.');
  if (over) {
    await audit('AUTH_LOGIN_RATELIMITED', { ip });                 // 감사(P0-7): 마스킹 후 기록·실패 무해화
    return over;
  }
  const { username, password } = await req.json().catch(() => ({}));
  const u = findUser(username, password);
  if (!u) {
    await audit('AUTH_LOGIN_FAIL', { actor: username, ip });       // 감사(P0-7)
    return unauthorized('아이디 또는 비밀번호가 올바르지 않습니다.');
  }
  await audit('AUTH_LOGIN', { actor: u.u, role: u.role, ip });     // 감사(P0-7)
  const token = await signToken({ u: u.u, role: u.role, name: u.name });
  const res = NextResponse.json({ ok: true, role: u.role, name: u.name });
  res.cookies.set(COOKIE, token, {
    httpOnly: true, sameSite: 'lax', path: '/', maxAge: SESSION_HOURS * 3600,
    secure: process.env.NODE_ENV === 'production',
  });
  return res;
}
