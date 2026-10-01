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
  fontSizeViolations,
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

test('색 이름 집합이 화면 요구를 덮는다(배경·본문·주색·경고)', () => {
  for (const k of ['bg', 'text', 'sub', 'brand', 'onBrand', 'alertBg', 'onAlert', 'warnBg', 'warnEdge', 'focus']) {
    assert.ok(parseHex(EUM_COLORS[k]), `색 누락 또는 형식 오류: ${k}`);
  }
});
