// tests/sessionslive.test.mjs — 세션 보드 서버 집계(sessionsAgg) · 실시간 스냅샷 병합(liveMerge) 회귀 테스트
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptySessionAgg, sessionAggRows, foldSessionGroups, readSessionAgg, stepCount, nodeCount } from '../lib/sessionsAgg.js';
import { applyLive } from '../lib/liveMerge.js';

const S = (id, step, node, elapsed) => ({ id, step, node, elapsed, scenario: '카드발급', phone: '010-****-1234', status: '진행' });

/* ── sessionsAgg ── */

test('emptySessionAgg: 기본값', () => {
  assert.deepEqual(emptySessionAgg(), { total: 0, byStep: {}, byNode: {}, avgElapsed: 0 });
});

test('sessionAggRows: 단계·노드 집계와 평균 경과(반올림)', () => {
  const a = sessionAggRows([S('A', 1, 'SHOW_CARD', 10), S('B', 3, 'REQUEST_DOC', 20), S('C', 3, 'CHANNEL_SWITCH', 31)]);
  assert.equal(a.total, 3);
  assert.deepEqual(a.byStep, { 1: 1, 3: 2 });
  assert.equal(a.byNode.CHANNEL_SWITCH, 1);
  assert.equal(a.avgElapsed, Math.round(61 / 3)); // 20
});

test('sessionAggRows: 빈 배열·비배열은 0으로 수렴(0분모 방지)', () => {
  assert.equal(sessionAggRows([]).avgElapsed, 0);
  assert.equal(sessionAggRows(null).total, 0);
});

test('sessionAggRows: null 노드/비수치 경과 안전 처리', () => {
  const a = sessionAggRows([{ id: 'A', step: null, node: null, elapsed: 'x' }]);
  assert.equal(a.total, 1);
  assert.equal(a.byStep['0'], 1);
  assert.equal(a.byNode['기타'], 1);
  assert.equal(a.avgElapsed, 0);
});

test('foldSessionGroups: DB group-by 결과를 표준 형태로 접는다', () => {
  const a = foldSessionGroups([
    { step: 3, node: 'REQUEST_DOC', n: 2, el: 100 },
    { step: 3, node: 'CHANNEL_SWITCH', n: 1, el: 50 },
    { step: 0, node: 'VISUAL_LAUNCH', n: 1, el: 10 },
  ]);
  assert.equal(a.total, 4);
  assert.equal(stepCount(a, 3), 3);
  assert.equal(nodeCount(a, 'CHANNEL_SWITCH'), 1);
  assert.equal(a.avgElapsed, 40); // 160/4
});

test('foldSessionGroups: 빈 입력·문자열 숫자 방어', () => {
  assert.deepEqual(foldSessionGroups([]), emptySessionAgg());
  const a = foldSessionGroups([{ step: '2', node: 'SHOW_MENU', n: '3', el: '30' }]);
  assert.equal(a.total, 3);
  assert.equal(stepCount(a, 2), 3);
  assert.equal(a.avgElapsed, 10);
});

test('readSessionAgg: 형식이 어긋나도 기본값으로 수렴', () => {
  assert.deepEqual(readSessionAgg(null), emptySessionAgg());
  assert.deepEqual(readSessionAgg([1, 2]), emptySessionAgg());
  assert.deepEqual(readSessionAgg({ total: 'x', byStep: [], byNode: null, avgElapsed: '7' }),
    { total: 0, byStep: {}, byNode: {}, avgElapsed: 7 });
});

test('stepCount·nodeCount: 없는 키는 0', () => {
  const a = sessionAggRows([S('A', 1, 'SHOW_CARD', 5)]);
  assert.equal(stepCount(a, 4), 0);
  assert.equal(nodeCount(a, 'CHANNEL_SWITCH'), 0);
  assert.equal(stepCount(null, 1), 0);
  assert.equal(nodeCount(undefined, 'X'), 0);
});

/* ── liveMerge ── */

test('applyLive: 로드된 행을 id 기준으로 갱신한다(페이징 누적 유지)', () => {
  const prev = [S('A', 1, 'SHOW_CARD', 10), S('B', 2, 'SHOW_MENU', 20), S('OLD', 0, 'VISUAL_LAUNCH', 99)];
  const next = applyLive(prev, [S('A', 3, 'REQUEST_DOC', 40)]);
  assert.equal(next.length, 3);              // 과거 행(OLD)이 사라지지 않는다
  assert.equal(next.find(r => r.id === 'A').step, 3);
  assert.equal(next.find(r => r.id === 'OLD').elapsed, 99);
});

test('applyLive: 목록에 없는 새 세션은 맨 앞(최신)에 삽입', () => {
  const prev = [S('A', 1, 'SHOW_CARD', 10)];
  const next = applyLive(prev, [S('NEW', 0, 'VISUAL_LAUNCH', 1), S('A', 1, 'SHOW_CARD', 12)]);
  assert.equal(next[0].id, 'NEW');
  assert.equal(next.length, 2);
  assert.equal(next[1].elapsed, 12);
});

test('applyLive: insert=false(검색 중)면 새 세션을 삽입하지 않고 갱신만', () => {
  const prev = [S('A', 1, 'SHOW_CARD', 10)];
  const next = applyLive(prev, [S('NEW', 0, 'VISUAL_LAUNCH', 1), S('A', 2, 'SHOW_MENU', 15)], { insert: false });
  assert.equal(next.length, 1);
  assert.equal(next[0].step, 2);
});

test('applyLive: 중복 삽입 없음(같은 스냅샷 두 번 적용해도 개수 동일)', () => {
  const snap = [S('N1', 0, 'VISUAL_LAUNCH', 1)];
  const once = applyLive([], snap);
  const twice = applyLive(once, snap);
  assert.equal(once.length, 1);
  assert.equal(twice.length, 1);
});

test('applyLive: 값이 그대로면 같은 배열 참조를 반환(불필요한 리렌더 방지)', () => {
  const prev = [S('A', 1, 'SHOW_CARD', 10)];
  const next = applyLive(prev, [S('A', 1, 'SHOW_CARD', 10)]);
  assert.equal(next, prev);
});

test('applyLive: 빈 스냅샷·비배열 입력 방어(목록 유지)', () => {
  const prev = [S('A', 1, 'SHOW_CARD', 10)];
  assert.equal(applyLive(prev, []), prev);
  assert.equal(applyLive(prev, null), prev);
  assert.deepEqual(applyLive(null, null), []);
});

test('applyLive: id 없는 행은 무시(삽입·갱신 대상 아님)', () => {
  const prev = [S('A', 1, 'SHOW_CARD', 10)];
  const next = applyLive(prev, [{ step: 1, node: 'X' }]);
  assert.equal(next.length, 1);
  assert.equal(next[0].id, 'A');
});

test('applyLive: 원본 배열·행 객체를 변형하지 않는다(불변)', () => {
  const row = S('A', 1, 'SHOW_CARD', 10);
  const prev = [row];
  const next = applyLive(prev, [S('A', 2, 'SHOW_MENU', 20)]);
  assert.equal(row.step, 1);       // 원본 불변
  assert.equal(prev.length, 1);
  assert.equal(next[0].step, 2);
});
