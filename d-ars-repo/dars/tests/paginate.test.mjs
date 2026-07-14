// tests/paginate.test.mjs — 목록 API 페이지네이션·서버 사이드 검색 회귀 테스트
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseListParams, likeParam, filterRows, sliceRows, listResponse, MAX_LIMIT, MAX_Q,
} from '../lib/paginate.js';

const U = (qs = '') => 'http://local/api/x' + qs;

test('parseListParams: 파라미터 없으면 라우트 기본값(하위호환)', () => {
  const p = parseListParams(U(), { limit: 20 });
  assert.deepEqual(p, { limit: 20, offset: 0, q: null, meta: false });
});

test('parseListParams: limit 클램핑(1..MAX_LIMIT)', () => {
  assert.equal(parseListParams(U('?limit=0')).limit, 1);
  assert.equal(parseListParams(U('?limit=-5')).limit, 1);
  assert.equal(parseListParams(U('?limit=99999')).limit, MAX_LIMIT);
  assert.equal(parseListParams(U('?limit=50')).limit, 50);
  assert.equal(parseListParams(U('?limit=abc'), { limit: 100 }).limit, 100); // 비수치 → 기본값
});

test('parseListParams: offset 음수·비수치는 0', () => {
  assert.equal(parseListParams(U('?offset=-3')).offset, 0);
  assert.equal(parseListParams(U('?offset=xyz')).offset, 0);
  assert.equal(parseListParams(U('?offset=40')).offset, 40);
});

test('parseListParams: q 트림·길이 제한·빈문자는 null', () => {
  assert.equal(parseListParams(U('?q=%20%20')).q, null);
  assert.equal(parseListParams(U('?q=%20abc%20')).q, 'abc');
  assert.equal(parseListParams(U('?q=' + 'a'.repeat(300))).q.length, MAX_Q);
});

test('parseListParams: meta=1/true 만 객체 응답 모드', () => {
  assert.equal(parseListParams(U('?meta=1')).meta, true);
  assert.equal(parseListParams(U('?meta=true')).meta, true);
  assert.equal(parseListParams(U('?meta=0')).meta, false);
  assert.equal(parseListParams(U()).meta, false);
});

test('likeParam: 와일드카드 이스케이프', () => {
  assert.equal(likeParam(null), null);
  assert.equal(likeParam('영수증'), '%영수증%');
  assert.equal(likeParam('50%_x'), '%50\\%\\_x%');
});

test('filterRows: 대소문자 무시 부분일치 · null 안전 · q 없으면 원본', () => {
  const rows = [
    { id: 'D1', name: '거래 영수증', biz: null },
    { id: 'D2', name: 'Receipt', biz: '카페' },
  ];
  assert.equal(filterRows(rows, null, ['name']).length, 2);
  assert.equal(filterRows(rows, '영수증', ['id', 'name', 'biz']).length, 1);
  assert.equal(filterRows(rows, 'receipt', ['name']).length, 1); // 대소문자 무시
  assert.equal(filterRows(rows, '카페', ['biz']).length, 1); // null biz 행에서 예외 없음
  assert.equal(filterRows(rows, '없는값', ['name']).length, 0);
});

test('sliceRows: offset/limit 슬라이스', () => {
  const rows = Array.from({ length: 10 }, (_, i) => i);
  assert.deepEqual(sliceRows(rows, { limit: 3, offset: 0 }), [0, 1, 2]);
  assert.deepEqual(sliceRows(rows, { limit: 3, offset: 8 }), [8, 9]);
  assert.deepEqual(sliceRows(rows, { limit: 3, offset: 20 }), []);
});

test('listResponse: 기본은 배열 반환(하위호환) + 페이지 헤더', async () => {
  const p = { limit: 2, offset: 0, meta: false };
  const res = listResponse([{ id: 1 }, { id: 2 }], 7, p, 60);
  const body = await res.json();
  assert.ok(Array.isArray(body), '기본 응답은 배열이어야 한다');
  assert.equal(body.length, 2);
  assert.equal(res.headers.get('X-Total-Count'), '7');
  assert.equal(res.headers.get('X-Has-More'), '1');
  assert.equal(res.headers.get('X-Limit'), '2');
  assert.equal(res.headers.get('X-Offset'), '0');
  assert.match(res.headers.get('Cache-Control'), /s-maxage=60/);
});

test('listResponse: meta=1 이면 {rows,total,hasMore} 객체 · 마지막 페이지 hasMore=0', async () => {
  const p = { limit: 5, offset: 5, meta: true };
  const res = listResponse([{ id: 6 }, { id: 7 }], 7, p, 15);
  const body = await res.json();
  assert.deepEqual(body, { rows: [{ id: 6 }, { id: 7 }], total: 7, limit: 5, offset: 5, hasMore: false });
  assert.equal(res.headers.get('X-Has-More'), '0');
});
