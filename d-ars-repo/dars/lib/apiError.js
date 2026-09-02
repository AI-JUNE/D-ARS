// lib/apiError.js — 표준 API 응답/에러 포맷 (상용 하드닝)
//
// 목적: 라우트별로 제각각인 에러 응답을 하나의 봉투(envelope)로 표준화한다.
//   - 성공: { ok: true, ...data }
//   - 실패: { ok: false, error: <짧은 코드/메시지>, code?, details? }
// 설계: 기존 관례({ ok:false, error })와 100% 하위호환. 기존 라우트는
//   점진 채택하면 되고, 이 헬퍼가 error 문자열 필드를 그대로 유지한다.
//   code(선택)는 기계 판독용 안정 코드로, 프런트가 문구 대신 분기할 때 쓴다.
//
// 개인정보/보안: details 에는 PII·스택·내부경로를 담지 말 것(클라이언트 노출).

const NO_STORE = { 'Cache-Control': 'no-store' };

// 성공 응답. data 는 객체(또는 undefined). ok:true 를 강제 부착한다.
export function ok(data = {}, init = {}) {
  const body = data && typeof data === 'object' && !Array.isArray(data) ? data : { data };
  return Response.json({ ok: true, ...body }, { status: 200, ...init });
}

// 실패 응답의 단일 진입점.
//   error : 짧은 사람용 메시지 또는 코드 문자열(필수)
//   status: HTTP 상태(기본 400)
//   extra : { code, details, ... } 추가 필드(선택)
export function fail(error = 'invalid request', status = 400, extra = {}, headers = {}) {
  const payload = { ok: false, error, ...(extra || {}) };
  // no-store 는 항상 기본 — 에러 응답이 CDN/브라우저에 캐시되면 복구 후에도 실패가 남는다.
  // headers 인자는 Retry-After 같은 표준 헤더를 얹기 위한 것이고, 넘겨도 no-store 를 덮어쓰지 않는다.
  return Response.json(payload, { status, headers: { ...(headers || {}), ...NO_STORE } });
}

// ─── 상태별 단축 헬퍼(관례 문자열 유지) ─────────────────────────────────────
export function badRequest(error = 'invalid request', extra) { return fail(error, 400, extra); }
export function unauthorized(error = 'unauthorized', extra)  { return fail(error, 401, extra); }
export function forbidden(error = 'forbidden', extra)        { return fail(error, 403, extra); }
export function notFound(error = 'not found', extra)         { return fail(error, 404, extra); }
export function gone(error = 'expired', extra)               { return fail(error, 410, extra); }
export function tooManyRequests(error = 'rate limited', extra) { return fail(error, 429, extra); }
// 서버 오류: 내부 상세를 클라이언트에 노출하지 않음(로그로만). error 는 안전한 일반 문구.
export function serverError(error = 'internal error', extra) { return fail(error, 500, extra); }

// ─── 라우트 공통 관용구 ────────────────────────────────────────────────────
// 429 + Retry-After. 라우트마다 손으로 헤더를 만들다 빠뜨리는 것을 막는다(레이트리밋 응답 규약 단일화).
// retryAfterSec 은 정수 초로 정규화하고 최소 1 을 보장(0/NaN/음수면 클라이언트가 즉시 재시도해 무의미).
export function rateLimited(retryAfterSec, error = 'rate limited', extra) {
  const n = Number(retryAfterSec);
  const sec = Number.isFinite(n) && n > 0 ? Math.ceil(n) : 1;
  return fail(error, 429, extra, { 'Retry-After': String(sec) });
}

// 요청 본문 JSON 파싱 실패. 전 라우트가 같은 문구·같은 상태코드를 쓰도록 고정한다.
export function invalidJson(error = 'invalid json', extra) { return fail(error, 400, extra); }

// 익명 객체를 그대로 default export 하지 않고 이름 붙여 내보낸다(named default) —
// ESLint `import/no-anonymous-default-export` 경고 제거 · 디버깅 시 모듈 식별 용이.
// 내보내는 객체 구성원은 동일 → 기존 `import apiError from '@/lib/apiError'` 사용부 100% 불변(하위호환).
const apiError = {
  ok, fail, badRequest, unauthorized, forbidden, notFound, gone, tooManyRequests, serverError,
  rateLimited, invalidJson,
};
export default apiError;
