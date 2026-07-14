// tests/sortparams.test.mjs — 서버 사이드 정렬(lib/sortParams.js) 회귀 테스트
// 핵심 계약: (1) 화이트리스트 밖 키는 무시(기본 정렬 유지) (2) SQL 조각에 사용자 입력이 들어가지 않는다
// (3) 데모 폴백 정렬이 DB 경로와 같은 의미(빈 값 뒤로, id 2차 정렬, 원본 불변).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSortParams, orderBySql, sortRowsBy, sortQuery, isSafeExpr } from '../lib/sortParams.js';

const SPEC = {
  id: { sql: 'id' },
  name: { sql: 'name' },
  req: { sql: 'req' },
  rate: { sql: '(case when coalesce(req,0)=0 then 0 else done::numeric/req end)', val: (r) => (r.req ? r.done / r.req : 0) },
};

const u = (qs) => `http://local/api/docs${qs}`;

test('정렬 파라미터 없으면 null (기존 기본 정렬 유지)', () => {
  assert.equal(parseSortParams(u('?limit=50'), SPEC), null);
  assert.equal(parseSortParams(u(''), SPEC), null);
});

test('화이트리스트 밖 키는 무시된다 (인젝션 시도 포함)', () => {
  assert.equal(parseSortParams(u('?sort=password'), SPEC), null);
  assert.equal(parseSortParams(u('?sort=req;drop%20table%20docs'), SPEC), null);
  assert.equal(parseSortParams(u('?sort=(select%201)'), SPEC), null);
});

test('허용 키 + 방향 파싱 (dir 기본 asc, 이상값은 asc)', () => {
  assert.deepEqual(parseSortParams(u('?sort=req&dir=desc'), SPEC), { key: 'req', dir: 'desc' });
  assert.deepEqual(parseSortParams(u('?sort=req'), SPEC), { key: 'req', dir: 'asc' });
  assert.deepEqual(parseSortParams(u('?sort=req&dir=DESC'), SPEC), { key: 'req', dir: 'desc' });
  assert.deepEqual(parseSortParams(u('?sort=req&dir=xxx'), SPEC), { key: 'req', dir: 'asc' });
});

test('잘못된 URL 이어도 throw 하지 않는다', () => {
  assert.equal(parseSortParams('::::', SPEC), null);
  assert.equal(parseSortParams(null, SPEC), null);
});

test('orderBySql: 화이트리스트 식 + 방향 + nulls last + 결정적 2차 정렬', () => {
  assert.equal(orderBySql({ key: 'req', dir: 'desc' }, SPEC, 'id asc'), 'req desc nulls last, id asc');
  assert.equal(orderBySql({ key: 'name', dir: 'asc' }, SPEC, 'id asc'), 'name asc nulls last, id asc');
  assert.match(orderBySql({ key: 'rate', dir: 'desc' }, SPEC, 'id asc'), /^\(case when .* end\) desc nulls last, id asc$/);
});

test('orderBySql: 정렬 없음·미등록 키·위험한 식은 null → 라우트 기본 경로', () => {
  assert.equal(orderBySql(null, SPEC), null);
  assert.equal(orderBySql({ key: 'nope', dir: 'asc' }, SPEC), null);
  assert.equal(orderBySql({ key: 'bad', dir: 'asc' }, { bad: { sql: "id; drop table docs --" } }), null);
});

test('isSafeExpr: 세미콜론·따옴표·주석 차단', () => {
  assert.equal(isSafeExpr('req'), true);
  assert.equal(isSafeExpr('(case when coalesce(req,0)=0 then 0 else done::numeric/req end)'), true);
  assert.equal(isSafeExpr('id; drop table docs'), false);
  assert.equal(isSafeExpr("name || ''"), false);
  assert.equal(isSafeExpr('req -- x'), false);
  assert.equal(isSafeExpr(''), false);
});

test('sortRowsBy: 숫자 수치 비교 · 원본 불변', () => {
  const rows = [{ id: 'a', req: 9 }, { id: 'b', req: 100 }, { id: 'c', req: 20 }];
  const asc = sortRowsBy(rows, { key: 'req', dir: 'asc' }, SPEC);
  assert.deepEqual(asc.map((r) => r.req), [9, 20, 100]);
  const desc = sortRowsBy(rows, { key: 'req', dir: 'desc' }, SPEC);
  assert.deepEqual(desc.map((r) => r.req), [100, 20, 9]);
  assert.deepEqual(rows.map((r) => r.req), [9, 100, 20]); // 원본 불변
});

test('sortRowsBy: 빈 값은 방향과 무관하게 항상 뒤 (nulls last 와 동일 의미)', () => {
  const rows = [{ id: 'a', name: '가' }, { id: 'b', name: null }, { id: 'c', name: '나' }];
  assert.deepEqual(sortRowsBy(rows, { key: 'name', dir: 'asc' }, SPEC).map((r) => r.id), ['a', 'c', 'b']);
  assert.deepEqual(sortRowsBy(rows, { key: 'name', dir: 'desc' }, SPEC).map((r) => r.id), ['c', 'a', 'b']);
});

test('sortRowsBy: 동점이면 id 로 결정적 2차 정렬 (페이지 경계 중복·누락 방지)', () => {
  const rows = [{ id: 'c', req: 5 }, { id: 'a', req: 5 }, { id: 'b', req: 5 }];
  assert.deepEqual(sortRowsBy(rows, { key: 'req', dir: 'desc' }, SPEC).map((r) => r.id), ['a', 'b', 'c']);
});

test('sortRowsBy: 파생값(val) 사용 — 완료율', () => {
  const rows = [
    { id: 'a', req: 10, done: 1 },   // 10%
    { id: 'b', req: 0, done: 0 },    // 0% (0분모 방어)
    { id: 'c', req: 4, done: 3 },    // 75%
  ];
  assert.deepEqual(sortRowsBy(rows, { key: 'rate', dir: 'desc' }, SPEC).map((r) => r.id), ['c', 'a', 'b']);
});

test('sortRowsBy: 정렬 없음·미등록 키·비배열 안전', () => {
  const rows = [{ id: 'a' }];
  assert.equal(sortRowsBy(rows, null, SPEC), rows);
  assert.equal(sortRowsBy(rows, { key: 'zzz', dir: 'asc' }, SPEC), rows);
  assert.deepEqual(sortRowsBy(null, { key: 'req', dir: 'asc' }, SPEC), []);
});

test('sortQuery: 화면이 요청에 실을 파라미터 (정렬 없으면 기존 요청과 동일)', () => {
  assert.deepEqual(sortQuery(null), {});
  assert.deepEqual(sortQuery({ key: 'req', dir: 'desc' }), { sort: 'req', dir: 'desc' });
  assert.deepEqual(sortQuery({ key: 'req' }), { sort: 'req', dir: 'asc' });
});
