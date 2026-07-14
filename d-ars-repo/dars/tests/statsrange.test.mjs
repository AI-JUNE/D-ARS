// tests/statsrange.test.mjs — 통계 기간 파라미터(lib/statsRange.js) 회귀 테스트
// 핵심 계약: (1) 파라미터가 없으면 null → 라우트는 기존 전 기간 쿼리를 그대로 쓴다(하위호환),
//            (2) 날짜는 YYYY-MM-DD 형식 검증을 통과한 값만 나온다(SQL 바인딩 안전),
//            (3) 데모 daily 폴백은 고정 과거 날짜라 캘린더 필터가 0건이면 마지막 N일로 근사한다.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_DAYS, RANGE_PRESETS, DEFAULT_RANGE,
  dayKey, strictDay, shiftDay, parseRangeParams, inRange, filterByDate, tailDays,
  rangeQuery, statsUrl, rangeLabel, readRange,
} from '../lib/statsRange.js';

const NOW = new Date('2026-07-13T05:00:00Z');
const U = (qs) => `http://local/api/stats${qs}`;

test('dayKey: Date·ISO·날짜문자열 정규화, 잘못된 값은 null', () => {
  assert.equal(dayKey(new Date('2026-07-13T23:59:59Z')), '2026-07-13');
  assert.equal(dayKey('2026-07-13T10:00:00.000Z'), '2026-07-13');
  assert.equal(dayKey('2026-07-13'), '2026-07-13');
  assert.equal(dayKey('2026/07/13'), null);
  assert.equal(dayKey(''), null);
  assert.equal(dayKey(null), null);
  assert.equal(dayKey(new Date('nope')), null);
});

test('shiftDay: 월·연 경계를 넘어서도 UTC 기준으로 정확히 이동', () => {
  assert.equal(shiftDay('2026-07-13', -6), '2026-07-07');
  assert.equal(shiftDay('2026-03-01', -1), '2026-02-28');
  assert.equal(shiftDay('2026-01-01', -1), '2025-12-31');
  assert.equal(shiftDay('bad', -1), null);
});

test('parseRangeParams: 파라미터 없으면 null(= 전 기간, 기존 동작 유지)', () => {
  assert.equal(parseRangeParams(U(''), NOW), null);
  assert.equal(parseRangeParams(U('?meta=1'), NOW), null);
  assert.equal(parseRangeParams('완전히 잘못된 url', NOW), null);
});

test('parseRangeParams: days=N 은 오늘 포함 최근 N일', () => {
  const r = parseRangeParams(U('?days=7'), NOW);
  assert.deepEqual(r, { from: '2026-07-07', to: '2026-07-13', days: 7 });
  const one = parseRangeParams(U('?days=1'), NOW);
  assert.deepEqual(one, { from: '2026-07-13', to: '2026-07-13', days: 1 });
});

test('parseRangeParams: days 상한 클램핑 · 0·음수·비수치는 무시(null)', () => {
  assert.equal(parseRangeParams(U('?days=9999'), NOW).days, MAX_DAYS);
  assert.equal(parseRangeParams(U('?days=0'), NOW), null);
  assert.equal(parseRangeParams(U('?days=-5'), NOW), null);
  assert.equal(parseRangeParams(U('?days=abc'), NOW), null);
});

test('parseRangeParams: from·to 명시 구간, 역전 입력은 교정 · 형식 불량은 무시', () => {
  assert.deepEqual(parseRangeParams(U('?from=2026-06-01&to=2026-06-30'), NOW),
    { from: '2026-06-01', to: '2026-06-30', days: 0 });
  assert.deepEqual(parseRangeParams(U('?from=2026-06-30&to=2026-06-01'), NOW),
    { from: '2026-06-01', to: '2026-06-30', days: 0 });
  // 한쪽만 있거나 형식이 어긋나면 days 경로로 넘어가고, days 도 없으니 null
  assert.equal(parseRangeParams(U('?from=2026-06-01'), NOW), null);
  assert.equal(parseRangeParams(U('?from=오늘&to=내일'), NOW), null);
});

test('strictDay: 파라미터는 문자열 전체가 YYYY-MM-DD 여야 한다(앞 10자만 잘라 통과시키지 않는다)', () => {
  assert.equal(strictDay('2026-06-01'), '2026-06-01');
  assert.equal(strictDay(" 2026-06-01 "), '2026-06-01');       // 트림은 허용
  assert.equal(strictDay("2026-06-01';drop table daily_stats;--"), null);
  assert.equal(strictDay('2026-06-01T00:00:00Z'), null);        // 파라미터로는 날짜만 받는다
  assert.equal(strictDay('2026-02-31'), null);                  // 존재하지 않는 날짜
  assert.equal(strictDay(null), null);
});

test('parseRangeParams: SQL 인젝션 시도 문자열은 날짜 형식 검증에서 탈락(구간 미적용 → 기존 전 기간 쿼리)', () => {
  const r = parseRangeParams(U("?from=2026-06-01';drop table daily_stats;--&to=2026-06-30"), NOW);
  assert.equal(r, null);
  const ok = parseRangeParams(U('?days=30'), NOW);
  assert.match(ok.from, /^\d{4}-\d{2}-\d{2}$/);
  assert.match(ok.to, /^\d{4}-\d{2}-\d{2}$/);
});

test('inRange: 경계 포함, 날짜 없는 행은 제외 · range 없으면 항상 통과', () => {
  const r = { from: '2026-07-01', to: '2026-07-03', days: 3 };
  assert.equal(inRange('2026-07-01', r), true);
  assert.equal(inRange('2026-07-03T23:59:00Z', r), true);
  assert.equal(inRange('2026-06-30', r), false);
  assert.equal(inRange(null, r), false);
  assert.equal(inRange('2020-01-01', null), true);
});

test('filterByDate: 필드명 지정(day·ts·sent_at) · 원본 불변', () => {
  const rows = [
    { day: '2026-07-01', n: 1 },
    { day: '2026-07-05', n: 2 },
    { day: '2026-07-10', n: 3 },
  ];
  const out = filterByDate(rows, { from: '2026-07-02', to: '2026-07-09', days: 8 }, 'day');
  assert.deepEqual(out.map((r) => r.n), [2]);
  assert.equal(rows.length, 3);

  const logs = [{ ts: '2026-07-13T01:00:00Z' }, { ts: '2026-01-01T01:00:00Z' }];
  assert.equal(filterByDate(logs, { from: '2026-07-07', to: '2026-07-13', days: 7 }, 'ts').length, 1);
  assert.equal(filterByDate(logs, null, 'ts').length, 2);
});

test('tailDays: 캘린더 히트가 있으면 그대로, 0건이면 마지막 N일 근사(데모 폴백 무붕괴)', () => {
  const demo = [
    { day: '2026-06-27' }, { day: '2026-06-28' }, { day: '2026-06-29' },
    { day: '2026-06-30' }, { day: '2026-07-01' }, { day: '2026-07-02' }, { day: '2026-07-03' },
  ];
  // 오늘(07-13) 기준 최근 7일 → 캘린더로는 0건이지만 화면이 비면 안 되므로 마지막 7일로 근사
  const near = tailDays(demo, parseRangeParams(U('?days=7'), NOW));
  assert.equal(near.length, 7);
  const three = tailDays(demo, parseRangeParams(U('?days=3'), NOW));
  assert.deepEqual(three.map((r) => r.day), ['2026-07-01', '2026-07-02', '2026-07-03']);
  // 구간이 실제로 겹치면 캘린더 필터 결과를 쓴다
  const hit = tailDays(demo, { from: '2026-06-28', to: '2026-06-29', days: 2 });
  assert.deepEqual(hit.map((r) => r.day), ['2026-06-28', '2026-06-29']);
  // range 없으면 전체 그대로(하위호환)
  assert.equal(tailDays(demo, null).length, 7);
});

test('rangeQuery·statsUrl: all/미지정은 기존 URL 그대로(캐시 키 보존)', () => {
  assert.deepEqual(rangeQuery('all'), {});
  assert.deepEqual(rangeQuery('없는키'), {});
  assert.deepEqual(rangeQuery('30d'), { days: 30 });
  assert.equal(statsUrl('/api/stats', 'all'), '/api/stats');
  assert.equal(statsUrl('/api/stats', DEFAULT_RANGE), '/api/stats');
  assert.equal(statsUrl('/api/stats', '7d'), '/api/stats?days=7');
});

test('RANGE_PRESETS: 화면 세그먼트와 API 파라미터의 단일 출처 · 기본값은 전체', () => {
  assert.deepEqual(RANGE_PRESETS.map((r) => r.key), ['7d', '30d', '90d', 'all']);
  assert.equal(DEFAULT_RANGE, 'all');
  assert.equal(RANGE_PRESETS.find((r) => r.key === 'all').days, 0);
  for (const r of RANGE_PRESETS) assert.ok(r.days <= MAX_DAYS);
});

test('rangeLabel·readRange: 서버가 적용한 실제 구간을 라벨로(라벨-숫자 불일치 방지)', () => {
  assert.equal(rangeLabel({ from: '2026-07-07', to: '2026-07-13', days: 7 }), '최근 7일 (2026-07-07 ~ 2026-07-13)');
  assert.equal(rangeLabel({ from: '2026-06-01', to: '2026-06-30', days: 0 }), '2026-06-01 ~ 2026-06-30');
  assert.equal(rangeLabel(null, 7), '전체 7일 합계');
  assert.equal(rangeLabel(null, 0), '');
  assert.deepEqual(readRange({ from: '2026-07-01', to: '2026-07-03', days: 3 }), { from: '2026-07-01', to: '2026-07-03', days: 3 });
  assert.equal(readRange({ from: 'bad', to: '2026-07-03' }), null);
  assert.equal(readRange(null), null);
  assert.equal(readRange(undefined), null);
});
