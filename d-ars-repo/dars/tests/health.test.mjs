// tests/health.test.mjs — 헬스체크 응답 구성 단위 테스트 (무의존성: node:test)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildHealth } from '../lib/health.js';

const FIXED = new Date('2026-07-09T00:00:00.000Z');

test('connected: ok=true, 200, 지연·커밋·환경 포함', () => {
  const { body, status } = buildHealth({
    dbStatus: 'connected', latencyMs: 12, commit: 'abc1234', env: 'production', now: FIXED,
  });
  assert.equal(status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.db, 'connected');
  assert.equal(body.dbLatencyMs, 12);
  assert.equal(body.commit, 'abc1234');
  assert.equal(body.env, 'production');
  assert.equal(body.ts, '2026-07-09T00:00:00.000Z');
});

test('demo-fallback: ok=true, 200, 지연 미포함(하위호환)', () => {
  const { body, status } = buildHealth({ dbStatus: 'demo-fallback', now: FIXED });
  assert.equal(status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.db, 'demo-fallback');
  assert.equal('dbLatencyMs' in body, false);
});

test('error: ok=false, 503 (업타임 모니터 감지)', () => {
  const { body, status } = buildHealth({ dbStatus: 'error', now: FIXED });
  assert.equal(status, 503);
  assert.equal(body.ok, false);
  assert.equal(body.db, 'error');
});

test('기본값: commit/env 누락 시 null·unknown', () => {
  const { body } = buildHealth({ dbStatus: 'demo-fallback', now: FIXED });
  assert.equal(body.commit, null);
  assert.equal(body.env, 'unknown');
});

test('latencyMs=0 도 포함(falsy 값 누락 방지)', () => {
  const { body } = buildHealth({ dbStatus: 'connected', latencyMs: 0, now: FIXED });
  assert.equal(body.dbLatencyMs, 0);
});
