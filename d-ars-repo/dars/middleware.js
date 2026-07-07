import { NextResponse } from 'next/server';
import { COOKIE, verifyToken, isEnforced, minRoleFor, roleAtLeast } from '@/lib/auth';

export async function middleware(req) {
  try {
    if (!isEnforced()) return NextResponse.next();           // 데모 모드: 통과
    const { pathname } = req.nextUrl;
    const token = req.cookies.get(COOKIE)?.value;
    const user = token ? await verifyToken(token) : null;
    if (!user) {
      const url = req.nextUrl.clone();
      url.pathname = '/login';
      url.searchParams.set('next', pathname);
      return NextResponse.redirect(url);
    }
    if (!roleAtLeast(user.role, minRoleFor(pathname))) {
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
  ],
};
