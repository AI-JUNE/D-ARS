// lib/fetchJson.js — 클라이언트 데이터 요청 공통 유틸 (상용 에러처리 하드닝)
//
// 문제: 포털 화면들이 fetch(...).then(r=>r.json()).then(setState) 형태라
//   - API 5xx/네트워크 단절/타임아웃 시 화면이 조용히 빈 상태로 남고(사용자는 원인을 모름),
//   - JSON이 아닌 응답(에러 HTML 등)에서 예외가 그대로 터진다.
// 해결: 모든 요청을 { data, error } 로 정규화. 예외를 던지지 않으므로 호출부는
//       error 를 배너로 보여주고 '다시 시도' 를 제공할 수 있다.
//
// 2026-07-12 추가(자동 재시도·오프라인 감지):
//   - 일시적 실패(네트워크 단절·타임아웃·429·5xx)는 **지수 백오프로 자동 재시도**해
//     서버 콜드스타트·순간 단절에서 사용자가 직접 '다시 시도'를 누르지 않아도 회복된다.
//   - **쓰기 요청(POST/PUT)은 기본 재시도 0** — 중복 전송(문자 발송·세션 생성) 방지. (안전 기본값)
//   - 브라우저가 오프라인(navigator.onLine === false)이면 네트워크를 두드리지 않고
//     즉시 오프라인 메시지를 반환(불필요한 대기·재시도 제거).
//
// 저위험: 읽기 요청 래퍼 + 사용자 메시지. 인증·개인정보·과금 로직 불변.

export const DEFAULT_TIMEOUT = 8000;
export const DEFAULT_RETRIES = 2;        // GET 기본 재시도 횟수(총 시도 = 1 + 2)
export const RETRY_BASE_DELAY = 400;     // 백오프 기준(ms): 400 → 800 → 1600 …
export const RETRY_MAX_DELAY = 4000;     // 백오프 상한(ms)
export const OFFLINE_MESSAGE = '오프라인 상태입니다. 네트워크 연결을 확인해 주세요.';

// HTTP 상태코드 → 사용자용 한국어 메시지(운영자 친화적, 기술용어 최소화)
export function httpMessage(status) {
  if (status === 401) return '로그인이 필요합니다. 다시 로그인해 주세요.';
  if (status === 403) return '이 작업에 대한 권한이 없습니다.';
  if (status === 404) return '데이터를 찾을 수 없습니다.';
  if (status === 400) return '요청 값이 올바르지 않습니다.';
  if (status === 429) return '요청이 많습니다. 잠시 후 다시 시도해 주세요.';
  if (status >= 500) return '서버 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.';
  return '요청을 처리하지 못했습니다.';
}

// 예외 → 사용자용 메시지 (타임아웃/중단 구분)
export function errorMessage(err) {
  if (err && (err.name === 'AbortError' || err.name === 'TimeoutError')) {
    return '응답이 지연되어 요청을 중단했습니다. 다시 시도해 주세요.';
  }
  return '네트워크 오류로 데이터를 불러오지 못했습니다. 연결을 확인해 주세요.';
}

// 재시도해도 의미 있는(일시적) 실패인가?
// 408 요청 타임아웃 · 429 과다요청 · 5xx 서버오류 · 0(네트워크/응답없음)만 재시도.
// 4xx(400/401/403/404 등)는 재시도해도 동일하므로 즉시 반환.
export function isTransientStatus(status) {
  const s = Number(status) || 0;
  return s === 0 || s === 408 || s === 429 || s >= 500;
}

// 지수 백오프 지연(ms): base * 2^attempt, 상한 cap. attempt 는 0부터.
// jitter(0~1)를 주면 지연의 최대 jitter 비율만큼 무작위 가산(썬더링 허드 완화).
export function backoffDelay(attempt, { base = RETRY_BASE_DELAY, cap = RETRY_MAX_DELAY, jitter = 0, random = Math.random } = {}) {
  const raw = Math.min(cap, base * Math.pow(2, Math.max(0, attempt)));
  if (!jitter) return raw;
  return Math.round(raw * (1 + jitter * random()));
}

// 브라우저 오프라인 여부. navigator 가 없는 환경(SSR/Node)은 항상 온라인으로 간주.
export function isOffline(nav) {
  const n = nav || (typeof navigator !== 'undefined' ? navigator : null);
  return !!(n && n.onLine === false);
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// ─────────────────────────────────────────────────────────────────────────────
// fetchOnce — **시간 상한이 걸린 단발 요청**. 응답(Response)을 그대로 돌려준다.
//
// 왜 requestJSON 과 따로 두나: requestJSON 은 본문까지 JSON 으로 정규화해 돌려주므로
// 상태코드별로 다르게 안내해야 하는 화면(409=이미 접수, 410=만료)이나 실패 본문의
// 메시지를 그대로 써야 하는 화면(로그인)에서는 쓸 수 없다. 그런 화면들은 지금까지
// **맨 fetch** 를 썼고, 맨 fetch 에는 시간 상한이 없다.
//
// 상한 없는 fetch 가 실제로 만드는 사고(관측된 것):
//   - 제출 버튼이 `disabled` 인 채 "신청하는 중…" 에서 **영영 멈춘다**. 사용자는 실패한
//     줄도 모르고, 다시 누를 수도 없다(QUALITY_BAR §1 "멈춘 것처럼 보이지 않는다").
//   - 폴링 루프에서는 더 나쁘다 — 멈춘 요청은 성공도 실패도 보고하지 않으므로
//     **연속 실패 카운터가 올라가지 않고 장애 폴백이 영영 켜지지 않는다**. 응답 없음이
//     곧 무장애로 취급된다(QUALITY_BAR §3 "오류를 삼키고 아무 일 없는 척").
//
// 계약: **절대 throw 하지 않는다**. `{ res, failure }` 를 돌려주며 둘 중 하나만 채워진다.
//   failure: 'timeout'(상한 초과로 우리가 끊음) · 'offline'(브라우저가 오프라인) ·
//            'network'(연결 실패·중단) · null(응답 도착 — 상태코드 판정은 호출부의 몫)
// 상태코드는 실패로 보지 않는다. 4xx/5xx 도 "응답이 도착한 것"이므로 `res` 로 넘긴다.
export const FETCH_FAILURE_MESSAGE = {
  timeout: '응답이 늦어 요청을 중단했습니다. 다시 시도해 주세요.',
  offline: OFFLINE_MESSAGE,
  network: '네트워크 오류로 요청을 보내지 못했습니다. 연결을 확인해 주세요.',
};

// 실패 사유 → 사용자 메시지. 모르는 값은 network 로 보수적으로 안내한다(빈 문자열 금지 —
// 안내가 비면 화면은 다시 "아무 일도 없는 척" 하게 된다).
export function failureMessage(failure) {
  return FETCH_FAILURE_MESSAGE[failure] || FETCH_FAILURE_MESSAGE.network;
}

export async function fetchOnce(url, opts = {}) {
  const {
    method = 'GET', body, headers, cache,
    timeout = DEFAULT_TIMEOUT, fetchImpl, navigatorImpl,
  } = opts;

  if (isOffline(navigatorImpl)) return { res: null, failure: 'offline' };

  const f = fetchImpl || (typeof fetch !== 'undefined' ? fetch : null);
  if (!f) return { res: null, failure: 'network' };

  const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  // 우리가 끊은 것인지(timeout) 바깥에서 끊긴 것인지(network) 구분한다 — 두 경우의
  // 안내 문구가 다르고, 사용자가 다음에 할 일도 다르다.
  let timedOut = false;
  const timer = ctrl && timeout > 0
    ? setTimeout(() => { timedOut = true; try { ctrl.abort(); } catch { /* noop */ } }, timeout)
    : null;

  const sendsBody = body !== undefined && body !== null;
  try {
    const res = await f(url, {
      method,
      cache,
      headers: sendsBody ? { 'content-type': 'application/json', ...(headers || {}) } : (headers || undefined),
      body: sendsBody ? JSON.stringify(body) : undefined,
      signal: ctrl ? ctrl.signal : undefined,
    });
    if (!res) return { res: null, failure: 'network' };
    return { res, failure: null };
  } catch (err) {
    if (timedOut) return { res: null, failure: 'timeout' };
    if (err && (err.name === 'AbortError' || err.name === 'TimeoutError')) return { res: null, failure: 'timeout' };
    return { res: null, failure: 'network' };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

// 단발 요청: 절대 throw 하지 않고 { data, error, status } 반환.
// timeout(ms) 초과 시 AbortController 로 중단 → 화면이 무한 로딩에 갇히지 않는다.
async function attemptOnce(url, { method, body, timeout, fetchImpl }) {
  const f = fetchImpl || (typeof fetch !== 'undefined' ? fetch : null);
  if (!f) return { data: null, error: errorMessage(null), status: 0 };

  const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = ctrl && timeout ? setTimeout(() => ctrl.abort(), timeout) : null;
  try {
    const res = await f(url, {
      method,
      signal: ctrl ? ctrl.signal : undefined,
      headers: body ? { 'content-type': 'application/json', accept: 'application/json' } : { accept: 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res || !res.ok) {
      const status = res ? res.status : 0;
      return { data: null, error: httpMessage(status), status };
    }
    let data = null;
    try { data = await res.json(); } catch { return { data: null, error: '응답 형식이 올바르지 않습니다.', status: res.status }; }
    return { data, error: null, status: res.status };
  } catch (err) {
    return { data: null, error: errorMessage(err), status: 0 };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

// 공통 요청기(재시도 포함): 절대 throw 하지 않고 { data, error } 반환.
// retries 미지정 시 GET 은 DEFAULT_RETRIES, 쓰기(POST/PUT/DELETE)는 0(중복 전송 방지).
export async function requestJSON(url, opts = {}) {
  const {
    method = 'GET', body, timeout = DEFAULT_TIMEOUT, fetchImpl,
    retries, sleep = wait, jitter = 0.25, random, onRetry, navigatorImpl,
  } = opts;

  if (isOffline(navigatorImpl)) return { data: null, error: OFFLINE_MESSAGE, offline: true, attempts: 0 };

  const max = Number.isInteger(retries) ? Math.max(0, retries) : (method === 'GET' ? DEFAULT_RETRIES : 0);
  let last = null;
  for (let attempt = 0; attempt <= max; attempt++) {
    last = await attemptOnce(url, { method, body, timeout, fetchImpl });
    if (!last.error) return { data: last.data, error: null, attempts: attempt + 1 };
    // 응답 형식 오류(status 2xx + 파싱 실패)는 재시도 대상 아님.
    const transient = last.status !== undefined && isTransientStatus(last.status) && !(last.status >= 200 && last.status < 300);
    if (attempt >= max || !transient) break;
    // 재시도 직전 오프라인이 되었으면 즉시 중단(무의미한 대기 방지).
    if (isOffline(navigatorImpl)) return { data: null, error: OFFLINE_MESSAGE, offline: true, attempts: attempt + 1 };
    if (typeof onRetry === 'function') onRetry(attempt + 1, last.error);
    await sleep(backoffDelay(attempt, { jitter, random }));
  }
  return { data: null, error: last ? last.error : errorMessage(null), attempts: max + 1 };
}

export function getJSON(url, opts) {
  return requestJSON(url, { ...opts, method: 'GET' });
}
export function postJSON(url, body, opts) {
  return requestJSON(url, { ...opts, method: 'POST', body });
}
export function putJSON(url, body, opts) {
  return requestJSON(url, { ...opts, method: 'PUT', body });
}

// 배열 응답 정규화: API가 배열이 아닌 값(에러 객체 등)을 주더라도 화면이 깨지지 않도록.
export function asArray(data) {
  return Array.isArray(data) ? data : [];
}
