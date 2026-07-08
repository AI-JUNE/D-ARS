// lib/ui.js 순수 헬퍼 단위 테스트
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pct, fmt, tagClass, NODE_TYPES, journey } from '../lib/ui.js';

test('pct: 비율을 반올림, 0으로 나누면 0', () => {
  assert.equal(pct(1, 4), 25);
  assert.equal(pct(2, 3), 67);   // 66.6→67 반올림
  assert.equal(pct(5, 0), 0);    // 분모 0 → 0 (NaN 방지)
  assert.equal(pct(0, 10), 0);
});

test('fmt: 초를 mm:ss 로 (제로패딩)', () => {
  assert.equal(fmt(5), '00:05');
  assert.equal(fmt(65), '01:05');
  assert.equal(fmt(600), '10:00');
  assert.equal(fmt(0), '00:00');
});

test('tagClass: 알려진 상태 매핑, 미지정은 t-mut 기본', () => {
  assert.equal(tagClass('운영'), 't-ok');
  assert.equal(tagClass('실패'), 't-bad');
  assert.equal(tagClass('대기'), 't-warn');
  assert.equal(tagClass('진행'), 't-info');
  assert.equal(tagClass('알수없음'), 't-mut');
});

test('NODE_TYPES/journey: 구조 상수 무결성', () => {
  assert.equal(NODE_TYPES.VISUAL_LAUNCH.c, '#be5535'); // 브랜드 컬러
  assert.ok(Array.isArray(journey) && journey.length === 5);
});
