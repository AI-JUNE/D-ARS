import { NextResponse } from 'next/server';
import { findUser, signToken, COOKIE, SESSION_HOURS } from '@/lib/auth';
export const dynamic = 'force-dynamic';
export async function POST(req) {
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
