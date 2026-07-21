// tests/ratelimit.test.mjs — rate limit 유틸 단위 테스트 (무의존성: node:test)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hitWindow, createRateLimiter, clientIp } from '../lib/rateLimit.js';

test('hitWindow: 최초 요청은 허용되고 윈도우 생성', () => {
  const r = hitWindow(null, { now: 1000, windowMs: 60000, max: 3 });
  assert.equal(r.allowed, true);
  assert.equal(r.remaining, 2);
  assert.equal(r.state.count, 1);
  assert.equal(r.state.resetAt, 61000);
});

test('hitWindow: max 도달 전까지 허용, 초과 시 차단+retryAfter', () => {
  let s = null;
  for (let i = 0; i < 3; i++) {
    const r = hitWindow(s, { now: 1000, windowMs: 60000, max: 3 });
    assert.equal(r.allowed, true);
    s = r.state;
  }
  const blocked = hitWindow(s, { now: 1000, windowMs: 60000, max: 3 });
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.remaining, 0);
  assert.equal(blocked.retryAfterSec, 60);
});

test('hitWindow: 윈도우 만료 후 리셋', () => {
  const s = { count: 5, resetAt: 5000 };
  const r = hitWindow(s, { now: 5000, windowMs: 60000, max: 3 });
  assert.equal(r.allowed, true);
  assert.equal(r.state.count, 1);
});

test('createRateLimiter: key별 독립 카운트 · 429 경계', () => {
  const rl = createRateLimiter({ windowMs: 1000, max: 2 });
  const t = 0;
  assert.equal(rl.check('a', t).allowed, true);
  assert.equal(rl.check('a', t).allowed, true);
  assert.equal(rl.check('a', t).allowed, false);   // 초과
  assert.equal(rl.check('b', t).allowed, true);     // 다른 key는 영향 없음
});

test('createRateLimiter: reset 후 다시 허용', () => {
  const rl = createRateLimiter({ windowMs: 1000, max: 1 });
  assert.equal(rl.check('x', 0).allowed, true);
  assert.equal(rl.check('x', 0).allowed, false);
  rl.reset('x');
  assert.equal(rl.check('x', 0).allowed, true);
});

test('clientIp: x-forwarded-for 첫 IP 추출', () => {
  const req = { headers: new Map([['x-forwarded-for', '203.0.113.9, 10.0.0.1']]) };
  assert.equal(clientIp(req), '203.0.113.9');
});

test('clientIp: 헤더 없으면 unknown', () => {
  assert.equal(clientIp({ headers: new Map() }), 'unknown');
});
