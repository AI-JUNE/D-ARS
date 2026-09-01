// lib/monitor.js — 전역 에러 캡처 + 알림 훅 (상용 필수 §공통-1)
//
// 목적: 운영 중 발생한 예외를 **일관된 한 줄 JSON**으로 남기고, 외부 수집기(DSN)가
//   설정된 경우에만 전송한다. 지금까지 각 라우트가 `console.error(e?.message)` 를
//   제각각 찍던 것을 하나의 봉투로 모아 장애 조사·알림 연동의 접점을 만든다.
//
// 원칙 "build now, activate on approval":
//   - 기본(MONITOR_DSN 미설정): **완전 no-op** — 콘솔 한 줄만 남기고 네트워크는 건드리지 않는다.
//     즉 이 모듈을 배선해도 배포 동작·외부 통신은 변하지 않는다(무해).
//   - MONITOR_DSN 설정 시에만 전송을 시도한다. 실제 DSN 주입은 운영자 승인 사항. [승인 필요]
//
// 무해화 계약: captureError 는 **어떤 입력·어떤 실패에도 throw 하지 않는다**.
//   모니터링이 본 요청을 실패시키면 모니터링이 곧 장애 원인이 된다(audit.js 와 동일 계약).
//
// 개인정보: 메시지·컨텍스트는 전송 전에 반드시 scrubText 로 마스킹한다.
//   전화번호·이메일·주민등록번호·카드번호·자격증명은 원문이 로그/외부로 나가지 않는다.
//   스택트레이스는 내부 경로가 드러나므로 **전송 대상에서 제외**한다(콘솔에만 남는다).

// 심각도 어휘(자유 문자열 금지 — 필터·알림 라우팅 가능성 확보)
export const MONITOR_LEVELS = ['fatal', 'error', 'warn'];
const DEFAULT_LEVEL = 'error';

// 같은 오류가 폭주할 때 알림이 도배되지 않도록 하는 기본 창(밀리초)
export const DEFAULT_THROTTLE_MS = 60_000;

// 메시지 길이 상한(로그 폭주 방어)
const MAX_MSG = 300;

// ── PII·자격증명 마스킹(순수 함수) ────────────────────────────────
// 규칙 순서가 중요하다: 자릿수가 겹치는 패턴(주민번호 · 카드 · 전화)은 넓은 것부터 지운다.
const SCRUB_RULES = [
  // 자격증명: bearer 토큰 / key=... / token=... / password=... / secret=...
  [/\b(bearer)\s+[\w.\-~+/=]+/gi, '$1 [redacted]'],
  [/\b(api[_-]?key|token|secret|password|passwd|pwd)\s*[=:]\s*[^\s&,;"']+/gi, '$1=[redacted]'],
  // 주민등록번호(6-7)
  [/\b\d{6}[-\s]?[1-4]\d{6}\b/g, '[rrn]'],
  // 카드번호(4-4-4-4)
  [/\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g, '[card]'],
  // 이메일
  [/\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g, '[email]'],
  // 전화번호: 휴대폰(01x) · 유선(02/0xx) 모두
  [/\b0\d{1,2}[-\s]?\d{3,4}[-\s]?\d{4}\b/g, '[phone]'],
];

// 문자열에서 PII·자격증명을 마스킹하고 길이를 제한한다. 문자열이 아니면 ''.
export function scrubText(s, max = MAX_MSG) {
  if (typeof s !== 'string' || !s) return '';
  let out = s;
  for (const [re, to] of SCRUB_RULES) out = out.replace(re, to);
  return out.length > max ? out.slice(0, max) : out;
}

// 컨텍스트(평면 객체)를 마스킹한다. 키 8개 상한 · 원시값만(감사로그 sanitizeDetail 과 동일 보수 정책).
export function scrubContext(ctx) {
  if (!ctx || typeof ctx !== 'object' || Array.isArray(ctx)) return {};
  const out = {};
  let n = 0;
  for (const k of Object.keys(ctx)) {
    if (n >= 8) break;
    const v = ctx[k];
    if (v == null) continue;
    const t = typeof v;
    if (t === 'string') out[k] = scrubText(v, 120);
    else if (t === 'number' || t === 'boolean') out[k] = v;
    else continue;
    n++;
  }
  return out;
}

// Error(또는 임의 값)에서 전송 가능한 형태만 뽑는다. 스택은 제외한다(내부 경로 노출 방지).
export function errorShape(err) {
  if (err instanceof Error) {
    return { name: err.name || 'Error', message: scrubText(err.message) };
  }
  if (typeof err === 'string') return { name: 'Error', message: scrubText(err) };
  if (err && typeof err === 'object') {
    const name = typeof err.name === 'string' ? err.name : 'Error';
    const message = typeof err.message === 'string' ? err.message : '';
    return { name, message: scrubText(message) };
  }
  return { name: 'Error', message: '' };
}

// 레벨 정규화(화이트리스트 밖은 기본값으로).
export function normalizeLevel(level) {
  return MONITOR_LEVELS.includes(level) ? level : DEFAULT_LEVEL;
}

// 수집기로 보낼 이벤트(평면 객체). now 주입 가능 — 테스트 결정성.
export function buildEvent({
  err,
  level,
  source = 'server',
  requestId = null,
  env = 'unknown',
  commit = null,
  context,
  now = new Date(),
} = {}) {
  const e = errorShape(err);
  return {
    ts: now.toISOString(),
    level: normalizeLevel(level),
    source: typeof source === 'string' && source ? source.slice(0, 40) : 'server',
    name: e.name,
    message: e.message,
    requestId: typeof requestId === 'string' && requestId ? requestId.slice(0, 64) : null,
    env: typeof env === 'string' ? env : 'unknown',
    commit: typeof commit === 'string' && commit ? commit : null,
    context: scrubContext(context),
  };
}

// 같은 오류를 묶는 키. 메시지의 가변부(숫자)는 제거해 "같은 유형"을 하나로 본다.
export function fingerprint(event) {
  const e = event || {};
  const msg = String(e.message || '').replace(/\d+/g, '#');
  return [e.level || DEFAULT_LEVEL, e.source || 'server', e.name || 'Error', msg].join('|');
}

// 스로틀 판정(순수 함수 — 상태 맵을 주입받아 테스트 가능).
// 반환 true 면 전송, false 면 창 안의 중복이므로 생략한다. 창을 넘겼으면 타임스탬프를 갱신한다.
export function shouldSend(state, key, now = Date.now(), windowMs = DEFAULT_THROTTLE_MS) {
  if (!(state instanceof Map) || typeof key !== 'string') return true;
  const last = state.get(key);
  if (typeof last === 'number' && now - last < windowMs) return false;
  state.set(key, now);
  // 맵 무한 증식 방어: 오래된 키는 정리한다.
  if (state.size > 200) {
    for (const [k, t] of state) if (now - t >= windowMs) state.delete(k);
  }
  return true;
}

// 콘솔 한 줄 포맷(수집기 파싱 가능한 JSON · 접두어 [MONITOR] 고정 — [AUDIT] 와 동일 관례).
export function monitorLine(event) {
  return '[MONITOR] ' + JSON.stringify(event);
}

// DSN 설정 여부(= 외부 전송 활성 여부). 미설정이면 이 모듈은 콘솔 전용으로 동작한다.
export function isMonitorEnabled(env = process.env) {
  const dsn = env && typeof env.MONITOR_DSN === 'string' ? env.MONITOR_DSN.trim() : '';
  return /^https:\/\//.test(dsn);
}

// ── 기록(부수효과) ────────────────────────────────────────────────
const throttleState = new Map();

// 전역 에러 캡처 진입점. 항상 콘솔 한 줄을 남기고, DSN 이 있을 때만 전송을 시도한다.
// 반환: 콘솔 기록 성공 여부(호출측은 무시해도 된다). **절대 throw 하지 않는다.**
export async function captureError(err, ctx = {}) {
  try {
    const event = buildEvent({
      err,
      level: ctx.level,
      source: ctx.source,
      requestId: ctx.requestId,
      env: process.env.VERCEL_ENV || process.env.NODE_ENV || 'unknown',
      commit: (process.env.VERCEL_GIT_COMMIT_SHA || '').slice(0, 7) || null,
      context: ctx.context,
    });
    console.error(monitorLine(event));
    if (!isMonitorEnabled()) return true;            // 기본 경로: 외부 통신 없음(no-op)
    if (!shouldSend(throttleState, fingerprint(event), Date.now())) return true;
    await deliver(event, process.env.MONITOR_DSN.trim());
    return true;
  } catch (e) {
    try { console.error('monitor fail:', e?.message); } catch {}
    return false;
  }
}

// 알림 훅: DSN 으로 이벤트를 POST 한다. 실패·타임아웃은 삼킨다(요청 흐름에 영향 없음).
// 별도 훅을 끼우고 싶으면 이 함수만 교체하면 된다(수집기 SDK 도입 시 접점).
async function deliver(event, dsn) {
  if (typeof fetch !== 'function') return false;
  const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), 2000) : null;
  try {
    await fetch(dsn, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(event),
      signal: ctrl ? ctrl.signal : undefined,
    });
    return true;
  } catch {
    return false;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

// 익명 default export 금지(ESLint import/no-anonymous-default-export) — apiError.js 와 동일 관례.
const monitor = {
  MONITOR_LEVELS, DEFAULT_THROTTLE_MS,
  scrubText, scrubContext, errorShape, normalizeLevel,
  buildEvent, fingerprint, shouldSend, monitorLine, isMonitorEnabled, captureError,
};
export default monitor;
