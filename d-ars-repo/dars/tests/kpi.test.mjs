// tests/kpi.test.mjs — 대시보드·통계 KPI 파생 유틸 회귀 테스트(순수 함수, 의존성 0)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sumBy, fmtNum, lastDelta, activeSessions, completionRate, dropRate } from '../lib/kpi.js';

const daily = [
  { day: '2026-07-01', inbound: 100, multimodal: 10, completed: 8, dropped: 2 },
  { day: '2026-07-02', inbound: 200, multimodal: 20, completed: 16, dropped: 4 },
  { day: '2026-07-03', inbound: 250, multimodal: 15, completed: 12, dropped: 4 },
];

test('sumBy: 컬럼 합계', () => {
  assert.equal(sumBy(daily, 'inbound'), 550);
  assert.equal(sumBy(daily, 'multimodal'), 45);
});

test('sumBy: 문자열 숫자·null·비배열 안전', () => {
  assert.equal(sumBy([{ n: '10' }, { n: null }, {}, null], 'n'), 10);
  assert.equal(sumBy(null, 'n'), 0);
  assert.equal(sumBy(undefined, 'n'), 0);
  assert.equal(sumBy([{ n: 'x' }], 'n'), 0);
});

test('fmtNum: 천단위 콤마(Counter 포맷 판단용)', () => {
  assert.equal(fmtNum(1220), '1,220');
  assert.equal(fmtNum(0), '0');
  assert.equal(fmtNum('4182'), '4,182');
  assert.equal(fmtNum(null), '0');
});

test('lastDelta: 마지막 날 vs 직전 날 증감률(상승)', () => {
  const d = lastDelta(daily, 'inbound'); // 200 → 250 = +25%
  assert.deepEqual(d, { text: '25%', dir: 'up' });
});

test('lastDelta: 하락은 dir=down, 절댓값 표기', () => {
  const d = lastDelta(daily, 'multimodal'); // 20 → 15 = -25%
  assert.deepEqual(d, { text: '25%', dir: 'down' });
});

test('lastDelta: 소수 1자리 반올림', () => {
  const rows = [{ v: 3 }, { v: 4 }]; // +33.333% → 33.3
  assert.deepEqual(lastDelta(rows, 'v'), { text: '33.3%', dir: 'up' });
});

test('lastDelta: 표본 부족·직전값 0·변화 없음이면 null(가짜 배지 방지)', () => {
  assert.equal(lastDelta([{ v: 1 }], 'v'), null);
  assert.equal(lastDelta([], 'v'), null);
  assert.equal(lastDelta(null, 'v'), null);
  assert.equal(lastDelta([{ v: 0 }, { v: 5 }], 'v'), null); // 0으로 나눌 수 없음
  assert.equal(lastDelta([{ v: 5 }, { v: 5 }], 'v'), null); // 변화 없음
});

test('activeSessions: 서버 총계에서 완료(step 4) 제외·음수 방지', () => {
  assert.equal(activeSessions({ total: 12, byStep: { 0: 5, 3: 5, 4: 2 } }), 10);
  assert.equal(activeSessions({ total: 3, byStep: {} }), 3);
  assert.equal(activeSessions({ total: 0, byStep: { 4: 5 } }), 0);
  assert.equal(activeSessions(null), 0);
  assert.equal(activeSessions({}), 0);
});

test('completionRate: 멀티모달 집계 → 완료율(%)', () => {
  assert.equal(completionRate({ total: 200, byResult: { 완료: 150, 이탈: 50 } }), 75);
  assert.equal(completionRate({ total: 3, byResult: { 완료: 1 } }), 33);
  assert.equal(completionRate({ total: 0, byResult: {} }), 0);
  assert.equal(completionRate(null), 0);
});

test('dropRate: 멀티모달 집계 → 이탈률(%)', () => {
  assert.equal(dropRate({ total: 200, byResult: { 완료: 150, 이탈: 50 } }), 25);
  assert.equal(dropRate({ total: 100, byResult: { 완료: 100 } }), 0);
  assert.equal(dropRate(undefined), 0);
});
