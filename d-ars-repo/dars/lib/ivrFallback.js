// lib/ivrFallback.js — 엔진 장애 시 기존(음성) IVR 전환 계약 (순수 로직 · 의존성 0 · 서버/클라이언트 공용)
//
// 배경(COMMERCIAL_READINESS "장애 폴백 — 엔진 오류 시 기존 IVR 전환 경로 검증"):
//   보이는 ARS 는 통화(음성 IVR)에 **화면을 덧붙이는** 제품이다. 화면 쪽(D-ARS 엔진)이 죽어도
//   통화 자체는 계속돼야 하고, 콜봇은 "화면 없이 음성만으로 진행"으로 즉시 돌아서야 한다.
//   지금까지 인입 웹훅은 SMS 발송이 실패해도 `ok:true` 를 돌려줬고, 화면 액션 릴레이가 3회
//   재시도 끝에 실패해도 `ok:true` 였다 — 콜봇 입장에서는 성공과 장애가 구분되지 않아
//   "화면을 보세요"라고 안내한 뒤 고객이 빈 화면 앞에서 기다리는 사고가 가능했다.
//
// 계약(콜봇 ↔ D-ARS): 모든 콜봇 대면 응답은 `fallback` 필드를 **항상** 싣는다.
//   { fallback: { mode: 'visual'|'ivr', reason: <코드|null>, message: <콜봇이 읽을 한국어 문구> } }
//   콜봇은 다음 어느 하나면 음성 IVR 로 계속한다(참조 구현 `callbotShouldUseIvr`):
//     (a) HTTP 응답이 2xx 가 아니다 / 네트워크 오류·타임아웃  — 엔진 자체 장애
//     (b) 본문 `fallback.mode === 'ivr'`                        — 엔진은 살아 있으나 화면 경로 불가
//   즉 "응답이 없거나 이상하면 음성으로" 가 기본이고, 화면 진행은 **명시적 'visual' 일 때만** 한다.
//
// 안전 원칙: 이 모듈은 환경변수를 읽지 않고 외부 호출도 하지 않는다. 판정 결과에 PII·URL·오류
//   원문을 담지 않는다(reason 은 고정 코드, message 는 고정 문구).

export const FALLBACK_MODES = Object.freeze(['visual', 'ivr']);

// reason 코드 → 콜봇/운영자용 설명. 코드는 기계 판독용이라 바꾸지 않는다(문서와 양방향 대조).
export const FALLBACK_REASONS = Object.freeze({
  SMS_FAILED:    '화면 링크 문자를 발송하지 못함',
  RELAY_FAILED:  '화면 선택을 콜봇으로 전달하지 못함',
  ENGINE_ERROR:  '화면 안내 엔진 내부 오류',
  SCREEN_LOST:   '고객 화면이 서버 상태 조회에 연속 실패',
});

// 콜봇이 고객에게 읽어 주는 문구(음성 전환 안내). 화면 문구도 같은 뜻으로 맞춘다.
export const IVR_PROMPT = '화면 안내를 이용할 수 없어 음성 안내로 계속 진행합니다.';
export const VISUAL_PROMPT = '화면으로도 함께 안내해 드립니다.';
// 고객 화면(/visual)이 서버와 끊겼을 때 보여 주는 문구.
export const SCREEN_LOST_MESSAGE = '화면 연결이 끊겼습니다. 전화 음성 안내로 계속 진행해 주세요.';

// 고객 화면 폴링이 이 횟수만큼 **연속** 실패하면 "끊김"으로 본다.
// 폴링 주기 2.5초 × 4 = 10초 — 일시적 지터(1~2회)에는 반응하지 않고, 진짜 장애는 10초 안에 드러난다.
// 실측 지표가 아니라 운영 기준값이다.
export const SCREEN_LOST_AFTER = 4;

function isObj(v) { return !!v && typeof v === 'object'; }

/** 판정 결과 객체를 만든다(항상 같은 모양). */
export function decision(mode, reason = null) {
  const m = mode === 'ivr' ? 'ivr' : 'visual';
  const r = m === 'ivr' && reason && Object.prototype.hasOwnProperty.call(FALLBACK_REASONS, reason) ? reason : null;
  // ivr 인데 알 수 없는 코드가 오면 ENGINE_ERROR 로 보수 처리(콜봇이 모르는 코드로 분기하지 않게).
  const finalReason = m === 'ivr' ? (r || 'ENGINE_ERROR') : null;
  return Object.freeze({ mode: m, reason: finalReason, message: m === 'ivr' ? IVR_PROMPT : VISUAL_PROMPT });
}

/**
 * 인입콜 웹훅(POST /api/cpaas/voice) 판정.
 *   sms — lib/cpaas.sendSms 결과 { ok, skipped? }.
 *   멱등 재호출(skipped) 은 이미 링크가 나간 상태이므로 visual.
 *   sms.ok !== true 면 고객은 링크를 못 받는다 → ivr(SMS_FAILED).
 *   sms 가 객체가 아니면(예외적 상황) 보수적으로 ivr.
 */
export function decideInbound({ sms } = {}) {
  if (!isObj(sms)) return decision('ivr', 'SMS_FAILED');
  if (sms.skipped === true) return decision('visual');
  return sms.ok === true ? decision('visual') : decision('ivr', 'SMS_FAILED');
}

/**
 * 화면 액션 릴레이(POST /api/visual/action) 판정.
 *   relay — lib/cpaas.notifyCallbot 결과 { ok, failed?, attempts? }.
 *   재시도 소진(failed) 또는 ok !== true → ivr(RELAY_FAILED): 화면은 눌렀지만 통화 쪽에 반영되지
 *   않았으므로 고객에게 "말씀으로 진행"을 안내해야 한다.
 */
export function decideRelay(relay) {
  if (!isObj(relay)) return decision('ivr', 'RELAY_FAILED');
  if (relay.failed === true) return decision('ivr', 'RELAY_FAILED');
  return relay.ok === true ? decision('visual') : decision('ivr', 'RELAY_FAILED');
}

/** 엔진 예외(try/catch 에서 잡힌 throw) → ivr(ENGINE_ERROR). 오류 원문은 담지 않는다. */
export function decideEngineError() { return decision('ivr', 'ENGINE_ERROR'); }

/** 응답 본문에 얹을 봉투. `{ fallback: {...} }` — 라우트가 spread 로 합친다. */
export function fallbackEnvelope(d) {
  const x = isObj(d) && FALLBACK_MODES.includes(d.mode) ? d : decision('ivr', 'ENGINE_ERROR');
  return { fallback: { mode: x.mode, reason: x.reason ?? null, message: x.message || (x.mode === 'ivr' ? IVR_PROMPT : VISUAL_PROMPT) } };
}

/**
 * 콜봇 측 판정의 **참조 구현**(문서 계약과 1:1). 콜봇 벤더가 이 로직을 그대로 옮기면 된다.
 *   status — HTTP 상태(숫자). 네트워크 오류·타임아웃은 null/undefined/0 으로 넘긴다.
 *   body   — 파싱된 JSON(파싱 실패면 null).
 * 반환: true 면 음성 IVR 로 계속, false 면 화면 진행.
 * 원칙: 확실히 'visual' 이라고 말한 정상 응답만 화면 진행. 그 외 전부 음성.
 */
export function callbotShouldUseIvr({ status, body } = {}) {
  const s = Number(status);
  if (!Number.isFinite(s) || s < 200 || s >= 300) return true;
  if (!isObj(body)) return true;
  if (body.ok !== true) return true;
  const fb = body.fallback;
  if (!isObj(fb)) return true;            // 계약 위반(필드 누락) — 보수적으로 음성
  return fb.mode !== 'visual';
}

/**
 * 고객 화면 폴링 실패 누적 판정(순수 리듀서).
 *   state — { fails, lost } (초기값 pollInitial()).
 *   ok    — 이번 폴링 성공 여부.
 * 성공하면 즉시 복구(fails=0, lost=false). 실패는 누적되고 SCREEN_LOST_AFTER 이상이면 lost=true.
 */
export function pollInitial() { return { fails: 0, lost: false }; }
export function pollNext(state, ok) {
  const prev = isObj(state) ? state : pollInitial();
  if (ok) return { fails: 0, lost: false };
  const fails = (Number.isFinite(prev.fails) && prev.fails >= 0 ? prev.fails : 0) + 1;
  return { fails, lost: fails >= SCREEN_LOST_AFTER };
}
