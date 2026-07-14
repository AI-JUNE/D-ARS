// tests/exportall.test.mjs — 내보내기 "서버 전체 기준" 수집 유틸 회귀 테스트
import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchAllRows, truncationNote, EXPORT_PAGE_SIZE, EXPORT_MAX_ROWS } from '../lib/exportAll.js';

// 가짜 서버: rows 를 limit/offset 으로 잘라 meta 응답을 준다. 호출 URL 을 기록한다.
function makeServer(rows, { meta = true } = {}) {
  const calls = [];
  const get = async (url) => {
    calls.push(url);
    const u = new URL(url, 'http://x');
    const limit = Number(u.searchParams.get('limit'));
    const offset = Number(u.searchParams.get('offset'));
    const q = u.searchParams.get('q') || '';
    const pool = q ? rows.filter((r) => String(r.name).includes(q)) : rows;
    const slice = pool.slice(offset, offset + limit);
    if (!meta) return { data: slice, error: null };
    return {
      data: { rows: slice, total: pool.length, limit, offset, hasMore: offset + slice.length < pool.length },
      error: null,
    };
  };
  return { get, calls };
}

const mkRows = (n, prefix = 'r') =>
  Array.from({ length: n }, (_, i) => ({ id: i + 1, name: `${prefix}${i + 1}` }));

test('한 페이지로 끝나면 1회만 요청한다', async () => {
  const s = makeServer(mkRows(10));
  const r = await fetchAllRows('/api/docs', { get: s.get });
  assert.equal(r.error, null);
  assert.equal(r.rows.length, 10);
  assert.equal(r.total, 10);
  assert.equal(r.truncated, false);
  assert.equal(s.calls.length, 1);
});

test('여러 페이지를 offset 순회로 모두 모은다(로드된 행이 아니라 전체)', async () => {
  const s = makeServer(mkRows(450));
  const r = await fetchAllRows('/api/multimodal', { get: s.get, pageSize: 200 });
  assert.equal(r.rows.length, 450);
  assert.equal(r.total, 450);
  assert.equal(r.truncated, false);
  assert.equal(s.calls.length, 3); // 200 + 200 + 50
  assert.deepEqual(r.rows.map((x) => x.id).slice(-1), [450]);
});

test('중복 id 는 병합 시 제거된다(삽입으로 오프셋이 밀린 경우)', async () => {
  let hit = 0;
  const get = async (url) => {
    const u = new URL(url, 'http://x');
    const offset = Number(u.searchParams.get('offset'));
    hit++;
    if (offset === 0) return { data: { rows: [{ id: 1 }, { id: 2 }], total: 4, hasMore: true }, error: null };
    return { data: { rows: [{ id: 2 }, { id: 3 }], total: 4, hasMore: false }, error: null };
  };
  const r = await fetchAllRows('/api/sessions', { get, pageSize: 2 });
  assert.deepEqual(r.rows.map((x) => x.id), [1, 2, 3]);
  assert.equal(hit, 2);
});

test('안전 상한(maxRows)에 걸리면 truncated=true 로 중단한다', async () => {
  const s = makeServer(mkRows(1000));
  const r = await fetchAllRows('/api/ums', { get: s.get, pageSize: 100, maxRows: 250 });
  assert.equal(r.rows.length, 250);
  assert.equal(r.truncated, true);
  assert.equal(r.total, 1000); // 서버 총계는 그대로 보고
});

test('검색어·필터 파라미터가 요청 URL 에 실린다', async () => {
  const s = makeServer(mkRows(5, 'kim'));
  await fetchAllRows('/api/ums', { get: s.get, q: 'kim2', params: { status: '대기' } });
  const u = new URL(s.calls[0], 'http://x');
  assert.equal(u.searchParams.get('q'), 'kim2');
  assert.equal(u.searchParams.get('status'), '대기');
  assert.equal(u.searchParams.get('meta'), '1');
});

test("params 의 '전체'·빈 값은 생략된다(전체 조건)", async () => {
  const s = makeServer(mkRows(3));
  await fetchAllRows('/api/multimodal', { get: s.get, params: { channel: '전체', foo: '' } });
  const u = new URL(s.calls[0], 'http://x');
  assert.equal(u.searchParams.get('channel'), null);
  assert.equal(u.searchParams.get('foo'), null);
});

test('실패하면 throw 하지 않고 error 를 반환한다(부분 수집분 보존)', async () => {
  let n = 0;
  const get = async () => {
    n++;
    if (n === 1) return { data: { rows: [{ id: 1 }, { id: 2 }], total: 4, hasMore: true }, error: null };
    return { data: null, error: '일시적인 서버 오류입니다' };
  };
  const r = await fetchAllRows('/api/docs', { get, pageSize: 2 });
  assert.equal(r.error, '일시적인 서버 오류입니다');
  assert.equal(r.rows.length, 2);
});

test('배열(구형) 응답도 하위호환으로 순회한다', async () => {
  const s = makeServer(mkRows(120), { meta: false });
  const r = await fetchAllRows('/api/docs', { get: s.get, pageSize: 50 });
  assert.equal(r.rows.length, 120);
  assert.equal(r.truncated, false);
});

test('빈 결과·빈 페이지에서 무한 루프하지 않는다', async () => {
  let n = 0;
  const get = async () => { n++; return { data: { rows: [], total: 0, hasMore: true }, error: null }; };
  const r = await fetchAllRows('/api/docs', { get, pageSize: 50 });
  assert.equal(r.rows.length, 0);
  assert.equal(n, 1); // 빈 페이지를 받으면 hasMore 와 무관하게 중단
});

test('get 미주입 시 throw 없이 error 를 반환한다', async () => {
  const r = await fetchAllRows('/api/docs', {});
  assert.equal(r.rows.length, 0);
  assert.match(r.error, /함수/);
});

test('pageSize 는 API 상한(500) 이내로 클램핑된다', async () => {
  const s = makeServer(mkRows(10));
  await fetchAllRows('/api/docs', { get: s.get, pageSize: 99999 });
  const u = new URL(s.calls[0], 'http://x');
  assert.equal(u.searchParams.get('limit'), '500');
});

test('truncationNote: 상한 미도달이면 빈 문자열', () => {
  assert.equal(truncationNote(false), '');
  assert.match(truncationNote(true, 5000), /5,000/);
});

test('기본 상수', () => {
  assert.equal(EXPORT_PAGE_SIZE, 200);
  assert.equal(EXPORT_MAX_ROWS, 5000);
});
