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
export function fail(error = 'invalid request', status = 400, extra = {}) {
  const payload = { ok: false, error, ...(extra || {}) };
  return Response.json(payload, { status, headers: NO_STORE });
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

export default {
  ok, fail, badRequest, unauthorized, forbidden, notFound, gone, tooManyRequests, serverError,
};
