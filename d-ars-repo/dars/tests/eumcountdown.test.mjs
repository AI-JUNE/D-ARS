// tests/eumcountdown.test.mjs — 「이음 어르신 신청」 남은 시간 계산
//
// 이 테스트가 지키는 선: **화면은 어르신 기기의 시계를 믿고 만료를 선언하지 않는다.**
// 고친 결함은 눈에 띄지 않는 종류였다 — 서버가 "유효하다"고 판정해 내려보낸 링크가, 기기 시계가
// 몇 분 앞섰다는 이유만으로 첫 화면에서 만료로 덮였다. 담당자가 새 링크를 보내도 같은 일이
// 반복되고, 양쪽 모두 원인을 알 수 없다. 그래서 아래 두 축을 회귀로 고정한다.
//   (1) 절대 시각이 아니라 **경과**로 센다 → 시계 오차에 무관
//   (2) 모를 때는 만료라고 **말하지 않는다** → 판정 실패가 멀쩡한 링크를 막지 않는다

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import {
  EUM_SOON_MS,
  EUM_SOON_MESSAGE,
  nowTick,
  initialLeftMs,
  elapsedSince,
  leftAfter,
  isExpired,
  isSoon,
  secondsLeft,
} from '../lib/eumCountdown.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(resolve(root, p), 'utf8');

// ── 정상 경로 ────────────────────────────────────────────────────────────────

test('정상 경로: 서버가 준 남은 기간에서 경과만큼 줄어든다', () => {
  const init = initialLeftMs(300000);
  assert.equal(init, 300000);
  assert.equal(leftAfter(init, 0), 300000);
  assert.equal(leftAfter(init, 1000), 299000);
  assert.equal(leftAfter(init, 299000), 1000);
  assert.equal(leftAfter(init, 300000), 0);
  assert.equal(leftAfter(init, 999999), 0, '남은 시간은 음수가 되지 않는다');
});

test('기기 시계가 얼마로 맞춰져 있든 결과가 같다(절대 오차 무관)', () => {
  // 같은 링크를 시계가 10분 앞선 기기와 3시간 느린 기기가 받았다고 하자. 눈금의 **출발점**만
  // 다를 뿐 경과는 같으므로 남은 시간도 같아야 한다 — 예전 구현은 여기서 갈렸다.
  const init = initialLeftMs(300000);
  const skewed = [0, 600000, -10800000, 1.7e12];
  const seen = new Set();
  for (const base of skewed) {
    seen.add(leftAfter(init, elapsedSince(base, base + 42000)));
  }
  assert.deepEqual([...seen], [258000], `시계에 따라 남은 시간이 달라졌다: ${[...seen].join(',')}`);
});

test('화면은 서버가 유효하다고 한 링크를 첫 순간에 만료로 덮지 않는다', () => {
  // 서버 판정(남은 1ms 든 5분이든)을 받은 직후의 경과는 0 이다 → 만료 아님.
  for (const ms of [1, 1000, 300000]) {
    const left = leftAfter(initialLeftMs(ms), 0);
    assert.equal(isExpired(left), false, `${ms}ms 남은 링크가 즉시 만료로 판정됐다`);
  }
});

// ── 실패 경로 ────────────────────────────────────────────────────────────────

test('남은 기간을 모르면 0 이 아니라 null — 만료로 뭉개지 않는다', () => {
  for (const bad of [undefined, null, '', 'abc', NaN, Infinity, -1, 0, {}, []]) {
    const init = initialLeftMs(bad);
    assert.equal(init, null, `값 없음이 0 으로 뭉개졌다: ${String(bad)}`);
    assert.equal(leftAfter(init, 5000), null);
    assert.equal(isExpired(leftAfter(init, 5000)), false, '모를 때 만료를 선언하면 멀쩡한 링크가 막힌다');
    assert.equal(isSoon(leftAfter(init, 5000)), false);
  }
});

test('눈금이 뒤로 가도(시계 수정) 남은 시간이 늘어나지 않는다', () => {
  assert.equal(elapsedSince(1000, 400), 0, '음수 경과는 0 으로 흡수해야 한다');
  const init = initialLeftMs(60000);
  assert.equal(leftAfter(init, elapsedSince(1000, 400)), 60000);
  assert.equal(leftAfter(init, -50000), 60000, '음수 경과로 시간이 늘면 만료가 영영 오지 않는다');
});

test('이상 입력에 throw 하지 않는다(남은 시간 때문에 화면이 죽지 않는다)', () => {
  const junk = [undefined, null, NaN, Infinity, -Infinity, 'x', {}, [], () => {}, Symbol.iterator];
  for (const v of junk) {
    assert.doesNotThrow(() => elapsedSince(v, v));
    assert.doesNotThrow(() => leftAfter(v, v));
    assert.doesNotThrow(() => isExpired(v));
    assert.doesNotThrow(() => isSoon(v));
    assert.doesNotThrow(() => secondsLeft(v));
    assert.doesNotThrow(() => initialLeftMs(v));
  }
  assert.equal(isExpired('0'), false, '문자열을 숫자로 삼아 만료를 선언하면 안 된다');
});

test('nowTick: 단조 눈금을 돌려주고 두 번 불러도 뒤로 가지 않는다', () => {
  const a = nowTick();
  const b = nowTick();
  assert.equal(Number.isFinite(a), true);
  assert.ok(b >= a, `눈금이 뒤로 갔다: ${a} → ${b}`);
  assert.equal(elapsedSince(a, b) >= 0, true);
});

// ── 만료 임박 안내 ───────────────────────────────────────────────────────────

test('만료 임박 구간 판정(경계 포함)', () => {
  assert.equal(isSoon(EUM_SOON_MS), true, '경계값은 임박에 포함한다');
  assert.equal(isSoon(EUM_SOON_MS + 1), false);
  assert.equal(isSoon(1), true);
  assert.equal(isSoon(0), false, '만료된 뒤에는 임박 안내가 아니라 만료 화면이다');
  assert.equal(isSoon(-5), false);
  assert.equal(isSoon(30000, 0), false, '기준이 이상하면 안내하지 않는다');
});

test('남은 초는 올림이라 "0초" 로 머무르지 않는다', () => {
  assert.equal(secondsLeft(60000), 60);
  assert.equal(secondsLeft(59001), 60);
  assert.equal(secondsLeft(1), 1);
  assert.equal(secondsLeft(0), 0);
  assert.equal(secondsLeft(-1), 0);
});

test('임박 안내 문구에 초 숫자를 넣지 않는다(스크린리더가 매초 끊긴다)', () => {
  assert.ok(EUM_SOON_MESSAGE.length > 0);
  assert.equal(/\d/.test(EUM_SOON_MESSAGE), false, '문장에 숫자가 있으면 낭독이 1초마다 다시 시작된다');
  assert.equal(EUM_SOON_MESSAGE.includes('초'), false);
});

// 고친 결함: 이 경고는 「잠시 후 **이 화면이 닫힙니다**」였다. 8회차가 안내 패널의 마무리
// 문구에서 바로 그 말을 걷어냈는데(수명이 5분인 것은 화면이 아니라 링크다 · 화면은 닫히지
// 않는다) 같은 주장이 그 옆의 경고에 그대로 남아 있었다 — 고침이 절반이었다. 실제로
// 일어나는 일은 닫힘이 아니라 **교체**이고, 바뀐 화면의 제목은 「링크가 만료되었습니다」다.
test('임박 안내는 그 다음에 보게 되는 화면과 같은 낱말을 쓴다(링크가 만료된다)', () => {
  assert.match(EUM_SOON_MESSAGE, /링크/, '무엇의 수명이 다하는지를 말하지 않는다');
  assert.match(EUM_SOON_MESSAGE, /만료/, '다음 화면의 제목과 다른 낱말로 말한다');
  assert.equal(/닫힙니다/.test(EUM_SOON_MESSAGE), false, '닫히지 않는 화면에 닫힌다고 적은 문장이 되살아났다');
  // 지금 할 일을 함께 말한다 — 남은 1분 안에 끝낼 수 있다는 것이 이 경고의 목적이다.
  assert.match(EUM_SOON_MESSAGE, /신청해 주세요/);
});

// ── 화면 배선(소스 계약) ─────────────────────────────────────────────────────

test('화면에 절대 만료시각을 넘기지 않는다 — 기기 시계와 비교할 거리를 주지 않는다', () => {
  const page = read('app/eum/senior/[token]/page.jsx');
  const flow = read('app/eum/senior/[token]/SeniorFlow.jsx');
  assert.match(page, /remainingMs=\{result\.remainingMs\}/, '남은 기간을 넘겨야 한다');
  assert.equal(/expiresAt/.test(page), false, 'page 가 절대 만료시각을 넘기고 있다');
  assert.equal(/expiresAt/.test(flow), false, '화면이 절대 만료시각을 들고 있다');
  // 주석을 걷어낸 코드에 Date.now() 가 남아 있으면 시계 비교가 되살아난 것이다.
  const code = flow
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n')
    .map((l) => l.replace(/(^|[^:\\w])\/\/.*$/, '$1'))
    .join('\n');
  assert.equal(/Date\.now\(\)/.test(code), false, '화면이 다시 기기 시계로 만료를 판정하고 있다');
  assert.match(flow, /from '@\/lib\/eumCountdown'/, '남은 시간 계산은 단일 출처에서 가져온다');
});

test('만료 임박 안내가 스크린리더에도 전달되고, 초 숫자는 낭독에서 빠진다', () => {
  const flow = read('app/eum/senior/[token]/SeniorFlow.jsx');
  const warn = flow.match(/\{soon \? \([\s\S]*?\) : null\}/);
  assert.ok(warn, '만료 임박 안내 블록을 찾지 못했다');
  const block = warn[0];
  assert.match(block, /aria-live="polite"/, '보이지 않는 사용자는 화면이 곧 닫히는 것을 알 수 없다');
  assert.match(block, /EUM_SOON_MESSAGE/, '안내 문구는 단일 출처에서 가져온다');
  assert.match(block, /aria-hidden="true"[^>]*>[^<]*\{secondsLeft\(left\)\}/,
    '매초 바뀌는 초 숫자가 낭독 영역 안에 있으면 문장이 1초마다 끊긴다');
});
