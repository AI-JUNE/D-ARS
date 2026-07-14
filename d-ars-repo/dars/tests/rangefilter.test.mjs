// tests/rangefilter.test.mjs — 목록 화면 기간 필터(/history·/ums) 회귀 테스트
// 검증 대상: rangeBounds(SQL 바인딩 경계값) · filterByDate(데모 폴백 · ts/sent_at 필드) ·
//            rangeQuery→buildListUrl(화면→요청 파라미터) 하위호환.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseRangeParams, rangeBounds, filterByDate, rangeQuery, DEFAULT_RANGE, RANGE_PRESETS,
} from '../lib/statsRange.js';
import { buildListUrl } from '../lib/listUrl.js';

const NOW = new Date('2026-07-13T12:00:00Z');

test('rangeBounds: 구간 미지정이면 null/null (기존 where 절 통과 → 하위호환)', () => {
  assert.deepEqual(rangeBounds(null), { from: null, to: null });
  assert.deepEqual(rangeBounds(undefined), { from: null, to: null });
  assert.deepEqual(rangeBounds({}), { from: null, to: null });
});

test('rangeBounds: days=7 → 오늘 포함 최근 7일 경계', () => {
  const r = parseRangeParams('http://local/api/multimodal?days=7', NOW);
  assert.deepEqual(rangeBounds(r), { from: '2026-07-07', to: '2026-07-13' });
});

test('rangeBounds: from/to 명시 구간(역전 입력은 교정)', () => {
  const r = parseRangeParams('http://local/api/ums?from=2026-06-30&to=2026-06-01', NOW);
  assert.deepEqual(rangeBounds(r), { from: '2026-06-01', to: '2026-06-30' });
});

test('rangeBounds: 쓰레기·인젝션 시도 날짜는 구간 미적용(전 기간 폴백)', () => {
  for (const bad of ["2026-06-01'; drop table ums_log;--", '2026-02-31', 'yesterday', '', '2026-6-1']) {
    const r = parseRangeParams(`http://local/api/ums?from=${encodeURIComponent(bad)}&to=2026-07-01`, NOW);
    assert.deepEqual(rangeBounds(r), { from: null, to: null }, `bad=${bad}`);
  }
});

test('filterByDate(ts): 멀티모달 데모 폴백 — 구간 밖 행 제외, 경계일 포함', () => {
  const rows = [
    { id: 1, ts: '2026-07-13T09:00:00Z' },
    { id: 2, ts: '2026-07-07T23:59:59Z' }, // from 경계일 → 포함
    { id: 3, ts: '2026-07-06T23:59:59Z' }, // 구간 밖
    { id: 4, ts: null },                   // 날짜 없음 → 제외
  ];
  const r = parseRangeParams('http://local/api/multimodal?days=7', NOW);
  assert.deepEqual(filterByDate(rows, r, 'ts').map((x) => x.id), [1, 2]);
});

test('filterByDate(sent_at): UMS 발송 로그 — 필드명이 달라도 동일 의미', () => {
  const rows = [
    { id: 1, sent_at: '2026-07-13T01:00:00Z' },
    { id: 2, sent_at: '2026-05-01T01:00:00Z' },
  ];
  const r = parseRangeParams('http://local/api/ums?days=30', NOW);
  assert.deepEqual(filterByDate(rows, r, 'sent_at').map((x) => x.id), [1]);
});

test('filterByDate: 구간 미지정이면 원본 그대로(전 기간)', () => {
  const rows = [{ ts: '2020-01-01T00:00:00Z' }, { ts: null }];
  assert.equal(filterByDate(rows, null, 'ts').length, 2);
});

test('rangeQuery: 전체(all)는 빈 객체 → 요청 URL 이 기존과 동일(하위호환)', () => {
  assert.deepEqual(rangeQuery(DEFAULT_RANGE), {});
  assert.deepEqual(rangeQuery('all'), {});
  assert.deepEqual(rangeQuery('없는키'), {});
  assert.deepEqual(rangeQuery('30d'), { days: 30 });
});

test('RANGE_PRESETS: 7·30·90·전체 프리셋 단일 출처', () => {
  assert.deepEqual(RANGE_PRESETS.map((p) => p.key), ['7d', '30d', '90d', 'all']);
});

test('buildListUrl + rangeQuery: 목록 요청에 days 가 실린다(전체면 미포함)', () => {
  const u7 = new URL(buildListUrl('/api/ums', { params: { status: '전체', ...rangeQuery('7d') } }), 'http://local');
  assert.equal(u7.searchParams.get('days'), '7');
  assert.equal(u7.searchParams.get('status'), null); // '전체' 는 생략(기존 규칙)
  const uAll = new URL(buildListUrl('/api/ums', { params: { status: '전체', ...rangeQuery('all') } }), 'http://local');
  assert.equal(uAll.searchParams.get('days'), null);
});

test('라우트 파싱: 목록 파라미터(limit/offset/q)와 기간이 서로 간섭하지 않는다', () => {
  const r = parseRangeParams('http://local/api/multimodal?limit=50&offset=50&q=주문&days=90&sort=ts&dir=desc', NOW);
  assert.deepEqual(rangeBounds(r), { from: '2026-04-15', to: '2026-07-13' });
  assert.equal(r.days, 90);
});
