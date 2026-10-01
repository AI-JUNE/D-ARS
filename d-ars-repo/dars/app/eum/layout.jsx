// app/eum/layout.jsx — 어르신 화면 묶음의 레이아웃 겸 **제품 브랜드 차단막**
//
// 고친 결함: 이 화면들은 `title` 만 어르신 것으로 덮어쓰고 있었다. 그런데 Next 의 `metadata` 는
// 레이아웃에서 페이지로 **상속**되고, 자식이 적지 않은 최상위 키는 부모 값이 그대로 내려간다.
// 루트 레이아웃(`app/layout.jsx`)은 운영 포털용으로 `openGraph`·`twitter`·`applicationName`·
// `appleWebApp` 을 선언해 두었으므로, 어르신 화면의 head 에는 제품 브랜드 제목과 사이트 이름이
// 그대로 실려 있었다.
//
// 왜 사소하지 않은가: **어르신은 링크를 문자로 받는다**(이 기능의 유일한 진입 경로다). 문자·메신저
// 앱은 링크를 받으면 그 주소를 긁어 `og:*` 로 **미리보기 카드**를 만들고, 어르신이 신청 화면보다
// 먼저 보는 것이 그 카드다. 거기 적혀 있던 것은 「이음 어르신 신청」이 아니라 운영 포털의 제목과
// 사이트 이름이었다 — 담당자가 보낸 링크인지 알아볼 단서가 없고, 「제품 화면을 어르신에게 노출하지
// 않는다」는 요건(로고·도입사례·요금표 표시 금지)이 화면 본문에서만 지켜지고 있었던 셈이다.
// 홈 화면에 추가했을 때의 이름(`appleWebApp`·`applicationName`)도 같다.
// 금지 문구는 테스트가 **화면 코드**에서 막고 있었지만 head 는 아무도 보지 않았다.
//
// 그래서 묶음 전체에 하나만 두어 단일 출처로 삼는다 — `/eum` · `/eum/senior` ·
// `/eum/senior/[token]` 과 경계 화면(오류·대기)이 모두 이 레이아웃 아래에 있다.
// 페이지가 자기 `title` 을 다시 적는 것은 그대로 둔다(같은 문구 · 가장 가까운 선언이 이긴다).
//
// 값을 지우는 대신 **어르신 문구로 덮어쓴다**: 최상위 키를 하나라도 적으면 그 키의 부모 값은
// 통째로 대체되므로, 덮어쓰기는 상속이 어떻게 합쳐지든 결과가 같다. 미리보기 카드를 없애지
// 않는 이유는 그 카드가 어르신에게 **도움이 되기 때문**이다 — 「이음 어르신 신청」이라고 적힌
// 카드는 담당자가 보낸 링크임을 알아보는 단서가 된다.
//
// 남겨 둔 상속은 `tests/eumseniorui.test.mjs` 가 사유와 함께 고정한다(파비콘·`metadataBase` 등).

const EUM_TITLE = '이음 어르신 신청';
const EUM_DESC = '이음 어르신 신청 화면입니다.';

export const metadata = {
  // 루트 템플릿('%s · 제품명')을 쓰지 않는다 — 어르신 화면에는 제품 브랜드를 노출하지 않는다.
  title: { absolute: EUM_TITLE },
  description: EUM_DESC,
  // 검색 색인 차단(루트와 같은 방침). 토큰이 든 주소가 색인되면 안 되므로 여기서도 명시한다.
  robots: { index: false, follow: false, googleBot: { index: false, follow: false } },
  // 문자·메신저가 읽는 미리보기 카드. 제품 이름·주소를 싣지 않는다
  // (부모의 `url`·`siteName` 까지 함께 대체된다 — 최상위 키 단위로 바뀌기 때문).
  openGraph: {
    type: 'website',
    locale: 'ko_KR',
    siteName: EUM_TITLE,
    title: EUM_TITLE,
    description: EUM_DESC,
  },
  twitter: { card: 'summary', title: EUM_TITLE, description: EUM_DESC },
  // 브라우저·홈 화면이 말하는 이름.
  applicationName: EUM_TITLE,
  appleWebApp: { title: EUM_TITLE, statusBarStyle: 'default' },
};

// 레이아웃은 화면을 그리지 않는다 — 어르신 화면의 표현은 `senior/[token]/ui.jsx` 한 곳뿐이고,
// 여기에 머리말·꼬리말을 더하면 그 단일 출처가 둘로 갈라진다(버튼 4개 이내 요건도 함께 흔들린다).
export default function EumLayout({ children }) {
  return <>{children}</>;
}
