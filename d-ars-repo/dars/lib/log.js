// lib/log.js — 구조화 로깅 (상용 필수 §공통-2)
//
// 목적: 요청 한 건을 **한 줄 JSON**으로 남긴다. 필드는 고정이다.
//   ts · level · requestId · method · path · status · durationMs · code · msg
// 이 고정 스키마가 있어야 수집기에서 "느린 요청", "특정 에러코드 급증"을 질의할 수 있다.
// 지금까지 라우트마다 제각각이던 console.log 를 이 봉투로 모은다.
//
// monitor.js 와의 역할 분담:
//   - monitor.js : **예외**를 캡처해 알림(DSN)까지 보낸다. 접두어 [MONITOR].
//   - log.js     : **모든 요청**의 결과를 남긴다(정상 포함). 접두어 [LOG]. 외부 전송 없음.
//   PII 마스킹 규칙은 하나여야 하므로 monitor.js 의 scrubText 를 재사용한다(규칙 이중화 금지).
//
// 개인정보: 경로의 쿼리스트링은 **통째로 버린다**(전화번호·이름이 가장 흔하게 새는 곳).
//   메시지는 scrubText 로 마스킹한다. 바디는 어떤 경우에도 로그에 넣지 않는다.
//
// 무해화 계약: 이 모듈의 함수는 **어떤 입력에도 throw 하지 않는다**(monitor.js·audit.js 와 동일).
//   로깅이 요청을 실패시키면 로깅이 곧 장애 원인이 된다.

import { scrubText } from './monitor.js';

// 레벨 어휘(자유 문자열 금지 — 수집기 필터 가능성 확보)
export const LOG_LEVELS = ['debug', 'info', 'warn', 'error'];
const DEFAULT_LEVEL = 'info';

// 경로·메시지 길이 상한(로그 폭주 방어)
const MAX_PATH = 200;
const MAX_MSG = 200;

// 요청 ID 를 읽을 헤더 후보(앞에서부터 먼저 발견된 것을 쓴다).
// 프록시/게이트웨이가 이미 부여한 ID 가 있으면 그것을 이어받아야 추적이 끊기지 않는다.
export const REQUEST_ID_HEADERS = ['x-request-id', 'x-correlation-id', 'x-vercel-id'];

// ── 요청 ID ────────────────────────────────────────────────────────
// 충돌 확률이 실질적으로 0 이어야 한다(엔트로피 요건). crypto.randomUUID 우선,
// 없으면 시간+난수 조합으로 낮춰 잡는다(구형 런타임 폴백).
export function newRequestId() {
  try {
    if (typeof crypto === 'object' && crypto && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch {}
  const t = Date.now().toString(36);
  const r = Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10);
  return `${t}-${r}`;
}

// 헤더에서 요청 ID 를 이어받거나 새로 만든다.
// headers 는 Headers 객체 · 평면 객체 · null 모두 허용(라우트/테스트 양쪽에서 쓰기 위함).
export function requestIdFrom(headers) {
  const get = (k) => {
    try {
      if (!headers) return null;
      if (typeof headers.get === 'function') return headers.get(k);
      const v = headers[k] ?? headers[k.toLowerCase()];
      return typeof v === 'string' ? v : null;
    } catch {
      return null;
    }
  };
  for (const h of REQUEST_ID_HEADERS) {
    const v = get(h);
    if (typeof v === 'string' && v.trim()) return v.trim().slice(0, 64);
  }
  return newRequestId();
}

// ── 정규화(순수 함수) ──────────────────────────────────────────────
export function normalizeLogLevel(level) {
  return LOG_LEVELS.includes(level) ? level : DEFAULT_LEVEL;
}

// 상태코드에서 기본 레벨을 정한다: 5xx=error · 4xx=warn · 그 외 info.
export function levelForStatus(status) {
  const n = Number(status);
  if (!Number.isFinite(n)) return DEFAULT_LEVEL;
  if (n >= 500) return 'error';
  if (n >= 400) return 'warn';
  return 'info';
}

// 경로에서 쿼리스트링·해시를 제거한다. **PII 유출의 최대 경로이므로 예외 없이 버린다.**
// 절대 URL 이 들어와도 경로만 남긴다(호스트·자격증명 제거).
export function scrubPath(path) {
  if (typeof path !== 'string' || !path) return '';
  let p = path;
  const m = /^[a-z][a-z0-9+.-]*:\/\/[^/]*(\/.*)?$/i.exec(p);
  if (m) p = m[1] || '/';
  const cut = p.search(/[?#]/);
  if (cut >= 0) p = p.slice(0, cut);
  return p.length > MAX_PATH ? p.slice(0, MAX_PATH) : p;
}

// 소요시간: 음수·NaN·비수치는 null(잘못된 값이 통계를 오염시키지 않게).
export function normalizeDuration(ms) {
  const n = Number(ms);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n);
}

// 에러코드: 기계 판독용 안정 코드. 대문자·숫자·밑줄만 허용하고 그 외는 버린다
// (자유 문장이 code 로 들어오면 집계가 무의미해진다 — 문장은 msg 로).
export function normalizeCode(code) {
  if (typeof code !== 'string') return null;
  const c = code.trim().toUpperCase().replace(/[^A-Z0-9_]/g, '_').slice(0, 40);
  return c || null;
}

// ── 이벤트 조립 ────────────────────────────────────────────────────
// now 주입 가능 — 테스트 결정성(monitor.buildEvent 와 동일 관례).
export function buildLogEvent({
  requestId = null,
  method = null,
  path = null,
  status = null,
  durationMs = null,
  code = null,
  level = null,
  msg = null,
  env = 'unknown',
  now = new Date(),
} = {}) {
  // null·undefined·빈문자열은 Number() 가 0/NaN 으로 바꿔버리므로 먼저 걸러낸다
  // (status 0 이라는 가짜 상태코드가 집계에 섞이지 않게).
  const st =
    status === null || status === undefined || status === '' || !Number.isFinite(Number(status))
      ? null
      : Number(status);
  return {
    ts: now.toISOString(),
    level: normalizeLogLevel(level || (st == null ? DEFAULT_LEVEL : levelForStatus(st))),
    requestId: typeof requestId === 'string' && requestId ? requestId.slice(0, 64) : null,
    method: typeof method === 'string' && method ? method.toUpperCase().slice(0, 10) : null,
    path: scrubPath(path),
    status: st,
    durationMs: normalizeDuration(durationMs),
    code: normalizeCode(code),
    msg: scrubText(msg, MAX_MSG) || null,
    env: typeof env === 'string' ? env : 'unknown',
  };
}

// 콘솔 한 줄 포맷([MONITOR]·[AUDIT] 와 동일 관례).
export function logLine(event) {
  return '[LOG] ' + JSON.stringify(event);
}

// ── 타이머 ─────────────────────────────────────────────────────────
// 라우트 시작에서 startTimer() → 끝에서 t.done() 으로 소요시간을 얻는다.
// now 주입 가능(테스트에서 시계를 고정하기 위함).
export function startTimer(now = () => Date.now()) {
  const t0 = now();
  return { t0, done: () => normalizeDuration(now() - t0) };
}

// ── 기록(부수효과) ─────────────────────────────────────────────────
// 요청 한 건을 한 줄로 남긴다. 레벨에 따라 console.error/warn/log 를 고른다.
// **절대 throw 하지 않는다.** 반환값은 기록에 사용한 이벤트(호출측은 무시해도 된다).
export function logRequest(fields = {}) {
  try {
    const event = buildLogEvent({
      ...fields,
      env: fields.env || process.env.VERCEL_ENV || process.env.NODE_ENV || 'unknown',
    });
    const line = logLine(event);
    if (event.level === 'error') console.error(line);
    else if (event.level === 'warn') console.warn(line);
    else console.log(line);
    return event;
  } catch {
    return null;
  }
}

// 익명 default export 금지(ESLint import/no-anonymous-default-export) — apiError.js 와 동일 관례.
const log = {
  LOG_LEVELS, REQUEST_ID_HEADERS,
  newRequestId, requestIdFrom, normalizeLogLevel, levelForStatus,
  scrubPath, normalizeDuration, normalizeCode,
  buildLogEvent, logLine, startTimer, logRequest,
};
export default log;
