import { NextResponse } from 'next/server';
import { COOKIE, parseCookie, verifyToken } from '@/lib/auth';
import { clientIp } from '@/lib/rateLimit';
import { audit } from '@/lib/audit';
export const dynamic = 'force-dynamic';

export async function POST(req) {
  // 감사(P0-7): 세션이 유효하면 누가 로그아웃했는지 마스킹 후 기록(실패 무해화 — 응답에 영향 없음)
  try {
    const token = parseCookie(req?.headers?.get?.('cookie'), COOKIE);
    const user = token ? await verifyToken(token) : null;
    await audit('AUTH_LOGOUT', { actor: user?.u, role: user?.role, ip: clientIp(req) });
  } catch {}
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE, '', { httpOnly: true, path: '/', maxAge: 0 });
  return res;
}
