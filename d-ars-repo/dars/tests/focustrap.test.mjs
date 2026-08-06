// tests/focustrap.test.mjs — 모달 포커스 트랩·닫힘 포커스 복귀 회귀 테스트
// lib/focusTrap.js: focusables 필터 · wrapTarget 경계 순환 · trapTabKey · restoreFocus
import test from 'node:test';
import assert from 'node:assert/strict';
import { FOCUS_SELECTOR, focusables, wrapTarget, trapTabKey, restoreFocus } from '../lib/focusTrap.js';

// 테스트용 요소 목: 표시 상태(rects)·비활성·aria-hidden 을 흉내낸다
const el = (name, opts = {}) => ({
  name,
  disabled: !!opts.disabled,
  getAttribute: (k) => (k === 'aria-hidden' && opts.hidden ? 'true' : null),
  getClientRects: () => (opts.norects ? [] : [{}]),
  focus() { this.focused = (this.focused || 0) + 1; },
});
const box = (list) => ({ querySelectorAll: () => list });

test('FOCUS_SELECTOR: 표준 상호작용 요소 + tabindex(-1 제외) 포함', () => {
  assert.ok(FOCUS_SELECTOR.includes('a[href]'));
  assert.ok(FOCUS_SELECTOR.includes('button:not([disabled])'));
  assert.ok(FOCUS_SELECTOR.includes('[tabindex]:not([tabindex="-1"])'));
});

test('focusables: 비활성·aria-hidden·미렌더(rects 0) 요소 제외', () => {
  const a = el('a'), b = el('b', { disabled: true }), c = el('c', { hidden: true }), d = el('d', { norects: true });
  assert.deepEqual(focusables(box([a, b, c, d])).map((x) => x.name), ['a']);
});

test('focusables: DOM API 없는 요소는 안전하게 포함 · 잘못된 컨테이너는 []', () => {
  const bare = { name: 'bare' }; // getAttribute·getClientRects 없음(테스트 목)
  assert.deepEqual(focusables(box([bare])).map((x) => x.name), ['bare']);
  assert.deepEqual(focusables(null), []);
  assert.deepEqual(focusables({}), []);
  assert.deepEqual(focusables({ querySelectorAll: () => { throw new Error('x'); } }), []);
});

test('wrapTarget: 경계에서만 순환 — 끝→처음 · 처음→끝(Shift)', () => {
  const [a, b, c] = [el('a'), el('b'), el('c')];
  assert.equal(wrapTarget([a, b, c], c, false), a); // 마지막에서 Tab → 처음
  assert.equal(wrapTarget([a, b, c], a, true), c);  // 처음에서 Shift+Tab → 끝
  assert.equal(wrapTarget([a, b, c], b, false), null); // 중간은 브라우저 기본 이동
  assert.equal(wrapTarget([a, b, c], b, true), null);
});

test('wrapTarget: 포커스가 목록 밖이면 안쪽 끝으로 회수 · 빈 목록은 null', () => {
  const [a, b] = [el('a'), el('b')];
  const outside = el('out');
  assert.equal(wrapTarget([a, b], outside, false), a);
  assert.equal(wrapTarget([a, b], outside, true), b);
  assert.equal(wrapTarget([a, b], null, false), a);
  assert.equal(wrapTarget([], null, false), null);
  assert.equal(wrapTarget(undefined, null, false), null);
});

test('trapTabKey: 마지막 요소에서 Tab → preventDefault + 처음으로 포커스', () => {
  const [a, b] = [el('a'), el('b')];
  let prevented = 0;
  const e = { key: 'Tab', shiftKey: false, preventDefault: () => { prevented++; } };
  assert.equal(trapTabKey(e, box([a, b]), { activeElement: b }), true);
  assert.equal(prevented, 1);
  assert.equal(a.focused, 1);
});

test('trapTabKey: 중간 이동은 개입하지 않음(false·preventDefault 0회)', () => {
  const [a, b, c] = [el('a'), el('b'), el('c')];
  let prevented = 0;
  const e = { key: 'Tab', shiftKey: false, preventDefault: () => { prevented++; } };
  assert.equal(trapTabKey(e, box([a, b, c]), { activeElement: b }), false);
  assert.equal(prevented, 0);
});

test('trapTabKey: Tab 아닌 키·빈 이벤트는 false · 빈 다이얼로그는 탈출만 차단', () => {
  assert.equal(trapTabKey({ key: 'Escape' }, box([el('a')]), { activeElement: null }), false);
  assert.equal(trapTabKey(null, box([el('a')]), { activeElement: null }), false);
  let prevented = 0;
  const e = { key: 'Tab', preventDefault: () => { prevented++; } };
  assert.equal(trapTabKey(e, box([]), { activeElement: null }), false);
  assert.equal(prevented, 1); // 포커스 가능 요소 0개 — 배경 탈출만 차단
});

test('restoreFocus: 포커스 유실(body/null)일 때만 트리거로 복귀', () => {
  const bodyEl = {};
  const trigger = el('trigger');
  assert.equal(restoreFocus(trigger, { activeElement: bodyEl, body: bodyEl }), true);
  assert.equal(trigger.focused, 1);
  const trigger2 = el('trigger2');
  assert.equal(restoreFocus(trigger2, { activeElement: null, body: bodyEl }), true);
  assert.equal(trigger2.focused, 1);
});

test('restoreFocus: 다른 요소가 포커스를 가지면 개입하지 않음 · 결손 인자 방어', () => {
  const bodyEl = {}, other = el('other'), trigger = el('trigger');
  assert.equal(restoreFocus(trigger, { activeElement: other, body: bodyEl }), false);
  assert.equal(trigger.focused, undefined);
  assert.equal(restoreFocus(null, { activeElement: bodyEl, body: bodyEl }), false);
  assert.equal(restoreFocus({}, { activeElement: bodyEl, body: bodyEl }), false);
  assert.equal(restoreFocus({ focus: () => { throw new Error('detached'); } }, { activeElement: bodyEl, body: bodyEl }), false);
});
