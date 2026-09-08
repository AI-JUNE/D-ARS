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

// 보조 문구(단계 표시·안내)는 본문보다 작을 수 있으나 20px 아래로는 내리지 않는다.
export const EUM_MIN_SUB_FONT_PX = 20;

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
