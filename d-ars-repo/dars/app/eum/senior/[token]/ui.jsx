// app/eum/senior/[token]/ui.jsx — 어르신 화면 공통 표현(스타일 토큰 · 포커스 링 · 안내 패널)
//
// 왜 별도 파일인가: 만료/오류 안내는 **서버 컴포넌트(page)** 와 **클라이언트 흐름(SeniorFlow)**
// 양쪽에서 같은 모양으로 나와야 한다(토큰이 진입 시 만료된 경우 / 작성 도중 만료된 경우).
// 훅 없는 순수 표현 컴포넌트라 양쪽에서 그대로 쓸 수 있다.
//
// 디자인 요건(가이드 §6-2): 글자 18pt(=24px) 이상 · 명도 대비 4.5:1 이상 · 375px 폭 기준 1열.
// 로고·도입사례·요금표는 표시하지 않는다.
//   색과 글자 크기는 lib/eumTheme.js 가 단일 출처이며, 대비 4.5:1 은 테스트가 실제 값으로
//   계산해 검증한다(tests/eumtheme.test.mjs) — 색을 손보면 테스트가 먼저 깨진다.
//   **크기도 숫자를 여기 적지 않는다.** 예전에는 22·26·32 를 손으로 적어 두었고, 그중 22px 는
//   요건(24px) 아래였다 — 오류 안내·만료 임박 경고·되돌아가기 링크, 즉 무언가 잘못됐을 때
//   읽어야 하는 글자만 작았다. 숫자가 이 파일에 있으면 아무 테스트도 그것을 보지 못한다.
//
// 그리고 **인라인 style 만으로는 이 화면을 다 지킬 수 없다**(아래 EumStyles 참조) —
// `app/globals.css` 가 루트 레이아웃을 통해 이 화면까지 내려오고, 거기엔 요소 선택자가 있다.

import { EUM_COLORS as C, EUM_FONT_PX as F } from '@/lib/eumTheme';

// 375px 폭에서 가로 스크롤이 생기지 않게 하는 공통 규칙.
// width:100% 인 요소에 padding·border 가 더해지면 부모를 넘겨 화면이 옆으로 밀린다 → border-box 고정.
const BOX = { boxSizing: 'border-box', maxWidth: '100%' };

// 어르신 화면의 범위 표시. 이 클래스가 붙은 `<main>` 안에서만 아래 EumStyles 의 규칙이 산다 —
// 포털 화면에는 한 줄도 영향을 주지 않는다(단방향 차단막).
export const EUM_SCOPE = 'eum-screen';

// 주버튼(확인 화면의 「이대로 신청하기」 · 오류 화면의 「다시 시도」).
const PRIMARY = {
  display: 'block',
  width: '100%',
  minHeight: 72,
  padding: '18px 20px',
  fontSize: F.choice,
  fontWeight: 700,
  color: C.onBrand,
  background: C.brand,
  border: `3px solid ${C.brand}`,
  borderRadius: 12,
  cursor: 'pointer',
  ...BOX,
};

// 선택지 버튼(희망 활동 · 희망 시간대). 고른 것과 고르지 않은 것의 차이는 아래 S.choiceOn 이다.
const CHOICE = {
  display: 'block',
  width: '100%',
  minHeight: 72,
  padding: '18px 20px',
  fontSize: F.choice,
  fontWeight: 600,
  lineHeight: 1.4,
  textAlign: 'left',
  color: C.text,
  background: C.bg,
  border: `3px solid ${C.brand}`,
  borderRadius: 12,
  cursor: 'pointer',
  overflowWrap: 'break-word',
  ...BOX,
};

export const S = {
  page: {
    minHeight: '100vh',
    background: C.bg,
    color: C.text,
    fontSize: F.body, // 18pt
    lineHeight: 1.6,
    fontFamily: 'system-ui, -apple-system, "Malgun Gothic", sans-serif',
    padding: '24px 16px 48px',
    ...BOX,
  },
  wrap: { maxWidth: 480, margin: '0 auto', ...BOX },
  // 머리말·단계 표시·마무리 안내는 본문과 **같은 크기**이고 서열은 색(C.sub)으로만 준다 —
  // 작게 만들던 예전 방식은 요건(18pt) 아래로 내려가는 유일한 길이었다.
  kicker: { fontSize: F.sub, color: C.sub, margin: '0 0 4px' },
  h1: { fontSize: F.h1, lineHeight: 1.35, margin: '0 0 20px', fontWeight: 700, outline: 'none' },
  body: { fontSize: F.body, margin: '0 0 20px' },
  note: { fontSize: F.sub, color: C.sub, margin: '0 0 20px' },
  list: { display: 'grid', gap: 16, margin: '0 0 24px' },
  choice: CHOICE,
  // 고친 결함: **고른 것이 눈에는 보이지 않았다.** 선택 여부는 `aria-pressed` 하나로만 있었고
  // 네 버튼의 style 은 똑같았다 — 브라우저는 `[aria-pressed=true]` 를 저절로 꾸미지 않는다.
  // 그래서 이 사실은 스크린리더에만 전해졌고, 보는 어르신에게는 한 픽셀도 달라지지 않았다.
  // 보이는 자리: 2단계에서 「앞 화면으로」를 눌러 1단계로 돌아가면(또는 탭이 되살아나 복원되면)
  // 아까 고른 것이 주소에도 상태에도 남아 있는데 화면은 **처음과 똑같다**. 6회차에 고친 것이
  // "다시 그려져도 고른 것이 살아남는다" 였는데, 살아남은 것을 **보여 주지 않고 있었다** —
  // 어르신에게는 그 고침이 절반만 닿은 셈이다(두 번 고르게 하거나, 아까 고른 것을 기억에만
  // 의지해 되짚게 한다. 링크 수명은 5분이다).
  // 색만으로 말하지 않는다(WCAG 1.4.1) — 자리를 비워 둔 표시 칸(S.mark)에 ✓ 가 함께 붙는다.
  // 색 조합은 새로 들이지 않는다: 흰 글자 대 주색은 EUM_CONTRAST_PAIRS 의 ['onBrand','brand'].
  choiceOn: { ...CHOICE, color: C.onBrand, background: C.brand, fontWeight: 700 },
  // 고른 것 표시 칸. **모든** 선택지가 같은 폭을 비워 두어 라벨이 어긋나지 않게 한다
  // (고르지 않은 쪽은 빈칸 — 표시가 붙었다 떨어질 때 글자가 움직이면 그것만으로도 읽기 어렵다).
  mark: { display: 'inline-block', width: 34, fontWeight: 700 },
  primary: PRIMARY,
  // 제출이 진행 중일 때의 주버튼.
  //
  // 고친 결함: 포털 전역 CSS 의 `button:disabled{opacity:.55}` 가 이 버튼에도 내려와,
  // 「신청하는 중…」 동안 흰 글자 대 배경 대비가 **2.87:1** 로 떨어졌다(요건 4.5:1).
  // 눌림을 투명도로 말하면 요건을 지킬 방법이 없으므로 **색**으로 말한다 — 흰 글자 대 C.sub 는
  // 실측 10.4:1 이고 EUM_CONTRAST_PAIRS 의 ['onBrand','sub'] 가 그것을 지킨다.
  // 새 색을 들이지 않고 이미 쓰는 보조색을 재사용한다.
  // cursor 로도 말한다 — 이 버튼은 이제 `disabled` 가 아니라 `aria-disabled` 다(SeniorFlow 참조).
  primaryBusy: { ...PRIMARY, background: C.sub, border: `3px solid ${C.sub}`, cursor: 'progress' },
  // 이 화면에서 유일한 되돌리기 수단이다 — 가장 작게 둘 자리가 아니다(예전 22px).
  back: {
    display: 'inline-block',
    marginTop: 8,
    fontSize: F.back,
    color: C.brand,
    textDecorationLine: 'underline',
  },
  summary: {
    fontSize: F.summary,
    fontWeight: 600,
    padding: '18px 20px',
    border: `3px solid ${C.sub}`,
    borderRadius: 12,
    margin: '0 0 24px',
    overflowWrap: 'break-word',
    ...BOX,
  },
  // 제출이 실패했을 때 읽는 문장 · 만료 임박 경고 — 둘 다 예전에는 22px(요건 미달)이었다.
  alert: {
    fontSize: F.alert,
    color: C.onAlert,
    background: C.alertBg,
    padding: '14px 18px',
    borderRadius: 12,
    margin: '0 0 20px',
    ...BOX,
  },
  warn: {
    fontSize: F.warn,
    color: C.text,
    background: C.warnBg,
    border: `2px solid ${C.warnEdge}`,
    padding: '12px 16px',
    borderRadius: 12,
    margin: '0 0 20px',
    ...BOX,
  },
};

// 어르신 화면에만 붙는 최소 CSS. 두 가지 일을 한다.
//
// (1) 키보드 포커스 표시 — 인라인 style 로는 `:focus-visible` 을 표현할 수 없다. 링을 요소
//     **바깥**(offset)에 그려 파란 버튼 위가 아니라 흰 배경 위에 놓이게 한다(그래야 포커스색 대
//     배경 대비 4.5:1 이 성립한다). 어르신은 마우스 조작이 어려운 경우가 많아 두께를 4px 로 잡았다.
//
// (2) **포털 전역 CSS 차단** — 고친 결함이다. `app/globals.css` 는 루트 레이아웃이 import 하므로
//     어르신 화면에도 그대로 내려온다. 클래스 선택자(`.btn:disabled`)는 이 화면에 닿지 않지만
//     **요소·의사 선택자는 닿는다**. 어르신 화면은 요건(18pt·대비 4.5:1)을 인라인 style 로만
//     지켜 왔고, 인라인 style 은 자기가 적은 속성만 이긴다 — 적지 않은 속성은 전역 규칙이
//     그대로 가져간다. 그래서 이 화면 코드를 **한 줄도 건드리지 않은 채** 요건이 깨져 있었다:
//       · `button:disabled{opacity:.55}` → 「신청하는 중…」 동안 주버튼 대비 **2.87:1**
//         (흰 글자·파란 배경이 흰 바닥 위에서 함께 바래 버린다 — 요건은 4.5:1).
//         투명도로는 요건을 지킬 수 없으므로 끄고, 눌림은 색으로 말한다(S.primaryBusy).
//       · `a,button{transition:…}` → 이 파일은 그것을 끄려 했는데 질의가 **거꾸로**였다
//         (`prefers-reduced-motion: no-preference` — 움직임을 꺼 달라고 **하지 않은** 사람에게만
//         끄고, 꺼 달라고 한 사람에게는 그대로 뒀다). 이 화면에는 애니메이션이 필요한 곳이
//         없으므로 조건 없이 끈다.
//       · `body{letter-spacing:-0.01em}`·`h1,h2,h3,h4{letter-spacing:-0.02em}` → 글자를 좁혀
//         붙인다. 크기(24px 이상)는 지켜도 저시력 어르신이 읽는 자간이 포털 취향으로 눌렸다.
//       · `:focus-visible{box-shadow:var(--ring)}` → 포커스 링 바깥에 **제품 브랜드색** 번짐이
//         한 겹 더 깔린다(어르신 화면의 색 단일 출처는 lib/eumTheme 하나여야 한다).
//     막는 범위는 `.eum-screen` 안쪽뿐이다 — 포털 화면은 한 줄도 바뀌지 않는다.
//     재발 방지: 전역 CSS 의 요소 선택자를 **전부 분류**하게 하는 양방향 대조
//     (`lib/sourceLint.cssBareSelectors` + tests/eumseniorui.test.mjs).
//
// (3) **문서 바탕색** — 고친 결함이고, 위 (2)의 대조가 왜 절반이었는지를 보여 주는 자리다.
//     그 대조는 전역 CSS 의 **선택자 이름**을 분류하게 했고 `body` 는 「자간을 끈다」로 분류돼
//     있었다. 그런데 같은 `body` 규칙은 `background: var(--bg)`(포털 바탕색)도 들고
//     있었고, 그 속성은 아무도 판정하지 않았다 — 선택자는 이미 목록에 있으니 새 선언이 늘어도
//     테스트가 아무 말을 하지 않는다(`lib/sourceLint.cssBareDecls` 가 이제 선언까지 센다).
//     왜 보이는가: `background-color` 는 **문서 캔버스**로 전파된다 — html 에 배경이 없으면
//     브라우저는 body 의 색으로 캔버스를 칠하고, 그 캔버스가 보이는 자리가 오버스크롤
//     (iOS 의 고무줄 스크롤)이다. 어르신이 화면 끝에서 한 번 더 밀면 흰 화면 위아래로 포털
//     베이지 띠가 드러났다. 하필 8회차가 `viewport.themeColor` 를 이 화면의 바탕색으로 맞춰
//     둔 자리가 **그 띠의 바로 위**(주소창)다 — 주소창은 어르신 색인데 그 아래 한 겹이 포털
//     색이었으니, 그 고침도 절반이었던 셈이다.
//     이 규칙만은 `.eum-screen` 안쪽에 둘 수 없다 — 캔버스를 칠하는 것은 문서의 뿌리
//     (html·body)이고 그것은 범위 **바깥**이다. 대신 이 `<style>` 은 어르신 화면만 그리므로
//     포털 페이지에는 애초에 실리지 않는다. 범위 없는 규칙은 테스트가 **사유와 함께 등록**하게
//     하고 그 외에는 실패시킨다(예전 대조는 `.` 으로 시작하지 않는 줄을 건너뛰어, 범위가
//     아예 없는 규칙은 걸러지지 않았다 — 「범위 안쪽만 끈다」는 이름이 코드보다 앞서 있었다).
export function EumStyles() {
  return (
    <style>{`
      html, body { background: ${C.bg}; }
      .${EUM_SCOPE}, .${EUM_SCOPE} * { letter-spacing: normal; }
      .${EUM_SCOPE} a, .${EUM_SCOPE} button { transition: none; }
      .${EUM_SCOPE} button:disabled { opacity: 1; }
      .${EUM_SCOPE} :focus-visible { box-shadow: none; }
      .eum-focus:focus-visible {
        outline: 4px solid ${C.focus};
        outline-offset: 3px;
        border-radius: 12px;
      }
    `}</style>
  );
}

// 고른 것 표시(S.mark 와 함께 쓴다). 스크린리더에는 `aria-pressed` 가 이미 말하므로
// 이 글자는 `aria-hidden` 으로 가린다 — 같은 사실을 두 번 낭독하지 않게.
export const EUM_CHOICE_MARK = '✓';

// 제출·선택이 되지 않았을 때의 안내 한 줄. 문구는 `lib/eumMessage` 가 단일 출처다.
//
// ── 고친 결함: **안내가 가리키는 단추를 자기가 밀어냈다** ──────────────────────────────
// 이 안내는 확인 화면에서 **주버튼보다 위**에 한 자리만 있었다. 그래서 제출이 실패하는
// 순간(상한 8초를 기다린 뒤) 안내 한 덩어리가 끼어들며 요약·보조 사본 안내·주버튼을 통째로
// 아래로 밀어냈다. 하필 그 안내가 하던 말이 「**아래** 단추를 한 번 더 눌러 주세요」였다 —
// 누르라고 가리킨 단추를 그 문장이 그려지면서 다른 자리로 옮겨 놓은 셈이다. 저시력 어르신은
// 화면을 더듬어 읽는 대신 **자리를 외워** 누르고, 손이 아직 그 자리에 있는 동안 단추가
// 사라진다(그 다음 누름은 요약 글자 위로 떨어져 아무 일도 일어나지 않는다).
// 직전 세 회차가 고친 자리와 **같은 순간**이다 — 6회차 「그때 읽어야 하는 글자만 작았다」·
// 7회차 「같은 순간의 글자가 흐렸다」·8회차 「들리지 않았다」, 이번에는 **움직였다**.
//
// 그래서 자리를 **호출측이 정하게** 하고(확인 화면에서는 주버튼 **뒤**), 문구에서는 자리를
// 가리키는 낱말을 없앴다(`lib/eumMessage.EUM_SUBMIT_MESSAGE`). 「아래」는 애초에 눈에만
// 뜻이 있는 말이었다 — 스크린리더에 위·아래는 없고, 그 순간 포커스는 이미 그 단추에 남아
// 있다(8회차의 `aria-disabled`). 지금은 안내가 단추 **바로 아래**에 붙어 가리킬 필요도 없다.
// 할 말이 없으면 **빈 줄도 그리지 않는다**(PriorLocal 과 같은 계약).
export function Alert({ text = '' }) {
  if (!text) return null;
  return <p style={S.alert} role="alert">{text}</p>;
}

// 만료·오류 안내 패널. 되돌릴 방법이 없는 상태이므로 **버튼을 두지 않고** 다음 행동만 알려 준다
// (담당자에게 다시 요청 — 어르신이 스스로 재발급할 수단이 없기 때문).
//
//  - detail: 이미 접수된 링크로 들어왔을 때 **무엇이 접수됐는지** 한 줄로 보여 준다. 모르면
//    넘기지 않는다 — 빈 칸을 그리는 대신 아예 그리지 않는다(지어내지 않는다).
//  - hint: 다음에 무엇을 하면 되는지 한 줄(예: 바꾸려면 담당자에게). detail 과 마찬가지로
//    모르면 넘기지 않는다. 이 문장이 없으면 되돌릴 단추가 없는 화면이 **막다른 길**이 된다 —
//    어르신은 담당자에게 새 링크를 청하고, 그 링크로 낸 신청이 중복 접수가 된다.
//  - foot: 마무리 안내. **기본값을 두지 않는다**(아래 참조).
//  - children: 서버가 지을 수 없는 한 줄을 끼우는 자리. 지금 쓰는 곳은 만료 화면의
//    「이 기기에서 전에 신청하신 내용」 하나다(PriorLocal.jsx) — 그 사실은 **어르신 단말의
//    localStorage** 에만 있어 서버 컴포넌트가 읽을 수 없다. 패널 전체를 클라이언트로 만들면
//    (만료·잘린 링크까지 포함해) 네 화면이 전부 자바스크립트에 매달리므로, 그 한 줄만 조각으로
//    뗀다. 자리는 hint 다음·foot 앞이다 — 「무엇을 하면 된다」 뒤에 「하지 않아도 된다」가 와야
//    말이 이어진다.
//  - headingRef: 제목으로 포커스를 옮길 수 있게 내주는 자리(기본은 없음 — 서버 컴포넌트는
//    ref 를 넘길 수 없고, 넘길 필요도 없다: 그 셋은 **새로 열린 문서**라 브라우저가 알아서
//    문서 앞에서 시작한다). 아래쪽 「화면이 뒤집히는데 아무 말도 하지 않았다」 참조.
//
// ── 고친 결함: 마무리 문구가 **나오는 모든 자리에서 거짓이었다** ───────────────────────────
// 이 자리의 기본값은 "이 화면은 안전을 위해 5분이 지나면 닫힙니다" 였고, 바로 위 주석은
// 그것을 "기본은 만료 안내" 라고 적어 두었다. 그런데 `Notice` 가 실제로 쓰이는 자리는 넷이다 —
//   · 진입 시 만료(`[token]/page.jsx`) → 5분은 **이미 지났다**. 앞으로 닫힌다는 말은 거짓이고,
//     읽는 사람에게는 "그럼 지금은 왜 안 되지" 만 남는다.
//   · 작성 중 만료(`SeniorFlow`) → 같다.
//   · 잘린 링크(`/eum` · `/eum/senior`) → 토큰이 없는 **정적 페이지**라 닫히지 않는다.
//     애초에 열린 적이 없는 5분을 두고 "지나면 닫힙니다" 라고 말하고 있었다.
//   · 이미 접수됨 → 이 한 자리만 `foot` 을 따로 넘겨 맞는 말을 하고 있었다.
// 정작 그 문장이 맞는 화면(신청 흐름 1~4단계)은 `Notice` 를 쓰지 않고 자기 경고
// (`EUM_SOON_MESSAGE`)를 쓴다. 즉 **맞는 자리에는 없고 틀린 자리에만 있던 문장**이다.
// (정정: 그 경고도 「이 화면이 닫힙니다」라고 말하고 있었으니 **그 자리에서도 맞지 않았다** —
//  닫히는 것은 화면이 아니고, 실제로 일어나는 일은 이 패널로의 교체다. 8회차의 고침이 절반
//  이었던 셈이다. 지금 그 경고는 「잠시 후 링크가 만료됩니다」로, 바로 다음에 보게 되는 이
//  화면의 제목과 같은 낱말을 쓴다 · lib/eumCountdown.js)
// 왜 아무도 몰랐나: 기본값이라 아무 호출도 적지 않아도 조용히 붙는다 — 상속·전역 CSS 와 같은
// 모양이다. 그래서 기본값을 없애고(빠뜨리면 **아무 말도 하지 않는다**, 틀린 말을 하지 않는다)
// 상황별 문장을 아래 등록부에 두고, 호출마다 `foot` 을 적게 한다(tests/eumseniorui.test.mjs 가
// 호출 자리 ↔ 등록부를 양방향 대조한다 — 등록만 하고 안 쓰거나 안 적고 넘어가면 실패한다).
export const EUM_NOTICE_FOOT = {
  // 링크가 더 이상 열리지 않는 상태. 사실은 "이 화면이 닫힌다"가 아니라 "링크가 5분만 산다"다.
  expired: '링크는 안전을 위해 보내 드린 뒤 5분 동안만 열립니다.',
  // 토큰이 없는 경로(문자에서 잘린 링크·잘못된 링크). 이 화면은 닫히지 않는다 —
  // 할 수 있는 말은 무엇을 눌러야 하는가다(링크는 길어서 문자 앱이 줄 끝에서 자른다).
  // 문장에 '주소' 를 쓰지 않는다: 이 화면군의 개인정보 금지 검사가 그 낱말을 막는다(그리고
  // 어르신에게 '주소' 는 사는 곳으로 읽힌다). 이 화면의 어휘는 처음부터 「링크」 하나다.
  link: '문자에 있는 링크를 끝까지 눌러 주세요.',
  // 접수가 끝난 사람 — 더 할 일이 없다는 것이 이 자리에서 가장 중요한 사실이다.
  done: '이제 이 화면을 닫으셔도 됩니다.',
};

// ── 고친 결함: **화면이 뒤집히는데 아무 말도 하지 않았다** ────────────────────────────
// 작성 도중 5분이 지나면 신청 흐름이 이 패널로 **통째로 바뀐다**. 그런데 그때 포커스가 얹혀
// 있던 요소(선택지 버튼·「이대로 신청하기」)는 그 순간 문서에서 사라지므로, 브라우저는 포커스를
// 문서(body)로 돌려보낸다. 그래서 키보드·스크린리더로 쓰는 어르신에게는
//   ① 들리는 말이 **한 마디도 없다.** 새로 그려진 `role="status"` 는 그 자리에서 함께 태어난
//      영역이라 리더가 변화로 보지 않는 경우가 많다(살아 있던 영역의 내용이 바뀐 것이 아니다).
//      화면은 바뀌었는데 귀에는 아무 일도 일어나지 않은 것과 같다.
//   ② 다음 Tab 이 **문서 맨 앞**에서 시작한다. 이 패널에는 조작 요소가 하나도 없어(되돌릴
//      방법이 없는 상태이므로 일부러 두지 않았다) Tab 은 브라우저 바깥으로 빠져나간다.
// 흐름 쪽은 단계가 바뀔 때마다 제목으로 포커스를 옮기고 있었는데(`SeniorFlow` 의 headingRef),
// **흐름에서 이 패널로 뒤집히는 전환**만 아무것도 하지 않았다 — 화면이 가장 크게 바뀌는 순간이
// 유일하게 빠져 있었다. 8회차의 「전송 중 포커스를 잃었다」와 같은 모양이다.
export function Notice({ title, body, detail = '', hint = '', foot = '', children = null, headingRef = null }) {
  return (
    <main style={S.page} className={EUM_SCOPE}>
      <EumStyles />
      <div style={S.wrap}>
        <p style={S.kicker}>이음 어르신 신청</p>
        {/* tabIndex=-1 은 탭 순서에 끼어들지 않는다 — 코드가 옮길 수 있게만 열어 둔다. */}
        <h1 style={S.h1} ref={headingRef} tabIndex={-1}>{title}</h1>
        <p style={S.body} role="status">{body}</p>
        {detail ? <p style={S.summary}>{detail}</p> : null}
        {hint ? <p style={S.body}>{hint}</p> : null}
        {children}
        {foot ? <p style={S.note}>{foot}</p> : null}
      </div>
    </main>
  );
}
