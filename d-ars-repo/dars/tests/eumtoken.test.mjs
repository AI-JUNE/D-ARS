// tests/eumtoken.test.mjs — 이음 1회용 링크 토큰(발급·검증·5분 만료) 단위 테스트
// 계약: 정상 발급→검증 통과 · 위조/파손/만료는 사유별로 구분 · 어떤 입력에도 throw 없음.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EUM_TOKEN_TTL_MS,
  issueEumToken,
  verifyEumToken,
  remainingMs,
  normalizeSid,
  tokenMessage,
} from '../lib/eumToken.js';

const T0 = 1_760_000_000_000; // 고정 시각 — 시계에 의존하지 않는다

test('만료 기본값은 5분이다(가이드 §6-2 요건)', () => {
  assert.equal(EUM_TOKEN_TTL_MS, 5 * 60 * 1000);
});

test('normalizeSid: URL 세그먼트에 안전한 문자만 허용한다', () => {
  assert.equal(normalizeSid('s-1001'), 's-1001');
  assert.equal(normalizeSid('  s_1001  '), 's_1001');
  assert.equal(normalizeSid('홍길동'), null);
  assert.equal(normalizeSid('a/b'), null);
  assert.equal(normalizeSid(''), null);
  assert.equal(normalizeSid(null), null);
  assert.equal(normalizeSid('x'.repeat(65)), null);
});

test('정상 경로: 발급한 토큰은 검증을 통과하고 sid·남은 시간을 돌려준다', async () => {
  const tok = await issueEumToken('s-1001', { now: T0 });
  assert.equal(typeof tok, 'string');
  assert.equal(tok.split('.').length, 2);
  const r = await verifyEumToken(tok, T0 + 1000);
  assert.equal(r.ok, true);
  assert.equal(r.payload.sid, 's-1001');
  assert.equal(r.payload.exp, T0 + EUM_TOKEN_TTL_MS);
  assert.equal(r.remainingMs, EUM_TOKEN_TTL_MS - 1000);
});

test('토큰에는 개인정보가 담기지 않는다(sid·iat·exp 뿐)', async () => {
  const tok = await issueEumToken('s-1001', { now: T0 });
  const body = JSON.parse(Buffer.from(tok.split('.')[0], 'base64url').toString('utf8'));
  assert.deepEqual(Object.keys(body).sort(), ['exp', 'iat', 'sid']);
});

test('실패 경로: 5분 1ms 뒤에는 만료다(경계 포함)', async () => {
  const tok = await issueEumToken('s-1001', { now: T0 });
  const edge = await verifyEumToken(tok, T0 + EUM_TOKEN_TTL_MS - 1);
  assert.equal(edge.ok, true);
  const gone = await verifyEumToken(tok, T0 + EUM_TOKEN_TTL_MS);
  assert.equal(gone.ok, false);
  assert.equal(gone.reason, 'expired');
});

test('실패 경로: 서명 위조·형식 파손·빈 값을 사유별로 구분한다', async () => {
  const tok = await issueEumToken('s-1001', { now: T0 });
  const [b, sig] = tok.split('.');
  const flipped = sig[0] === 'A' ? `B${sig.slice(1)}` : `A${sig.slice(1)}`;
  assert.equal((await verifyEumToken(`${b}.${flipped}`, T0)).reason, 'signature');
  assert.equal((await verifyEumToken('abc', T0)).reason, 'malformed');
  assert.equal((await verifyEumToken('abc.', T0)).reason, 'malformed');
  assert.equal((await verifyEumToken('', T0)).reason, 'missing');
  assert.equal((await verifyEumToken(null, T0)).reason, 'missing');
  assert.equal((await verifyEumToken(undefined, T0)).reason, 'missing');
});

test('실패 경로: 서명은 맞지만 본문이 규격 밖이면 malformed 다', async () => {
  const bad = Buffer.from(JSON.stringify({ sid: '홍길동', exp: T0 + 1000 }), 'utf8').toString('base64url');
  // 같은 비밀로 서명해 서명 검증은 통과시키고 본문만 규격 밖으로 만든다
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode('dars-eum-demo-secret-v1'),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sigBytes = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(bad)));
  const sig = Buffer.from(sigBytes).toString('base64url');
  const r = await verifyEumToken(`${bad}.${sig}`, T0);
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'malformed');
});

test('발급 거부: sid 규격 밖·ttl 이상값이면 null(링크를 만들지 않는다)', async () => {
  assert.equal(await issueEumToken('홍길동'), null);
  assert.equal(await issueEumToken(''), null);
  assert.equal(await issueEumToken('s-1', { ttlMs: 0 }), null);
  assert.equal(await issueEumToken('s-1', { ttlMs: -5 }), null);
  assert.equal(await issueEumToken('s-1', { ttlMs: NaN }), null);
});

test('remainingMs: 음수가 되지 않고 이상 입력에 throw 하지 않는다', () => {
  assert.equal(remainingMs({ exp: T0 + 5000 }, T0), 5000);
  assert.equal(remainingMs({ exp: T0 - 5000 }, T0), 0);
  assert.equal(remainingMs(null, T0), 0);
  assert.equal(remainingMs({ exp: 'x' }, T0), 0);
});

test('안내문: 만료는 요건 문장 그대로, 그 밖은 공통 안내다', () => {
  assert.equal(tokenMessage('expired'), '링크가 만료되었습니다. 담당자에게 다시 요청해 주세요');
  assert.equal(tokenMessage('signature'), tokenMessage('malformed'));
  assert.equal(tokenMessage('알 수 없는 사유'), tokenMessage('malformed'));
});
