// tests/monitor.test.mjs — 전역 에러 캡처/알림 훅 회귀 테스트
// 핵심 계약 3가지를 고정한다:
//   1) PII·자격증명은 어떤 경로로도 원문이 남지 않는다.
//   2) MONITOR_DSN 미설정이면 외부 통신이 **한 번도** 일어나지 않는다(no-op).
//   3) captureError 는 어떤 입력에도 throw 하지 않는다.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MONITOR_LEVELS, DEFAULT_THROTTLE_MS,
  scrubText, scrubContext, errorShape, normalizeLevel,
  buildEvent, fingerprint, shouldSend, monitorLine, isMonitorEnabled, captureError,
} from '../lib/monitor.js';

// 콘솔을 잠시 가로채 출력 줄을 수집한다(테스트 로그 오염 방지 겸용).
function captureConsole(fn) {
  const lines = [];
  const orig = console.error;
  console.error = (...a) => lines.push(a.join(' '));
  try { return { lines, ret: fn(lines) }; }
  finally { console.error = orig; }
}

test('scrubText — 전화·이메일·주민번호·카드번호를 마스킹한다', () => {
  assert.equal(scrubText('연락처 010-1234-5678 확인'), '연락처 [phone] 확인');
  assert.equal(scrubText('01012345678'), '[phone]');
  assert.equal(scrubText('02-123-4567'), '[phone]');
  assert.equal(scrubText('user.name+tag@example.co.kr 에게'), '[email] 에게');
  assert.equal(scrubText('900101-1234567'), '[rrn]');
  assert.equal(scrubText('4111 1111 1111 1111'), '[card]');
});

test('scrubText — 자격증명(bearer·key=·password=)을 마스킹한다', () => {
  assert.equal(scrubText('Authorization: Bearer abc.def-123'), 'Authorization: Bearer [redacted]');
  assert.equal(scrubText('api_key=sk_live_9f8e7d'), 'api_key=[redacted]');
  assert.equal(scrubText('password: hunter2'), 'password=[redacted]');
  assert.equal(scrubText('token=eyJhbGciOi&next=1'), 'token=[redacted]&next=1');
});

test('scrubText — 이상 입력·길이 상한', () => {
  assert.equal(scrubText(null), '');
  assert.equal(scrubText(undefined), '');
  assert.equal(scrubText(123), '');
  assert.equal(scrubText(''), '');
  assert.equal(scrubText('가'.repeat(500)).length, 300);
  assert.equal(scrubText('abcdef', 3), 'abc');
});

test('scrubContext — 평면 원시값만·키 8개 상한·문자열도 마스킹', () => {
  assert.deepEqual(scrubContext({ route: '/api/sessions', ms: 12, ok: false }),
    { route: '/api/sessions', ms: 12, ok: false });
  assert.deepEqual(scrubContext({ who: 'a@b.com' }), { who: '[email]' });
  assert.deepEqual(scrubContext({ nested: { a: 1 }, fn: () => {}, nil: null }), {});
  const many = {};
  for (let i = 0; i < 20; i++) many['k' + i] = i;
  assert.equal(Object.keys(scrubContext(many)).length, 8);
  assert.deepEqual(scrubContext(null), {});
  assert.deepEqual(scrubContext([1, 2]), {});
  assert.deepEqual(scrubContext('x'), {});
});

test('errorShape — 스택은 절대 포함하지 않는다', () => {
  const e = new TypeError('전화 010-1234-5678 조회 실패');
  const shape = errorShape(e);
  assert.deepEqual(shape, { name: 'TypeError', message: '전화 [phone] 조회 실패' });
  assert.equal('stack' in shape, false);
  assert.deepEqual(errorShape('문자열 오류'), { name: 'Error', message: '문자열 오류' });
  assert.deepEqual(errorShape({ name: 'DbError', message: 'timeout' }), { name: 'DbError', message: 'timeout' });
  assert.deepEqual(errorShape(null), { name: 'Error', message: '' });
  assert.deepEqual(errorShape(42), { name: 'Error', message: '' });
});

test('normalizeLevel — 화이트리스트 밖은 error 로 정규화', () => {
  assert.deepEqual(MONITOR_LEVELS, ['fatal', 'error', 'warn']);
  for (const l of MONITOR_LEVELS) assert.equal(normalizeLevel(l), l);
  assert.equal(normalizeLevel('debug'), 'error');
  assert.equal(normalizeLevel(undefined), 'error');
  assert.equal(normalizeLevel(null), 'error');
});

test('buildEvent — 평면 이벤트 구성(ts 주입으로 결정적)', () => {
  const now = new Date('2026-09-01T00:00:00.000Z');
  const ev = buildEvent({
    err: new Error('probe failed for a@b.com'),
    level: 'fatal', source: 'api/health', requestId: 'req-1',
    env: 'production', commit: 'abc1234', context: { route: '/api/health' }, now,
  });
  assert.deepEqual(ev, {
    ts: '2026-09-01T00:00:00.000Z',
    level: 'fatal',
    source: 'api/health',
    name: 'Error',
    message: 'probe failed for [email]',
    requestId: 'req-1',
    env: 'production',
    commit: 'abc1234',
    context: { route: '/api/health' },
  });
});

test('buildEvent — 인자 없이도 안전한 기본값', () => {
  const ev = buildEvent();
  assert.equal(ev.level, 'error');
  assert.equal(ev.source, 'server');
  assert.equal(ev.requestId, null);
  assert.equal(ev.commit, null);
  assert.deepEqual(ev.context, {});
  assert.equal(typeof ev.ts, 'string');
});

test('fingerprint — 숫자만 다른 메시지는 같은 지문으로 묶인다', () => {
  const a = buildEvent({ err: new Error('timeout after 1200ms'), source: 'db' });
  const b = buildEvent({ err: new Error('timeout after 3400ms'), source: 'db' });
  const c = buildEvent({ err: new Error('timeout after 1200ms'), source: 'ums' });
  assert.equal(fingerprint(a), fingerprint(b));
  assert.notEqual(fingerprint(a), fingerprint(c));
  assert.equal(typeof fingerprint({}), 'string');
  assert.equal(typeof fingerprint(null), 'string');
});

test('shouldSend — 창 안 중복은 생략, 창을 넘기면 재전송', () => {
  const st = new Map();
  assert.equal(shouldSend(st, 'k', 0, 1000), true);
  assert.equal(shouldSend(st, 'k', 500, 1000), false);
  assert.equal(shouldSend(st, 'k', 1000, 1000), true);
  assert.equal(shouldSend(st, 'other', 1000, 1000), true);
  // 상태 맵이 아니면 막지 않는다(보수적: 알림 유실보다 중복이 낫다)
  assert.equal(shouldSend(null, 'k', 0, 1000), true);
  assert.equal(shouldSend(new Map(), 42, 0, 1000), true);
  assert.equal(DEFAULT_THROTTLE_MS, 60000);
});

test('monitorLine — [MONITOR] 접두어 + 파싱 가능한 JSON 한 줄', () => {
  const ev = buildEvent({ err: new Error('boom'), now: new Date('2026-09-01T00:00:00.000Z') });
  const line = monitorLine(ev);
  assert.equal(line.startsWith('[MONITOR] '), true);
  assert.equal(line.includes('\n'), false);
  assert.deepEqual(JSON.parse(line.slice('[MONITOR] '.length)), ev);
});

test('isMonitorEnabled — https DSN 이 있을 때만 활성(기본 OFF)', () => {
  assert.equal(isMonitorEnabled({}), false);
  assert.equal(isMonitorEnabled({ MONITOR_DSN: '' }), false);
  assert.equal(isMonitorEnabled({ MONITOR_DSN: '   ' }), false);
  assert.equal(isMonitorEnabled({ MONITOR_DSN: 'http://insecure.example' }), false);
  assert.equal(isMonitorEnabled({ MONITOR_DSN: 'not-a-url' }), false);
  assert.equal(isMonitorEnabled({ MONITOR_DSN: ' https://collector.example/hook ' }), true);
  assert.equal(isMonitorEnabled(null), false);
  assert.equal(isMonitorEnabled(undefined), false); // 실환경 process.env 에 DSN 미설정
});

test('captureError — DSN 미설정이면 fetch 를 호출하지 않는다(no-op 계약)', async () => {
  const prev = process.env.MONITOR_DSN;
  delete process.env.MONITOR_DSN;
  const origFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls++; return new Response('', { status: 200 }); };
  const { lines } = captureConsole(() => {});
  const orig = console.error;
  console.error = (...a) => lines.push(a.join(' '));
  try {
    const ok = await captureError(new Error('DB 연결 실패 010-1234-5678'), { source: 'db' });
    assert.equal(ok, true);
    assert.equal(calls, 0);                                   // 외부 통신 없음
    assert.equal(lines.length, 1);
    assert.equal(lines[0].startsWith('[MONITOR] '), true);
    assert.equal(lines[0].includes('010-1234-5678'), false);  // PII 원문 미기록
    assert.equal(lines[0].includes('[phone]'), true);
  } finally {
    console.error = orig;
    globalThis.fetch = origFetch;
    if (prev !== undefined) process.env.MONITOR_DSN = prev;
  }
});

test('captureError — 어떤 입력에도 throw 하지 않는다', async () => {
  const orig = console.error;
  console.error = () => {};
  try {
    for (const bad of [null, undefined, 0, '', [], { toString() { throw new Error('x'); } }]) {
      await assert.doesNotReject(() => captureError(bad));
    }
    await assert.doesNotReject(() => captureError(new Error('x'), { level: 'nope', source: 123 }));
  } finally {
    console.error = orig;
  }
});
