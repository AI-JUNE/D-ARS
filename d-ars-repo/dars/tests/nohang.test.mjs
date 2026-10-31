// tests/nohang.test.mjs — "응답 없는 요청은 반드시 끝난다" 회귀 테스트
//
// 고친 결함(이번 회차): 클라이언트 화면의 요청이 전부 **상한 없는 맨 fetch** 였다.
// 연결은 살아 있는데 서버가 응답하지 않는 상태(모바일 음영·서버리스 콜드스타트)에서
// 맨 fetch 는 성공도 실패도 하지 않고 영원히 매달린다. 그 결과:
//   ① 「이음 어르신 신청」 제출 단추가 disabled 인 채 "신청하는 중…" 에서 멈추고,
//      그 사이 5분 만료가 지나 링크까지 죽는다 — 어르신에게는 아무 안내도 없다.
//   ② 고객 화면 /visual 의 상태 폴링은 **연속 실패 카운터를 올리지 않아** 장애 폴백
//      (SCREEN_LOST_MESSAGE)이 영영 켜지지 않는다. "응답 없음"이 "무장애"가 된다.
//   ③ 로그인·로그아웃 단추가 눌러도 아무 일 없는 것처럼 보인다.
// ②가 특히 중요하다 — docs/IVR_FALLBACK.md 가 막는다고 적어 둔 바로 그 사고였다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { fetchOnce } from '../lib/fetchJson.js';
import {
  pollInitial, pollNext, SCREEN_LOST_AFTER,
  SCREEN_POLL_INTERVAL_MS, SCREEN_POLL_TIMEOUT_MS,
  RELAY_BUDGET_MS, RELAY_MAX_ATTEMPTS, RELAY_RETRY_BASE_MS, RELAY_TIMEOUT_MS, relayWorstCaseMs,
} from '../lib/ivrFallback.js';
import { stripSourceComments } from '../lib/sourceLint.js';

// 아웃바운드 경로는 **http 프로바이더에서만** 돈다(mock 은 콘솔 출력으로 끝난다). `PROVIDER` 는
// 모듈 평가 시점에 고정되므로 환경을 먼저 세우고 **그 뒤에** 불러온다.
process.env.CPAAS_PROVIDER = 'http';
process.env.SMS_GATEWAY_URL = 'https://sms.internal.example/send';
process.env.CALLBOT_CALLBACK_URL = 'https://callbot.internal.example/relay';
const cpaas = await import('../lib/cpaas/index.js');

const root = fileURLToPath(new URL('../', import.meta.url));
const read = (rel) => readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');

// ── 1. 폴링 상한과 주기의 관계 ────────────────────────────────────────────────

test('요청 상한이 폴링 주기보다 짧다 — 멈춘 요청이 다음 폴링 전에 실패로 확정된다', () => {
  assert.ok(SCREEN_POLL_TIMEOUT_MS > 0, '상한이 없으면 멈춘 폴링이 실패로 세어지지 않는다');
  assert.ok(
    SCREEN_POLL_TIMEOUT_MS < SCREEN_POLL_INTERVAL_MS,
    '상한이 주기보다 길면 응답 없는 요청이 겹겹이 쌓이고 판정이 뒤로 밀린다',
  );
});

test('선언한 감지 시간이 실제 상수의 곱과 맞는다(문서가 코드보다 앞서지 않게)', () => {
  // docs/IVR_FALLBACK.md 와 lib 주석이 말하는 "연속 4회 ≈ 10초".
  assert.equal(SCREEN_LOST_AFTER * SCREEN_POLL_INTERVAL_MS, 10000);
});

// ── 2. 행동 회귀: 응답 없는 서버에서 폴백이 실제로 켜지는가 ───────────────────

// signal.abort 를 존중하는, 영원히 응답하지 않는 가짜 서버.
const hangingFetch = () => (url, init) => new Promise((resolve, reject) => {
  const sig = init && init.signal;
  if (!sig) return;                       // 상한이 없으면 이 약속은 영영 미해결이다
  sig.addEventListener('abort', () => reject(Object.assign(new Error('a'), { name: 'AbortError' })));
});

// ── 고친 결함: 멈추는 자리가 **머리 뒤에도** 있었다 ─────────────────────────────
// 위 가짜 서버는 응답 **머리**조차 주지 않는 경우다. 실제로 더 흔한 것은 머리는 오고
// **본문이 흘러오지 않는** 경우다(프록시·콜드스타트·모바일 음영). `fetch` 는 머리가 오면
// resolve 하므로 그때 `fetchOnce` 의 상한은 이미 풀려 있었고, 폴링 한 바퀴는 그 뒤의
// `await r.json()` 에서 멈췄다 — `pollNext` 를 **한 번도 부르지 않으므로** 연속 실패가
// 쌓이지 않고 끊김 안내가 영영 뜨지 않는다. 그리고 이 파일의 아래 테스트가 고정해 온
// 「상한 < 주기 → 겹겹이 쌓이지 않는다」도 그 경로에서는 참이 아니었다(매 주기 하나씩 쌓인다).
// 이 가짜 서버가 그 경로다.
const headersOnlyFetch = () => (url, init) => Promise.resolve({
  ok: true,
  status: 200,
  json: () => new Promise((resolve, reject) => {
    const sig = init && init.signal;
    if (!sig) return;                     // 상한이 본문까지 덮지 않으면 영영 미해결이다
    sig.addEventListener('abort', () => reject(Object.assign(new Error('a'), { name: 'AbortError' })));
  }),
});

// /visual 폴링 한 바퀴를 그대로 옮긴 것(화면 렌더 없이 판정 부분만).
// 본문까지 함께 받는다 — 화면이 하는 일과 같아야 재현이 성립한다(옛 판본은 본문을 읽지
// 않아, 정작 멈추는 자리를 지나가며 통과했다).
async function pollOnce(state, opts) {
  const { failure, res, data } = await fetchOnce('/api/visual/state?s=x', {
    cache: 'no-store', json: true, navigatorImpl: { onLine: true }, ...opts,
  });
  return pollNext(state, !failure && !!res && res.ok && !!data && data.ok === true);
}

test('응답 없는 서버: 상한이 있으면 연속 실패가 쌓여 화면 끊김 안내가 켜진다', async () => {
  let state = pollInitial();
  for (let i = 0; i < SCREEN_LOST_AFTER; i++) {
    state = await pollOnce(state, { timeout: 10, fetchImpl: hangingFetch() });
    assert.equal(state.lost, i + 1 >= SCREEN_LOST_AFTER, `${i + 1}회차 판정`);
  }
  assert.equal(state.lost, true, '응답이 오지 않는데도 끊김을 알리지 못하면 고객은 멈춘 화면에 남는다');
  assert.equal(state.fails, SCREEN_LOST_AFTER);
});

test('상한이 없으면 폴링이 끝나지 않는다 — 고친 결함을 그대로 재현해 둔다', async () => {
  // timeout:0 = 상한 없음(예전 맨 fetch 와 같은 상태). 폴링 한 바퀴가 **끝나지 않으므로**
  // pollNext 는 한 번도 불리지 않고 lost 는 영원히 false 다.
  let settled = false;
  pollOnce(pollInitial(), { timeout: 0, fetchImpl: hangingFetch() }).then(() => { settled = true; });
  await new Promise((r) => setTimeout(r, 60));
  assert.equal(settled, false, '상한 없는 요청은 성공도 실패도 보고하지 않는다 — 그래서 상한이 필요하다');
});

test('성공 응답 한 번으로 즉시 복구된다(일시적 지터를 장애로 굳히지 않는다)', async () => {
  let state = pollInitial();
  state = await pollOnce(state, { timeout: 10, fetchImpl: hangingFetch() });
  state = await pollOnce(state, {
    fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ ok: true, node: 'n1' }) }),
  });
  assert.deepEqual(state, { fails: 0, lost: false });
});

test('머리만 오고 본문이 멈춘 서버: 그래도 연속 실패가 쌓여 끊김 안내가 켜진다', async () => {
  let state = pollInitial();
  for (let i = 0; i < SCREEN_LOST_AFTER; i++) {
    state = await pollOnce(state, { timeout: 10, fetchImpl: headersOnlyFetch() });
    assert.equal(state.lost, i + 1 >= SCREEN_LOST_AFTER, `${i + 1}회차 판정`);
  }
  assert.equal(state.lost, true,
    '머리만 받고 본문에서 멈춌는데 끊김을 알리지 못하면 고객은 멈춌 화면에 남는다');
});

test('본문이 멈추면 한 바퀴가 아예 끝나지 않는다 — 고친 결함을 그대로 재현해 둔다', async () => {
  // timeout:0 = 상한 없음(= 본문 읽기가 상한 밖이던 예전 상태). `pollNext` 는 한 번도
  // 불리지 않고, 매 주기마다 끝나지 않는 요청이 하나씩 쌓인다.
  let settled = false;
  pollOnce(pollInitial(), { timeout: 0, fetchImpl: headersOnlyFetch() }).then(() => { settled = true; });
  await new Promise((r) => setTimeout(r, 60));
  assert.equal(settled, false, '본문에 상한이 없으면 응답 없음이 무장애로 취급된다');
});

// ── 3. 소스 불변식: 상한 없는 맨 fetch 가 화면에 다시 들어오지 못하게 ─────────

// app/ 아래 모든 클라이언트 화면(.jsx)을 모은다.
function jsxFiles(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = `${dir}/${name}`;
    if (statSync(p).isDirectory()) jsxFiles(p, out);
    else if (name.endsWith('.jsx')) out.push(p.slice(root.length).replace(/\\/g, '/'));
  }
  return out;
}

// 주석·문자열 안의 'fetch(' 는 불변식이 아니다 — 주석을 먼저 걷어낸다.
// 걷어내기는 **한 곳**에서 가져온다(lib/sourceLint) — 이 파일의 판본은 앞을 보지 않는
// `//.*$` 여서 주소의 `//` 에서 줄을 끊었고(그 뒤의 `fetch(` 를 못 본다) **블록 주석은 아예
// 걷어내지 않았다**(그 안의 `fetch(` 를 위반으로 센다). 같은 함수가 테스트 파일 일곱 자리에
// 판본 셋으로 갈려 있던 자리다 · 25회차.
const stripLineComments = stripSourceComments;

test('화면(app/**/*.jsx)에 상한 없는 맨 fetch 가 없다', () => {
  const offenders = [];
  for (const rel of jsxFiles(`${root}app`)) {
    const src = stripLineComments(read(rel));
    // fetchOnce/getJSON/postJSON 등 상한이 걸린 호출은 `fetch(` 패턴에 걸리지 않는다.
    for (const m of src.matchAll(/(^|[^\w.])fetch\s*\(/g)) {
      offenders.push(`${rel}:${src.slice(0, m.index).split('\n').length}`);
    }
  }
  assert.deepEqual(
    offenders, [],
    `상한 없는 fetch 는 화면을 "처리 중" 에 영원히 가둔다. lib/fetchJson 의 fetchOnce·getJSON·postJSON 를 쓸 것: ${offenders.join(', ')}`,
  );
});

test('상한이 필요한 화면 세 곳이 실제로 상한 있는 호출을 쓴다', () => {
  const cases = [
    ['app/eum/senior/[token]/SeniorFlow.jsx', /fetchOnce\(\s*'\/api\/eum\/senior\/preferences'/],
    ['app/login/page.jsx', /fetchOnce\(\s*'\/api\/auth\/login'/],
    ['app/visual/page.jsx', /fetchOnce\(/],
  ];
  for (const [rel, re] of cases) assert.match(read(rel), re, `${rel} 에 상한 있는 호출이 없다`);
});

// ── 고친 결함: 가드가 **요청**만 보고 **본문**은 보지 않았다 ──────────────────────
//
// 위 대조는 화면 소스에서 맨 `fetch(` 를 찾는다. 그런데 멈추는 자리는 하나가 더 있었다 —
// 응답이 도착한 **뒤** 호출측이 손으로 하는 `await res.json()` 이다. `fetchOnce` 는 상한
// 타이머를 `finally` 에서 껐으므로(머리가 오면 resolve 한다) 그 본문 읽기에는 아무 상한도
// 걸려 있지 않았고, 세 화면이 모두 그렇게 읽고 있었다. 이 파일의 이름이 「응답 없는 요청은
// 반드시 끝난다」인데 그 뒤의 한 걸음은 아무도 보지 않은 셈이다(아래 로그인 대조는 그
// 상한 없는 한 줄을 **리터럴로 고정**하고 있었다 — 결함을 고정하는 테스트였다).
//
// 그래서 본문 읽기는 `fetchOnce` 안(= 상한 안)에서만 일어나게 하고, 화면이 직접 읽는 길을
// 막는다. 예외 목록은 두지 않는다 — 읽어야 하면 `json: true` 를 켜면 된다.
test('화면(app/**/*.jsx)이 응답 본문을 직접 읽지 않는다(상한 밖에서 멈추지 않게)', () => {
  const offenders = [];
  for (const rel of jsxFiles(`${root}app`)) {
    const src = stripLineComments(read(rel));
    for (const m of src.matchAll(/\.(json|text|arrayBuffer|blob)\s*\(\s*\)/g)) {
      // JSON.stringify/parse 같은 호출은 인자가 있어 위 패턴(빈 괄호)에 걸리지 않는다.
      offenders.push(`${rel}:${src.slice(0, m.index).split('\n').length} ${m[1]}()`);
    }
  }
  assert.deepEqual(
    offenders, [],
    `본문 읽기는 상한 안(fetchOnce 의 json:true)에서 해야 한다. 상한 밖의 본문 읽기는 화면을 "처리 중" 에 영원히 가둔다: ${offenders.join(', ')}`,
  );
});

test('본문을 쓰는 화면 세 곳이 상한 안에서 받는다(json:true)', () => {
  const cases = [
    ['app/eum/senior/[token]/SeniorFlow.jsx', '제출 409 의 「먼저 접수된 선택」'],
    ['app/login/page.jsx', '로그인 실패 사유'],
    ['app/visual/page.jsx', '콜봇이 밀어 준 노드'],
  ];
  for (const [rel, why] of cases) {
    const src = stripLineComments(read(rel));
    assert.match(src, /json:\s*true/, `${rel}: ${why} 을 상한 밖에서 읽는다`);
  }
});

test('/visual 폴링은 주기·상한을 lib/ivrFallback 상수에서 가져온다(하드코딩 금지)', () => {
  const src = read('app/visual/page.jsx');
  assert.match(src, /SCREEN_POLL_TIMEOUT_MS/, '상한을 넘기지 않으면 기본값이 주기보다 길어 판정이 밀린다');
  assert.match(src, /setInterval\(poll, SCREEN_POLL_INTERVAL_MS\)/);
  assert.equal(/setInterval\(poll,\s*\d/.test(src), false, '주기를 숫자로 다시 적으면 두 값이 따로 논다');
});

// ── 4. 실패했을 때 사용자가 무엇을 볼 것인가 ─────────────────────────────────

test('제출 실패를 삼키지 않는다 — 오프라인과 지연을 나눠 안내한다', () => {
  const flow = read('app/eum/senior/[token]/SeniorFlow.jsx');
  const submit = flow.slice(flow.indexOf('async function submit'));
  assert.match(submit, /if \(failure\)/, '실패 분기가 없으면 성공처럼 보인다');
  assert.match(submit, /failure === 'offline'/);
  assert.match(submit, /setError\(/);
  // 어르신 화면이다 — 기술 용어(timeout·AbortError·상태코드 숫자)를 노출하지 않는다.
  assert.equal(/timeout|AbortError|Abort/.test(submit.split('if (failure)')[1].slice(0, 400)), false);
});

test('로그인: 응답이 JSON 이 아니어도 연결 탓으로 잘못 안내하지 않는다', () => {
  const src = read('app/login/page.jsx');
  // 예전에는 res.json() 의 예외가 catch 로 흘러 "네트워크 오류" 라고 안내됐다(연결은 멀쩡했는데도).
  //
  // 정정: 그 뒤로 이 대조는 상한 **밖**의 본문 읽기 한 줄을 리터럴로 고정하고 있었다
  // (`try { d = await res.json(); } catch { d = null; }`) — 게이트웨이가 머리만 보내고 본문을
  // 흘리지 않으면 버튼이 "확인 중…" 에서 영영 멈추는 자리다. 지금은 본문을 상한 안에서 받고
  // (`json: true`), 지켜야 할 선은 **안내가 갈리는 방식**이라 그것만 본다.
  assert.match(src, /data: d \} = await fetchOnce/, '본문을 상한 안에서 받지 않는다');
  assert.match(src, /if \(!d \|\| !d\.ok\)/, 'JSON 이 아닌 응답(d=null)을 받아 내는 갈림이 없다');
  assert.match(src, /res\.status >= 500/, '서버 오류와 자격 증명 실패를 구분해 안내한다');
});

test('로그아웃은 서버가 응답하지 않아도 로그인 화면으로 간다', () => {
  const src = read('app/(portal)/layout.jsx');
  const line = src.split('\n').find((l) => l.includes('const logout'));
  assert.ok(line && /fetchOnce\(/.test(line), '상한 없는 로그아웃은 눌러도 아무 일 없는 것처럼 보인다');
  assert.match(line, /window\.location\.href = '\/login'/);
});

// ── 5. 우리가 **바깥으로** 거는 요청도 반드시 끝난다 ─────────────────────────
//
// 고친 결함: 위 네 묶음은 전부 **화면**이 거는 요청을 본다(`app/**/*.jsx`). 그런데 장애 폴백
// 계약의 판정(`decideInbound`·`decideRelay`)이 읽는 값은 **서버가 제3자에게 건 요청의 결과**이고
// (`lib/cpaas.sendSms`·`notifyCallbot`), 그 둘에는 시간 상한이 한 줄도 없었다 — 상한이 가장
// 필요한 자리(바깥으로 나가는 요청)가 이 파일의 어느 대조에도 들어 있지 않았던 것이다.
// 멈추면 판정이 **한 번도 불리지 않고** `fallback` 봉투를 실은 응답이 아예 나가지 않는다
// (lib/ivrFallback 의 RELAY_TIMEOUT_MS 주석 · docs/IVR_FALLBACK.md).

// 응답 머리조차 주지 않는 가짜 게이트웨이. 상한이 없으면(= signal 이 없으면) 이 약속은 영영
// 미해결이고, 아래 테스트는 **끝나지 않는다** — 고침 전 코드에서 그대로 멈추는 재현이다.
const hangingGateway = () => (url, init) => new Promise((resolve, reject) => {
  const sig = init && init.signal;
  if (!sig) return;
  sig.addEventListener('abort', () => reject(Object.assign(new Error('a'), { name: 'AbortError' })));
});

test('멈추는 SMS 게이트웨이: sendSms 가 상한 안에서 timeout 으로 끝난다', async () => {
  const r = await cpaas.sendSms('01000000000', '링크', { fetchImpl: hangingGateway(), timeoutMs: 20 });
  assert.deepEqual(r.ok, false, '멈춌 게이트웨이가 성공으로 보이면 콜봇은 「화면을 보세요」를 말한다');
  assert.equal(r.reason, 'timeout', '우리가 끊은 것과 연결 실패를 나눠 말한다');
});

test('멈추는 콜봇 콜백: notifyCallbot 이 재시도를 소진하고 failed 로 끝난다', async () => {
  const slept = [];
  const r = await cpaas.notifyCallbot({ sessionId: 'VS-1' }, {
    fetchImpl: hangingGateway(), timeoutMs: 20, sleep: (ms) => { slept.push(ms); return Promise.resolve(); },
  });
  assert.equal(r.failed, true, '소진을 성공으로 위장하지 않는다(decideRelay 가 RELAY_FAILED 로 받는다)');
  assert.equal(r.attempts, RELAY_MAX_ATTEMPTS);
  assert.equal(r.reason, 'timeout');
  // 백오프는 종전 거동 그대로(0.2s, 0.4s) — 이번에 바뀐 것은 「끝나지 않을 수 있다」뿐이다.
  assert.deepEqual(slept, [RELAY_RETRY_BASE_MS, RELAY_RETRY_BASE_MS * 2]);
});

test('릴레이 최악 소요가 서버리스 예산 안에 든다 — 백오프만 세던 셈을 바로잡는다', () => {
  assert.ok(RELAY_TIMEOUT_MS > 0, '상한이 없으면 판정이 아예 일어나지 않는다');
  // 예전 주석의 셈("0.2s,0.4s")은 요청 시간을 세지 않아 요청 하나가 멈추면 통째로 거짓이 됐다.
  const backoffOnly = RELAY_RETRY_BASE_MS + RELAY_RETRY_BASE_MS * 2;
  assert.equal(relayWorstCaseMs(), RELAY_MAX_ATTEMPTS * RELAY_TIMEOUT_MS + backoffOnly);
  assert.ok(relayWorstCaseMs() > backoffOnly, '요청 시간을 세지 않으면 이 셈은 의미가 없다');
  assert.ok(
    relayWorstCaseMs() <= RELAY_BUDGET_MS,
    `최악 소요 ${relayWorstCaseMs()}ms 가 예산 ${RELAY_BUDGET_MS}ms 를 넘으면 플랫폼이 함수를 먼저 끊고 콜봇은 봉투를 받지 못한다`,
  );
  // 이상 입력에도 던지지 않는다(판정 모듈의 공통 계약).
  assert.equal(relayWorstCaseMs(0, 1000, 100), 1000);
  assert.equal(relayWorstCaseMs(1, 1000, 100), 1000);
  assert.equal(relayWorstCaseMs('x', NaN, null), 0);
});

// ── 서버 쪽 아웃바운드 호출 **자리 목록을 소스에서 파생**한다 ────────────────
//
// 사유만 사람이 적고 목록은 긁는다 — 손으로 적는 목록은 다음 호출이 늘어나는 날 조용히 빠진다
// (31회차가 문구 등록부에서 고친 것과 같은 계약). 새 자리가 생기면 등록할 때까지 실패한다.
const OUTBOUND_SITES = {
  'lib/cpaas/index.js': 'SMS 발송·콜봇 콜백 — 상한은 lib/ivrFallback.RELAY_TIMEOUT_MS (postJson)',
  'lib/monitor.js': '오류 수집기 전송 — 2초 상한(deliver · DSN 설정 시에만 돈다)',
};

function jsFiles(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = `${dir}/${name}`;
    if (statSync(p).isDirectory()) jsFiles(p, out);
    else if (name.endsWith('.js')) out.push(p.slice(root.length).replace(/\\/g, '/'));
  }
  return out;
}

test('서버가 바깥으로 거는 요청은 전부 등록되고, 그 자리에 상한이 있다', () => {
  const found = [];
  for (const rel of [...jsFiles(`${root}lib`), ...jsFiles(`${root}app`)]) {
    const src = stripSourceComments(read(rel));
    if (/(^|[^\w.])fetch\s*\(/.test(src)) found.push(rel);
  }
  assert.deepEqual(
    found.sort(), Object.keys(OUTBOUND_SITES).sort(),
    '바깥으로 거는 요청이 늘었거나 사라졌다 — 사유와 함께 등록해야 한다(상한 없는 요청은 응답을 영영 보내지 못한다)',
  );
  // 등록된 자리는 **실제로** 상한 장치를 들고 있어야 한다(이름만 적고 끝나지 않게).
  for (const rel of found) {
    const src = stripSourceComments(read(rel));
    assert.match(src, /AbortController/, `${rel}: 상한을 걸 수단이 없다`);
    // `signal` 이 아니라 `signal:` 을 찾는다 — 이름만 비슷한 칸(`signalX:`)으로 통과하지 못하게.
    assert.match(src, /\bsignal:/, `${rel}: 요청에 signal 을 넘기지 않는다 — 타이머가 스트림을 끊지 못한다`);
    assert.match(src, /clearTimeout/, `${rel}: 타이머를 끄지 않는다`);
  }
});
