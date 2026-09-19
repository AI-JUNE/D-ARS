// tests/eumconsume.test.mjs — 「이음 어르신 신청」 1회용 링크 소진 판정 + 제출 라우트 소스 가드
//
// 이 테스트가 지키는 것: 링크가 **말뿐인 1회용**으로 되돌아가지 않게 하는 것.
// 예전에는 만료(5분)만 있고 소진이 없어 같은 링크로 몇 번이고 신청할 수 있었다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  EUM_CONSUME_MAX,
  consumeKey,
  createConsumeStore,
  consumeStore,
  consumeMessage,
  EUM_CONSUME_MESSAGE,
} from '../lib/eumConsume.js';
import { issueEumToken, verifyEumToken } from '../lib/eumToken.js';

const T0 = 1_760_000_000_000;
const EXP = T0 + 5 * 60 * 1000;

// ── consumeKey ────────────────────────────────────────────────────────────
test('consumeKey: 토큰의 서명 부분만 키로 쓴다(페이로드는 키에 들어가지 않는다)', async () => {
  const token = await issueEumToken('s-1001', { now: T0 });
  const [body, sig] = token.split('.');
  const key = consumeKey(token);
  assert.equal(key, sig);
  assert.equal(key.includes(body), false, '본문이 키에 섞이면 기록 자체가 유효 링크가 된다');
});

test('consumeKey: 형식 밖 입력은 빈 문자열(판정을 진행시키지 않는다)', () => {
  for (const bad of ['', '   ', 'nodot', 'a.b.c', 'body.', '.sig', 'body.short', null, undefined, 42, {}]) {
    assert.equal(consumeKey(bad), '', `허용되면 안 되는 입력: ${String(bad)}`);
  }
});

// ── claim: 1회용 본질 ─────────────────────────────────────────────────────
test('핵심 계약: 같은 링크는 두 번 소진되지 않는다', () => {
  const s = createConsumeStore();
  assert.deepEqual(s.claim('sig-aaaaaaaaaaaaaaaa', EXP, T0), { ok: true });
  assert.deepEqual(s.claim('sig-aaaaaaaaaaaaaaaa', EXP, T0 + 1000), { ok: false, reason: 'used' });
});

test('다른 링크는 서로를 막지 않는다(담당자가 새 링크를 발급하면 재신청 가능)', () => {
  const s = createConsumeStore();
  assert.equal(s.claim('sig-first-aaaaaaaaaa', EXP, T0).ok, true);
  assert.equal(s.claim('sig-second-bbbbbbbbb', EXP, T0).ok, true, 'sid 가 아니라 링크 단위로 막아야 한다');
});

test('만료된 링크는 소진되지 않는다(만료가 소진보다 먼저 판정된다)', () => {
  const s = createConsumeStore();
  assert.deepEqual(s.claim('sig-cccccccccccccccc', EXP, EXP), { ok: false, reason: 'expired' });
  assert.deepEqual(s.claim('sig-cccccccccccccccc', EXP, EXP + 1), { ok: false, reason: 'expired' });
});

test('기록은 토큰 만료와 함께 사라진다(메모리가 무한히 자라지 않는다)', () => {
  const s = createConsumeStore();
  s.claim('sig-dddddddddddddddd', EXP, T0);
  assert.equal(s.has('sig-dddddddddddddddd', T0 + 1000), true);
  assert.equal(s.has('sig-dddddddddddddddd', EXP + 1), false);
  assert.equal(s.stats().size, 0, '만료 확인 시 기록도 함께 정리된다');
});

test('키·시각이 이상하면 통과가 아니라 unusable 로 닫는다(실패의 기본값이 개방이 아니다)', () => {
  const s = createConsumeStore();
  for (const bad of ['', null, undefined, 0, {}]) {
    assert.deepEqual(s.claim(bad, EXP, T0), { ok: false, reason: 'unusable' }, `키: ${String(bad)}`);
  }
  assert.deepEqual(s.claim('sig-eeeeeeeeeeeeeeee', 'nope', T0), { ok: false, reason: 'unusable' });
  assert.deepEqual(s.claim('sig-eeeeeeeeeeeeeeee', EXP, NaN), { ok: false, reason: 'unusable' });
});

test('has: 이상 입력에도 throw 하지 않고 false 를 돌려준다', () => {
  const s = createConsumeStore();
  for (const bad of ['', null, undefined, {}]) assert.equal(s.has(bad, T0), false);
  assert.equal(s.has('sig-ffffffffffffffff', NaN), false);
});

test('상한을 넘으면 가장 먼저 만료될 것부터 버리고, 버린 수를 감추지 않는다', () => {
  const s = createConsumeStore({ max: 3 });
  s.claim('k-late-aaaaaaaaaaaa', T0 + 90_000, T0);
  s.claim('k-early-bbbbbbbbbbb', T0 + 10_000, T0); // 가장 먼저 만료 → 먼저 버려진다
  s.claim('k-mid-cccccccccccc', T0 + 50_000, T0);
  s.claim('k-new-dddddddddddd', T0 + 90_000, T0);
  const st = s.stats();
  assert.equal(st.size, 3);
  assert.equal(st.evicted, 1, '버린 항목 수가 보고되어야 한다(조용한 손실 금지)');
  assert.equal(s.has('k-early-bbbbbbbbbbb', T0 + 1), false);
  assert.equal(s.has('k-late-aaaaaaaaaaaa', T0 + 1), true);
});

test('기본 스토어는 프로세스 안에서 공유된다', () => {
  assert.equal(consumeStore(), consumeStore());
  assert.equal(typeof EUM_CONSUME_MAX, 'number');
  assert.ok(EUM_CONSUME_MAX > 0);
});

// ── 안내문 ────────────────────────────────────────────────────────────────
test('안내문: 만료와 "이미 신청함"을 다른 문장으로 구분한다', () => {
  assert.notEqual(EUM_CONSUME_MESSAGE.used, EUM_CONSUME_MESSAGE.expired);
  assert.match(consumeMessage('used'), /이미 신청/);
  assert.match(consumeMessage('expired'), /만료/);
  assert.equal(consumeMessage('모르는사유'), EUM_CONSUME_MESSAGE.unusable, '모르는 사유는 보수적으로 안내');
  assert.equal(consumeMessage(undefined), EUM_CONSUME_MESSAGE.unusable);
});

test('안내문에 기술 용어·식별자가 섞이지 않는다(어르신 화면 문구)', () => {
  for (const [k, v] of Object.entries(EUM_CONSUME_MESSAGE)) {
    assert.equal(/token|sid|HTTP|[0-9]{3}\b/.test(v), false, `${k}: 기술 용어 노출`);
    assert.ok(v.length <= 40, `${k}: 한 줄로 읽히지 않는다`);
  }
});

// ── 토큰 ↔ 소진 결합(실제 흐름) ───────────────────────────────────────────
test('실제 흐름: 발급 → 검증 → 소진 → 같은 링크 재제출은 거부된다', async () => {
  const token = await issueEumToken('s-2002', { now: T0 });
  const v = await verifyEumToken(token, T0 + 1000);
  assert.equal(v.ok, true);
  const s = createConsumeStore();
  assert.equal(s.claim(consumeKey(token), v.payload.exp, T0 + 1000).ok, true);
  assert.deepEqual(
    s.claim(consumeKey(token), v.payload.exp, T0 + 2000),
    { ok: false, reason: 'used' },
    '같은 링크로 두 번 신청되면 담당자에게 중복 접수로 보인다',
  );
});

// ── 제출 라우트 소스 가드 ─────────────────────────────────────────────────
const ROUTE = readFileSync(
  fileURLToPath(new URL('../app/api/eum/senior/preferences/route.js', import.meta.url)),
  'utf8',
);

test('제출 라우트: 토큰을 쿼리스트링이 아니라 본문으로 받는다(접근로그 유출 방지)', () => {
  assert.equal(/searchParams\.get\(\s*['"]token['"]/.test(ROUTE), false);
  assert.match(ROUTE, /body\.token/);
});

test('제출 라우트: 서버가 토큰을 재검증하고 소진까지 한다', () => {
  assert.match(ROUTE, /verifyEumToken/, '서버 재검증 없이 접수하면 안 된다');
  assert.match(ROUTE, /consumeStore\(\)\.claim\(/, '1회용 판정이 빠지면 서술만 남는다');
  assert.match(ROUTE, /consume\(\s*['"]eumSubmit['"]/, 'rate limit 누락');
});

test('제출 라우트: 전송하지 않았음을 응답에 정직하게 표시한다', () => {
  assert.match(ROUTE, /delivered:\s*false/, '이음 미전송을 성공처럼 꾸미지 않는다');
  assert.match(ROUTE, /\[승인 필요\]/, '실연결이 승인 사항임을 코드가 밝혀야 한다');
});

test('제출 라우트: 만료(410)·이미 접수(409)·잘못된 링크(401)를 구분한다', () => {
  assert.match(ROUTE, /gone\(/);
  assert.match(ROUTE, /409/);
  assert.match(ROUTE, /unauthorized\(/);
});

test('제출 라우트: HTTP 메서드·설정 외 export 를 두지 않는다(빌드 실패 예방)', () => {
  const names = [...ROUTE.matchAll(/^export\s+(?:async\s+)?(?:function|const|let|var|class)\s+(\w+)/gm)]
    .map((m) => m[1]);
  assert.deepEqual(names.sort(), ['POST', 'dynamic', 'runtime']);
  assert.equal(/^export\s*\{/m.test(ROUTE), false);
  assert.equal(/^export\s+default/m.test(ROUTE), false);
});

// ── 화면 배선 가드 ────────────────────────────────────────────────────────
const FLOW = readFileSync(
  fileURLToPath(new URL('../app/eum/senior/[token]/SeniorFlow.jsx', import.meta.url)),
  'utf8',
);

test('화면: 제출은 서버 라우트를 거친다(브라우저 단독 성공 판정 금지)', () => {
  // `fetch` 든 `fetchOnce` 든 상관없다 — 지켜야 할 선은 "제출 판정을 서버가 한다" 이다.
  assert.match(FLOW, /fetch(Once)?\(\s*['"]\/api\/eum\/senior\/preferences['"]/);
  // 로컬 저장은 남아 있어도 되지만, 그것만으로 완료 화면에 가서는 안 된다.
  const submitBody = FLOW.slice(FLOW.indexOf('async function submit'));
  assert.equal(/setDone\(true\)/.test(submitBody), false, 'submit 이 서버 응답 없이 완료로 넘어가면 안 된다');
});

test('화면: 서버가 만료·중복·실패를 알렸을 때 각각 다르게 반응한다', () => {
  assert.match(FLOW, /res\.status === 409/);
  assert.match(FLOW, /res\.status === 410/);
  assert.match(FLOW, /setError\(/, '실패를 삼키고 조용히 넘어가지 않는다');
});

test('화면: 서버 만료 판정이 화면 만료 안내로 이어진다(클라이언트 시계 불일치 대비)', () => {
  assert.match(FLOW, /setExpiredByServer\(true\)/);
  assert.match(FLOW, /expiredByServer \|\|/);
});
