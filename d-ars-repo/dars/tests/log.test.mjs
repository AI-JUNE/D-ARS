// tests/log.test.mjs — 구조화 로깅 단위 테스트 (무의존성: node:test)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  newRequestId, requestIdFrom, normalizeLogLevel, levelForStatus,
  scrubPath, normalizeDuration, normalizeCode,
  buildLogEvent, logLine, startTimer, logRequest, LOG_LEVELS,
} from '../lib/log.js';

const FIXED = new Date('2026-09-02T00:00:00.000Z');

// ── 요청 ID ────────────────────────────────────────────────────────
test('newRequestId: 매번 다르고 충분히 길다(엔트로피)', () => {
  const seen = new Set();
  for (let i = 0; i < 200; i++) {
    const id = newRequestId();
    assert.equal(typeof id, 'string');
    assert.ok(id.length >= 16, `too short: ${id}`);
    assert.equal(seen.has(id), false, `collision: ${id}`);
    seen.add(id);
  }
});

test('requestIdFrom: 상류 헤더를 이어받는다(추적 연속성)', () => {
  assert.equal(requestIdFrom({ 'x-request-id': 'abc-123' }), 'abc-123');
  assert.equal(requestIdFrom(new Headers({ 'x-correlation-id': 'corr-9' })), 'corr-9');
  assert.equal(requestIdFrom({ 'x-vercel-id': 'icn1::xyz' }), 'icn1::xyz');
});

test('requestIdFrom: x-request-id 가 x-vercel-id 보다 우선', () => {
  assert.equal(requestIdFrom({ 'x-vercel-id': 'v1', 'x-request-id': 'r1' }), 'r1');
});

test('requestIdFrom: 헤더 없으면 새로 만든다 · 공백만이면 무시', () => {
  const a = requestIdFrom(null);
  assert.ok(a && a.length >= 16);
  const b = requestIdFrom({ 'x-request-id': '   ' });
  assert.ok(b && b.length >= 16);
});

test('requestIdFrom: 64자 상한 · 깨진 헤더 객체에도 throw 없음', () => {
  const long = 'x'.repeat(300);
  assert.equal(requestIdFrom({ 'x-request-id': long }).length, 64);
  const broken = { get() { throw new Error('boom'); } };
  assert.doesNotThrow(() => requestIdFrom(broken));
  assert.ok(requestIdFrom(broken).length >= 16);
});

// ── 정규화 ─────────────────────────────────────────────────────────
test('normalizeLogLevel: 화이트리스트 밖은 info', () => {
  for (const l of LOG_LEVELS) assert.equal(normalizeLogLevel(l), l);
  assert.equal(normalizeLogLevel('fatal'), 'info');
  assert.equal(normalizeLogLevel(undefined), 'info');
});

test('levelForStatus: 5xx=error · 4xx=warn · 2xx=info', () => {
  assert.equal(levelForStatus(500), 'error');
  assert.equal(levelForStatus(503), 'error');
  assert.equal(levelForStatus(400), 'warn');
  assert.equal(levelForStatus(429), 'warn');
  assert.equal(levelForStatus(200), 'info');
  assert.equal(levelForStatus(304), 'info');
  assert.equal(levelForStatus('nope'), 'info');
});

test('scrubPath: 쿼리스트링을 통째로 버린다(PII 최대 유출 경로)', () => {
  assert.equal(scrubPath('/api/sessions?phone=010-1234-5678'), '/api/sessions');
  assert.equal(scrubPath('/api/docs/42#frag'), '/api/docs/42');
  assert.equal(scrubPath('/api/x'), '/api/x');
});

test('scrubPath: 절대 URL 은 경로만 남긴다(호스트·자격증명 제거)', () => {
  assert.equal(scrubPath('https://u:p@h.example.com/api/a?b=1'), '/api/a');
  assert.equal(scrubPath('https://h.example.com'), '/');
});

test('scrubPath: 비문자열·빈값은 빈 문자열 · 200자 상한', () => {
  assert.equal(scrubPath(null), '');
  assert.equal(scrubPath(123), '');
  assert.equal(scrubPath('/' + 'a'.repeat(500)).length, 200);
});

test('normalizeDuration: 음수·NaN 은 null · 소수는 반올림', () => {
  assert.equal(normalizeDuration(12.4), 12);
  assert.equal(normalizeDuration(12.6), 13);
  assert.equal(normalizeDuration(0), 0);
  assert.equal(normalizeDuration(-1), null);
  assert.equal(normalizeDuration('x'), null);
  assert.equal(normalizeDuration(undefined), null);
});

test('normalizeCode: 대문자·숫자·밑줄만 남긴다(집계 가능성)', () => {
  assert.equal(normalizeCode('db_timeout'), 'DB_TIMEOUT');
  assert.equal(normalizeCode('rate limited'), 'RATE_LIMITED');
  assert.equal(normalizeCode(''), null);
  assert.equal(normalizeCode(null), null);
  assert.equal(normalizeCode('x'.repeat(80)).length, 40);
});

// ── 이벤트 조립 ────────────────────────────────────────────────────
test('buildLogEvent: 고정 스키마 · 상태코드에서 레벨 파생', () => {
  const e = buildLogEvent({
    requestId: 'r1', method: 'get', path: '/api/stats?range=7d',
    status: 200, durationMs: 31, env: 'production', now: FIXED,
  });
  assert.deepEqual(Object.keys(e), [
    'ts', 'level', 'requestId', 'method', 'path', 'status', 'durationMs', 'code', 'msg', 'env',
  ]);
  assert.equal(e.ts, '2026-09-02T00:00:00.000Z');
  assert.equal(e.level, 'info');
  assert.equal(e.method, 'GET');
  assert.equal(e.path, '/api/stats');
  assert.equal(e.status, 200);
  assert.equal(e.durationMs, 31);
  assert.equal(e.code, null);
  assert.equal(e.env, 'production');
});

test('buildLogEvent: 5xx 는 error · code 정규화', () => {
  const e = buildLogEvent({ status: 500, code: 'db timeout', now: FIXED });
  assert.equal(e.level, 'error');
  assert.equal(e.code, 'DB_TIMEOUT');
});

test('buildLogEvent: 명시 level 이 상태코드 파생보다 우선', () => {
  const e = buildLogEvent({ status: 200, level: 'warn', now: FIXED });
  assert.equal(e.level, 'warn');
});

test('buildLogEvent: msg 의 PII 는 마스킹된다(전화·이메일·주민번호)', () => {
  const e = buildLogEvent({
    msg: '010-1234-5678 / a@b.com / 900101-1234567 실패', status: 500, now: FIXED,
  });
  assert.ok(!e.msg.includes('010-1234-5678'), e.msg);
  assert.ok(!e.msg.includes('a@b.com'), e.msg);
  assert.ok(!e.msg.includes('900101-1234567'), e.msg);
  assert.ok(e.msg.includes('[phone]') && e.msg.includes('[email]') && e.msg.includes('[rrn]'));
});

test('buildLogEvent: 자격증명은 마스킹된다', () => {
  const e = buildLogEvent({ msg: 'Bearer abc.def.ghi 로 호출', now: FIXED });
  assert.ok(!e.msg.includes('abc.def.ghi'), e.msg);
  assert.ok(e.msg.includes('[redacted]'));
});

test('buildLogEvent: 인자 없이도 throw 없이 기본 이벤트를 만든다', () => {
  const e = buildLogEvent();
  assert.equal(e.level, 'info');
  assert.equal(e.status, null);
  assert.equal(e.path, '');
  assert.equal(typeof e.ts, 'string');
});

test('logLine: [LOG] 접두어 + 파싱 가능한 JSON', () => {
  const e = buildLogEvent({ requestId: 'r1', status: 200, now: FIXED });
  const line = logLine(e);
  assert.ok(line.startsWith('[LOG] '));
  assert.deepEqual(JSON.parse(line.slice(6)), e);
});

// ── 타이머 ─────────────────────────────────────────────────────────
test('startTimer: 주입한 시계로 소요시간을 계산한다(결정적)', () => {
  let t = 1000;
  const timer = startTimer(() => t);
  t = 1042;
  assert.equal(timer.done(), 42);
});

// ── 기록 ───────────────────────────────────────────────────────────
test('logRequest: 레벨에 맞는 콘솔로 한 줄을 남긴다', () => {
  const orig = { log: console.log, warn: console.warn, error: console.error };
  const got = { log: [], warn: [], error: [] };
  console.log = (s) => got.log.push(s);
  console.warn = (s) => got.warn.push(s);
  console.error = (s) => got.error.push(s);
  try {
    logRequest({ requestId: 'r1', method: 'GET', path: '/a', status: 200, durationMs: 5 });
    logRequest({ requestId: 'r2', method: 'GET', path: '/b', status: 404 });
    logRequest({ requestId: 'r3', method: 'GET', path: '/c', status: 500, code: 'boom' });
  } finally {
    console.log = orig.log; console.warn = orig.warn; console.error = orig.error;
  }
  assert.equal(got.log.length, 1);
  assert.equal(got.warn.length, 1);
  assert.equal(got.error.length, 1);
  assert.ok(got.log[0].startsWith('[LOG] '));
  assert.equal(JSON.parse(got.error[0].slice(6)).code, 'BOOM');
});

test('logRequest: 순환참조 등 어떤 입력에도 throw 하지 않는다(무해화 계약)', () => {
  const orig = console.log;
  console.log = () => {};
  try {
    const circular = {};
    circular.self = circular;
    assert.doesNotThrow(() => logRequest({ path: '/x', msg: circular }));
    assert.doesNotThrow(() => logRequest());
    assert.doesNotThrow(() => logRequest(null));
  } finally {
    console.log = orig;
  }
});
