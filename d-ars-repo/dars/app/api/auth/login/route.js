import { NextResponse } from 'next/server';
import { findUser, signToken, COOKIE, SESSION_HOURS } from '@/lib/auth';
import { createRateLimiter, clientIp } from '@/lib/rateLimit';
export const dynamic = 'force-dynamic';

// 브루트포스 완화: IP당 5분 내 로그인 시도 10회 제한(인메모리 · 단일 인스턴스).
// [승인 필요] 멀티노드/서버리스 확장 시 Redis 등 공유 스토어로 교체.
const loginLimiter = createRateLimiter({ windowMs: 5 * 60_000, max: 10 });

export async function POST(req) {
  const ip = clientIp(req);
  const gate = loginLimiter.check(ip);
  if (!gate.allowed) {
    return NextResponse.json(
      { ok: false, error: '로그인 시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.' },
      { status: 429, headers: { 'Retry-After': String(gate.retryAfterSec) } },
    );
  }
  const { username, password } = await req.json().catch(() => ({}));
  const u = findUser(username, password);
  if (!u) return NextResponse.json({ ok: false, error: '아이디 또는 비밀번호가 올바르지 않습니다.' }, { status: 401 });
  const token = await signToken({ u: u.u, role: u.role, name: u.name });
  const res = NextResponse.json({ ok: true, role: u.role, name: u.name });
  res.cookies.set(COOKIE, token, {
    httpOnly: true, sameSite: 'lax', path: '/', maxAge: SESSION_HOURS * 3600,
    secure: process.env.NODE_ENV === 'production',
  });
  return res;
}
