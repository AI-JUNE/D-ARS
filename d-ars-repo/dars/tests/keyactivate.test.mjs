// tests/keyactivate.test.mjs — 클릭 전용 요소 키보드 활성화 공통 처리 회귀 테스트
// lib/keyActivate.js: Enter/Space 판정 · IME 조합 방어 · Space 스크롤 방지 · pressableProps 계약
import test from 'node:test';
import assert from 'node:assert/strict';
import { isActivateKey, onActivateKey, pressableProps } from '../lib/keyActivate.js';

test('isActivateKey: Enter·Space(구형 Spacebar 포함)만 true, 다른 키·빈 이벤트는 false', () => {
  assert.equal(isActivateKey({ key: 'Enter' }), true);
  assert.equal(isActivateKey({ key: ' ' }), true);
  assert.equal(isActivateKey({ key: 'Spacebar' }), true); // 구형 브라우저 명칭
  assert.equal(isActivateKey({ key: 'a' }), false);
  assert.equal(isActivateKey({ key: 'Escape' }), false);
  assert.equal(isActivateKey({ key: 'Tab' }), false);
  assert.equal(isActivateKey(null), false);
  assert.equal(isActivateKey(undefined), false);
  assert.equal(isActivateKey('Enter'), false); // 이벤트 객체가 아니면 false
});

test('isActivateKey: 한글 IME 조합 중 Enter 는 무시(nativeEvent.isComposing·원본 isComposing)', () => {
  assert.equal(isActivateKey({ key: 'Enter', nativeEvent: { isComposing: true } }), false);
  assert.equal(isActivateKey({ key: 'Enter', nativeEvent: { isComposing: false } }), true);
  assert.equal(isActivateKey({ key: 'Enter', isComposing: true }), false);
});

test('isActivateKey: 레거시 IME(keyCode 229) 도 방어 — 합성·원본 양쪽', () => {
  assert.equal(isActivateKey({ key: 'Enter', keyCode: 229 }), false);
  assert.equal(isActivateKey({ key: 'Enter', nativeEvent: { keyCode: 229 } }), false);
  assert.equal(isActivateKey({ key: 'Enter', keyCode: 13 }), true);
});

test('onActivateKey: 활성화 키면 preventDefault + fn 호출 + true', () => {
  let prevented = 0; let called = 0;
  const e = { key: ' ', preventDefault: () => { prevented++; } };
  assert.equal(onActivateKey(e, () => { called++; }), true);
  assert.equal(prevented, 1); // Space 로 페이지가 스크롤되지 않도록
  assert.equal(called, 1);
});

test('onActivateKey: 다른 키는 fn 미호출·preventDefault 미호출·false', () => {
  let prevented = 0; let called = 0;
  const e = { key: 'Tab', preventDefault: () => { prevented++; } };
  assert.equal(onActivateKey(e, () => { called++; }), false);
  assert.equal(prevented, 0);
  assert.equal(called, 0);
});

test('onActivateKey: 결손 인자 방어 — preventDefault 없음·fn 없음·null 이벤트 무throw', () => {
  assert.doesNotThrow(() => onActivateKey({ key: 'Enter' }));            // fn 생략
  assert.doesNotThrow(() => onActivateKey({ key: 'Enter' }, null));      // fn null
  assert.equal(onActivateKey(null, () => {}), false);                    // 이벤트 null
  assert.equal(onActivateKey({ key: 'Enter' }, undefined), true);        // 판정은 그대로 true
});

test('pressableProps: role="button"·tabIndex 0·onClick=fn 계약', () => {
  const fn = () => {};
  const p = pressableProps(fn, '데모 시나리오 열기');
  assert.equal(p.role, 'button');
  assert.equal(p.tabIndex, 0);
  assert.equal(p.onClick, fn);
  assert.equal(typeof p.onKeyDown, 'function');
  assert.equal(p['aria-label'], '데모 시나리오 열기');
});

test('pressableProps: label 생략 시 aria-label 키 자체가 없다(요소 텍스트가 이름)', () => {
  const p = pressableProps(() => {});
  assert.equal(Object.prototype.hasOwnProperty.call(p, 'aria-label'), false);
});

test('pressableProps: onKeyDown 이 Enter/Space 에서만 fn 을 실행한다', () => {
  let called = 0;
  const p = pressableProps(() => { called++; });
  p.onKeyDown({ key: 'Enter', preventDefault: () => {} });
  assert.equal(called, 1);
  p.onKeyDown({ key: ' ', preventDefault: () => {} });
  assert.equal(called, 2);
  p.onKeyDown({ key: 'ArrowDown', preventDefault: () => {} });
  assert.equal(called, 2); // 이동 키는 불개입(스크롤·탐색 기본 동작 유지)
  p.onKeyDown({ key: 'Enter', nativeEvent: { isComposing: true }, preventDefault: () => {} });
  assert.equal(called, 2); // IME 조합 확정 Enter 무시
});
