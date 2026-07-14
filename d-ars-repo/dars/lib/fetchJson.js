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
