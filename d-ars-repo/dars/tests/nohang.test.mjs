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
} from '../lib/ivrFallback.js';

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

// /visual 폴링 한 바퀴를 그대로 옮긴 것(화면 렌더 없이 판정 부분만).
async function pollOnce(state, opts) {
  const { failure, res } = await fetchOnce('/api/visual/state?s=x', {
    cache: 'no-store', navigatorImpl: { onLine: true }, ...opts,
  });
  return pollNext(state, !failure && !!res && res.ok);
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
  state = await pollOnce(state, { fetchImpl: async () => ({ ok: true, status: 200 }) });
  assert.deepEqual(state, { fails: 0, lost: false });
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

// 주석·문자열 안의 'fetch(' 는 불변식이 아니다 — 줄 주석을 먼저 걷어낸다.
function stripLineComments(src) {
  return src.split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n');
}

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
  assert.match(src, /try \{ d = await res\.json\(\); \} catch \{ d = null; \}/);
  assert.match(src, /res\.status >= 500/, '서버 오류와 자격 증명 실패를 구분해 안내한다');
});

test('로그아웃은 서버가 응답하지 않아도 로그인 화면으로 간다', () => {
  const src = read('app/(portal)/layout.jsx');
  const line = src.split('\n').find((l) => l.includes('const logout'));
  assert.ok(line && /fetchOnce\(/.test(line), '상한 없는 로그아웃은 눌러도 아무 일 없는 것처럼 보인다');
  assert.match(line, /window\.location\.href = '\/login'/);
});
