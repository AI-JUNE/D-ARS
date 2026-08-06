// tests/toast.test.mjs — 비차단 토스트 순수 로직 회귀 테스트(108회차)
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TOAST_BASE_MS, TOAST_MAX_MS, TOAST_PER_CHAR_MS, TOAST_FREE_CHARS,
  toastKind, toastDuration, makeToast,
} from '../lib/toast.js';

test('toastKind: warn 만 경고 톤, 나머지는 전부 ok 로 정규화', () => {
  assert.equal(toastKind('warn'), 'warn');
  assert.equal(toastKind('ok'), 'ok');
  assert.equal(toastKind(undefined), 'ok');
  assert.equal(toastKind('danger'), 'ok'); // 알 수 없는 값 방어
});

test('toastDuration: 기준 길이 이하 짧은 메시지는 기본 시간', () => {
  assert.equal(toastDuration('저장됨'), TOAST_BASE_MS);
  assert.equal(toastDuration(''), TOAST_BASE_MS);
});

test('toastDuration: 기준 길이 초과분은 1자당 가산', () => {
  const msg = 'a'.repeat(TOAST_FREE_CHARS + 10);
  assert.equal(toastDuration(msg), TOAST_BASE_MS + 10 * TOAST_PER_CHAR_MS);
});

test('toastDuration: 장문도 상한을 넘지 않는다', () => {
  assert.equal(toastDuration('a'.repeat(500)), TOAST_MAX_MS);
});

test('toastDuration: 비문자열은 기본 시간으로 방어', () => {
  assert.equal(toastDuration(null), TOAST_BASE_MS);
  assert.equal(toastDuration(undefined), TOAST_BASE_MS);
  assert.equal(toastDuration(123), TOAST_BASE_MS);
});

test('makeToast: id 는 이전 토스트에서 단조 증가(연속 동일 메시지도 key 변경 보장)', () => {
  const a = makeToast(null, '저장됨');
  const b = makeToast(a, '저장됨');
  assert.equal(a.id, 1);
  assert.equal(b.id, 2);
});

test('makeToast: prev 가 없거나 id 가 오염돼도 1부터 안전 시작', () => {
  assert.equal(makeToast(null, 'x').id, 1);
  assert.equal(makeToast({ id: 'oops' }, 'x').id, 1);
  assert.equal(makeToast({}, 'x').id, 1);
});

test('makeToast: 메시지 null/undefined 는 빈 문자열로 방어', () => {
  assert.equal(makeToast(null, null).msg, '');
  assert.equal(makeToast(null, undefined).msg, '');
});

test('makeToast: 비문자열 메시지는 문자열로 강제', () => {
  assert.equal(makeToast(null, 42).msg, '42');
});

test('makeToast: kind 정규화·표시 시간이 toastDuration 과 일치', () => {
  const t = makeToast(null, '⚠ 런칭/종료 노드를 확인하세요', 'warn');
  assert.equal(t.kind, 'warn');
  assert.equal(t.ms, toastDuration('⚠ 런칭/종료 노드를 확인하세요'));
  assert.equal(makeToast(null, 'x', 'bogus').kind, 'ok');
});
