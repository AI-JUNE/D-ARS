// tests/fetchonce.test.mjs — 시간 상한이 걸린 단발 요청(fetchOnce) 회귀 테스트
//
// 지키려는 선은 하나다: **응답이 오지 않는 요청은 반드시 끝난다.**
// 끝나지 않는 요청은 화면을 "처리 중" 에 영원히 가둘 뿐 아니라, 폴링 루프에서는
// 성공도 실패도 보고하지 않아 **장애 폴백이 영영 켜지지 않게** 만든다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchOnce, failureMessage, FETCH_FAILURE_MESSAGE, DEFAULT_TIMEOUT } from '../lib/fetchJson.js';

const online = { onLine: true };
const offline = { onLine: false };

// signal.abort 를 실제로 존중하는 가짜 fetch — 영원히 응답하지 않는 서버를 흉내낸다.
function hangingFetch(seen = {}) {
  return (url, init) => new Promise((resolve, reject) => {
    seen.url = url; seen.init = init;
    const sig = init && init.signal;
    if (!sig) return; // 상한이 없으면 이 약속은 영원히 미해결 — 그것이 고치려는 버그다
    sig.addEventListener('abort', () => {
      reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
    });
  });
}

test('응답 없는 서버: 상한을 넘기면 timeout 으로 끝난다(영원히 매달리지 않는다)', async () => {
  const seen = {};
  const out = await fetchOnce('/api/x', { timeout: 20, fetchImpl: hangingFetch(seen), navigatorImpl: online });
  assert.equal(out.failure, 'timeout');
  assert.equal(out.res, null);
  assert.ok(seen.init.signal, '중단 신호를 실제로 넘겨야 상한이 성립한다');
});

test('정상 응답은 Response 를 그대로 돌려준다 — 상태코드 판정은 호출부의 몫', async () => {
  const res = { ok: false, status: 409, json: async () => ({ ok: false }) };
  const out = await fetchOnce('/api/x', { fetchImpl: async () => res, navigatorImpl: online });
  assert.equal(out.failure, null, '4xx 는 실패가 아니라 "응답이 도착한 것"이다');
  assert.equal(out.res, res);
  assert.equal(out.res.status, 409);
});

test('5xx 도 실패로 뭉개지 않는다(본문 메시지를 쓰는 화면이 있다)', async () => {
  const res = { ok: false, status: 503, json: async () => ({ error: 'x' }) };
  const out = await fetchOnce('/api/x', { fetchImpl: async () => res, navigatorImpl: online });
  assert.equal(out.failure, null);
  assert.equal(out.res.status, 503);
});

test('연결 실패는 network, 우리가 끊은 것은 timeout — 둘을 섞지 않는다', async () => {
  const dead = await fetchOnce('/api/x', {
    fetchImpl: async () => { throw new TypeError('Failed to fetch'); }, navigatorImpl: online,
  });
  assert.equal(dead.failure, 'network');

  const cut = await fetchOnce('/api/x', { timeout: 10, fetchImpl: hangingFetch(), navigatorImpl: online });
  assert.equal(cut.failure, 'timeout');
});

test('바깥에서 온 AbortError 도 timeout 으로 안내한다(사용자가 할 일이 같다)', async () => {
  const out = await fetchOnce('/api/x', {
    timeout: 0,
    fetchImpl: async () => { throw Object.assign(new Error('a'), { name: 'AbortError' }); },
    navigatorImpl: online,
  });
  assert.equal(out.failure, 'timeout');
});

test('오프라인이면 네트워크를 두드리지 않는다', async () => {
  let called = 0;
  const out = await fetchOnce('/api/x', {
    fetchImpl: async () => { called += 1; return { ok: true, status: 200 }; },
    navigatorImpl: offline,
  });
  assert.equal(out.failure, 'offline');
  assert.equal(called, 0, '오프라인에서 요청을 보내면 무의미한 대기만 늘어난다');
});

test('fetch 가 없는 환경(SSR)에서도 throw 하지 않는다', async () => {
  const out = await fetchOnce('/api/x', { fetchImpl: null, navigatorImpl: online });
  assert.equal(out.failure, 'network');
});

test('응답이 null/undefined 여도 throw 하지 않는다', async () => {
  for (const bad of [null, undefined]) {
    const out = await fetchOnce('/api/x', { fetchImpl: async () => bad, navigatorImpl: online });
    assert.equal(out.failure, 'network');
    assert.equal(out.res, null);
  }
});

test('본문이 있으면 JSON 으로 직렬화하고 content-type 을 붙인다', async () => {
  const seen = {};
  await fetchOnce('/api/x', {
    method: 'POST', body: { a: 1 }, navigatorImpl: online,
    fetchImpl: async (url, init) => { Object.assign(seen, { url, init }); return { ok: true, status: 200 }; },
  });
  assert.equal(seen.init.method, 'POST');
  assert.equal(seen.init.headers['content-type'], 'application/json');
  assert.equal(seen.init.body, JSON.stringify({ a: 1 }));
});

test('본문이 없으면 content-type 을 붙이지 않는다(GET 에 본문 헤더가 붙지 않게)', async () => {
  const seen = {};
  await fetchOnce('/api/x', {
    cache: 'no-store', navigatorImpl: online,
    fetchImpl: async (url, init) => { Object.assign(seen, { init }); return { ok: true, status: 200 }; },
  });
  assert.equal(seen.init.body, undefined);
  assert.equal(seen.init.cache, 'no-store', 'cache 옵션은 그대로 전달돼야 한다');
  assert.ok(!seen.init.headers || !seen.init.headers['content-type']);
});

test('기본 상한이 있다 — timeout 을 적지 않아도 무한 대기가 되지 않는다', async () => {
  assert.ok(Number.isFinite(DEFAULT_TIMEOUT) && DEFAULT_TIMEOUT > 0, '기본 상한이 없으면 부르는 쪽이 잊는 순간 무한 대기가 된다');
  const seen = {};
  // 실제 8초를 기다리지 않는다 — 기본값으로도 **중단 신호가 걸린다**는 사실이 상한의 존재다.
  await fetchOnce('/api/x', {
    navigatorImpl: online,
    fetchImpl: async (url, init) => { seen.init = init; return { ok: true, status: 200 }; },
  });
  assert.ok(seen.init.signal, '기본값으로도 중단 신호가 걸려야 한다');
});

test('failureMessage: 모든 사유에 사용자 안내가 있고 비어 있지 않다', () => {
  for (const k of ['timeout', 'offline', 'network']) {
    assert.equal(typeof FETCH_FAILURE_MESSAGE[k], 'string');
    assert.ok(FETCH_FAILURE_MESSAGE[k].length > 0);
    assert.equal(failureMessage(k), FETCH_FAILURE_MESSAGE[k]);
  }
  // 모르는 사유가 와도 안내가 비지 않는다 — 빈 안내는 곧 "아무 일 없는 척" 이다.
  for (const bad of [null, undefined, '', 'nope', 0, {}]) {
    assert.ok(failureMessage(bad).length > 0);
  }
});

test('안내 문구에 기술 용어(AbortError·status 숫자)를 노출하지 않는다', () => {
  for (const k of Object.keys(FETCH_FAILURE_MESSAGE)) {
    const m = FETCH_FAILURE_MESSAGE[k];
    assert.ok(!/Abort|Error|fetch|HTTP|\b[45]\d\d\b/.test(m), `기술 용어 노출: ${m}`);
  }
});

test('이상 입력(url 미지정·opts 없음)에도 throw 하지 않는다', async () => {
  const out = await fetchOnce(undefined, { fetchImpl: async () => { throw new Error('x'); }, navigatorImpl: online });
  assert.equal(out.failure, 'network');
});
