// tests/retry.test.mjs — 자동 재시도(지수 백오프)·오프라인 감지 회귀 테스트 (무의존성: node:test)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isTransientStatus, backoffDelay, isOffline, requestJSON, getJSON, postJSON,
  OFFLINE_MESSAGE, RETRY_BASE_DELAY, RETRY_MAX_DELAY,
} from '../lib/fetchJson.js';

const okRes = (data) => ({ ok: true, status: 200, json: async () => data });
const errRes = (status) => ({ ok: false, status, json: async () => ({}) });
const noSleep = async () => {};                 // 테스트는 실제로 기다리지 않는다
const offlineNav = { onLine: false };

test('isTransientStatus: 일시적 실패만 재시도 대상', () => {
  for (const s of [0, 408, 429, 500, 502, 503, 504]) assert.equal(isTransientStatus(s), true, `${s}`);
  for (const s of [200, 400, 401, 403, 404, 409, 422]) assert.equal(isTransientStatus(s), false, `${s}`);
});

test('backoffDelay: 지수 증가 + 상한 + 지터', () => {
  assert.equal(backoffDelay(0), RETRY_BASE_DELAY);
  assert.equal(backoffDelay(1), RETRY_BASE_DELAY * 2);
  assert.equal(backoffDelay(2), RETRY_BASE_DELAY * 4);
  assert.equal(backoffDelay(10), RETRY_MAX_DELAY);            // 상한 고정
  assert.equal(backoffDelay(-1), RETRY_BASE_DELAY);           // 음수 방어
  const j = backoffDelay(0, { jitter: 0.5, random: () => 1 }); // 최대 지터
  assert.equal(j, Math.round(RETRY_BASE_DELAY * 1.5));
});

test('isOffline: navigator 없으면 온라인 취급(SSR 안전)', () => {
  assert.equal(isOffline(null), false);
  assert.equal(isOffline({ onLine: true }), false);
  assert.equal(isOffline(offlineNav), true);
});

test('GET 5xx: 지수 백오프로 자동 재시도 후 마지막 오류 반환', async () => {
  let calls = 0;
  const delays = [];
  const r = await requestJSON('/api/x', {
    fetchImpl: async () => { calls++; return errRes(503); },
    sleep: async (ms) => { delays.push(ms); },
    jitter: 0,
  });
  assert.equal(calls, 3);                        // 최초 1 + 재시도 2
  assert.deepEqual(delays, [RETRY_BASE_DELAY, RETRY_BASE_DELAY * 2]); // 지수 증가
  assert.match(r.error, /서버 오류/);
  assert.equal(r.attempts, 3);
});

test('GET: 재시도 도중 성공하면 데이터 반환(콜드스타트 자동 회복)', async () => {
  let calls = 0;
  const r = await getJSON('/api/x', {
    fetchImpl: async () => { calls++; return calls < 3 ? errRes(500) : okRes([{ id: 1 }]); },
    sleep: noSleep, jitter: 0,
  });
  assert.equal(calls, 3);
  assert.equal(r.error, null);
  assert.deepEqual(r.data, [{ id: 1 }]);
});

test('GET 4xx: 재시도하지 않고 즉시 반환(무의미한 반복 방지)', async () => {
  let calls = 0;
  const r = await getJSON('/api/x', { fetchImpl: async () => { calls++; return errRes(403); }, sleep: noSleep });
  assert.equal(calls, 1);
  assert.match(r.error, /권한/);
});

test('네트워크 예외(status 0)도 재시도 대상', async () => {
  let calls = 0;
  const r = await getJSON('/api/x', {
    fetchImpl: async () => { calls++; throw new Error('down'); },
    sleep: noSleep, jitter: 0,
  });
  assert.equal(calls, 3);
  assert.match(r.error, /네트워크/);
});

test('쓰기(POST)는 기본 재시도 0 — 중복 전송(문자·세션) 방지', async () => {
  let calls = 0;
  const r = await postJSON('/api/ums', { to: '010-0000-0000' }, {
    fetchImpl: async () => { calls++; return errRes(500); },
    sleep: noSleep,
  });
  assert.equal(calls, 1);
  assert.match(r.error, /서버 오류/);
});

test('응답 형식 오류(2xx + JSON 파싱 실패)는 재시도하지 않음', async () => {
  let calls = 0;
  const bad = { ok: true, status: 200, json: async () => { throw new Error('not json'); } };
  const r = await getJSON('/api/x', { fetchImpl: async () => { calls++; return bad; }, sleep: noSleep });
  assert.equal(calls, 1);
  assert.match(r.error, /응답 형식/);
});

test('오프라인이면 네트워크를 두드리지 않고 즉시 안내', async () => {
  let calls = 0;
  const r = await getJSON('/api/x', {
    fetchImpl: async () => { calls++; return okRes([]); },
    navigatorImpl: offlineNav, sleep: noSleep,
  });
  assert.equal(calls, 0);
  assert.equal(r.offline, true);
  assert.equal(r.error, OFFLINE_MESSAGE);
});

test('onRetry 콜백: 재시도 횟수를 호출부에 알림', async () => {
  const seen = [];
  await getJSON('/api/x', {
    fetchImpl: async () => errRes(500),
    sleep: noSleep, jitter: 0,
    onRetry: (n) => seen.push(n),
  });
  assert.deepEqual(seen, [1, 2]);
});

test('retries 옵션으로 재시도 횟수 제어 가능', async () => {
  let calls = 0;
  await getJSON('/api/x', { fetchImpl: async () => { calls++; return errRes(500); }, retries: 0, sleep: noSleep });
  assert.equal(calls, 1);
  calls = 0;
  await postJSON('/api/x', {}, { fetchImpl: async () => { calls++; return errRes(500); }, retries: 3, sleep: noSleep, jitter: 0 });
  assert.equal(calls, 4);
});
