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
    '/admin/:path*',
    '/dashboard/:path*', '/sessions/:path*', '/scenarios/:path*', '/docs/:path*',
    '/ums/:path*', '/stats/:path*', '/notifications/:path*', '/history/:path*',
    '/report/:path*', '/templates/:path*', '/launcher/:path*', '/help/:path*',
    // API 보호: 아래 접두어는 **자체 인증**을 들고 오는 요청이라 포털 세션을 요구하지 않고,
    // 나머지 포털 API 는 로그인이 필요하다. 면제 목록의 단일 출처는 `lib/auth.SELF_AUTH_API`
    // (사유 포함)이며, Next 는 matcher 를 정적 리터럴로만 읽으므로 여기 손으로 적은 이 줄과
    // 등록부를 `tests/selfauthapi.test.mjs` 가 양방향으로 대조한다 — 빠뜨리면 테스트가 실패한다.
    // `eum/senior/` 가 빠져 있던 동안, AUTH_ENFORCE=1 은 어르신 신청 제출을 전부 401 로 만들었다
    // (화면은 그것을 「링크가 올바르지 않습니다」로 안내한다 — 링크는 멀쩡한데).
    '/api/((?!auth|health|cpaas|visual|dev|eum/senior/).*)',
  ],
};
