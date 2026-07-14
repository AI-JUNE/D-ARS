// tests/sortth.test.mjs — 정렬 헤더 접근성 하드닝(2026-07-13) 회귀 테스트
// nextSort/sortArrow/ariaSort 는 순수 함수라 React 없이 검증 가능하다.
// 목적: 기존 화면(docs·ums·sessions)에 인라인 중복돼 있던 정렬 토글 로직을 단일화하면서
//       (1) 상태 전이(오름→내림→해제)가 100% 보존되는지, (2) aria-sort 가 올바른지 고정한다.

import test from 'node:test';
import assert from 'node:assert/strict';
import { nextSort, sortArrow, ariaSort } from '../lib/ui.js';

test('nextSort: 미정렬 → 오름차순', () => {
  assert.deepEqual(nextSort(null, 'biz'), { key: 'biz', dir: 'asc' });
});

test('nextSort: 같은 컬럼 오름 → 내림', () => {
  assert.deepEqual(nextSort({ key: 'biz', dir: 'asc' }, 'biz'), { key: 'biz', dir: 'desc' });
});

test('nextSort: 같은 컬럼 내림 → 해제(null)', () => {
  assert.equal(nextSort({ key: 'biz', dir: 'desc' }, 'biz'), null);
});

test('nextSort: 다른 컬럼을 누르면 그 컬럼 오름차순으로 전환', () => {
  assert.deepEqual(nextSort({ key: 'biz', dir: 'desc' }, 'name'), { key: 'name', dir: 'asc' });
});

test('nextSort: key 가 없으면 상태 유지(방어)', () => {
  const s = { key: 'biz', dir: 'asc' };
  assert.equal(nextSort(s, ''), s);
  assert.equal(nextSort(null, undefined), null);
});

test('nextSort: 3회 순환하면 원래(미정렬) 상태로 돌아온다', () => {
  let s = null;
  s = nextSort(s, 'req'); s = nextSort(s, 'req'); s = nextSort(s, 'req');
  assert.equal(s, null);
});

test('nextSort: 입력 상태를 변경하지 않는다(불변)', () => {
  const s = { key: 'biz', dir: 'asc' };
  nextSort(s, 'biz');
  assert.deepEqual(s, { key: 'biz', dir: 'asc' });
});

test('sortArrow: 정렬 방향에 맞는 화살표(미정렬은 빈 문자열)', () => {
  assert.equal(sortArrow(null, 'biz'), '');
  assert.equal(sortArrow({ key: 'name', dir: 'asc' }, 'biz'), '');
  assert.equal(sortArrow({ key: 'biz', dir: 'asc' }, 'biz'), ' ▲');
  assert.equal(sortArrow({ key: 'biz', dir: 'desc' }, 'biz'), ' ▼');
});

test('ariaSort: WAI-ARIA columnheader 값', () => {
  assert.equal(ariaSort(null, 'biz'), 'none');
  assert.equal(ariaSort({ key: 'name', dir: 'asc' }, 'biz'), 'none');
  assert.equal(ariaSort({ key: 'biz', dir: 'asc' }, 'biz'), 'ascending');
  assert.equal(ariaSort({ key: 'biz', dir: 'desc' }, 'biz'), 'descending');
});

test('화살표와 aria-sort 는 항상 같은 상태를 가리킨다(표시·스크린리더 일치)', () => {
  for (const s of [null, { key: 'x', dir: 'asc' }, { key: 'x', dir: 'desc' }]) {
    const arrow = sortArrow(s, 'x');
    const aria = ariaSort(s, 'x');
    if (arrow === '') assert.equal(aria, 'none');
    if (arrow === ' ▲') assert.equal(aria, 'ascending');
    if (arrow === ' ▼') assert.equal(aria, 'descending');
  }
});
