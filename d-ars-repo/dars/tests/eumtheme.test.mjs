// tests/eumtheme.test.mjs — 「이음 어르신 신청」 색·글자 규격(가이드 §6-2) 회귀 고정
//
// 대비 4.5:1 과 18pt 는 심사 요건이라 "대충 어두운 색"으로는 부족하다.
// 화면이 실제로 쓰는 값(lib/eumTheme.js)을 그대로 계산해 검증한다 — 색을 손보면 여기가 먼저 깨진다.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  EUM_COLORS,
  EUM_CONTRAST_PAIRS,
  EUM_CONTRAST_MIN,
  EUM_MIN_FONT_PX,
  EUM_FONT_PX,
  EUM_TAP_MIN_PX,
  EUM_TAP_PX,
  fontSizeViolations,
  tapTargetViolations,
  parseHex,
  relativeLuminance,
  contrastRatio,
  meetsContrast,
  contrastViolations,
} from '../lib/eumTheme.js';

test('parseHex: 3자리·6자리를 모두 읽고 규격 밖은 null', () => {
  assert.deepEqual(parseHex('#fff'), [255, 255, 255]);
  assert.deepEqual(parseHex('000000'), [0, 0, 0]);
  assert.deepEqual(parseHex('#0f4c81'), [15, 76, 129]);
  for (const bad of ['', '#12', '#12345', 'rgb(0,0,0)', '#zzzzzz', null, undefined, 42]) {
    assert.equal(parseHex(bad), null, `허용되면 안 됨: ${String(bad)}`);
  }
});

test('relativeLuminance: 흑백 기준값이 WCAG 정의와 같다', () => {
  assert.equal(relativeLuminance('#000000'), 0);
  assert.equal(relativeLuminance('#ffffff'), 1);
  assert.equal(relativeLuminance('#nope'), null);
});

test('contrastRatio: 흑백은 21:1, 같은 색은 1:1', () => {
  assert.equal(Math.round(contrastRatio('#000000', '#ffffff')), 21);
  assert.equal(contrastRatio('#0f4c81', '#0f4c81'), 1);
});

test('contrastRatio: 순서를 바꿔도 값이 같다(전경·배경 대칭)', () => {
  const a = contrastRatio(EUM_COLORS.brand, EUM_COLORS.bg);
  const b = contrastRatio(EUM_COLORS.bg, EUM_COLORS.brand);
  assert.equal(a, b);
});

test('contrastRatio: 색이 규격 밖이면 0 — "모른다"를 통과로 오해하지 않는다(실패 경로)', () => {
  assert.equal(contrastRatio('#ffffff', 'not-a-color'), 0);
  assert.equal(meetsContrast('#ffffff', undefined), false);
});

test('화면이 쓰는 모든 색 조합이 4.5:1 이상이다', () => {
  const bad = contrastViolations();
  assert.deepEqual(bad, [], `대비 미달: ${JSON.stringify(bad)}`);
  assert.ok(EUM_CONTRAST_PAIRS.length >= 7, '검사 쌍이 줄어들면 규격이 새어 나간다');
});

test('contrastViolations: 대비가 모자란 색을 실제로 잡아낸다(실패 경로)', () => {
  const bad = contrastViolations({ bg: '#ffffff', weak: '#cccccc' }, [['weak', 'bg']]);
  assert.equal(bad.length, 1);
  assert.equal(bad[0].fg, 'weak');
  assert.ok(bad[0].ratio < EUM_CONTRAST_MIN);
});

test('최소 글자 크기가 18pt(24px) 이상이다', () => {
  assert.ok(EUM_MIN_FONT_PX >= 24, `18pt = 24px 미만: ${EUM_MIN_FONT_PX}`);
});

// 고친 결함: 예전에는 이 자리에서 상수 **두 개**(본문 24 · 보조 20)만 보았다. 보조 하한 20px 은
// 15pt 로 요건 아래였고, 더 나쁜 것은 화면이 그 둘 중 어느 쪽도 아닌 22px 을 세 자리에 손으로
// 적고 있었다는 점이다 — 오류 안내·만료 임박 경고·되돌아가기 링크. 상수만 보는 검사는 그것을
// 영원히 보지 못한다. 이제 **화면이 실제로 쓰는 크기 전부**를 등록부에서 본다.
test('화면이 쓰는 모든 글자 크기가 18pt(24px) 이상이다', () => {
  const bad = fontSizeViolations();
  assert.deepEqual(bad, [], `18pt 미달: ${JSON.stringify(bad)}`);
  for (const name of ['h1', 'choice', 'summary', 'body', 'sub', 'alert', 'warn', 'back']) {
    assert.equal(typeof EUM_FONT_PX[name], 'number', `크기 등록 누락: ${name}`);
  }
});

test('fontSizeViolations: 기준 미달·수가 아닌 값을 실제로 잡아낸다(실패 경로)', () => {
  // 하필 예전에 쓰던 값들이다 — 되살아나면 반드시 실패해야 한다.
  assert.deepEqual(fontSizeViolations({ alert: 22 }), [{ name: 'alert', px: 22 }]);
  assert.deepEqual(fontSizeViolations({ sub: 20 }), [{ name: 'sub', px: 20 }]);
  // '24px' 처럼 단위가 붙으면 React 는 그대로 쓰지만 우리는 비교할 수 없다 → 통과시키지 않는다.
  assert.deepEqual(fontSizeViolations({ body: '24px' }), [{ name: 'body', px: null }]);
  assert.deepEqual(fontSizeViolations({ body: NaN }), [{ name: 'body', px: null }]);
  assert.deepEqual(fontSizeViolations({ body: 24 }), []);
  // 경계: 기준값과 같은 크기는 통과한다.
  assert.deepEqual(fontSizeViolations({ body: EUM_MIN_FONT_PX }), []);
});

test('fontSizeViolations: 이상 입력에도 던지지 않는다(화면 규격 검사가 테스트를 죽이지 않게)', () => {
  for (const bad of [null, undefined, 42, 'nope', [], {}]) {
    assert.deepEqual(fontSizeViolations(bad), [], `예외 없이 빈 결과여야 한다: ${String(bad)}`);
  }
  assert.deepEqual(fontSizeViolations({ body: 24 }, 'nope'), [{ name: 'body', px: 24 }]);
});

// ── 누를 자리 ──────────────────────────────────────────────────────────────
//
// 고친 결함: 주버튼·선택지 버튼은 72px 로 지어 두고 **되돌아가기 링크에는 높이를 주지
// 않았다**. 그러면 누를 수 있는 자리는 글자 한 줄의 줄 상자뿐이다 — 글자 24px · 줄간격 1.6 →
// **38.4px**. 하필 그것이 이 화면의 유일한 되돌리기 수단이고, 같은 링크의 글자 크기(6회차)와
// 동작(14회차)은 이미 한 번씩 고친 자리다. 「손이 떨려 두 번 누르는 것이 흔하다」는 사실이
// 소스에 적혀 있는데도 **누를 넓이**에는 닿지 않았다.
// 왜 아무도 몰랐나: 글자 크기에는 등록부 ↔ 화면 양방향 대조가 있었는데(위) 누를 자리에는
// 그런 가드가 아예 없었다 — 6회차에 세운 가드가 크기 **한 종류만** 보고 있었던 셈이다.
test('화면이 쓰는 모든 누를 자리가 44px 이상이다', () => {
  const bad = tapTargetViolations();
  assert.deepEqual(bad, [], `누를 자리 미달: ${JSON.stringify(bad)}`);
  for (const name of ['primary', 'choice', 'back']) {
    assert.equal(typeof EUM_TAP_PX[name], 'number', `누를 자리 등록 누락: ${name}`);
  }
  // 기준값의 근거: WCAG 2.2 의 최소 기준(SC 2.5.8)은 24px 이고 그것만으로는 이 사용자층에
  // 모자라다. 44px 는 강화 기준(SC 2.5.5)이자 이 화면이 다른 조작 요소에 준 값과 같은 방향이다.
  assert.ok(EUM_TAP_MIN_PX >= 44, `기준이 강화 기준 아래로 내려갔다: ${EUM_TAP_MIN_PX}`);
  // 되돌아가기 링크가 높이를 잃으면 줄 상자(글자 × 줄간격 1.6)만 남는다 — 그 값이 기준 아래다.
  const lineBox = EUM_FONT_PX.back * 1.6;
  assert.ok(lineBox < EUM_TAP_MIN_PX, `줄 상자만으로 기준을 넘으면 이 가드가 무의미하다: ${lineBox}`);
});

test('tapTargetViolations: 기준 미달·수가 아닌 값을 실제로 잡아낸다(실패 경로)', () => {
  // 높이를 주지 않았을 때 실제로 남던 자리(24 × 1.6)다 — 되살아나면 반드시 실패해야 한다.
  assert.deepEqual(tapTargetViolations({ back: 38.4 }), [{ name: 'back', px: 38.4 }]);
  assert.deepEqual(tapTargetViolations({ back: 24 }), [{ name: 'back', px: 24 }]);
  // '44px' 처럼 단위가 붙으면 React 는 그대로 쓰지만 우리는 비교할 수 없다 → 통과시키지 않는다.
  assert.deepEqual(tapTargetViolations({ back: '44px' }), [{ name: 'back', px: null }]);
  assert.deepEqual(tapTargetViolations({ back: NaN }), [{ name: 'back', px: null }]);
  // 경계: 기준값과 같은 높이는 통과한다.
  assert.deepEqual(tapTargetViolations({ back: EUM_TAP_MIN_PX }), []);
});

test('tapTargetViolations: 이상 입력에도 던지지 않는다(규격 검사가 테스트를 죽이지 않게)', () => {
  for (const bad of [null, undefined, 42, 'nope', [], {}]) {
    assert.deepEqual(tapTargetViolations(bad), [], `예외 없이 빈 결과여야 한다: ${String(bad)}`);
  }
  assert.deepEqual(tapTargetViolations({ back: 44 }, 'nope'), [{ name: 'back', px: 44 }]);
});

test('색 이름 집합이 화면 요구를 덮는다(배경·본문·주색·경고)', () => {
  for (const k of ['bg', 'text', 'sub', 'brand', 'onBrand', 'alertBg', 'onAlert', 'warnBg', 'warnEdge', 'focus']) {
    assert.ok(parseHex(EUM_COLORS[k]), `색 누락 또는 형식 오류: ${k}`);
  }
});
