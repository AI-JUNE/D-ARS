// tests/eumtoken.test.mjs — 이음 1회용 링크 토큰(발급·검증·5분 만료) 단위 테스트
// 계약: 정상 발급→검증 통과 · 위조/파손/만료는 사유별로 구분 · 어떤 입력에도 throw 없음.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EUM_TOKEN_TTL_MS,
  EUM_TOKEN_MAX_TTL_MS,
  issueEumToken,
  verifyEumToken,
  withinTokenLifetime,
  remainingMs,
  normalizeSid,
} from '../lib/eumToken.js';
import { TOKEN_SPECS } from '../lib/tokenAudit.js';

const T0 = 1_760_000_000_000; // 고정 시각 — 시계에 의존하지 않는다

// 같은 비밀(데모 기본값)로 본문만 골라 서명한다 — 서명 검증은 통과시키고 **본문**이 규격
// 밖인 경우를 재현하는 데 쓴다. 서명 비밀을 아는 사람이 할 수 있는 일이 곧 이 함수다.
async function signBody(body) {
  const b = Buffer.from(JSON.stringify(body), 'utf8').toString('base64url');
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode('dars-eum-demo-secret-v1'),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(b)));
  return `${b}.${Buffer.from(sig).toString('base64url')}`;
}

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

// ── 고친 결함: 「5분」을 **검증이 확인하지 않았다** ─────────────────────────
//
// 수명 상한을 지키는 코드는 발급 쪽 한 곳(lib/eumLink.resolveTtlMs — CLI)뿐이었다.
// `issueEumToken` 은 양수 ttl 이면 무엇이든 받았고, `verifyEumToken` 은 토큰이 적어 온 수명을
// 한 번도 보지 않았다(`exp` 가 지금보다 뒤이기만 하면 통과했다). 즉 `{ iat, exp: iat + 1년 }`
// 로 서명된 토큰은 1년짜리 「1회용 5분 링크」였다.
// 왜 사소하지 않은가: 이 기능의 위험 완화가 거의 전부 그 숫자에 걸려 있다 —
// 「알려진 한계」가 **세 번**(소진 기록 소멸 · 접근로그 · 메신저 미리보기) "짧은 수명(5분)" 을
// 완화 수단으로 인용한다. 그런데 지키는 쪽은 발급자이고 **발급자는 위협 모델 안에 없다**
// (라이브는 저장소에 공개된 데모 비밀값으로 서명한다 — token:check 의 TOKEN_SECRET_DEMO).
test('수명 상한은 토큰 명세와 같고, 발급이 그것을 넘기면 거부한다', async () => {
  const spec = TOKEN_SPECS.find((s) => s.name === 'eum-link');
  assert.equal(EUM_TOKEN_MAX_TTL_MS, spec.maxTtlMs, '상한을 푸는 자리는 하나다');
  assert.ok(EUM_TOKEN_MAX_TTL_MS >= EUM_TOKEN_TTL_MS, '상한이 요건값보다 좁으면 정상 발급이 막힌다');
  // 경계는 받고, 한 눈금 넘으면 **거부**한다(조용히 깎지 않는다).
  assert.equal(typeof await issueEumToken('s-1', { ttlMs: EUM_TOKEN_MAX_TTL_MS, now: T0 }), 'string');
  assert.equal(await issueEumToken('s-1', { ttlMs: EUM_TOKEN_MAX_TTL_MS + 1, now: T0 }), null);
  assert.equal(await issueEumToken('s-1', { ttlMs: 365 * 24 * 3600 * 1000, now: T0 }), null);
});

test('검증 거부: 수명이 상한 밖인 토큰은 만료가 아니라 사유 lifetime 이다', async () => {
  // 서명은 멀쩡하고 본문만 「우리가 발급하지 않는 수명」인 토큰.
  const long = await signBody({ sid: 's-1001', iat: T0, exp: T0 + 365 * 24 * 3600 * 1000 });
  const r = await verifyEumToken(long, T0 + 1000);
  assert.equal(r.ok, false, '상한 밖 수명이 통과하면 1회용 5분 링크라는 서술이 거짓이 된다');
  assert.equal(r.reason, 'lifetime');
  // 만료 쪽으로 떨어뜨리면 안 된다 — 그 화면만 「담당자가 새 링크를 보내면 되는 상태」라고
  // 말하고, 그 기기의 보조 사본을 찾으라고 sid 까지 돌려준다.
  assert.equal(r.sid, undefined, '우리가 발급하지 않은 모양의 토큰에 sid 를 돌려주면 안 된다');
  assert.equal(r.payload, undefined);
  assert.equal(r.remainingMs, undefined);

  // 경계: 상한 그 자체는 통과하고, 1ms 넘으면 거부한다.
  const edge = await signBody({ sid: 's-1001', iat: T0, exp: T0 + EUM_TOKEN_MAX_TTL_MS });
  assert.equal((await verifyEumToken(edge, T0)).ok, true);
  const over = await signBody({ sid: 's-1001', iat: T0, exp: T0 + EUM_TOKEN_MAX_TTL_MS + 1 });
  assert.equal((await verifyEumToken(over, T0)).reason, 'lifetime');

  // iat 를 **빼면** 이 검사가 사라지던 길도 막는다 — 모르면 거부다(여기서 닫는 것은
  // 우리가 발급하지 않은 모양의 링크이고, 어르신의 조작이 아니다).
  for (const bad of [undefined, null, 'x', NaN, {}]) {
    const noIat = await signBody({ sid: 's-1001', iat: bad, exp: T0 + EUM_TOKEN_TTL_MS });
    assert.equal((await verifyEumToken(noIat, T0)).reason, 'lifetime', `iat: ${String(bad)}`);
  }
  // iat 를 **미래**로 적어 남은 시간만 늘리는 길도 막는다(화면의 눈금이 그 값을 그대로 받는다).
  const future = await signBody({
    sid: 's-1001', iat: T0 + 24 * 3600 * 1000, exp: T0 + 24 * 3600 * 1000 + EUM_TOKEN_TTL_MS,
  });
  assert.equal((await verifyEumToken(future, T0)).reason, 'lifetime');

  // 수명이 규격 안인 **만료된** 토큰은 그대로 만료로 말한다(그쪽 안내가 맞는 상태다).
  const gone = await issueEumToken('s-1001', { now: T0 });
  const after = await verifyEumToken(gone, T0 + EUM_TOKEN_TTL_MS);
  assert.equal(after.reason, 'expired');
  assert.equal(after.sid, 's-1001');
});

test('withinTokenLifetime: 모르는 값은 전부 거부이고 throw 하지 않는다', () => {
  assert.equal(withinTokenLifetime({ iat: T0, exp: T0 + EUM_TOKEN_TTL_MS }, T0), true);
  // 수명이 0 이하인 토큰은 애초에 모양이 틀렸다(발급이 만들지 않는다).
  assert.equal(withinTokenLifetime({ iat: T0, exp: T0 }, T0), false);
  assert.equal(withinTokenLifetime({ iat: T0, exp: T0 - 1 }, T0), false);
  for (const bad of [null, undefined, 42, 'x', [], Symbol('x')]) {
    assert.equal(withinTokenLifetime(bad, T0), false, `payload: ${String(bad)}`);
    assert.equal(withinTokenLifetime({ iat: T0, exp: T0 + 1000 }, bad), false, `now: ${String(bad)}`);
  }
  // 상한 자체가 이상하면 통과시키지 않는다 — 판정 불가를 허용으로 넘기지 않는다.
  // (`undefined` 는 기본 인자가 받아 등록된 상한이 되므로 여기 넣지 않는다.)
  for (const cap of [0, -1, NaN, 'x', null, [], Symbol('x')]) {
    assert.equal(withinTokenLifetime({ iat: T0, exp: T0 + 1000 }, T0, cap), false, `cap: ${String(cap)}`);
  }
  assert.equal(withinTokenLifetime({ iat: T0, exp: T0 + 1000 }, T0, undefined), true,
    '상한을 넘기지 않으면 등록된 상한을 쓴다');
});

test('remainingMs: 음수가 되지 않고 이상 입력에 throw 하지 않는다', () => {
  assert.equal(remainingMs({ exp: T0 + 5000 }, T0), 5000);
  assert.equal(remainingMs({ exp: T0 - 5000 }, T0), 0);
  assert.equal(remainingMs(null, T0), 0);
  assert.equal(remainingMs({ exp: 'x' }, T0), 0);
});

// 안내문은 이 파일에서 더 이상 검사하지 않는다 — 표가 lib/eumMessage.js 로 옮겨 갔다
// (이 파일은 서명 비밀을 읽으므로 브라우저 화면이 import 할 수 없고, 그래서 화면이 같은 문장을
// 손으로 적고 있었다). 검사는 tests/eummessage.test.mjs 가 한다.
test('만료 판정은 sid 를 함께 돌려준다(서명이 이미 검증된 뒤라 우리 값이다)', async () => {
  const tok = await issueEumToken('s-1001', { now: T0 });
  const gone = await verifyEumToken(tok, T0 + EUM_TOKEN_TTL_MS);
  assert.equal(gone.ok, false);
  assert.equal(gone.sid, 's-1001', '만료 화면이 그 기기의 보조 사본을 찾을 수 없게 된다');
  // 통과와 혼동되지 않게 payload 는 주지 않는다 — 호출측이 ok 만 보고 분기해도 안전해야 한다.
  assert.equal(gone.payload, undefined);
  // 서명이 검증되지 않은 실패에는 sid 가 없다(호출자가 적어 넣은 값을 돌려주지 않는다).
  for (const bad of ['abc', '', null]) {
    assert.equal((await verifyEumToken(bad, T0)).sid, undefined, `입력: ${String(bad)}`);
  }
});
