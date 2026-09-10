// tests/ivrfallback.test.mjs — 엔진 장애 시 음성 IVR 전환 계약 (무의존성: node:test)
//  1) 순수 판정(decideInbound/decideRelay/decideEngineError/fallbackEnvelope)
//  2) 콜봇 측 참조 구현 callbotShouldUseIvr — "명시적 visual 만 화면, 나머지 전부 음성"
//  3) 고객 화면 폴링 누적 리듀서 pollNext
//  4) 소스 가드 — 콜봇 대면 라우트 2종·/visual 화면·문서가 계약을 실제로 배선했는지
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  FALLBACK_MODES, FALLBACK_REASONS, IVR_PROMPT, VISUAL_PROMPT, SCREEN_LOST_MESSAGE, SCREEN_LOST_AFTER,
  decision, decideInbound, decideRelay, decideEngineError, fallbackEnvelope, callbotShouldUseIvr,
  pollInitial, pollNext,
} from '../lib/ivrFallback.js';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

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

test('문서 가드: docs/IVR_FALLBACK.md 가 모든 reason 코드·문구·기준값과 일치한다', () => {
  const doc = read('../docs/IVR_FALLBACK.md');
  for (const code of Object.keys(FALLBACK_REASONS)) assert.ok(doc.includes(`\`${code}\``), `문서에 ${code} 누락`);
  const documented = [...doc.matchAll(/`([A-Z_]{4,})`/g)].map((m) => m[1]).filter((c) => /^[A-Z]+_[A-Z_]+$/.test(c) && !c.startsWith('HTTP'));
  for (const c of documented) {
    if (['SCREEN_LOST_AFTER', 'IVR_PROMPT', 'VISUAL_PROMPT', 'SCREEN_LOST_MESSAGE', 'CALLBOT_CALLBACK_URL', 'SMS_GATEWAY_URL', 'CPAAS_PROVIDER'].includes(c)) continue;
    assert.ok(c in FALLBACK_REASONS, `문서의 유령 코드 ${c}`);
  }
  assert.ok(doc.includes(IVR_PROMPT) && doc.includes(SCREEN_LOST_MESSAGE));
  assert.ok(doc.includes(`${SCREEN_LOST_AFTER}회`));
  for (const m of FALLBACK_MODES) assert.ok(doc.includes(`\`${m}\``));
});
