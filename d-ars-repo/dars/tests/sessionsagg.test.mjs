// tests/sessionsagg.test.mjs — 실시간 세션 보드 서버 집계 유틸 회귀 테스트(순수 함수, 의존성 0)
//
// lib/sessionsAgg.js 는 /api/sessions(서버 집계) · /sessions(KPI) · dashboard · 포털 레이아웃
// 사이드바 카운터 · lib/kpi.js(stepCount 재사용) 5곳이 공유하는 핵심 모듈인데 직접 유닛이 없었다.
// 형제 모듈(kpi·aggregate 등)과 동일한 방어 계약을 고정한다:
//   - 비배열/널/결손 필드에도 절대 throw 하지 않고 기본값으로 수렴
//   - 숫자 필드는 Number() 방어(문자열 숫자 허용 · NaN → 0)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  emptySessionAgg, sessionAggRows, foldSessionGroups, readSessionAgg, stepCount, nodeCount,
} from '../lib/sessionsAgg.js';

test('emptySessionAgg: 표준 빈 형태', () => {
  assert.deepEqual(emptySessionAgg(), { total: 0, byStep: {}, byNode: {}, avgElapsed: 0 });
});

test('sessionAggRows: 단계·노드별 건수와 평균 경과(반올림)', () => {
  const rows = [
    { step: 1, node: 'SHOW_DOCS', elapsed: 30 },
    { step: 1, node: 'SHOW_DOCS', elapsed: 60 },
    { step: 3, node: 'CHANNEL_SWITCH', elapsed: 65 },
  ];
  const a = sessionAggRows(rows);
  assert.equal(a.total, 3);
  assert.deepEqual(a.byStep, { 1: 2, 3: 1 });
  assert.deepEqual(a.byNode, { SHOW_DOCS: 2, CHANNEL_SWITCH: 1 });
  assert.equal(a.avgElapsed, Math.round(155 / 3)); // 52
});

test('sessionAggRows: 결손 필드 방어 — step 비수치→"0" 키·node 누락→기타·elapsed 비수치 제외', () => {
  const a = sessionAggRows([
    { step: 'x', elapsed: 'abc' },       // step 비수치 → '0', node 누락 → 기타, elapsed 제외
    { step: '2', node: 'A', elapsed: 10 }, // 문자열 숫자 step 허용
    null,                                 // 널 행도 무해
  ]);
  assert.equal(a.total, 3);
  // 널 행도 '0' 단계·'기타' 노드로 수렴(행 자체는 세되 throw 없음)
  assert.deepEqual(a.byStep, { 0: 2, 2: 1 });
  assert.equal(a.byNode['기타'], 2);
  assert.equal(a.byNode['A'], 1);
  // elapsed 유효값 10 하나 / 총 3건 → 반올림 3
  assert.equal(a.avgElapsed, 3);
});

test('sessionAggRows: 비배열·빈 배열 → 빈 집계(avgElapsed 0 분모 방어)', () => {
  assert.deepEqual(sessionAggRows(null), emptySessionAgg());
  assert.deepEqual(sessionAggRows(undefined), emptySessionAgg());
  assert.deepEqual(sessionAggRows('oops'), emptySessionAgg());
  assert.deepEqual(sessionAggRows([]), emptySessionAgg());
});

test('foldSessionGroups: DB group-by 행을 표준 형태로 접기(가중 합·평균)', () => {
  const a = foldSessionGroups([
    { step: 1, node: 'SHOW_DOCS', n: 2, el: 90 },
    { step: 3, node: 'CHANNEL_SWITCH', n: 1, el: 65 },
    { step: 1, node: 'MENU', n: 3, el: 45 },
  ]);
  assert.equal(a.total, 6);
  assert.deepEqual(a.byStep, { 1: 5, 3: 1 });
  assert.deepEqual(a.byNode, { SHOW_DOCS: 2, CHANNEL_SWITCH: 1, MENU: 3 });
  assert.equal(a.avgElapsed, Math.round(200 / 6)); // 33
});

test('foldSessionGroups: 결손 방어 — n/el 비수치→0 · step 비수치→"0" · node 누락→기타 · 비배열 무해', () => {
  const a = foldSessionGroups([
    { step: null, n: 'x', el: 'y' },      // n 0건 행은 건수에 기여하지 않지만 키는 생성돼도 0
    { step: '2', node: 'A', n: '3', el: '30' }, // 문자열 숫자 허용
  ]);
  assert.equal(a.total, 3);
  assert.equal(a.byStep['2'], 3);
  assert.equal(a.byStep['0'] || 0, 0);
  assert.equal(a.avgElapsed, 10);
  assert.deepEqual(foldSessionGroups(null), emptySessionAgg());
  assert.deepEqual(foldSessionGroups(undefined), emptySessionAgg());
});

test('readSessionAgg: 정상 응답은 그대로, 문자열 숫자는 숫자로 정규화', () => {
  const a = readSessionAgg({ total: '5', byStep: { 1: 5 }, byNode: { A: 5 }, avgElapsed: '42' });
  assert.equal(a.total, 5);
  assert.equal(a.avgElapsed, 42);
  assert.deepEqual(a.byStep, { 1: 5 });
  assert.deepEqual(a.byNode, { A: 5 });
});

test('readSessionAgg: 형식 어긋난 응답 → 기본값 수렴(널·배열·비객체 필드)', () => {
  assert.deepEqual(readSessionAgg(null), emptySessionAgg());
  assert.deepEqual(readSessionAgg(undefined), emptySessionAgg());
  assert.deepEqual(readSessionAgg([1, 2]), emptySessionAgg());
  assert.deepEqual(readSessionAgg('err'), emptySessionAgg());
  const a = readSessionAgg({ total: 'NaN아님', byStep: [1], byNode: null, avgElapsed: {} });
  assert.deepEqual(a, { total: 0, byStep: {}, byNode: {}, avgElapsed: 0 });
});

test('stepCount: 숫자·문자열 키 모두 허용 · 결손 방어', () => {
  const agg = { byStep: { 2: 4, 5: '3' } };
  assert.equal(stepCount(agg, 2), 4);
  assert.equal(stepCount(agg, '2'), 4);
  assert.equal(stepCount(agg, 5), 3);   // 문자열 값도 Number() 방어
  assert.equal(stepCount(agg, 9), 0);   // 없는 단계 → 0
  assert.equal(stepCount(null, 2), 0);  // agg 자체 결손 → 0
  assert.equal(stepCount({}, 2), 0);
});

test('nodeCount: 노드 건수 · 결손 방어', () => {
  const agg = { byNode: { CHANNEL_SWITCH: 2, A: '7' } };
  assert.equal(nodeCount(agg, 'CHANNEL_SWITCH'), 2);
  assert.equal(nodeCount(agg, 'A'), 7);
  assert.equal(nodeCount(agg, 'B'), 0);
  assert.equal(nodeCount(null, 'A'), 0);
  assert.equal(nodeCount({}, 'A'), 0);
});
