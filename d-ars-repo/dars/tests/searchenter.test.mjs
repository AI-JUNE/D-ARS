// tests/searchenter.test.mjs — 검색 입력 Enter(모바일 "검색" 키) 공통 처리 회귀 테스트
// lib/searchEnter.js: IME 조합 방어 · 디바운스 플러시 · 터치 기기 키보드 접힘(coarse 에서만)
import test from 'node:test';
import assert from 'node:assert/strict';
import { isSearchSubmit, shouldDismissKeyboard, onSearchEnter } from '../lib/searchEnter.js';

// 테스트용 window 대체: pointer: coarse 매치 여부를 고정
const winCoarse = { matchMedia: (q) => ({ matches: q === '(pointer: coarse)' }) };
const winFine = { matchMedia: () => ({ matches: false }) };

test('isSearchSubmit: Enter 만 true, 다른 키·빈 이벤트는 false', () => {
  assert.equal(isSearchSubmit({ key: 'Enter' }), true);
  assert.equal(isSearchSubmit({ key: 'a' }), false);
  assert.equal(isSearchSubmit({ key: 'Escape' }), false);
  assert.equal(isSearchSubmit(null), false);
  assert.equal(isSearchSubmit(undefined), false);
});

test('isSearchSubmit: 한글 IME 조합 중 Enter 는 무시(nativeEvent.isComposing)', () => {
  assert.equal(isSearchSubmit({ key: 'Enter', nativeEvent: { isComposing: true } }), false);
  assert.equal(isSearchSubmit({ key: 'Enter', nativeEvent: { isComposing: false } }), true);
});

test('isSearchSubmit: 원본 이벤트 isComposing·레거시 keyCode 229 도 방어', () => {
  assert.equal(isSearchSubmit({ key: 'Enter', isComposing: true }), false);
  assert.equal(isSearchSubmit({ key: 'Enter', keyCode: 229 }), false);
  assert.equal(isSearchSubmit({ key: 'Enter', nativeEvent: { keyCode: 229 } }), false);
});

test('shouldDismissKeyboard: coarse=true · fine=false', () => {
  assert.equal(shouldDismissKeyboard(winCoarse), true);
  assert.equal(shouldDismissKeyboard(winFine), false);
});

test('shouldDismissKeyboard: window 부재·matchMedia 미지원/예외 시 false(안전 기본값)', () => {
  assert.equal(shouldDismissKeyboard(null), false);
  assert.equal(shouldDismissKeyboard({}), false);
  assert.equal(shouldDismissKeyboard({ matchMedia: () => { throw new Error('x'); } }), false);
});

test('onSearchEnter: Enter 가 아니면 아무 것도 하지 않고 false', () => {
  let flushed = 0;
  assert.equal(onSearchEnter({ key: 'a' }, () => { flushed++; }, winCoarse), false);
  assert.equal(flushed, 0);
});

test('onSearchEnter: Enter 시 preventDefault + flush 호출', () => {
  let flushed = 0, prevented = 0;
  const e = { key: 'Enter', preventDefault: () => { prevented++; } };
  assert.equal(onSearchEnter(e, () => { flushed++; }, winFine), true);
  assert.equal(flushed, 1);
  assert.equal(prevented, 1);
});

test('onSearchEnter: 터치 기기(coarse)에서만 blur(키보드 접힘)', () => {
  let blurredCoarse = 0, blurredFine = 0;
  const mk = (cb) => ({ key: 'Enter', preventDefault: () => {}, currentTarget: { blur: cb } });
  onSearchEnter(mk(() => { blurredCoarse++; }), null, winCoarse);
  onSearchEnter(mk(() => { blurredFine++; }), null, winFine);
  assert.equal(blurredCoarse, 1);
  assert.equal(blurredFine, 0); // 데스크톱은 포커스 유지(검색어 다듬기 흐름 보호)
});

test('onSearchEnter: flush 미제공·blur 미지원(currentTarget 없음)에도 예외 없이 true', () => {
  assert.equal(onSearchEnter({ key: 'Enter' }, undefined, winCoarse), true);
  assert.equal(onSearchEnter({ key: 'Enter', target: {} }, null, winCoarse), true);
});

test('onSearchEnter: IME 조합 중 Enter 는 flush·blur 없이 false', () => {
  let flushed = 0, blurred = 0;
  const e = {
    key: 'Enter', nativeEvent: { isComposing: true },
    preventDefault: () => {}, currentTarget: { blur: () => { blurred++; } },
  };
  assert.equal(onSearchEnter(e, () => { flushed++; }, winCoarse), false);
  assert.equal(flushed, 0);
  assert.equal(blurred, 0);
});
