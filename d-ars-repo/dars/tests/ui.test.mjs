// tests/ui.test.mjs — UI 표시 유틸 단위 테스트 (무의존성)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pct, fmt, tagClass, NODE_TYPES, journey, compareVals, sortRows } from '../lib/ui.js';

test('pct: 정상 계산(반올림)', () => {
  assert.equal(pct(1, 2), 50);
  assert.equal(pct(1, 3), 33);
  assert.equal(pct(2, 3), 67);
});

test('pct: 분모 0이면 0 (0 나누기 방지)', () => {
  assert.equal(pct(5, 0), 0);
  assert.equal(pct(0, 0), 0);
});

test('fmt: 초를 mm:ss로 (0 패딩)', () => {
  assert.equal(fmt(65), '01:05');
  assert.equal(fmt(5), '00:05');
  assert.equal(fmt(600), '10:00');
});

test('tagClass: 알려진 상태 매핑', () => {
  assert.equal(tagClass('운영'), 't-ok');
  assert.equal(tagClass('실패'), 't-bad');
  assert.equal(tagClass('대기'), 't-warn');
  assert.equal(tagClass('진행'), 't-info');
});

test('tagClass: 미지의 상태는 기본값 t-mut', () => {
  assert.equal(tagClass('없는상태'), 't-mut');
  assert.equal(tagClass(undefined), 't-mut');
});

test('NODE_TYPES/journey: 핵심 구조 상수 존재', () => {
  assert.ok(NODE_TYPES.VISUAL_LAUNCH);
  assert.equal(NODE_TYPES.END.name, '종료');
  assert.equal(journey.length, 5);
});

test('compareVals: 두 값이 숫자면 수치 비교', () => {
  assert.ok(compareVals(2, 10) < 0);        // 2 < 10 (문자열 정렬이면 반대가 됨)
  assert.ok(compareVals(10, 2) > 0);
  assert.equal(compareVals(5, 5), 0);
});

test('compareVals: 문자열은 한글·숫자 자연 정렬', () => {
  assert.ok(compareVals('가', '나') < 0);
  assert.ok(compareVals('항목2', '항목10') < 0);  // numeric:true → 2 < 10
  assert.ok(compareVals('A2', 'A10') < 0);
});

test('compareVals: null/undefined 안전(빈 문자열 취급)', () => {
  assert.equal(compareVals(null, null), 0);
  assert.equal(compareVals(undefined, ''), 0);
  assert.ok(compareVals(null, '가') < 0);   // '' < '가'
});

test('sortRows: sort 없거나 key 없으면 원본 그대로', () => {
  const rows = [{ n: 3 }, { n: 1 }, { n: 2 }];
  assert.equal(sortRows(rows, null), rows);
  assert.equal(sortRows(rows, {}), rows);
});

test('sortRows: 오름/내림 정렬 + 원본 불변', () => {
  const rows = [{ n: 3 }, { n: 1 }, { n: 2 }];
  const asc = sortRows(rows, { key: 'n', dir: 'asc' });
  assert.deepEqual(asc.map(r => r.n), [1, 2, 3]);
  const desc = sortRows(rows, { key: 'n', dir: 'desc' });
  assert.deepEqual(desc.map(r => r.n), [3, 2, 1]);
  assert.deepEqual(rows.map(r => r.n), [3, 1, 2]); // 원본 불변
});

test('sortRows: val 함수로 파생 키 정렬(예: 완료율)', () => {
  const rows = [{ done: 1, req: 2 }, { done: 9, req: 10 }, { done: 1, req: 4 }];
  const val = (r, k) => k === 'rate' ? pct(r.done, r.req) : r[k];
  const asc = sortRows(rows, { key: 'rate', dir: 'asc' }, val);
  assert.deepEqual(asc.map(r => pct(r.done, r.req)), [25, 50, 90]);
});

test('sortRows: 안정 정렬(동률 시 입력 순서 유지)', () => {
  const rows = [{ n: 1, id: 'a' }, { n: 1, id: 'b' }, { n: 1, id: 'c' }];
  const asc = sortRows(rows, { key: 'n', dir: 'asc' });
  assert.deepEqual(asc.map(r => r.id), ['a', 'b', 'c']);
});
