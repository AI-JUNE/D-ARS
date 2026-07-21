import { NextResponse } from 'next/server';
import { COOKIE, verifyToken, isEnforced, minRoleFor, roleAtLeast } from '@/lib/auth';

export async function middleware(req) {
  try {
    if (!isEnforced()) return NextResponse.next();           // 데모 모드: 통과
    const { pathname } = req.nextUrl;
    const isApi = pathname.startsWith('/api/');              // API 는 리다이렉트 대신 JSON 에러
    const token = req.cookies.get(COOKIE)?.value;
    const user = token ? await verifyToken(token) : null;
    if (!user) {
      if (isApi) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
      const url = req.nextUrl.clone();
      url.pathname = '/login';
      url.searchParams.set('next', pathname);
      return NextResponse.redirect(url);
    }
    if (!roleAtLeast(user.role, minRoleFor(pathname))) {
      if (isApi) return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });
      const url = req.nextUrl.clone();
      url.pathname = '/dashboard';
      url.searchParams.set('denied', pathname);
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  } catch {
    return NextResponse.next();                              // 장애 시 무조건 통과(사이트 무붕괴)
  }
}

export const config = {
  matcher: [
    '/dashboard/:path*', '/sessions/:path*', '/scenarios/:path*', '/docs/:path*',
    '/ums/:path*', '/stats/:path*', '/notifications/:path*', '/history/:path*',
    '/report/:path*', '/templates/:path*', '/launcher/:path*', '/help/:path*',
    // API 보호: auth·health·cpaas·visual·dev 는 공개(각자 인증 보유), 나머지 포털 API는 로그인 필요
    '/api/((?!auth|health|cpaas|visual|dev).*)',  // 머신/토큰/데모: 자체 인증(webhook-secret·서명토큰·DEMO_MODE)
  ],
};
