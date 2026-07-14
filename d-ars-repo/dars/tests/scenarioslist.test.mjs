// tests/scenarioslist.test.mjs — 시나리오 목록 서버 검색·페이징·정렬 전환 회귀 테스트(2026-07-13 야간)
// 검증 범위(순수 로직만 — DB·React 비의존):
//  1) 통합된 정렬 화이트리스트 스펙(lib/listSorts.js: DOC_SORTS·UMS_SORTS·SCENARIO_SORTS)의
//     키 집합·SQL 조각 안전성·파생값 의미 — 기존 라우트 내 인라인 스펙과 **동일 동작**이어야 한다(중복 제거 리팩터링).
//  2) 시나리오 목록의 서버 검색(검색 필드)·페이징·정렬 데모 폴백 경로 의미.
//  3) 인젝션 시도·화이트리스트 밖 키는 무시(기본 정렬 유지).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DOC_SORTS, UMS_SORTS, SCENARIO_SORTS,
  DOC_SEARCH_FIELDS, UMS_SEARCH_FIELDS, SCENARIO_SEARCH_FIELDS,
} from '../lib/listSorts.js';
import { parseSortParams, orderBySql, sortRowsBy, isSafeExpr } from '../lib/sortParams.js';
import { parseListParams, likeParam, filterRows, sliceRows } from '../lib/paginate.js';

const rows = [
  { id: 'SC-01', name: '반품·교환·환불', type: '인바운드', status: '운영', version: 7, updated_by: '김운영', updated_at: '2026-06-28', nodes: [1, 2, 3, 4, 5] },
  { id: 'SC-02', name: '주문/배송 조회', type: '인바운드', status: '운영', version: 4, updated_by: '김운영', updated_at: '2026-06-20', nodes: [1, 2, 3, 4] },
  { id: 'SC-03', name: '영수증·증빙 발급', type: '인바운드', status: '운영', version: 2, updated_by: '박환불', updated_at: '2026-06-25', nodes: [1, 2, 3, 4] },
  { id: 'SC-04', name: '이탈고객 재안내(OB)', type: '아웃바운드', status: '미운영', version: 1, updated_by: '박환불', updated_at: '2026-06-29', nodes: [1, 2, 3] },
];

test('SCENARIO_SORTS: 목록·보드에서 쓰는 키 집합', () => {
  assert.deepEqual(Object.keys(SCENARIO_SORTS).sort(),
    ['id', 'name', 'nodes', 'status', 'type', 'updated_at', 'version'].sort());
});

test('통합 스펙(DOC·UMS·SCENARIO)의 SQL 조각은 모두 안전(세미콜론·주석·따옴표 없음)', () => {
  for (const spec of [DOC_SORTS, UMS_SORTS, SCENARIO_SORTS]) {
    for (const [k, v] of Object.entries(spec)) {
      assert.equal(isSafeExpr(v.sql), true, `unsafe expr for ${k}: ${v.sql}`);
    }
  }
});

test('DOC_SORTS: 라우트 인라인 시절과 동일한 키·완료율 파생값(중복 제거 리팩터링 무회귀)', () => {
  assert.deepEqual(Object.keys(DOC_SORTS).sort(),
    ['biz', 'done', 'id', 'name', 'rate', 'req', 'sent'].sort());
  assert.equal(DOC_SORTS.rate.val({ req: 0, done: 0 }), 0);        // 0분모 방지
  assert.equal(DOC_SORTS.rate.val({ req: 200, done: 100 }), 0.5);
});

test('UMS_SORTS: 전화번호는 정렬 대상, 검색 대상은 아님(PII 정책)', () => {
  assert.ok(Object.prototype.hasOwnProperty.call(UMS_SORTS, 'phone'));
  assert.equal(UMS_SEARCH_FIELDS.includes('phone'), false);
  assert.equal(SCENARIO_SEARCH_FIELDS.includes('phone'), false);
  assert.equal(DOC_SEARCH_FIELDS.includes('phone'), false);
});

test('SCENARIO_SORTS.nodes: DB 는 jsonb_array_length, 데모는 배열 길이(동일 의미)', () => {
  assert.equal(SCENARIO_SORTS.nodes.sql, 'jsonb_array_length(nodes)');
  assert.equal(SCENARIO_SORTS.nodes.val({ nodes: [1, 2, 3] }), 3);
  assert.equal(SCENARIO_SORTS.nodes.val({}), 0);            // nodes 없음 → 0(정렬 붕괴 방지)
});

test('시나리오 정렬: 노드 수 내림차순 · 원본 불변', () => {
  const snapshot = JSON.stringify(rows);
  const out = sortRowsBy(rows, { key: 'nodes', dir: 'desc' }, SCENARIO_SORTS);
  assert.deepEqual(out.map((r) => r.id), ['SC-01', 'SC-02', 'SC-03', 'SC-04']);
  assert.equal(JSON.stringify(rows), snapshot);
});

test('시나리오 정렬: 수정일은 문자열이 아니라 시각 값으로 비교', () => {
  const out = sortRowsBy(rows, { key: 'updated_at', dir: 'desc' }, SCENARIO_SORTS);
  assert.deepEqual(out.map((r) => r.id), ['SC-04', 'SC-01', 'SC-03', 'SC-02']);
});

test('시나리오 ORDER BY: 방향·nulls last·id 2차 정렬', () => {
  const s = parseSortParams('/api/scenarios?sort=version&dir=desc', SCENARIO_SORTS);
  assert.deepEqual(s, { key: 'version', dir: 'desc' });
  assert.equal(orderBySql(s, SCENARIO_SORTS, 'id asc'), 'version desc nulls last, id asc');
});

test('시나리오: 화이트리스트 밖 키·인젝션 시도는 무시(기존 order by id 유지)', () => {
  assert.equal(parseSortParams('/api/scenarios?sort=nodes;drop table scenarios', SCENARIO_SORTS), null);
  assert.equal(parseSortParams('/api/scenarios?sort=updated_by', SCENARIO_SORTS), null); // 정렬 대상 아님
  assert.equal(parseSortParams('/api/scenarios', SCENARIO_SORTS), null);
});

test('시나리오 서버 검색: 이름·유형·상태·수정자 부분일치(대소문자 무시)', () => {
  assert.deepEqual(filterRows(rows, '아웃바운드', SCENARIO_SEARCH_FIELDS).map((r) => r.id), ['SC-04']);
  assert.deepEqual(filterRows(rows, '박환불', SCENARIO_SEARCH_FIELDS).map((r) => r.id), ['SC-03', 'SC-04']);
  assert.deepEqual(filterRows(rows, 'sc-02', SCENARIO_SEARCH_FIELDS).map((r) => r.id), ['SC-02']);
  assert.deepEqual(filterRows(rows, '', SCENARIO_SEARCH_FIELDS).length, 4); // 검색어 없으면 전체
});

test('시나리오 페이징: limit/offset 슬라이스 · 하위호환 기본값', () => {
  const p0 = parseListParams('/api/scenarios');
  assert.deepEqual([p0.limit, p0.offset, p0.q, p0.meta], [100, 0, null, false]); // 파라미터 없으면 기존 동작
  const p = parseListParams('/api/scenarios?limit=2&offset=2&meta=1');
  assert.deepEqual(sliceRows(rows, p).map((r) => r.id), ['SC-03', 'SC-04']);
  assert.equal(p.meta, true);
});

test('시나리오 검색어의 ILIKE 와일드카드는 이스케이프된다(패턴 오인 방지)', () => {
  assert.equal(likeParam('100%_할인'), '%100\\%\\_할인%');
  assert.equal(likeParam(null), null);
});
