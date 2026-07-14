// tests/clearparams.test.mjs — 조회 조건 초기화(조건 지우기) 순수 유틸 회귀 테스트
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clearHref, clearQuery, conditionEntries, countConditions, hasConditions,
} from '../lib/clearParams.js';

test('clearparams: 조건이 없으면 0건 · 비활성', () => {
  assert.equal(countConditions(''), 0);
  assert.equal(countConditions('?'), 0);
  assert.equal(hasConditions(''), false);
  assert.deepEqual(conditionEntries(''), []);
});

test('clearparams: 조건 개수는 파라미터 개수(선행 ? 유무 무관)', () => {
  assert.equal(countConditions('?range=7d&q=김&sort=req&dir=desc'), 4);
  assert.equal(countConditions('range=7d&q=김&sort=req&dir=desc'), 4);
  assert.equal(hasConditions('?q=a'), true);
});

test('clearparams: 같은 키의 여러 값도 각각 센다', () => {
  assert.equal(countConditions('?ch=문자&ch=음성'), 2);
});

test('clearparams: 쿼리 전체 제거 → 빈 문자열', () => {
  assert.equal(clearQuery('?range=30d&q=%EA%B9%80&ch=%EC%9D%8C%EC%84%B1&sort=at&dir=desc'), '');
});

test('clearparams: keep 키는 보존(순서 유지)되고 나머지만 제거', () => {
  assert.equal(clearQuery('?keepme=1&range=7d&q=a&other=2', ['keepme', 'other']), 'keepme=1&other=2');
  assert.equal(countConditions('?keepme=1&range=7d&q=a', ['keepme']), 2);
  assert.deepEqual(conditionEntries('?keepme=1&range=7d', ['keepme']), [['range', '7d']]);
});

test('clearparams: keep 이 없는 키를 가리켜도 안전', () => {
  assert.equal(clearQuery('?q=a', ['nope']), '');
});

test('clearHref: 남길 파라미터가 없으면 순수 경로(조건 없는 기본 화면과 동일한 주소)', () => {
  assert.equal(clearHref('/ums', '?range=7d&status=%EC%8B%A4%ED%8C%A8'), '/ums');
  assert.equal(clearHref('/docs', ''), '/docs');
});

test('clearHref: keep 이 있으면 그 파라미터만 붙는다', () => {
  assert.equal(clearHref('/history', '?tab=x&q=a', ['tab']), '/history?tab=x');
});

test('clearHref: pathname 이 비어도 루트로 폴백', () => {
  assert.equal(clearHref('', '?q=a'), '/');
  assert.equal(clearHref(undefined, ''), '/');
});

test('clearparams: URLSearchParams·객체 입력도 수용', () => {
  assert.equal(countConditions(new URLSearchParams('a=1&b=2')), 2);
  assert.equal(clearQuery(new URLSearchParams('a=1&b=2'), ['b']), 'b=2');
  assert.equal(countConditions({ range: '7d', q: 'x', nul: null }), 2); // null 값은 무시
});

test('clearparams: 이상한 입력은 조용히 0건으로 폴백(화면 무붕괴)', () => {
  assert.equal(countConditions(null), 0);
  assert.equal(countConditions(undefined), 0);
  assert.equal(countConditions(123), 0);
  assert.equal(clearQuery(null), '');
});

test('clearparams: 값에 특수문자가 있어도 인코딩이 보존된다', () => {
  assert.equal(clearQuery('?q=%EA%B0%80%20%EB%82%98&keep=a%26b', ['keep']), 'keep=a%26b');
});

test('clearparams: 인젝션 시도 문자열도 그냥 제거 대상일 뿐(파싱 예외 없음)', () => {
  assert.equal(countConditions("?sort=DROP;--&dir=x'"), 2);
  assert.equal(clearQuery("?sort=DROP;--&dir=x'"), '');
});
