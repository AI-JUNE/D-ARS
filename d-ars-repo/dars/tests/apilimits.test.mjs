// tests/apilimits.test.mjs — 공개 API rate limit 정책 단일화 모듈 테스트 (무의존성: node:test)
//
// 검증 관점
//  - 정책표가 라우트 코드가 아니라 이 모듈에만 있고, 값이 상식적인 범위인가.
//  - consume() 이 한도까지는 통과(null)하고 초과분만 429 + Retry-After 로 막는가.
//  - **키가 다르면 서로 영향이 없는가** — 세션 단위 제한의 핵심(무고한 차단 방지).
//  - RATE_LIMIT_DISABLED 비상구가 실제로 전부 통과시키는가.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  LIMIT_POLICY, limiter, consume, ipKey, resetLimits, limitsDisabled,
} from '../lib/apiLimits.js';

function fresh(name) { resetLimits(name); }

test('정책표: 필요한 정책이 모두 정의되어 있다', () => {
  for (const name of [
    'visualState', 'visualAction', 'tokenFail', 'ingest', 'read', 'simulate',
    'login', 'cpaasEvents', 'cpaasVoice', 'eumSubmit',
  ]) {
    assert.ok(LIMIT_POLICY[name], `정책 누락: ${name}`);
  }
});

test('정책표: 모든 한도가 양의 정수 · 윈도우도 양수', () => {
  for (const [name, p] of Object.entries(LIMIT_POLICY)) {
    assert.ok(Number.isInteger(p.max) && p.max > 0, `${name}.max 이상: ${p.max}`);
    assert.ok(Number.isInteger(p.windowMs) && p.windowMs > 0, `${name}.windowMs 이상: ${p.windowMs}`);
  }
});

test('정책표: 부작용 있는 경로가 읽기보다 빡빡하다(상대적 강도 역전 방지)', () => {
  // 회귀 방지용 — 누가 simulate 한도를 읽기 수준으로 올려버리면 실패한다.
  assert.ok(LIMIT_POLICY.simulate.max < LIMIT_POLICY.visualAction.max);
  assert.ok(LIMIT_POLICY.visualAction.max < LIMIT_POLICY.visualState.max);
  assert.ok(LIMIT_POLICY.visualState.max < LIMIT_POLICY.read.max);
  assert.ok(LIMIT_POLICY.tokenFail.max < LIMIT_POLICY.visualState.max);
});

test('정책표: visual 폴링 주기(2.5초 ≈ 24회/분) 대비 여유가 있다', () => {
  // 한도가 정상 폴링 아래로 내려가면 라이브 화면이 스스로 막힌다.
  assert.ok(LIMIT_POLICY.visualState.max >= 24 * 2, '정상 폴링의 최소 2배는 확보할 것');
});

test('limiter: 알 수 없는 정책 이름은 즉시 실패(오타를 조용히 통과시키지 않는다)', () => {
  assert.throws(() => limiter('nope'), /unknown rate limit policy/);
});

test('limiter: 같은 이름은 같은 인스턴스를 재사용(상태 공유)', () => {
  fresh('read');
  assert.equal(limiter('read'), limiter('read'));
});

test('consume: 한도까지 통과(null) · 초과분은 429 + Retry-After', async () => {
  fresh('simulate');
  const max = LIMIT_POLICY.simulate.max;
  for (let i = 0; i < max; i++) {
    assert.equal(consume('simulate', '1.1.1.1'), null, `${i + 1}번째는 통과해야 함`);
  }
  const blocked = consume('simulate', '1.1.1.1');
  assert.ok(blocked, '한도 초과분은 차단되어야 함');
  assert.equal(blocked.status, 429);
  const retry = Number(blocked.headers.get('Retry-After'));
  assert.ok(Number.isInteger(retry) && retry >= 1, `Retry-After 정수 초여야 함: ${retry}`);
  const body = await blocked.json();
  assert.equal(body.ok, false);
  assert.equal(body.error, 'rate limited');
});

test('consume: 키가 다르면 서로 영향 없음(무고한 차단 방지 · 세션 단위 제한의 핵심)', () => {
  fresh('simulate');
  const max = LIMIT_POLICY.simulate.max;
  for (let i = 0; i < max; i++) consume('simulate', 'A');
  assert.ok(consume('simulate', 'A'), 'A 는 소진되어 차단');
  assert.equal(consume('simulate', 'B'), null, 'B 는 영향 없이 통과해야 함');
});

test('consume: 정책이 다르면 카운터도 분리된다', () => {
  fresh('simulate'); fresh('visualAction');
  const max = LIMIT_POLICY.simulate.max;
  for (let i = 0; i < max; i++) consume('simulate', 'same-key');
  assert.ok(consume('simulate', 'same-key'));
  assert.equal(consume('visualAction', 'same-key'), null);
});

test('consume: 사용자 문구를 그대로 전달한다', async () => {
  fresh('simulate');
  const max = LIMIT_POLICY.simulate.max;
  for (let i = 0; i < max; i++) consume('simulate', 'msg');
  const body = await consume('simulate', 'msg', '요청이 너무 많습니다.').json();
  assert.equal(body.error, '요청이 너무 많습니다.');
});

test('consume: 키가 비어도 던지지 않고 unknown 버킷으로 묶인다', () => {
  fresh('read');
  assert.equal(consume('read', null), null);
  assert.equal(consume('read', undefined), null);
  assert.equal(consume('read', ''), null);
});

test('RATE_LIMIT_DISABLED=1: 비상구가 전부 통과시킨다', () => {
  fresh('simulate');
  process.env.RATE_LIMIT_DISABLED = '1';
  try {
    assert.equal(limitsDisabled(), true);
    for (let i = 0; i < LIMIT_POLICY.simulate.max + 20; i++) {
      assert.equal(consume('simulate', 'flood'), null);
    }
  } finally { delete process.env.RATE_LIMIT_DISABLED; }
  assert.equal(limitsDisabled(), false, '기본값은 적용됨(보호가 기본)');
});

test('RATE_LIMIT_DISABLED 는 정확히 "1" 일 때만 해제(오타로 보호가 풀리지 않게)', () => {
  for (const v of ['0', 'true', 'yes', '', 'on']) {
    process.env.RATE_LIMIT_DISABLED = v;
    assert.equal(limitsDisabled(), false, `해제되면 안 됨: ${v}`);
  }
  delete process.env.RATE_LIMIT_DISABLED;
});

test('ipKey: 프록시 헤더에서 첫 IP 추출 · 실패 시 unknown(던지지 않음)', () => {
  const req = (h) => ({ headers: { get: (k) => h[k.toLowerCase()] ?? null } });
  assert.equal(ipKey(req({ 'x-forwarded-for': '203.0.113.9, 10.0.0.1' })), '203.0.113.9');
  assert.equal(ipKey(req({ 'x-real-ip': '198.51.100.7' })), '198.51.100.7');
  assert.equal(ipKey(req({})), 'unknown');
  assert.equal(ipKey(null), 'unknown');
  assert.equal(ipKey(undefined), 'unknown');
});

test('resetLimits: 인자 없으면 전체 초기화', () => {
  const max = LIMIT_POLICY.simulate.max;
  for (let i = 0; i < max; i++) consume('simulate', 'r');
  assert.ok(consume('simulate', 'r'));
  resetLimits();
  assert.equal(consume('simulate', 'r'), null);
});

// ── 이음 어르신 신청 제출의 키 설계 ──────────────────────────────────────────
//
// 고친 결함: 이 라우트만 이 파일의 '키 선택이 핵심' 규칙에서 빠져 처음부터 IP 로 조이고 있었다.
// 하필 공유 IP 가 가장 흔한 경로였다 — 복지관·경로당에서 담당자가 여러 어르신을 한 자리에 모아
// 놓고 링크를 하나씩 보내는 것이 이 기능의 전형적인 사용 장면인데, 그 방은 공유기 하나 뒤에
// 있어 공인 IP 가 하나다. 앞사람들의 재시도가 한도를 채우면 **아무 잘못도 하지 않은 뒷사람이**
// 「잠시 후 다시 눌러 주세요」만 보다가 5분 링크를 잃는다. 정책표 주석은 그러면 안 된다고
// 적혀 있었지만 IP 키로는 코드가 보장할 수 없는 서술이었다.

const ROUTE_SRC = readFileSync(
  fileURLToPath(new URL('../app/api/eum/senior/preferences/route.js', import.meta.url)),
  'utf8',
);

test('이음 제출: 같은 IP 라도 링크가 다르면 서로 막지 않는다(공유 IP 무고한 차단 방지)', () => {
  fresh('eumSubmit');
  const max = LIMIT_POLICY.eumSubmit.max;
  // 한 어르신(링크 A)이 한도를 다 쓴다 — 손이 떨려 여러 번 눌렀다고 하자.
  for (let i = 0; i < max; i++) assert.equal(consume('eumSubmit', 'sigA'), null);
  assert.ok(consume('eumSubmit', 'sigA'), '자기 한도는 정상적으로 걸려야 한다');
  // 같은 방(같은 공인 IP)의 다음 어르신은 **링크가 다르므로** 영향을 받지 않는다.
  for (const other of ['sigB', 'sigC', 'sigD']) {
    assert.equal(consume('eumSubmit', other), null, `옆 사람의 재시도에 막혔다: ${other}`);
  }
});

test('이음 제출: 위조 토큰 홍수는 여전히 IP 단위(tokenFail)로 막힌다', () => {
  fresh('tokenFail');
  const max = LIMIT_POLICY.tokenFail.max;
  for (let i = 0; i < max; i++) assert.equal(consume('tokenFail', '203.0.113.9'), null);
  assert.ok(consume('tokenFail', '203.0.113.9'), '브루트포스는 IP 로 조여야 한다');
  assert.equal(consume('tokenFail', '198.51.100.7'), null, '다른 IP 로 전이되면 안 된다');
});

test('이음 제출 라우트: 유효한 링크는 링크 단위, 검증 실패만 IP 단위로 센다', () => {
  // 검증 실패 경로에서만 ipKey 를 쓴다 — 유효 토큰 경로에 ipKey 가 되살아나면 실패한다.
  const failBlock = ROUTE_SRC.slice(
    ROUTE_SRC.indexOf('if (!verdict.ok)'),
    ROUTE_SRC.indexOf('const linkKey'),
  );
  assert.ok(failBlock.length > 0, '검증 실패 분기를 찾지 못했다(라우트 구조 변경?)');
  assert.match(failBlock, /consume\('tokenFail',\s*ipKey\(req\)\)/, '위조 홍수를 IP 로 막지 않는다');

  assert.match(ROUTE_SRC, /const linkKey = consumeKey\(token\)/, '링크 단위 키를 만들지 않는다');
  assert.match(ROUTE_SRC, /consume\('eumSubmit',\s*linkKey/, '제출 한도가 링크 단위가 아니다');
  // 토큰 검증보다 먼저 IP 로 조이면 링크 단위 키를 쓸 수 없다 → 순서를 고정한다.
  assert.ok(
    ROUTE_SRC.indexOf('verifyEumToken(token)') < ROUTE_SRC.indexOf("consume('eumSubmit'"),
    '검증보다 먼저 제출 한도를 걸면 링크 단위로 셀 수 없다',
  );
  // 소진 기록과 한도가 **같은 키**를 쓴다(링크 하나 = 한 사람).
  assert.match(ROUTE_SRC, /claim\(linkKey,/, '소진 판정과 한도가 다른 키를 쓰면 안 된다');
});

test('이음 제출 라우트: 한도 키를 못 만들어도 무제한으로 통과시키지 않는다', () => {
  assert.match(ROUTE_SRC, /linkKey \|\| ipKey\(req\)/, '키 생성 실패 시 IP 로 물러서야 한다');
});
