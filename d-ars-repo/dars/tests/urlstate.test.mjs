// tests/urlstate.test.mjs — 검색어·필터 URL 보존(lib/urlState.js) 회귀 테스트
// 계약: (1) 기본값이면 파라미터를 붙이지 않는다(기존 주소와 100% 동일 → 하위호환)
//       (2) 화이트리스트 밖 값·쓰레기 문자열은 조용히 기본값 폴백(화면 무붕괴)
//       (3) 스펙 밖 파라미터(range 등)는 보존(useRangeParam 과 공존)
//       (4) 자유 입력은 트림·100자 제한(서버 q 정책과 일치)

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_Q, coerceValue, defaultState, parseUrlState, withUrlState, urlStateHref,
} from '../lib/urlState.js';

const SPEC = {
  q: { qs: 'q', def: '' },
  status: { qs: 'status', def: '전체', values: ['전체', '발송완료', '대기', '실패'] },
};

test('defaultState: 스펙의 기본값 객체를 만든다', () => {
  assert.deepEqual(defaultState(SPEC), { q: '', status: '전체' });
  assert.deepEqual(defaultState(undefined), {});
});

test('parseUrlState: URL 의 값을 읽는다(선행 ? 유무 무관)', () => {
  assert.deepEqual(parseUrlState('?q=영수증&status=실패', SPEC), { q: '영수증', status: '실패' });
  assert.deepEqual(parseUrlState('q=영수증&status=대기', SPEC), { q: '영수증', status: '대기' });
  assert.deepEqual(parseUrlState(new URLSearchParams('status=발송완료'), SPEC), { q: '', status: '발송완료' });
});

test('parseUrlState: 없거나 형식이 어긋나면 기본값 폴백', () => {
  assert.deepEqual(parseUrlState('', SPEC), { q: '', status: '전체' });
  assert.deepEqual(parseUrlState(null, SPEC), { q: '', status: '전체' });
  assert.deepEqual(parseUrlState('?status=', SPEC), { q: '', status: '전체' });
});

test('parseUrlState: 화이트리스트 밖 열거값(인젝션 시도 포함)은 기본값으로 폴백', () => {
  assert.equal(parseUrlState("?status=' or 1=1--", SPEC).status, '전체');
  assert.equal(parseUrlState('?status=drop%20table', SPEC).status, '전체');
  assert.equal(parseUrlState('?status=발송완료x', SPEC).status, '전체');
});

test('coerceValue: 자유 입력은 트림 + 100자 제한', () => {
  assert.equal(coerceValue('  영수증  ', SPEC.q), '영수증');
  const long = 'ㄱ'.repeat(300);
  assert.equal(coerceValue(long, SPEC.q).length, MAX_Q);
  assert.equal(coerceValue(123, SPEC.q), ''); // 문자열이 아니면 기본값
});

test('withUrlState: 기본값 키는 쿼리에서 제거된다(주소가 기존과 동일)', () => {
  assert.equal(withUrlState('', { q: '', status: '전체' }, SPEC), '');
  assert.equal(withUrlState('?q=a&status=실패', { q: '', status: '전체' }, SPEC), '');
});

test('withUrlState: 값이 있으면 싣는다', () => {
  const qs = new URLSearchParams(withUrlState('', { q: '영수증', status: '실패' }, SPEC));
  assert.equal(qs.get('q'), '영수증');
  assert.equal(qs.get('status'), '실패');
});

test('withUrlState: 스펙 밖 파라미터(range)는 보존 — useRangeParam 과 공존', () => {
  const qs = new URLSearchParams(withUrlState('?range=7d', { q: '영수증', status: '전체' }, SPEC));
  assert.equal(qs.get('range'), '7d');
  assert.equal(qs.get('q'), '영수증');
  assert.equal(qs.get('status'), null); // 기본값 → 제거
});

test('withUrlState: 화이트리스트 밖 값을 넣으려 해도 기본값으로 폴백(= 제거)', () => {
  assert.equal(withUrlState('', { q: '', status: '없는상태' }, SPEC), '');
});

test('urlStateHref: pathname + 쿼리 + 해시 조립, 빈 쿼리면 ? 없음', () => {
  assert.equal(urlStateHref({ pathname: '/ums', search: '', hash: '' }, { q: '', status: '전체' }, SPEC), '/ums');
  assert.equal(
    urlStateHref({ pathname: '/ums', search: '?range=30d', hash: '#top' }, { q: '', status: '실패' }, SPEC),
    '/ums?range=30d&status=%EC%8B%A4%ED%8C%A8#top',
  );
});

test('왕복(round-trip): 파싱 → 조립 → 재파싱이 값을 보존한다', () => {
  const start = '?range=90d&status=대기&q=거래+영수증';
  const s1 = parseUrlState(start, SPEC);
  const href = urlStateHref({ pathname: '/ums', search: start }, s1, SPEC);
  const s2 = parseUrlState(href.split('?')[1] || '', SPEC);
  assert.deepEqual(s2, s1);
  assert.ok(href.includes('range=90d')); // 기간 파라미터 유실 없음
});
