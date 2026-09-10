// tests/tokenaudit.test.mjs — 발급 토큰 보안 요건(만료·1회용·엔트로피) 판정
// 최우선 안전 요건: 판정 어디에도 **비밀값이 새지 않는다**.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  secretStrength, effectiveSecret, auditToken, auditTokens,
  TOKEN_SPECS, KNOWN_DEMO_SECRETS, MIN_SECRET_LENGTH, MIN_SECRET_VARIETY,
} from '../lib/tokenAudit.js';
import { EUM_TOKEN_TTL_MS } from '../lib/eumToken.js';
import { SESSION_HOURS } from '../lib/auth.js';
import { DEFAULT_TTL_SEC } from '../lib/session.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const STRONG = 'Qx7#kM2pL9vT4nR8sW1zY6bH3dJ5gC0e';   // 32자·문자 다양

// ---- 비밀값 강도 ----

test('secretStrength — 미설정/데모/약함/충분을 구분한다', () => {
  assert.equal(secretStrength(null).level, 'missing');
  assert.equal(secretStrength('   ').level, 'missing');
  assert.equal(secretStrength(KNOWN_DEMO_SECRETS[0]).level, 'demo');
  assert.equal(secretStrength('short').level, 'weak');
  assert.equal(secretStrength('a'.repeat(64)).level, 'weak', '반복 패턴은 길어도 약하다');
  assert.equal(secretStrength(STRONG).level, 'ok');
});

test('secretStrength — 경계값: 하한 미만은 weak, 하한은 ok', () => {
  const base = 'Qx7kM2pL9vT4nR8sW1zY6bH3dJ5gC0eF';
  assert.equal(base.length, MIN_SECRET_LENGTH);
  assert.equal(secretStrength(base).level, 'ok');
  assert.equal(secretStrength(base.slice(0, MIN_SECRET_LENGTH - 1)).level, 'weak');
});

test('secretStrength — 문자 다양성 하한을 지킨다', () => {
  const few = 'abcdefg'.repeat(10);                 // 서로 다른 문자 7종 < 8
  assert.ok(new Set(few).size < MIN_SECRET_VARIETY);
  assert.equal(secretStrength(few).level, 'weak');
});

test('secretStrength — 값·길이를 반환하지 않는다', () => {
  const r = secretStrength('TOPSECRET-' + 'x'.repeat(40));
  assert.deepEqual(Object.keys(r).sort(), ['level', 'lowVariety', 'meetsMinLength']);
  assert.doesNotMatch(JSON.stringify(r), /TOPSECRET|\b4\d\b/, '값·길이 유출 금지');
});

test('secretStrength — 이상 입력에 throw 하지 않는다', () => {
  for (const bad of [undefined, 0, {}, [], true]) {
    assert.equal(secretStrength(bad).level, 'missing');
  }
});

// ---- 폴백 체인 ----

test('effectiveSecret — 전용 키가 있으면 그것을 쓴다', () => {
  const spec = TOKEN_SPECS.find((s) => s.name === 'eum-link');
  const r = effectiveSecret(spec, { EUM_TOKEN_SECRET: STRONG, AUTH_SECRET: 'other' });
  assert.equal(r.source, 'EUM_TOKEN_SECRET');
  assert.equal(r.level, 'ok');
  assert.ok(!r.derived);
});

test('effectiveSecret — 전용 키가 없으면 폴백을 빌려 쓰고 derived 로 표시한다', () => {
  const spec = TOKEN_SPECS.find((s) => s.name === 'eum-link');
  const r = effectiveSecret(spec, { AUTH_SECRET: STRONG });
  assert.equal(r.source, 'AUTH_SECRET');
  assert.equal(r.derived, true);
});

test('effectiveSecret — 아무 것도 없으면 데모 기본값(또는 none)', () => {
  const eum = TOKEN_SPECS.find((s) => s.name === 'eum-link');
  assert.equal(effectiveSecret(eum, {}).source, 'demo-default');
  const rbac = TOKEN_SPECS.find((s) => s.name === 'rbac-session');
  assert.equal(effectiveSecret(rbac, {}).source, 'none', '데모 폴백이 없으면 아예 무동작');
});

test('effectiveSecret — 비밀값을 반환하지 않는다', () => {
  const spec = TOKEN_SPECS.find((s) => s.name === 'auth-session');
  const r = effectiveSecret(spec, { AUTH_SECRET: 'LEAKME-' + STRONG });
  assert.doesNotMatch(JSON.stringify(r), /LEAKME/);
});

// ---- 토큰별 판정 ----

test('auditToken — 데모 비밀값은 운영에서 차단, 그 외에는 경고', () => {
  const spec = TOKEN_SPECS.find((s) => s.name === 'auth-session');
  assert.ok(auditToken(spec, {}, 'production').blockers.some((b) => b.code === 'TOKEN_SECRET_DEMO'));
  assert.ok(auditToken(spec, {}, 'demo').warnings.some((w) => w.code === 'TOKEN_SECRET_DEMO'));
});

test('auditToken — 약한 비밀값도 운영에서 차단된다', () => {
  const spec = TOKEN_SPECS.find((s) => s.name === 'auth-session');
  const r = auditToken(spec, { AUTH_SECRET: 'short-but-set' }, 'production');
  assert.ok(r.blockers.some((b) => b.code === 'TOKEN_SECRET_WEAK'));
});

test('auditToken — 키를 빌려 쓰면 유출 파급을 경고한다', () => {
  const spec = TOKEN_SPECS.find((s) => s.name === 'eum-link');
  const r = auditToken(spec, { AUTH_SECRET: STRONG }, 'production');
  assert.ok(r.warnings.some((w) => w.code === 'TOKEN_SECRET_DERIVED'));
  assert.deepEqual(r.blockers, [], '강한 키를 빌려 쓰는 것 자체는 차단 사유가 아니다');
});

test('auditToken — 만료 없음/과도한 수명을 잡아낸다', () => {
  const noExp = { name: 't', ttlMs: 0, secretEnv: 'X', hasDemoFallback: false, transport: 'cookie' };
  assert.ok(auditToken(noExp, {}, 'demo').blockers.some((b) => b.code === 'TOKEN_NO_EXPIRY'));
  const tooLong = { name: 't2', ttlMs: 99e9, maxTtlMs: 1000, secretEnv: 'X', hasDemoFallback: false, transport: 'cookie' };
  assert.ok(auditToken(tooLong, {}, 'production').blockers.some((b) => b.code === 'TOKEN_TTL_TOO_LONG'));
});

test('auditToken — 1회용 요건 미구현은 항상 경고로 드러난다', () => {
  const spec = TOKEN_SPECS.find((s) => s.name === 'eum-link');
  for (const p of ['demo', 'staging', 'production']) {
    const r = auditToken(spec, { EUM_TOKEN_SECRET: STRONG }, p);
    const w = r.warnings.find((x) => x.code === 'TOKEN_NOT_ONE_TIME');
    assert.ok(w, `${p} 에서 1회용 미구현이 보고돼야 한다`);
    assert.match(w.msg, /\[승인 필요\]/);
  }
});

test('auditToken — 세션 토큰은 재사용이 전제라 1회용 경고를 내지 않는다', () => {
  for (const name of ['auth-session', 'rbac-session']) {
    const spec = TOKEN_SPECS.find((s) => s.name === name);
    const r = auditToken(spec, { AUTH_SECRET: STRONG, RBAC_SESSION_SECRET: STRONG }, 'production');
    assert.ok(!r.warnings.some((w) => w.code === 'TOKEN_NOT_ONE_TIME'));
  }
});

test('auditToken — URL 전달 토큰의 노출 경로를 경고한다', () => {
  const eum = TOKEN_SPECS.find((s) => s.name === 'eum-link');
  assert.ok(auditToken(eum, {}, 'demo').warnings.some((w) => w.code === 'TOKEN_IN_URL'));
  const auth = TOKEN_SPECS.find((s) => s.name === 'auth-session');
  assert.ok(!auditToken(auth, {}, 'demo').warnings.some((w) => w.code === 'TOKEN_IN_URL'), '쿠키 전달은 해당 없음');
});

// ---- 전체 판정 ----

test('auditTokens — 강한 전용 키를 모두 주면 운영에서도 차단 0건', () => {
  const env = {
    AUTH_SECRET: STRONG,
    RBAC_SESSION_SECRET: 'Zp4$rL8kN2vX6mQ9tB3wC7yF1dH5gJ0s',
    EUM_TOKEN_SECRET: 'Mk9!wR3nP7qL2vZ8xT4bY6cD1fG5hJ0a',
  };
  const r = auditTokens(env, 'production');
  assert.deepEqual(r.blockers, []);
  assert.equal(r.ok, true);
  // 구조적 한계(1회용 미구현·URL 전달)는 여전히 경고로 남아야 한다
  assert.ok(r.warnings.some((w) => w.code === 'TOKEN_NOT_ONE_TIME'));
});

test('auditTokens — 결과 어디에도 비밀값이 담기지 않는다', () => {
  const env = { AUTH_SECRET: 'LEAK-A-' + STRONG, RBAC_SESSION_SECRET: 'LEAK-B-' + STRONG, EUM_TOKEN_SECRET: 'LEAK-C-' + STRONG };
  assert.doesNotMatch(JSON.stringify(auditTokens(env, 'production')), /LEAK-/);
});

test('auditTokens — 이상 입력에 throw 하지 않는다', () => {
  for (const bad of [null, undefined, 42]) {
    assert.doesNotThrow(() => auditTokens(bad, 'production'));
  }
  assert.deepEqual(auditTokens({}, 'demo', null).rows, []);
});

// ---- 실제 구현과의 대조 ----

test('[통합] TOKEN_SPECS 의 수명이 실제 구현 상수와 일치한다', () => {
  const eum = TOKEN_SPECS.find((s) => s.name === 'eum-link');
  assert.equal(eum.ttlMs, EUM_TOKEN_TTL_MS, '이음 링크 TTL 이 코드와 어긋난다');
  const auth = TOKEN_SPECS.find((s) => s.name === 'auth-session');
  assert.equal(auth.ttlMs, SESSION_HOURS * 3600 * 1000);
  const rbac = TOKEN_SPECS.find((s) => s.name === 'rbac-session');
  assert.equal(rbac.ttlMs, DEFAULT_TTL_SEC * 1000);
});

test('[통합] 명세의 폴백 선언이 실제 소스와 일치한다', () => {
  const eumSrc = fs.readFileSync(path.join(root, 'lib', 'eumToken.js'), 'utf8');
  assert.match(eumSrc, /EUM_TOKEN_SECRET\s*\|\|\s*process\.env\.AUTH_SECRET/, 'eum-link 는 AUTH_SECRET 로 폴백한다');
  const authSrc = fs.readFileSync(path.join(root, 'lib', 'auth.js'), 'utf8');
  assert.match(authSrc, /AUTH_SECRET\s*\|\|\s*'/, 'auth-session 은 데모 기본값 폴백이 있다');
  const sessSrc = fs.readFileSync(path.join(root, 'lib', 'session.js'), 'utf8');
  assert.match(sessSrc, /RBAC_SESSION_SECRET\s*\|\|\s*''/, 'rbac-session 은 데모 폴백이 없다');
});

test('[통합] KNOWN_DEMO_SECRETS 가 실제 소스의 기본값과 같다', () => {
  const sources = ['lib/auth.js', 'lib/eumToken.js'].map((f) => fs.readFileSync(path.join(root, f), 'utf8')).join('\n');
  for (const s of KNOWN_DEMO_SECRETS) {
    assert.ok(sources.includes(s), `${s} 가 소스에 없다 — 목록이 낡았다`);
  }
});

test('[통합] 로그인 쿠키는 httpOnly·SameSite·운영 Secure 를 갖춘다', () => {
  const src = fs.readFileSync(path.join(root, 'app', 'api', 'auth', 'login', 'route.js'), 'utf8');
  assert.match(src, /httpOnly:\s*true/);
  assert.match(src, /sameSite:\s*'lax'/);
  assert.match(src, /secure:\s*process\.env\.NODE_ENV\s*===\s*'production'/);
  assert.match(src, /maxAge:\s*SESSION_HOURS\s*\*\s*3600/, '쿠키 수명과 토큰 수명이 같은 상수를 쓴다');
});

test('[통합] docs/TOKEN_SECURITY.md 가 명세와 양방향 일치한다', () => {
  const md = fs.readFileSync(path.join(root, 'docs', 'TOKEN_SECURITY.md'), 'utf8');
  const named = new Set([...md.matchAll(/`([a-z-]+)`/g)].map((m) => m[1]));
  for (const s of TOKEN_SPECS) assert.ok(named.has(s.name), `문서에 ${s.name} 누락`);
  // 토큰 표는 6열이다(등급 표 등 다른 표와 섞이지 않게 열 수로 구분한다).
  const rows = md.split('\n').filter((l) => /^\|\s*`[a-z-]+`/.test(l) && l.split('|').length === 8);
  const documented = rows.map((l) => (l.match(/`([a-z-]+)`/) || [])[1]).filter(Boolean);
  assert.ok(rows.length > 0, '토큰 표(6열)를 찾지 못했다');
  assert.deepEqual(documented.sort(), TOKEN_SPECS.map((s) => s.name).sort(), '문서 표와 명세가 어긋난다');
});

test('[통합] token-check CLI 는 값을 출력하지 않고 토큰을 발급하지 않는다', () => {
  const src = fs.readFileSync(path.join(root, 'scripts', 'token-check.mjs'), 'utf8');
  const code = src.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
  assert.doesNotMatch(code, /signToken|issueEumToken|signSession/, '토큰을 만들지 않는다');
  assert.doesNotMatch(code, /console\.[a-z]+\([^)]*process\.env\.[A-Z]/, '환경변수 값 출력 금지');
  assert.doesNotMatch(code, /writeFileSync|neon\s*\(/);
  assert.match(code, /process\.exit/);
});
