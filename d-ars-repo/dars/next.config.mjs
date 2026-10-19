// ── 어르신 화면의 주소는 그 자체가 인증 수단이다 ──────────────────────────────
//
// 고친 결함: 「이음 어르신 신청」 링크는 경로에 토큰을 싣는다(`/eum/senior/<token>`) — 회원가입이
// 없으므로 그 주소가 유일한 인증 수단이다(lib/eumToken.js 의 머리 주석). 제출 라우트는 그 사실을
// 알고 있어서 토큰을 쿼리스트링이 아니라 **본문**으로 받는다. 그 자리의 주석이 적어 둔 이유가
// 「접근로그·**리퍼러** 유출 방지」다.
//
// 그런데 **그 요청 자신의 `Referer` 헤더가 토큰을 들고 있었다.** 선언이 하나도 없으면 브라우저는
// 기본 방침 `strict-origin-when-cross-origin` 으로 돈다 — 그것이 가리는 것은 **다른 출처**로 나가는
// 요청뿐이고, **같은 출처** 요청에는 **주소 전체**(경로·질의)를 그대로 보낸다. 이 화면이 거는
// 요청은 전부 같은 출처다:
//   · `POST /api/eum/senior/preferences` → 본문으로 옮겨 둔 그 토큰이 `Referer` 로 따라간다.
//   · `/_next/static/**` 의 CSS·스크립트 → 어르신이 화면을 열 때마다 토큰이 든 주소가 정적 자원
//     요청의 `Referer` 로 나간다(CDN·플랫폼 접근로그가 흔히 기록하는 헤더다).
// 즉 토큰을 본문으로 옮긴 그 고침이 **절반**이었다. 1회용·5분이라 범위는 좁지만, 그 5분 안에
// 로그를 읽을 수 있는 쪽은 링크를 그대로 쓸 수 있다 — 어르신이 고르지 않은 활동·시간이 접수되고,
// 정작 어르신에게는 「이미 신청하셨습니다」가 뜬다(되돌릴 길이 없는 화면이다).
//
// 왜 `metadata.referrer`(= `<meta name="referrer">`)가 아닌가: **늦게 도착한다.** 빌드 산출물의
// head 순서를 확인한 사실이다 — `<link rel="stylesheet">` 와 스크립트 태그가 metadata 가 그리는
// `<meta>` 들보다 **앞**에 있다. 그 앞에서 이미 떠난 요청에는 뒤에 붙은 선언이 닿지 않는다.
// 응답 헤더는 문서보다 먼저 도착하므로 그 자원 요청까지 함께 덮는다.
//
// 범위는 `/eum` 아래뿐이다 — 포털 쪽 응답은 한 줄도 바뀌지 않는다(어르신 화면의 전역 CSS
// 차단막을 `.eum-screen` 안쪽으로만 둔 것과 같은 계약 · app/eum/senior/[token]/ui.jsx).
// `no-referrer` 를 고르는 이유: 이 화면군에는 리퍼러가 필요한 것이 하나도 없다(분석 도구도,
// 바깥으로 나가는 링크도 없다). `origin` 으로 깎으면 "무엇이 남는가" 를 매번 다시 판단해야 한다.
const EUM_REFERRER_POLICY = 'no-referrer';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async headers() {
    return [
      // `/eum` 자체와 그 아래 전부.
      // 두 줄인 이유: 빌드 산출물(`.next/routes-manifest.json`)에서 둘째 줄의 컴파일된 정규식은
      // `^/eum(?:/(…))?(?:/)?$` 라 `/eum` 도 함께 받는다 — 즉 지금은 겹친다. 그래도 첫 줄을
      // 두는 것은 그 겹침이 **패턴 확장 규칙**(`:path*` 가 앞 슬래시까지 선택으로 묶는다)에
      // 달려 있기 때문이다. 그 규칙이 바뀌는 날 잃는 것은 `/eum` 한 줄이고, 그 주소는 문자에서
      // 잘린 링크로 **실제로 열리는 진입 경로**다(app/eum/page.jsx). 값이 같으므로 겹침의
      // 대가는 없다 — 설치된 Next 소스로 확인했다: 헤더 규칙은 `resHeaders[key] = value` 로
      // **덮어쓴다**(`set-cookie` 만 배열에 쌓는다 ·
      // `next/dist/server/lib/router-utils/resolve-routes.js`). 같은 값이 두 번 나가지 않는다.
      {
        source: '/eum',
        headers: [{ key: 'Referrer-Policy', value: EUM_REFERRER_POLICY }],
      },
      {
        source: '/eum/:path*',
        headers: [{ key: 'Referrer-Policy', value: EUM_REFERRER_POLICY }],
      },
    ];
  },
};

export default nextConfig;
