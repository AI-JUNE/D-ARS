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
  nowTick,
  initialLeftMs,
  elapsedSince,
  leftAfter,
  leftNow,
  countingDown,
  isExpired,
  isSoon,
  secondsLeft,
  EUM_CLOCK_FLAG,
  serializeClock,
  parseClock,
  markClock,
  readClock,
  resumeClock,
} from '../lib/eumCountdown.js';
// 경고 **문구**는 이 모듈에 없다 — 화면 문구의 단일 출처는 lib/eumMessage 하나다.
// (한 벌로 들고 있던 동안 그 문장은 1·2단계에서 화면에 없는 것을 가리켰다 ·
//  단계별 대조는 tests/eummessage.test.mjs.)
import { EUM_SOON_LEAD, soonMessage } from '../lib/eumMessage.js';
// 주석 걷어내기는 **한 곳**에서 가져온다 — 이 파일도 손으로 적고 있었고, 그 판본의 문자
// 클래스가 `[^:\\w]` 여서 의도보다 더 지우는 쪽이었다(lib/sourceLint 의 그 자리 주석 참조).
import { stripSourceComments } from '../lib/sourceLint.js';

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
  for (const step of [1, 2, 3]) {
    const msg = soonMessage(step);
    assert.ok(msg.length > 0);
    assert.equal(/\d/.test(msg), false, '문장에 숫자가 있으면 낭독이 1초마다 다시 시작된다');
    assert.equal(msg.includes('초'), false);
  }
});

// 고친 결함: 이 경고는 「잠시 후 **이 화면이 닫힙니다**」였다. 8회차가 안내 패널의 마무리
// 문구에서 바로 그 말을 걷어냈는데(수명이 5분인 것은 화면이 아니라 링크다 · 화면은 닫히지
// 않는다) 같은 주장이 그 옆의 경고에 그대로 남아 있었다 — 고침이 절반이었다. 실제로
// 일어나는 일은 닫힘이 아니라 **교체**이고, 바뀐 화면의 제목은 「링크가 만료되었습니다」다.
test('임박 안내는 그 다음에 보게 되는 화면과 같은 낱말을 쓴다(링크가 만료된다)', () => {
  assert.match(EUM_SOON_LEAD, /링크/, '무엇의 수명이 다하는지를 말하지 않는다');
  assert.match(EUM_SOON_LEAD, /만료/, '다음 화면의 제목과 다른 낱말로 말한다');
  assert.equal(/닫힙니다/.test(EUM_SOON_LEAD), false, '닫히지 않는 화면에 닫힌다고 적은 문장이 되살아났다');
  // 지금 할 일을 함께 말한다 — 남은 1분 안에 끝낼 수 있다는 것이 이 경고의 목적이다.
  // 그 「할 일」은 단계마다 다르다(1단계에는 고른 것도 신청 단추도 없다 · tests/eummessage).
  // 글자 「신청해 주세요」를 찾지 않는다 — 3단계 토막은 눌러야 하는 단추를 **이름**으로
  // 가리키므로(25회차 · 「이대로 신청하기 단추를 눌러 주세요」) 낱말이 아니라 **하라는 말로
  // 끝나는가**를 본다. 단계별 문장 대조는 tests/eummessage.test.mjs 가 한다.
  for (const step of [1, 2, 3]) assert.match(soonMessage(step), /주세요\.$/);
});

// ── 되살아난 화면도 같은 눈금을 쓴다 ─────────────────────────────────────────
//
// 고친 결함: 화면은 `remainingMs` 를 서버가 넘긴 값으로 받아 **마운트 시점**을 출발점으로
// 삼았다. 그런데 문서가 열려 있는 동안 화면이 다시 마운트되는 길이 하나 있다 — 오류 화면의
// 「다시 시도」(Next 의 reset 은 같은 자식을 다시 그린다 · 서버를 거치지 않는다). 그때
// 출발점이 지금으로 다시 맞춰져, 4분 30초가 지난 링크가 **5분 남은 링크로** 되살아났다.
// 그러면 하필 시간이 가장 급한 그 순간에 「잠시 후 링크가 만료됩니다」가 침묵하고, 어르신은
// 네 화면을 끝까지 걷고 **제출에서** 410 을 만난다(고를 것을 다 고른 뒤에 만료를 듣는다).

// 최소한의 노드 흉내 — 이 모듈은 DOM 을 import 하지 않으므로 속성 한 칸만 있으면 된다
// (lib/eumSenior 의 markRetried 테스트와 같은 방식).
function fakeRoot(initial = {}) {
  const attrs = { ...initial };
  return {
    attrs,
    setAttribute(k, v) { attrs[k] = String(v); },
    getAttribute(k) { return Object.prototype.hasOwnProperty.call(attrs, k) ? attrs[k] : null; },
  };
}

test('눈금 왕복: 적어 둔 남은 기간·눈금이 그대로 돌아온다', () => {
  const root = fakeRoot();
  assert.equal(readClock(root), null, '적기 전에는 모른다고 답해야 한다');
  assert.equal(markClock(root, 270000, 12345.5), true);
  assert.equal(root.attrs[EUM_CLOCK_FLAG], '270000/12345.5');
  assert.deepEqual(readClock(root), { left: 270000, tick: 12345.5 });
  // 이어받으면 **경과만큼 줄어든 값**이 나온다 — 출발점이 지금으로 다시 맞춰지지 않는다.
  const got = resumeClock(readClock(root), 300000, 99999);
  assert.deepEqual(got, { left: 270000, tick: 12345.5, resumed: true });
  assert.equal(leftAfter(got.left, elapsedSince(got.tick, got.tick + 42000)), 228000);
});

test('적힌 눈금이 없으면 서버가 준 기간으로 새로 시작한다(첫 마운트)', () => {
  const got = resumeClock(null, 300000, 500);
  assert.deepEqual(got, { left: 300000, tick: 500, resumed: false });
  // resumed 가 false 인 동안에는 경과를 첫 값에 반영하지 않는다 — 서버가 그린 첫 그림과
  // 어긋나지 않게 하기 위한 구분이고, 이어받는 경우에는 하이드레이션이 애초에 없다.
  assert.equal(resumeClock(null, 'x', 500).left, null, '모르면 0 이 아니라 null 이다');
});

test('반쪽·파손된 눈금은 **모른다**로 떨어진다(지어내지 않는다)', () => {
  for (const bad of ['', '0/1', '-5/1', 'abc', '300000', '300000/', '/1', '300000/x',
    '300000/1/2', ' 300000/1', '3e5/1']) {
    assert.equal(parseClock(bad), null, `파손된 값을 믿었다: ${bad}`);
  }
  // 그때는 서버가 준 기간으로 새로 시작한다(판정 실패가 멀쩡한 링크를 막지 않는다).
  assert.deepEqual(resumeClock(parseClock('0/1'), 60000, 7), { left: 60000, tick: 7, resumed: false });
  assert.deepEqual(resumeClock({ left: 1000 }, 60000, 7), { left: 60000, tick: 7, resumed: false });
  assert.deepEqual(resumeClock({ tick: 1000 }, 60000, 7), { left: 60000, tick: 7, resumed: false });
});

test('적지 못하거나 읽지 못해도 던지지 않는다(남은 시간 때문에 화면이 죽지 않는다)', () => {
  const junk = [undefined, null, 0, '', 'x', [], () => {}, {}, Symbol.iterator];
  for (const v of junk) {
    assert.doesNotThrow(() => markClock(v, 1000, 1));
    assert.doesNotThrow(() => readClock(v));
    assert.doesNotThrow(() => resumeClock(v, 1000, 1));
    assert.doesNotThrow(() => serializeClock(v, v));
    assert.doesNotThrow(() => parseClock(v));
  }
  assert.equal(markClock(null, 1000, 1), false);
  assert.equal(serializeClock(0, 1), '', '남은 기간이 0 이면 적지 않는다(만료와 구별되지 않는다)');
  assert.equal(serializeClock(1000, NaN), '', '눈금이 없으면 반쪽으로 적지 않는다');
  const broken = { setAttribute() { throw new Error('막힘'); }, getAttribute() { throw new Error('막힘'); } };
  assert.equal(markClock(broken, 1000, 1), false);
  assert.equal(readClock(broken), null);
});

test('읽는 것은 **지우지 않는다** — 다시 마운트될 때마다 필요한 사실이다', () => {
  const root = fakeRoot();
  markClock(root, 1000, 1);
  assert.deepEqual(readClock(root), { left: 1000, tick: 1 });
  assert.deepEqual(readClock(root), { left: 1000, tick: 1 }, '한 번 읽고 사라지면 세 번째 마운트가 처음으로 돌아간다');
});

// ── 화면 배선(소스 계약) ─────────────────────────────────────────────────────

test('화면에 절대 만료시각을 넘기지 않는다 — 기기 시계와 비교할 거리를 주지 않는다', () => {
  const page = read('app/eum/senior/[token]/page.jsx');
  const flow = read('app/eum/senior/[token]/SeniorFlow.jsx');
  assert.match(page, /remainingMs=\{result\.remainingMs\}/, '남은 기간을 넘겨야 한다');
  assert.equal(/expiresAt/.test(page), false, 'page 가 절대 만료시각을 넘기고 있다');
  assert.equal(/expiresAt/.test(flow), false, '화면이 절대 만료시각을 들고 있다');
  // 주석을 걷어낸 코드에 Date.now() 가 남아 있으면 시계 비교가 되살아난 것이다.
  const code = stripSourceComments(flow);
  assert.equal(/Date\.now\(\)/.test(code), false, '화면이 다시 기기 시계로 만료를 판정하고 있다');
  assert.match(flow, /from '@\/lib\/eumCountdown'/, '남은 시간 계산은 단일 출처에서 가져온다');
});

test('화면은 문서에 적힌 눈금을 이어받는다(「다시 시도」가 5분을 되살리지 않게)', () => {
  const flow = read('app/eum/senior/[token]/SeniorFlow.jsx');
  assert.match(flow, /resumeClock\(readClock\(docRoot\(\)\), remainingMs, nowTick\(\)\)/,
    '적힌 눈금을 보지 않는다 — 다시 마운트될 때마다 남은 시간이 처음으로 되살아난다');
  assert.match(flow, /const \[initialLeft\] = useState\(clock\.left\);/, '이어받은 기간을 쓰지 않는다');
  assert.match(flow, /const \[baseTick\] = useState\(clock\.tick\);/, '이어받은 눈금을 쓰지 않는다');
  // 이미 적혀 있으면 **덮지 않는다** — 덮으면 되살아날 때마다 5분이 처음부터 다시 시작한다.
  assert.match(flow, /if \(clock\.resumed \|\| clock\.left === null\) return;/, '적힌 눈금을 덮어쓸 수 있다');
  // 쓰기는 효과의 몫이다(그리는 동안 문서를 고치지 않는다).
  const write = flow.indexOf('markClock(docRoot()');
  const effect = flow.lastIndexOf('useEffect(() => {', write);
  assert.ok(effect > -1 && write - effect < 400, '눈금을 렌더 중에 적고 있다');
  // 저장소에 넣지 않는다 — 그것들은 문서를 넘겨 살아남아 **다음에 링크를 여는 어르신**이
  // 남의 눈금을 물려받는다(markRetried 와 같은 계약).
  assert.equal(/(local|session)Storage[^\n]*clock/i.test(flow), false, '눈금이 문서를 넘겨 살아남는 자리에 있다');
});

// 정정: 이 테스트는 한동안 `aria-live` 가 **경고 문단에 붙어 있는지**를 확인하며 통과했다.
// 그런데 그 모양이 바로 결함이었다 — 영역이 경고와 **함께 태어나면** 리더는 그것을 변화로 보지
// 않는 경우가 많다(11·12회차가 만료 패널·오류 경계에서 같은 근거로 포커스를 옮기는 쪽을 고쳤다).
// 그래서 사본이 아니라 **배치**를 본다: 낭독 영역은 조건 **밖**에 늘 있고, 조건은 그 안에 있다.
test('만료 임박 안내가 스크린리더에도 전달되고, 초 숫자는 낭독에서 빠진다', () => {
  const flow = read('app/eum/senior/[token]/SeniorFlow.jsx');
  const warn = flow.match(/\{soon \? \([\s\S]*?\) : null\}/);
  assert.ok(warn, '만료 임박 안내 블록을 찾지 못했다');
  const block = warn[0];
  // 문구는 단일 출처에서 가져오고, **지금 단계와 지금 상태**를 넘긴다 — 한 벌로 가져오면
  // 1·2단계에서 화면에 없는 것을 가리키는 문장이 되살아나고, `busy` 를 빠뜨리면 제출이 떠
  // 있는 동안 3단계 토막이 **없는 이름**으로 단추를 가리킨다(그 자리의 글자는 「신청하는 중…」
  // 이고, 눌러도 아무 일도 일어나지 않는다 · 단계·상태별 문장 대조는 tests/eummessage).
  assert.match(block, /soonMessage\(step, busy\)/, '안내 문구를 단계·상태와 함께 가져오지 않는다');
  assert.match(block, /aria-hidden="true"[^>]*>[^<]*\{secondsLeft\(left\)\}/,
    '매초 바뀌는 초 숫자가 낭독 영역 안에 있으면 문장이 1초마다 끊긴다');

  // 낭독 영역은 **경고보다 먼저 문서에 있어야** 한다 — 경고가 생기는 순간 함께 태어나면
  // 「살아 있던 영역의 내용이 바뀐 것」이 아니라서 들리지 않는다.
  assert.equal(/aria-live|role="status"/.test(block), false,
    '낭독 영역이 경고와 함께 태어나고 있다(그 순간은 리더가 변화로 보지 않는다)');
  // 정정: 이 자리를 고칠 때는 영역을 이 파일에서 손으로 적었다(`<div role="status" …>`).
  // 그런데 같은 모양이 둘 더 있었고(제출 실패 안내 · 보조 사본 안내), 셋을 각자 적으면
  // 한 곳만 고쳐지는 날 다시 갈라진다 — 지금은 영역을 만드는 길이 ui.jsx 의 `Live` 하나다
  // (등록부 대조는 tests/eumseniorui 의 「낭독 영역을 만드는 길은 …」).
  const region = flow.match(/<Live>\s*\{soon \?/);
  assert.ok(region, '늘 문서에 있는 낭독 영역이 조건을 감싸고 있지 않다');
  // 빈 칸이 화면을 밀어내면 안 된다 — 영역에는 style 을 주지 않는다(내용 없는 블록은 0px).
  assert.equal(/<Live[^>]*style/.test(flow), false,
    '빈 낭독 영역에 style 이 붙으면 경고가 없는 화면까지 자리를 잃는다');
});

// ── 다시 재는 계기가 둘이어도 값은 한 벌이다 ─────────────────────────────────
//
// 고친 결함: 화면이 남은 시간을 다시 재는 길은 `setInterval` **하나뿐**이었다. 브라우저는
// 보이지 않는 탭의 타이머를 조이거나 멈추므로(모바일에서는 흔히 멈춘다), 어르신이 문자를
// 다시 보려고 앱을 바꿨다 돌아온 순간 눈금은 **떠난 시점의 값**이었다 — 다음 틱까지
// 만료 임박 경고가 침묵하고(isSoon 이 옛 값을 본다) 옆에 적힌 초 숫자가 거짓이 된다.
// 하필 그 떠남이 이 사용자층의 기본 경로이고(링크를 문자로 받는다), 하필 그 순간이 남은
// 1분이다. 위 resumeClock 이 고친 결함과 **같은 해**이고, 그때 좁았던 축은 「다시 마운트」
// 였고 이번에 좁았던 축은 「다시 보임」이다.

test('지금 남은 시간: 출발점과 눈금만으로 다시 잰다(계기가 둘이어도 같은 값)', () => {
  assert.equal(leftNow(300000, 100, 100), 300000);
  assert.equal(leftNow(300000, 100, 1100), 299000);
  assert.equal(leftNow(300000, 100, 400000), 0, '남은 시간은 음수가 되지 않는다');
  assert.equal(leftNow(null, 100, 1100), null, '모르면 0 이 아니라 null 이다(만료로 뭉개지 않는다)');
  // 1초 틱과 「다시 보임」이 같은 눈금에서 부르면 **같은 값**을 말해야 한다(두 벌 금지).
  assert.equal(leftNow(60000, 7, 7 + 12345), leftAfter(60000, elapsedSince(7, 7 + 12345)));
  // 이상 입력에 던지지 않는다 — 남은 시간 하나 때문에 신청 화면이 빈 화면이 되면 안 된다.
  for (const v of [undefined, '', 'x', [], {}, () => {}, Symbol.iterator]) {
    assert.doesNotThrow(() => leftNow(v, v, v), `입력에 던졌다: ${String(v)}`);
  }
});

test('더 셀 이유가 없으면 멈춘다(완료 뒤 · 만료를 선언한 뒤 · 남은 기간을 모를 때)', () => {
  assert.equal(countingDown({ initialLeft: 300000, done: false, expired: false }), true);
  assert.equal(countingDown({ initialLeft: 300000, done: true, expired: false }), false,
    '제출이 끝난 화면을 계속 세면 완료 화면이 만료로 덮인다');
  // 고친 결함: 멈추는 조건이 `done` 하나였다 — 만료 패널로 뒤집힌 뒤에도 1초 타이머가
  // 그 문서가 사는 동안 영영 돌았다(그 패널에는 어르신이 누를 단추가 없다).
  assert.equal(countingDown({ initialLeft: 300000, done: false, expired: true }), false,
    '만료를 선언한 뒤에도 타이머가 돈다(어르신 기기의 배터리다)');
  assert.equal(countingDown({ initialLeft: null, done: false, expired: false }), false,
    '남은 기간을 모르면 셀 것이 없다 — 판정은 서버에 맡긴다');
  // 이 함수는 만료를 **판정하지 않고 받는다** — 판정 자리는 화면의 expiredNow 한 곳이다.
  // 그래서 0 이하는 「만료」가 아니라 「셀 수 있는 기간이 아니다」로만 떨어진다.
  assert.equal(countingDown({ initialLeft: 0, done: false, expired: false }), false);
  assert.equal(countingDown({ initialLeft: -1, done: false, expired: false }), false);
  // 모르는 모양은 **세지 않는 쪽**으로 떨어지고, 던지지 않는다.
  for (const bad of [undefined, null, 0, '', 'x', [], () => {}, Symbol.iterator,
    { initialLeft: '300000' }, { initialLeft: NaN }]) {
    assert.doesNotThrow(() => countingDown(bad), `입력에 던졌다: ${String(bad)}`);
    assert.equal(countingDown(bad), false, `모르는 모양을 세고 있다: ${String(bad)}`);
  }
});

// ── 화면이 선언하는 만료는 **서버 기준으로도 만료**다 ─────────────────────────
//
// 26회차는 「다음에 볼 자리」에 이것을 남겼다 — 눈금이 0 에 닿은 상태에서 제출이 401 로
// 돌아오면 그 안내(「링크가 올바르지 않습니다」)는 그려지지 않고 화면은 자기 눈금으로 만료를
// 선언한다. 적어 둔 걱정은 「만료의 최종 판정자는 서버다」가 서버가 **다른 말을 한** 경우를
// 다루지 않는다는 것이었고, 사유를 바꿀지는 한 건으로 따로 서야 한다고 했다.
// 다시 보니 **고칠 것이 없었다.** 이 파일의 눈금은 서버보다 늘 **너그러운 쪽**으로만 틀리게
// 지어져 있다(머리 주석의 「남는 오차와 그 방향」) —
//   · 출발점은 서버가 **렌더 시점에** 잰 남은 기간이고, 세기 시작하는 눈금은 그보다 **뒤**다
//     (전송·하이드레이션, 또는 이어받기). 늦게 시작하므로 늘 더 남은 것처럼 센다.
//   · 경과는 뒤로 가지 않는다(elapsedSince 가 음수를 0 으로 흡수한다).
// 그러므로 화면의 남은 시간 ≥ 서버의 남은 시간이고, 화면이 0 을 보았다면 서버 기준으로도
// 0 이하다 — 만료 패널은 그 자리에서 **참**이다. 그리고 그 패널에는 401 안내에 없는 것이
// 하나 더 있다(그 기기의 보조 사본 한 줄 · PriorLocal): 덮는 쪽이 더 쓸모 있는 사실이다.
// 결론이 그 불변식에 매달려 있으므로 불변식을 여기 못박는다 — 눈금이 엄한 쪽으로 기울면
// (출발점을 서버 시각으로 잡거나 음수 경과를 흡수하지 않으면) 이 테스트가 먼저 깨진다.
test('눈금은 서버보다 너그러운 쪽으로만 틀린다(화면이 만료를 선언하면 서버도 만료다)', () => {
  const serverLeft = 300000; // 서버가 렌더 시점에 잰 남은 기간
  for (const delay of [0, 1, 250, 4000, 60000]) { // 렌더 → 세기 시작(전송·하이드레이션)
    for (const since of [0, 1, 1000, 299000, 300000, 450000]) { // 세기 시작 → 지금
      const shown = leftNow(serverLeft, 0, since);
      const truth = serverLeft - (delay + since); // 서버 기준 남은 시간
      assert.ok(shown >= Math.max(0, truth),
        `화면이 서버보다 엄하게 셌다: 화면 ${shown} < 서버 ${truth}`);
      if (isExpired(shown)) {
        assert.ok(truth <= 0, `화면이 아직 살아 있는 링크를 만료라고 선언했다(서버 ${truth}ms)`);
      }
    }
  }
  // 반대 방향도 막혀 있다 — 눈금이 뒤로 가도(시계 수정·눈금 교체) 남은 시간이 **늘어나지
  // 않는다**. 늘어나면 만료가 영영 오지 않고, 어르신은 고를 것을 다 고른 뒤 410 을 만난다.
  assert.equal(leftNow(serverLeft, 1000, 0), serverLeft);
});

test('만료를 선언한 뒤에는 눈금을 멈춘다(만료 판정 자리는 늘리지 않는다)', () => {
  const code = stripSourceComments(read('app/eum/senior/[token]/SeniorFlow.jsx'));
  // 멈추는 조건은 단일 출처가 정한다 — 화면이 손으로 적으면 `done` 하나만 보던 그 모양으로
  // 돌아간다(그때는 만료 패널로 뒤집힌 뒤에도 타이머가 영영 돌았다).
  assert.match(code, /countingDown\(\{ initialLeft, done, expired: expiredNow \}\)/,
    '눈금을 멈추는 조건이 단일 출처(lib/eumCountdown.countingDown)를 쓰지 않는다');
  // 만료 판정은 여전히 **한 곳**이다. 둘이 되면 「만료됐다」를 서로 다른 두 식이 정하고,
  // 그 둘이 갈리는 날 화면과 타이머가 서로 다른 사실을 믿는다.
  assert.equal((code.match(/isExpired\(/g) || []).length, 1,
    '화면의 만료 판정 자리가 둘이 됐다 — expiredNow 한 줄이어야 한다');
  // 의존성에 만료가 들어 있어야 **선언되는 순간** 실제로 멈춘다.
  const start = code.indexOf('if (!countingDown(');
  const end = code.indexOf('}, [initialLeft, baseTick, done, expiredNow]);', start);
  assert.ok(start > -1 && end > start,
    '눈금 효과를 찾지 못했다 — 만료가 의존성에 없으면 선언되어도 타이머가 그대로 돈다');
});

test('눈금을 다시 재는 계기가 둘이고, 둘 다 같은 한 함수를 부른다', () => {
  const code = stripSourceComments(read('app/eum/senior/[token]/SeniorFlow.jsx'));
  const start = code.indexOf('if (!countingDown(');
  const end = code.indexOf('}, [initialLeft, baseTick, done, expiredNow]);', start);
  assert.ok(start > -1 && end > start, '눈금 효과를 찾지 못했다');
  const block = code.slice(start, end);

  assert.match(block, /setLeft\(leftNow\(initialLeft, baseTick\)\)/,
    '다시 재는 계산이 단일 출처(leftNow)를 쓰지 않는다');
  assert.match(block, /setInterval\(recount, 1000\)/, '1초 눈금이 그 함수를 부르지 않는다');
  // 보이지 않는 탭의 타이머는 조이거나 멈춘다 — 다시 보이는 순간 **즉시** 다시 재지 않으면
  // 돌아온 어르신은 떠난 시점의 눈금을 본다(만료 임박 경고가 침묵한다).
  assert.match(block, /addEventListener\('visibilitychange', onShown\)/,
    '화면이 다시 보이는 순간 눈금을 다시 재지 않는다');
  // 뒤로/앞으로 캐시에서 되살아난 문서에는 visibilitychange 가 오지 않는 브라우저가 있다.
  assert.match(block, /addEventListener\('pageshow', onShown\)/,
    '캐시에서 되살아난 문서가 옛 눈금으로 남는다');
  // 걸었으면 **떼어야** 한다 — 떼지 않으면 다시 마운트될 때마다(「다시 시도」) 쌓인다.
  assert.match(block, /clearInterval\(id\)/, '1초 눈금을 치우지 않는다');
  assert.match(block, /removeEventListener\('visibilitychange', onShown\)/, '듣기를 떼지 않는다');
  assert.match(block, /removeEventListener\('pageshow', onShown\)/, '듣기를 떼지 않는다');
  // 「지금 남은 시간」을 화면에 쓰는 자리는 **한 곳**이다(recount) — 계기가 늘어날 때마다
  // 각자 계산하면 그중 하나만 고쳐지는 날 두 계기가 다른 값을 말한다.
  assert.equal((code.match(/setLeft\(/g) || []).length, 1,
    '남은 시간을 쓰는 자리가 둘이 됐다 — 다시 재는 계산은 recount 한 곳이어야 한다');
});
