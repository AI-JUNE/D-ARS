// tests/listsorts.test.mjs — 정렬 서버 전환 잔여분(history·sessions) 회귀 테스트
// 검증: 화이트리스트 스펙(MM_SORTS·SESSION_SORTS)의 키 집합·SQL 조각 안전성·파생값 의미,
//       인젝션 시도 무시, ORDER BY 생성(nulls last·2차 정렬), 데모 폴백 정렬 의미,
//       SSE 삽입 정책(정렬 중 삽입 보류).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MM_SORTS, SESSION_SORTS } from '../lib/listSorts.js';
import { parseSortParams, orderBySql, sortRowsBy, isSafeExpr, sortQuery } from '../lib/sortParams.js';
import { applyLive } from '../lib/liveMerge.js';

test('MM_SORTS: 표 헤더와 1:1 키 집합', () => {
  assert.deepEqual(Object.keys(MM_SORTS).sort(),
    ['channel', 'duration', 'id', 'phone', 'result', 'scenario', 'ts'].sort());
});

test('SESSION_SORTS: 표 헤더와 1:1 키 집합', () => {
  assert.deepEqual(Object.keys(SESSION_SORTS).sort(),
    ['elapsed', 'id', 'phone', 'scenario', 'status', 'step'].sort());
});

test('모든 SQL 조각은 안전(세미콜론·주석·따옴표 없음)', () => {
  for (const spec of [MM_SORTS, SESSION_SORTS]) {
    for (const [k, v] of Object.entries(spec)) {
      assert.equal(isSafeExpr(v.sql), true, `unsafe expr for ${k}: ${v.sql}`);
    }
  }
});

test('SESSION_SORTS.status 는 화면 표기와 동일하게 step 기준으로 정렬', () => {
  assert.equal(SESSION_SORTS.status.sql, 'step');
  assert.equal(SESSION_SORTS.status.val({ step: 3, status: '진행' }), 3);
});

test('화이트리스트 밖 키·인젝션 시도는 무시(기본 정렬 유지)', () => {
  assert.equal(parseSortParams('/api/multimodal?sort=secret', MM_SORTS), null);
  assert.equal(parseSortParams('/api/sessions?sort=id;drop table x', SESSION_SORTS), null);
  assert.equal(parseSortParams('/api/multimodal?sort=phone&dir=desc); delete from x', MM_SORTS).key, 'phone');
  assert.equal(parseSortParams('/api/sessions', SESSION_SORTS), null);
});

test('ORDER BY 생성: 방향·nulls last·id 2차 정렬', () => {
  const s = parseSortParams('/api/multimodal?sort=duration&dir=desc', MM_SORTS);
  assert.deepEqual(s, { key: 'duration', dir: 'desc' });
  assert.equal(orderBySql(s, MM_SORTS, 'id asc'), 'duration desc nulls last, id asc');
  const s2 = parseSortParams('/api/sessions?sort=status', SESSION_SORTS);
  assert.equal(orderBySql(s2, SESSION_SORTS, 'id asc'), 'step asc nulls last, id asc');
});

test('데모 폴백 정렬: 세션 status(=step) 오름차순 · 원본 불변', () => {
  const rows = [{ id: 'B', step: 4 }, { id: 'A', step: 1 }, { id: 'C', step: 2 }];
  const snapshot = JSON.stringify(rows);
  const out = sortRowsBy(rows, { key: 'status', dir: 'asc' }, SESSION_SORTS);
  assert.deepEqual(out.map(r => r.id), ['A', 'C', 'B']);
  assert.equal(JSON.stringify(rows), snapshot);
});

test('데모 폴백 정렬: 이력 소요시간 내림차순 · 빈 값은 항상 뒤', () => {
  const rows = [{ id: 1, duration: 30 }, { id: 2, duration: null }, { id: 3, duration: 120 }];
  const out = sortRowsBy(rows, { key: 'duration', dir: 'desc' }, MM_SORTS);
  assert.deepEqual(out.map(r => r.id), [3, 1, 2]);
});

test('데모 폴백 정렬: 시각(ts)은 문자열이 아니라 시각 값으로 비교', () => {
  const rows = [
    { id: 1, ts: '2026-07-13T09:00:00Z' },
    { id: 2, ts: '2026-07-13T21:00:00Z' },
    { id: 3, ts: '2026-07-12T23:00:00Z' },
  ];
  const out = sortRowsBy(rows, { key: 'ts', dir: 'desc' }, MM_SORTS);
  assert.deepEqual(out.map(r => r.id), [2, 1, 3]);
});

test('sortQuery: 정렬 없으면 기존 요청과 동일(빈 파라미터)', () => {
  assert.deepEqual(sortQuery(null), {});
  assert.deepEqual(sortQuery({ key: 'elapsed', dir: 'desc' }), { sort: 'elapsed', dir: 'desc' });
});

test('SSE 삽입 정책: 정렬 중에는 새 세션 삽입 보류(갱신만) → 서버 정렬 순서 보존', () => {
  const prev = [{ id: 'S1', elapsed: 10 }, { id: 'S2', elapsed: 5 }];
  const snap = [{ id: 'S2', elapsed: 7 }, { id: 'S9', elapsed: 1 }];
  const sorted = applyLive(prev, snap, { insert: false });
  assert.deepEqual(sorted.map(r => r.id), ['S1', 'S2']); // 신규 S9 미삽입
  assert.equal(sorted[1].elapsed, 7);                     // 기존 행은 갱신
});

test('SSE 삽입 정책: 정렬·검색이 없으면 기존처럼 신규 세션을 맨 앞에 삽입', () => {
  const prev = [{ id: 'S1', elapsed: 10 }];
  const snap = [{ id: 'S9', elapsed: 1 }];
  const out = applyLive(prev, snap, { insert: true });
  assert.deepEqual(out.map(r => r.id), ['S9', 'S1']);
});
