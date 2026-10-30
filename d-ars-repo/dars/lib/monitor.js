// lib/monitor.js — 전역 에러 캡처 + 알림 훅 (상용 필수 §공통-1) · **전송 쪽**
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
// ── 봉투를 **짓는** 부분은 이 파일에 없다 → lib/monitorEvent.js ─────────────────
//
// 고친 결함: 마스킹·봉투·한 줄 포맷이 여기 함께 있었고, 그 중 둘(`buildEvent`·`monitorLine`)을
// **브라우저에서 도는 오류 경계**가 쓴다(`app/error.jsx`·`app/eum/error.jsx` — 둘 다 콘솔에만
// 적는다). 그래서 이 모듈이 통째로 클라이언트 번들에 실렸다 — 빌드 산출물의
// `app/eum/error-*.js` 안에 `captureError`·스로틀 Map·`MONITOR_DSN` 조회, 그리고 수집기로
// **POST 하는 `deliver`(`fetch(dsn, …)`)** 까지 들어 있었고, 그 청크는 `/eum` HTML 의 head 가
// **미리 받는다**(어르신이 화면을 열 때마다다). 자세한 사유와 「왜 지금 새는 값은 없는가」는
// 그 파일의 머리 주석에 적었다. 전송·스로틀·DSN 판정은 여기 남고, 저쪽을 **다시 export 하지
// 않는다**(import 경로가 둘이면 단일 출처가 다시 말뿐이 된다 · lib/eumMessage 와 같은 계약).
//
// 개인정보: 메시지·컨텍스트는 전송 전에 반드시 scrubText 로 마스킹한다(lib/monitorEvent).
//   스택트레이스는 내부 경로가 드러나므로 **전송 대상에서 제외**한다(콘솔에만 남는다).

import { buildEvent, monitorLine } from './monitorEvent.js';

const DEFAULT_LEVEL = 'error';

// 같은 오류가 폭주할 때 알림이 도배되지 않도록 하는 기본 창(밀리초)
export const DEFAULT_THROTTLE_MS = 60_000;

// 같은 오류를 묶는 키. 메시지의 가변부(숫자)는 제거해 "같은 유형"을 하나로 본다.
// (스로틀 전용이라 전송 쪽에 남는다 — 봉투를 짓는 일이 아니다.)
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
// 봉투를 짓는 이름들은 **여기 담지 않는다** — 담으면 그것이 곧 두 번째 import 경로가 된다
// (lib/monitorEvent.js 의 머리 주석 참조).
const monitor = {
  DEFAULT_THROTTLE_MS, fingerprint, shouldSend, isMonitorEnabled, captureError,
};
export default monitor;
