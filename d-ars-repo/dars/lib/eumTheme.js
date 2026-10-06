// lib/eumTheme.js — 「이음 어르신 신청」 화면의 색·글자 크기 규격과 그 검증 로직
//
// 왜 상수를 화면에서 떼어 냈나: 가이드 §6-2 는 **글자 18pt 이상 · 명도 대비 4.5:1 이상**을
// 요구한다. 값이 JSX 안에 흩어져 있으면 "파란색을 조금 밝게" 같은 사소한 수정 한 번으로
// 요건이 조용히 깨지고, JSX 는 node:test 가 import 할 수 없어 회귀를 잡을 수단도 없다.
// 순수 JS 모듈로 분리해 두면 테스트가 **실제 화면이 쓰는 값**을 그대로 계산해 검증할 수 있다.
//
// 대비 계산은 WCAG 2.x 정의(상대 휘도 → (L1+0.05)/(L2+0.05))를 그대로 따른다.

// 18pt = 24px (1pt = 4/3 px). 화면의 어떤 글자도 이 아래로 내려가면 안 된다.
export const EUM_MIN_FONT_PX = 24;

// ── 글자 크기 등록부 ──────────────────────────────────────────────────────
//
// 고친 결함: 위 한 줄은 "화면의 어떤 글자도 이 아래로 내려가면 안 된다" 라고 적어 두고,
// 바로 아래에서 **보조 문구 하한 20px**(=15pt)을 스스로 예외로 뚫어 놓고 있었다. 그리고
// `ui.jsx` 는 그 둘 중 어느 쪽도 아닌 **제3의 값 22px**(=16.5pt)을 세 자리에 손으로 적고 있었다.
// 그 세 자리가 무엇이었는가가 이 결함의 전부다 —
//   · `alert` : 제출이 실패했을 때의 안내("연결이 원활하지 않습니다 … 한 번 더 눌러 주세요")
//   · `warn`  : 만료 임박 경고("잠시 후 링크가 만료됩니다")
//   · `back`  : 되돌아가기 링크 — 이 화면에서 **유일한 되돌리기 수단**이다.
// 평소 화면은 26~32px 로 크게 지어 두고, **무언가 잘못됐을 때 읽어야 하는 글자만** 요건 아래로
// 작았다. 저시력 어르신에게 가장 절실한 순간의 글자가 그것들이다.
//
// 왜 아무도 몰랐나: 이 파일은 "색을 손보면 테스트가 먼저 깨진다" 는 가드를 가지고 있었지만
// **크기에는 그런 가드가 없었다**. 테스트는 상수 두 개(24·20)가 기준을 넘는지만 보았고,
// 화면이 실제로 쓰는 숫자는 아무도 대조하지 않았다 — `ui.jsx` 의 테스트 이름은
// 「색·글자 크기는 lib/eumTheme.js 에서 가져온다(하드코딩 금지)」였는데 정작 검사하던 것은
// 색뿐이었다. 요건의 핵심 수치가 단일 출처 **밖에서** 조용히 깨져 있었던 셈이다.
//
// 그래서 (1) 보조 문구 예외를 없애고 — 글자 서열은 크기가 아니라 **색과 굵기**로 준다 —
// (2) 화면이 쓰는 크기를 전부 이름으로 등록하고, (3) `ui.jsx` 에 숫자 리터럴이 되살아나면
// 테스트가 실패하게 했다(tests/eumseniorui.test.mjs).
export const EUM_FONT_PX = {
  h1: 32,       // 단계 제목
  choice: 26,   // 선택지 버튼 · 주버튼("이대로 신청하기")
  summary: 26,  // 고른 것 요약 · 접수된 내용
  body: 24,     // 본문 · 안내 문단(기준선)
  sub: 24,      // 머리말("이음 어르신 신청") · 단계 표시 · 마무리 안내
  alert: 24,    // 오류 배너
  warn: 24,     // 만료 임박 경고
  back: 24,     // 되돌아가기 링크
};

// 기준(18pt) 아래로 내려간 등록 항목 목록. **비어 있어야 정상**이다.
// 수가 아닌 값(오타·단위 문자열)도 위반으로 본다 — 모르는 것을 통과로 넘기지 않는다.
export function fontSizeViolations(sizes = EUM_FONT_PX, min = EUM_MIN_FONT_PX) {
  const table = sizes && typeof sizes === 'object' ? sizes : {};
  const floor = Number(min);
  const out = [];
  for (const name of Object.keys(table)) {
    const px = typeof table[name] === 'number' ? table[name] : NaN;
    if (!Number.isFinite(px) || !Number.isFinite(floor) || px < floor) {
      out.push({ name, px: Number.isFinite(px) ? px : null });
    }
  }
  return out;
}

export const EUM_CONTRAST_MIN = 4.5;

// 화면이 쓰는 색은 여기가 단일 출처다(ui.jsx 가 import 한다).
export const EUM_COLORS = {
  bg: '#ffffff',
  text: '#14171a',
  sub: '#3a4048',
  brand: '#0f4c81',   // 주버튼 배경 · 선택지 테두리 · 링크
  onBrand: '#ffffff',
  alertBg: '#8a2b13', // 오류 배너 배경
  onAlert: '#ffffff',
  warnBg: '#ffe9c7',  // 만료 임박 경고 배경
  warnEdge: '#8a5b00',
  focus: '#a33b00',   // 포커스 링 — 파랑 위에서도 보이도록 보색 계열
};

// 반드시 4.5:1 이상이어야 하는 (전경, 배경) 쌍. 화면에 실제로 존재하는 조합만 담는다.
export const EUM_CONTRAST_PAIRS = [
  ['text', 'bg'],
  ['sub', 'bg'],
  ['brand', 'bg'],
  ['onBrand', 'brand'],
  // 제출이 진행 중인 주버튼(ui.jsx 의 S.primaryBusy) — 흰 글자 대 보조색 배경.
  // 왜 생겼나: 포털 전역 CSS 의 `button:disabled{opacity:.55}` 가 어르신 화면까지 내려와
  // 「신청하는 중…」 동안 대비를 2.87:1 로 떨어뜨렸다. 투명도로는 요건을 지킬 수 없어
  // 눌림을 **색**으로 말하게 바꿨고, 그 색 조합도 여기서 함께 지킨다.
  ['onBrand', 'sub'],
  ['onAlert', 'alertBg'],
  ['text', 'warnBg'],
  ['warnEdge', 'warnBg'],
  // 포커스 링은 버튼 **바깥**(outline-offset)에 그려 항상 흰 배경 위에 놓인다 → bg 기준으로 본다.
  ['focus', 'bg'],
];

// '#rgb' | '#rrggbb' → [r,g,b] (0~255). 규격 밖이면 null(호출측이 판단 — throw 하지 않는다).
export function parseHex(hex) {
  if (typeof hex !== 'string') return null;
  const s = hex.trim().replace(/^#/, '');
  if (!/^[0-9a-fA-F]+$/.test(s)) return null;
  if (s.length === 3) return [0, 1, 2].map((i) => parseInt(s[i] + s[i], 16));
  if (s.length === 6) return [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16));
  return null;
}

// WCAG 상대 휘도. 색이 규격 밖이면 null.
export function relativeLuminance(hex) {
  const rgb = parseHex(hex);
  if (!rgb) return null;
  const [r, g, b] = rgb.map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// 두 색의 명도 대비(1~21). 한쪽이라도 규격 밖이면 0 — "모른다"가 아니라 **실패**로 취급한다.
export function contrastRatio(a, b) {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  if (la === null || lb === null) return 0;
  const hi = Math.max(la, lb);
  const lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}

export function meetsContrast(a, b, min = EUM_CONTRAST_MIN) {
  return contrastRatio(a, b) >= min;
}

// 규격을 못 맞추는 쌍 목록. 비어 있어야 정상 — 테스트와 문서가 같은 함수를 본다.
export function contrastViolations(colors = EUM_COLORS, pairs = EUM_CONTRAST_PAIRS, min = EUM_CONTRAST_MIN) {
  const out = [];
  for (const pair of Array.isArray(pairs) ? pairs : []) {
    const [fg, bg] = Array.isArray(pair) ? pair : [];
    const ratio = contrastRatio(colors?.[fg], colors?.[bg]);
    if (!(ratio >= min)) out.push({ fg, bg, ratio: Math.round(ratio * 100) / 100 });
  }
  return out;
}
