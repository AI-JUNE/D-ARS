// tests/ivrfallback.test.mjs — 엔진 장애 시 음성 IVR 전환 계약 (무의존성: node:test)
//  1) 순수 판정(decideInbound/decideRelay/decideEngineError/fallbackEnvelope)
//  2) 콜봇 측 참조 구현 callbotShouldUseIvr — "명시적 visual 만 화면, 나머지 전부 음성"
//  3) 고객 화면 폴링 누적 리듀서 pollNext
//  4) 소스 가드 — 콜봇 대면 라우트 2종·/visual 화면·문서가 계약을 실제로 배선했는지
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as FB from '../lib/ivrFallback.js';
import {
  FALLBACK_MODES, FALLBACK_REASONS, IVR_PROMPT, VISUAL_PROMPT, SCREEN_LOST_MESSAGE, SCREEN_LOST_AFTER,
  decision, decideInbound, decideRelay, decideEngineError, fallbackEnvelope, callbotShouldUseIvr,
  pollInitial, pollNext,
} from '../lib/ivrFallback.js';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

// 아웃바운드 경로는 프로바이더에 따라 갈리고, `PROVIDER` 는 **모듈 평가 시점**에 고정된다.
// 두 경로를 다 보려면 같은 파일을 두 번 평가해야 한다(다른 URL 로 불러 재평가 · 26회차가
// 소진 스토어의 번들 경계를 재현할 때 쓴 수단과 같다).
process.env.CPAAS_PROVIDER = 'mock';
const mockCpaas = await import('../lib/cpaas/index.js?provider=mock');
process.env.CPAAS_PROVIDER = 'http';
process.env.SMS_GATEWAY_URL = 'https://sms.internal.example/send';
process.env.CALLBOT_CALLBACK_URL = 'https://callbot.internal.example/relay';
const httpCpaas = await import('../lib/cpaas/index.js?provider=http');

// ── 1) 판정 ────────────────────────────────────────────────────────────────
test('decideInbound: SMS 성공 → visual, 멱등 skip → visual, 실패/비객체 → ivr(SMS_FAILED)', () => {
  assert.equal(decideInbound({ sms: { ok: true } }).mode, 'visual');
  assert.equal(decideInbound({ sms: { ok: true, skipped: true } }).mode, 'visual');
  const f = decideInbound({ sms: { ok: false, error: 'SMS_GATEWAY_URL 미설정' } });
  assert.deepEqual([f.mode, f.reason, f.message], ['ivr', 'SMS_FAILED', IVR_PROMPT]);
  assert.equal(decideInbound({ sms: null }).reason, 'SMS_FAILED');
  assert.equal(decideInbound().reason, 'SMS_FAILED');
  assert.equal(decideInbound({ sms: { ok: 'true' } }).mode, 'ivr', 'ok 는 불리언 true 만 인정');
});

test('decideRelay: 콜백 성공 → visual, 재시도 소진/ok 아님/비객체 → ivr(RELAY_FAILED)', () => {
  assert.equal(decideRelay({ ok: true, status: 200, attempts: 1 }).mode, 'visual');
  assert.equal(decideRelay({ ok: true, provider: 'mock' }).mode, 'visual');
  assert.equal(decideRelay({ ok: false, status: 502, attempts: 3, failed: true }).reason, 'RELAY_FAILED');
  assert.equal(decideRelay({ ok: false }).reason, 'RELAY_FAILED');
  assert.equal(decideRelay(undefined).reason, 'RELAY_FAILED');
});

test('decideEngineError → ivr(ENGINE_ERROR); decision 은 미지 코드를 ENGINE_ERROR 로 보수 처리', () => {
  assert.equal(decideEngineError().reason, 'ENGINE_ERROR');
  assert.equal(decision('ivr', 'NOPE').reason, 'ENGINE_ERROR');
  assert.equal(decision('ivr').reason, 'ENGINE_ERROR');
  assert.equal(decision('visual', 'SMS_FAILED').reason, null, 'visual 에는 reason 없음');
  assert.equal(decision('weird').mode, 'visual');
  assert.ok(Object.isFrozen(decision('ivr', 'SMS_FAILED')));
});

test('fallbackEnvelope: 항상 { fallback:{mode,reason,message} } · 이상 입력은 ivr/ENGINE_ERROR', () => {
  const v = fallbackEnvelope(decision('visual'));
  assert.deepEqual(v, { fallback: { mode: 'visual', reason: null, message: VISUAL_PROMPT } });
  const bad = fallbackEnvelope(null).fallback;
  assert.deepEqual([bad.mode, bad.reason], ['ivr', 'ENGINE_ERROR']);
  assert.equal(fallbackEnvelope({ mode: 'ivr', reason: 'SMS_FAILED' }).fallback.message, IVR_PROMPT);
  assert.equal(fallbackEnvelope({ mode: 'ivr', reason: 'SMS_FAILED' }).fallback.reason, 'SMS_FAILED');
});

test('판정 결과에 오류 원문·URL·전화번호가 실리지 않는다(고정 코드·문구만)', () => {
  const secret = 'https://sms.example/xyz 010-1234-5678 ECONNREFUSED';
  const out = JSON.stringify([
    fallbackEnvelope(decideInbound({ sms: { ok: false, error: secret, to: '01012345678' } })),
    fallbackEnvelope(decideRelay({ ok: false, failed: true, error: secret })),
  ]);
  for (const s of ['example', '1234', 'ECONNREFUSED']) assert.equal(out.includes(s), false, s);
});

// ── 고친 결함: 바로 위 대조가 **봉투 한 필드**만 보았다 ────────────────────────
//
// 이름은 「판정 결과에 오류 원문·URL·전화번호가 실리지 않는다」인데, 라우트가 보내는 응답은
// 그 봉투와 **나란히** 아웃바운드 호출 결과를 싣는다(`/api/cpaas/voice` 의 `sms`,
// `/api/visual/action` 의 `relayed`). 그 객체가 `error: String(e?.message || e)` 를 들고 있었고,
// `fetch` 실패 메시지에는 대상 주소가 붙으므로 `SMS_GATEWAY_URL`·`CALLBOT_CALLBACK_URL` 이
// 응답으로 새어 나갔다 — 하필 `/api/visual/action` 을 받는 쪽은 **고객 브라우저**다.
// mock(라이브 기본값)에서는 `to`·`text`, 즉 가리지 않은 발신번호와 서명 링크까지 실렸다.
// 그래서 이제 **라우트가 조립하는 모양 그대로** 대조한다(봉투 옆자리까지).
test('콜봇 대면 응답 전체에 오류 원문·주소·전화번호가 없다(봉투 옆자리까지)', async () => {
  const secret = 'getaddrinfo ENOTFOUND sms.internal.example 010-1234-5678';
  const boom = () => { throw new Error(secret); };
  const sms = await httpCpaas.sendSms('01012345678', '화면 링크 https://d-ars.vercel.app/visual?s=tok', { fetchImpl: boom });
  const relay = await httpCpaas.notifyCallbot({ sessionId: 'VS-1' }, { fetchImpl: boom, sleep: () => Promise.resolve() });
  // `/api/cpaas/voice` · `/api/visual/action` 이 실제로 보내는 본문의 모양.
  const body = JSON.stringify([
    { ok: true, sms, ...fallbackEnvelope(decideInbound({ sms })) },
    { ok: true, relayed: relay, ...fallbackEnvelope(decideRelay(relay)) },
  ]);
  for (const s of ['internal.example', 'ENOTFOUND', '1234', 'tok']) {
    assert.equal(body.includes(s), false, `응답에 ${s} 가 실린다`);
  }
  // 판정은 **종전과 같다** — 좁힌 것은 모양뿐이다.
  assert.equal(decideInbound({ sms }).reason, 'SMS_FAILED');
  assert.equal(decideRelay(relay).reason, 'RELAY_FAILED');
  assert.equal(relay.failed, true);
});

test('mock 프로바이더도 번호·문구를 결과에 담지 않는다(라이브 기본값이다)', async () => {
  const link = 'https://d-ars.vercel.app/visual?s=SIGNEDTOKEN';
  const sms = await mockCpaas.sendSms('01012345678', `화면을 열어주세요: ${link}`);
  // `notifyCallbot` 의 mock 분기는 **콜백 주소가 없을 때**다(PROVIDER 가 아니라 주소가 가른다).
  const savedCb = process.env.CALLBOT_CALLBACK_URL;
  delete process.env.CALLBOT_CALLBACK_URL;
  const relay = await mockCpaas.notifyCallbot({ sessionId: 'VS-1' });
  process.env.CALLBOT_CALLBACK_URL = savedCb;
  assert.deepEqual(sms, { ok: true, provider: 'mock', mocked: true });
  assert.deepEqual(relay, { ok: true, provider: 'mock', mocked: true });
  // 판정은 둘 다 visual — 종전 거동 그대로(decideRelay 는 `{ok:true, provider:'mock'}` 를 받아 왔다).
  assert.equal(decideInbound({ sms }).mode, 'visual');
  assert.equal(decideRelay(relay).mode, 'visual');
  const body = JSON.stringify([sms, relay]);
  assert.equal(body.includes('01012345678'), false, '가리지 않은 발신번호가 응답에 실린다');
  assert.equal(body.includes('SIGNEDTOKEN'), false, '서명 링크가 응답에 실린다');
});

test('아웃바운드 실패 사유는 고정 어휘뿐이다(등록부 ↔ 실제로 나오는 값 양방향)', async () => {
  const reasons = httpCpaas.CPAAS_FAIL_REASONS;
  assert.ok(Object.isFrozen(reasons));
  const seen = new Set();
  const take = (r) => { if (r.reason) seen.add(r.reason); return r; };

  // 1) 엔드포인트 미설정 — 주소가 없으니 요청 자체를 걸지 않는다.
  const saved = process.env.SMS_GATEWAY_URL;
  delete process.env.SMS_GATEWAY_URL;
  take(await httpCpaas.sendSms('010', 't'));
  process.env.SMS_GATEWAY_URL = saved;
  // 2) 즉시 실패(연결 거부 등) 3) 2xx 가 아닌 응답 4) 상한 초과
  take(await httpCpaas.sendSms('010', 't', { fetchImpl: () => { throw new Error('ECONNREFUSED'); } }));
  take(await httpCpaas.sendSms('010', 't', { fetchImpl: async () => ({ ok: false, status: 502 }) }));
  take(await httpCpaas.sendSms('010', 't', {
    timeoutMs: 10,
    fetchImpl: (u, init) => new Promise((res, rej) => {
      init.signal.addEventListener('abort', () => rej(Object.assign(new Error('a'), { name: 'AbortError' })));
    }),
  }));
  assert.deepEqual([...seen].sort(), Object.keys(reasons).sort(),
    '사유 등록부와 실제로 나오는 값이 어긋난다 — 등록 밖의 글자가 응답으로 나가거나, 표가 썩는다');
  for (const [code, why] of Object.entries(reasons)) {
    assert.equal(/^[a-z_]+$/.test(code), true, `${code}: 사유 코드는 기계 판독용 소문자다`);
    assert.ok(typeof why === 'string' && why.length >= 2, `${code}: 사유 설명이 비었다`);
  }
  // 성공 응답은 상태만 말한다(몸통을 돌려주지 않는다).
  const ok = await httpCpaas.sendSms('010', 't', { fetchImpl: async () => ({ ok: true, status: 202 }) });
  assert.deepEqual(ok, { ok: true, provider: 'http', status: 202 });
});

// ── 2) 콜봇 측 참조 구현 ──────────────────────────────────────────────────
test('callbotShouldUseIvr: 2xx + ok:true + mode:visual 만 화면 진행', () => {
  const okBody = { ok: true, fallback: { mode: 'visual', reason: null, message: VISUAL_PROMPT } };
  assert.equal(callbotShouldUseIvr({ status: 200, body: okBody }), false);
  assert.equal(callbotShouldUseIvr({ status: 200, body: { ok: true, fallback: { mode: 'ivr', reason: 'SMS_FAILED' } } }), true);
  assert.equal(callbotShouldUseIvr({ status: 503, body: { ok: false, fallback: { mode: 'ivr' } } }), true);
  assert.equal(callbotShouldUseIvr({ status: 401, body: { ok: false, error: 'unauthorized' } }), true);
  assert.equal(callbotShouldUseIvr({ status: 429, body: {} }), true);
  assert.equal(callbotShouldUseIvr({ status: null, body: null }), true, '네트워크 오류·타임아웃');
  assert.equal(callbotShouldUseIvr({ status: 200, body: null }), true, 'JSON 파싱 실패');
  assert.equal(callbotShouldUseIvr({ status: 200, body: { ok: true } }), true, 'fallback 필드 누락 = 계약 위반 → 음성');
  assert.equal(callbotShouldUseIvr({ status: '200', body: okBody }), false, '문자열 상태코드 허용');
  assert.equal(callbotShouldUseIvr(), true);
});

// ── 3) 화면 폴링 누적 ─────────────────────────────────────────────────────
test('pollNext: 연속 실패 SCREEN_LOST_AFTER 회에 lost, 성공 1회로 즉시 복구, 간헐 실패는 lost 아님', () => {
  let st = pollInitial();
  assert.deepEqual(st, { fails: 0, lost: false });
  for (let i = 1; i < SCREEN_LOST_AFTER; i++) { st = pollNext(st, false); assert.equal(st.lost, false, `fail #${i}`); }
  st = pollNext(st, false);
  assert.deepEqual(st, { fails: SCREEN_LOST_AFTER, lost: true });
  st = pollNext(st, false);
  assert.equal(st.lost, true, '계속 실패하면 유지');
  st = pollNext(st, true);
  assert.deepEqual(st, { fails: 0, lost: false });
  // 간헐: 실패·성공 반복은 절대 lost 가 되지 않는다
  st = pollInitial();
  for (let i = 0; i < 20; i++) { st = pollNext(st, i % 2 === 0); assert.equal(st.lost, false); }
  // 이상 입력 무throw
  assert.equal(pollNext(null, false).fails, 1);
  assert.equal(pollNext({ fails: -5 }, false).fails, 1);
  assert.equal(pollNext({ fails: 'x' }, false).fails, 1);
  assert.ok(SCREEN_LOST_AFTER >= 2 && SCREEN_LOST_AFTER <= 8, '기준값이 2.5초 폴링에서 5~20초 범위를 벗어나면 안 된다');
});

// ── 4) 소스 가드 ──────────────────────────────────────────────────────────
test('소스 가드: 콜봇 대면 라우트 2종이 fallbackEnvelope 를 응답에 싣고, voice 는 예외를 503+ivr 로 잡는다', () => {
  const voice = read('../app/api/cpaas/voice/route.js');
  assert.match(voice, /from '@\/lib\/ivrFallback'/);
  assert.match(voice, /\.\.\.fallbackEnvelope\(decideInbound\(/);
  assert.match(voice, /catch\s*\(e\)[\s\S]*fail\('engine error',\s*503,\s*fallbackEnvelope\(decideEngineError\(\)\)\)/);
  assert.doesNotMatch(voice, /^export\s+(?:async\s+)?function\s+handleInbound/m, 'route.js 에서 헬퍼 export 금지');
  const action = read('../app/api/visual/action/route.js');
  assert.match(action, /\.\.\.fallbackEnvelope\(decideRelay\(relay\)\)/);
});

test('소스 가드: /visual 화면이 폴링 실패를 누적해 aria-live 로 음성 전환을 안내한다', () => {
  const page = read('../app/visual/page.jsx');
  assert.match(page, /from '@\/lib\/ivrFallback'/);
  assert.match(page, /pollNext\(health, ok\)/);
  assert.match(page, /SCREEN_LOST_MESSAGE/);
  assert.match(page, /role="status" aria-live="assertive"/);
  assert.doesNotMatch(page, /display:\s*lost\s*\?/, 'aria-live 영역을 display:none 으로 숨기면 낭독이 누락된다');
  // 세 실패 경로(HTTP 비정상·ok:false·네트워크 예외) 모두 mark(false)
  assert.equal((page.match(/mark\(false\)/g) || []).length, 3);
  assert.match(page, /mark\(true\)/);
});

// ── 고친 결함: 「유령 코드」 대조의 **예외 목록을 사람이 적고** 있었다 ──────────
//
// 아래 대조는 문서에 적힌 대문자 코드가 전부 실재하는지 본다. 그런데 reason 코드가 아닌
// 이름(상수·환경변수)은 **손으로 적은 목록**으로 건너뛰고 있었고, 그러면 상수를 하나 늘려
// 문서에 적는 순간 「유령 코드」로 실패한다 — **가드가 문서화를 벌하는** 모양이다(이번 회차에
// 아웃바운드 상한 상수 넷을 더하면서 실제로 걸렸다). 그래서 목록을 소스에서 **파생**한다:
// 문서가 가리켜도 되는 것은 ① 폴백 계약 모듈이 실제로 내보내는 이름과 ② 그 계약을 배선하는
// `lib/cpaas` 가 읽는 환경변수·내보내는 이름뿐이다(31회차가 문구 등록부에서 쓴 계약과 같다).
const DOC_KNOWN_NAMES = (() => {
  const cpaasSrc = read('../lib/cpaas/index.js');
  const names = new Set([
    ...Object.keys(FB),
    ...Object.keys(httpCpaas),
    ...[...cpaasSrc.matchAll(/process\.env\.([A-Z0-9_]+)/g)].map((m) => m[1]),
  ]);
  return names;
})();

test('문서 가드: docs/IVR_FALLBACK.md 가 모든 reason 코드·문구·기준값과 일치한다', () => {
  const doc = read('../docs/IVR_FALLBACK.md');
  for (const code of Object.keys(FALLBACK_REASONS)) assert.ok(doc.includes(`\`${code}\``), `문서에 ${code} 누락`);
  // 파생이 비어 통과하는 일이 없게(검사가 조용히 비면 아무것도 지키지 않는다).
  assert.ok(DOC_KNOWN_NAMES.size >= 10, `실재 이름을 찾지 못했다: ${DOC_KNOWN_NAMES.size}건`);
  const documented = [...doc.matchAll(/`([A-Z_]{4,})`/g)].map((m) => m[1]).filter((c) => /^[A-Z]+_[A-Z_]+$/.test(c) && !c.startsWith('HTTP'));
  for (const c of documented) {
    if (DOC_KNOWN_NAMES.has(c)) continue;
    assert.ok(c in FALLBACK_REASONS, `문서의 유령 코드 ${c}`);
  }
  assert.ok(doc.includes(IVR_PROMPT) && doc.includes(SCREEN_LOST_MESSAGE));
  assert.ok(doc.includes(`${SCREEN_LOST_AFTER}회`));
  for (const m of FALLBACK_MODES) assert.ok(doc.includes(`\`${m}\``));
  // 아웃바운드 상한은 **문서에도** 있어야 한다 — 「응답 없는 요청은 반드시 끝난다」가
  // 화면 쪽에만 적혀 있던 동안 서버 쪽에는 상한 자체가 없었다(이번 회차의 결함).
  for (const name of ['RELAY_TIMEOUT_MS', 'RELAY_MAX_ATTEMPTS', 'RELAY_BUDGET_MS']) {
    assert.ok(doc.includes(`\`${name}\``), `문서가 아웃바운드 상한(${name})을 말하지 않는다`);
  }
  assert.ok(doc.includes('CPAAS_FAIL_REASONS'), '봉투 옆자리의 고정 어휘 출처를 문서가 가리키지 않는다');
  // 봉투 옆자리의 사유 코드도 문서에 있어야 한다(응답 계약의 일부다).
  for (const code of Object.keys(httpCpaas.CPAAS_FAIL_REASONS)) {
    assert.ok(doc.includes(`\`${code}\``), `문서에 아웃바운드 사유 ${code} 누락`);
  }
});
