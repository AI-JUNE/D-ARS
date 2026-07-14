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
    // API 보호: 로그인(/api/auth/*)·헬스(/api/health)만 공개, 나머지는 인증 필요
    '/api/((?!auth|health).*)',
  ],
};
