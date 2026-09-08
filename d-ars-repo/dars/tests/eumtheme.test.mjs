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
  EUM_MIN_SUB_FONT_PX,
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
  assert.ok(EUM_MIN_SUB_FONT_PX >= 20, `보조 문구 하한 미달: ${EUM_MIN_SUB_FONT_PX}`);
  assert.ok(EUM_MIN_SUB_FONT_PX <= EUM_MIN_FONT_PX);
});

test('색 이름 집합이 화면 요구를 덮는다(배경·본문·주색·경고)', () => {
  for (const k of ['bg', 'text', 'sub', 'brand', 'onBrand', 'alertBg', 'onAlert', 'warnBg', 'warnEdge', 'focus']) {
    assert.ok(parseHex(EUM_COLORS[k]), `색 누락 또는 형식 오류: ${k}`);
  }
});
