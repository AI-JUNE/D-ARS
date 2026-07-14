// tests/rangeparam.test.mjs — 기간 선택 ↔ URL 쿼리(?range=) 동기화 회귀 테스트
// 검증 대상: isRangeKey(화이트리스트) · parseRangeKey(폴백·형식 방어) · withRangeParam(기본값 제거·타 파라미터 보존)
//            · rangeHref(주소 조립) · rangeQuery 연동(URL 키 → API 파라미터).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isRangeKey, parseRangeKey, withRangeParam, rangeHref, RANGE_QS } from '../lib/rangeParam.js';
import {
  DEFAULT_RANGE, RANGE_PRESETS, rangeQuery, parseRangeParams, rangeBounds, filterByDate,
} from '../lib/statsRange.js';

test('isRangeKey: 프리셋 키만 허용', () => {
  for (const p of RANGE_PRESETS) assert.equal(isRangeKey(p.key), true);
  for (const bad of ['', ' ', '1d', 'ALL', null, undefined, 7, {}, 'drop table']) {
    assert.equal(isRangeKey(bad), false);
  }
});

test('parseRangeKey: 유효한 키를 읽는다(선행 ? 유무 무관)', () => {
  assert.equal(parseRangeKey('?range=7d'), '7d');
  assert.equal(parseRangeKey('range=30d'), '30d');
  assert.equal(parseRangeKey('?x=1&range=90d&y=2'), '90d');
  assert.equal(parseRangeKey(new URLSearchParams('range=7d')), '7d');
  assert.equal(parseRangeKey({ range: '30d' }), '30d');
});

test('parseRangeKey: 없거나 알 수 없는 값은 기본값 폴백(화면 무붕괴)', () => {
  assert.equal(parseRangeKey(''), DEFAULT_RANGE);
  assert.equal(parseRangeKey('?q=abc'), DEFAULT_RANGE);
  assert.equal(parseRangeKey('?range=999d'), DEFAULT_RANGE);
  assert.equal(parseRangeKey("?range=7d'; drop table scenarios;--"), DEFAULT_RANGE);
  assert.equal(parseRangeKey(null), DEFAULT_RANGE);
  assert.equal(parseRangeKey(undefined), DEFAULT_RANGE);
  assert.equal(parseRangeKey(123), DEFAULT_RANGE);
});

test('parseRangeKey: 공백은 트림 후 검증', () => {
  assert.equal(parseRangeKey('?range=%207d%20'), '7d');
});

test('parseRangeKey: fallback 을 명시하면 그 값으로 폴백', () => {
  assert.equal(parseRangeKey('?range=zzz', '30d'), '30d');
});

test('withRangeParam: 기본값(전체)은 쿼리에서 제거 → 기존 주소와 동일(하위호환)', () => {
  assert.equal(withRangeParam('?range=7d', DEFAULT_RANGE), '');
  assert.equal(withRangeParam('', DEFAULT_RANGE), '');
});

test('withRangeParam: 비기본 키는 설정, 타 파라미터는 보존', () => {
  assert.equal(withRangeParam('?tab=board', '7d'), 'tab=board&range=7d');
  assert.equal(withRangeParam('?range=7d&tab=board', '30d'), 'range=30d&tab=board');
  // 기본값으로 되돌리면 range 만 사라지고 나머지는 남는다
  assert.equal(withRangeParam('?range=30d&tab=board', DEFAULT_RANGE), 'tab=board');
});

test('withRangeParam: 알 수 없는 키는 기본값 취급(파라미터 제거)', () => {
  assert.equal(withRangeParam('?range=7d', 'nope'), '');
  assert.equal(withRangeParam('?range=7d', null), '');
});

test('withRangeParam: 잘못된 search 입력에도 throw 하지 않는다', () => {
  assert.equal(withRangeParam(null, '7d'), `${RANGE_QS}=7d`);
  assert.equal(withRangeParam(undefined, '7d'), `${RANGE_QS}=7d`);
  assert.equal(withRangeParam(42, DEFAULT_RANGE), '');
});

test('rangeHref: pathname + 쿼리 + 해시 조립', () => {
  assert.equal(rangeHref({ pathname: '/ums', search: '', hash: '' }, '7d'), '/ums?range=7d');
  assert.equal(rangeHref({ pathname: '/ums', search: '?range=7d', hash: '#tbl' }, DEFAULT_RANGE), '/ums#tbl');
  assert.equal(rangeHref({ pathname: '/history', search: '?range=7d', hash: '' }, '90d'), '/history?range=90d');
  assert.equal(rangeHref(undefined, '30d'), '/?range=30d');
});

test('URL 키 → API 파라미터: 왕복이 일관된다(공유 링크가 같은 데이터를 부른다)', () => {
  for (const p of RANGE_PRESETS) {
    const href = rangeHref({ pathname: '/history', search: '' }, p.key);
    const search = href.includes('?') ? href.slice(href.indexOf('?')) : '';
    const key = parseRangeKey(search);
    assert.equal(key, p.key);
    assert.deepEqual(rangeQuery(key), p.days ? { days: p.days } : {});
  }
});

test('공유 링크 시나리오: 다른 사람이 열어도 같은 구간(7일)이 복원된다', () => {
  const shared = rangeHref({ pathname: '/report', search: '?print=1' }, '7d');
  assert.equal(shared, '/report?print=1&range=7d');
  assert.equal(parseRangeKey(shared.slice(shared.indexOf('?'))), '7d');
});

/* /api/scenarios 기간 필터(2026-07-14) — **updated_at 기준**.
   DB 경로는 rangeBounds 의 경계값을 $n 바인딩하고, 데모 폴백은 filterByDate 로 같은 의미를 재현한다. */
const NOW = new Date('2026-07-14T12:00:00Z');
const SCN = [
  { id: 'SC-01', status: '운영', updated_at: '2026-07-14' }, // 오늘
  { id: 'SC-02', status: '운영', updated_at: '2026-07-10' }, // 4일 전
  { id: 'SC-03', status: '미운영', updated_at: '2026-06-20' }, // 24일 전
];

test('scenarios 기간: 파라미터 없으면 구간 미적용 → 전 기간(하위호환)', () => {
  const range = parseRangeParams('http://local/api/scenarios', NOW);
  assert.equal(range, null);
  assert.deepEqual(rangeBounds(range), { from: null, to: null }); // where 절이 통과 → 기존 쿼리와 동일
  assert.equal(filterByDate(SCN, range, 'updated_at').length, 3);
});

test('scenarios 기간: days=7 → 최근 7일 수정분만(감사 조회)', () => {
  const range = parseRangeParams('http://local/api/scenarios?days=7', NOW);
  assert.deepEqual(rangeBounds(range), { from: '2026-07-08', to: '2026-07-14' });
  assert.deepEqual(filterByDate(SCN, range, 'updated_at').map((s) => s.id), ['SC-01', 'SC-02']);
});

test('scenarios 기간: days=30 → 전부 포함 · 인젝션 문자열은 구간 미적용 폴백', () => {
  const r30 = parseRangeParams('http://local/api/scenarios?days=30', NOW);
  assert.equal(filterByDate(SCN, r30, 'updated_at').length, 3);
  const bad = parseRangeParams("http://local/api/scenarios?from=2026-01-01';drop table scenarios;--&to=2026-07-14", NOW);
  assert.equal(bad, null); // strictDay 미통과 → 전 기간(구간 미적용)
});

test('scenarios 기간: 화면 키 → 요청 파라미터(rangeQuery)와 동일 구간을 부른다', () => {
  assert.deepEqual(rangeQuery('7d'), { days: 7 });
  assert.deepEqual(rangeQuery(DEFAULT_RANGE), {}); // 전체 = 기존 요청 URL
});
