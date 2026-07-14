// tests/listurl.test.mjs — 목록 화면 서버검색·페이징 순수 유틸 회귀 테스트
import test from 'node:test';
import assert from 'node:assert/strict';
import { PAGE_SIZE, buildListUrl, readPage, mergePage } from '../lib/listUrl.js';

test('buildListUrl: 기본 limit/offset/meta 포함', () => {
  const u = new URL(buildListUrl('/api/docs'), 'http://x');
  assert.equal(u.searchParams.get('limit'), String(PAGE_SIZE));
  assert.equal(u.searchParams.get('offset'), '0');
  assert.equal(u.searchParams.get('meta'), '1');
  assert.equal(u.searchParams.get('q'), null);
});

test('buildListUrl: 검색어 트림 후 전달, 공백만이면 생략', () => {
  const a = new URL(buildListUrl('/api/docs', { q: '  반품 ' }), 'http://x');
  assert.equal(a.searchParams.get('q'), '반품');
  const b = new URL(buildListUrl('/api/docs', { q: '   ' }), 'http://x');
  assert.equal(b.searchParams.get('q'), null);
});

test('buildListUrl: 추가 파라미터 전달, 빈값/전체는 생략(하위호환)', () => {
  const a = new URL(buildListUrl('/api/ums', { params: { status: '실패' } }), 'http://x');
  assert.equal(a.searchParams.get('status'), '실패');
  const b = new URL(buildListUrl('/api/ums', { params: { status: '전체', ch: '' , x: null } }), 'http://x');
  assert.equal(b.searchParams.get('status'), null);
  assert.equal(b.searchParams.get('ch'), null);
  assert.equal(b.searchParams.get('x'), null);
});

test('buildListUrl: offset/limit 반영(더 보기)', () => {
  const u = new URL(buildListUrl('/api/docs', { limit: 50, offset: 100 }), 'http://x');
  assert.equal(u.searchParams.get('limit'), '50');
  assert.equal(u.searchParams.get('offset'), '100');
});

test('readPage: meta 객체 응답', () => {
  const p = readPage({ rows: [{ id: 1 }], total: 7, limit: 50, offset: 0, hasMore: true }, { limit: 50, offset: 0 });
  assert.deepEqual(p.rows, [{ id: 1 }]);
  assert.equal(p.total, 7);
  assert.equal(p.hasMore, true);
});

test('readPage: hasMore 미제공 시 total 로 계산', () => {
  const p = readPage({ rows: [{ id: 1 }, { id: 2 }], total: 5 }, { limit: 2, offset: 2 });
  assert.equal(p.hasMore, true); // 2 + 2 < 5
  const q = readPage({ rows: [{ id: 1 }], total: 3 }, { limit: 2, offset: 2 });
  assert.equal(q.hasMore, false); // 2 + 1 >= 3
});

test('readPage: 배열(구형) 응답 하위호환 — 꽉 찬 페이지면 더 있음으로 간주', () => {
  const full = readPage([{ id: 1 }, { id: 2 }], { limit: 2, offset: 0 });
  assert.equal(full.hasMore, true);
  assert.equal(full.total, 2);
  const partial = readPage([{ id: 1 }], { limit: 2, offset: 4 });
  assert.equal(partial.hasMore, false);
  assert.equal(partial.total, 5); // offset + 개수
});

test('readPage: 비정상 응답은 빈 목록(화면 무붕괴)', () => {
  assert.deepEqual(readPage(null), { rows: [], total: 0, hasMore: false });
  assert.deepEqual(readPage({ error: 'x' }), { rows: [], total: 0, hasMore: false });
});

test('mergePage: offset 0 은 교체, 그 외는 누적', () => {
  const prev = [{ id: 1 }, { id: 2 }];
  assert.deepEqual(mergePage(prev, [{ id: 9 }], 0), [{ id: 9 }]);
  assert.deepEqual(mergePage(prev, [{ id: 3 }], 2), [{ id: 1 }, { id: 2 }, { id: 3 }]);
});

test('mergePage: 중복 id 제거(삽입으로 오프셋이 밀려도 행 중복 없음)', () => {
  const prev = [{ id: 1 }, { id: 2 }];
  const out = mergePage(prev, [{ id: 2 }, { id: 3 }], 2);
  assert.deepEqual(out.map((r) => r.id), [1, 2, 3]);
});

test('mergePage: 원본 배열 불변', () => {
  const prev = [{ id: 1 }];
  const out = mergePage(prev, [{ id: 2 }], 1);
  assert.equal(prev.length, 1);
  assert.equal(out.length, 2);
});
