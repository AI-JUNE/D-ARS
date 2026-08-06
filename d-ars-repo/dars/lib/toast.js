// lib/toast.js — 비차단 토스트 알림의 순수 로직(108회차)
//
// 왜 필요한가: /scenarios 의 저장 성공·검증 결과가 window.alert() 로 떠서
//   - 브라우저 모달이 **전체 UI 를 차단**하고(확인을 누를 때까지 SSE·폴링 콜백까지 지연),
//   - **포커스를 강탈**해 키보드 사용자 흐름을 끊고(WCAG 2.4.3 Focus Order),
//   - 모바일에선 도메인 문구가 붙은 시스템 다이얼로그로 떠 브랜드 UX 를 깬다.
// → role="status"(polite live region) 비차단 토스트로 교체한다.
//   이 모듈은 DOM 없이 단위 테스트 가능한 **순수 계산**만 담는다(컴포넌트는 lib/Toast.jsx).

export const TOAST_BASE_MS = 3000;   // 최소 표시 시간
export const TOAST_MAX_MS = 8000;    // 상한 — 장문이어도 화면을 무한정 점유하지 않는다
export const TOAST_PER_CHAR_MS = 60; // 기준 길이 초과 1자당 가산(읽기 속도 고려)
export const TOAST_FREE_CHARS = 20;  // 가산 없이 소화되는 길이

// 종류 정규화 — 알 수 없는 값은 'ok'(성공 톤). 'warn' 만 경고 톤.
export function toastKind(kind) {
  return kind === 'warn' ? 'warn' : 'ok';
}

// 메시지 길이에 비례한 표시 시간(ms). 비문자열은 기본값으로 방어.
export function toastDuration(msg) {
  const s = typeof msg === 'string' ? msg : '';
  const extra = Math.max(0, s.length - TOAST_FREE_CHARS) * TOAST_PER_CHAR_MS;
  return Math.min(TOAST_MAX_MS, TOAST_BASE_MS + extra);
}

// 이전 토스트(prev|null) → 새 토스트 객체.
// id 는 단조 증가 — 같은 메시지를 연속으로 띄워도 key 가 달라져 리렌더·재낭독이 보장된다.
export function makeToast(prev, msg, kind) {
  const m = msg == null ? '' : String(msg);
  const prevId = prev && Number.isFinite(Number(prev.id)) ? Number(prev.id) : 0;
  return { id: prevId + 1, msg: m, kind: toastKind(kind), ms: toastDuration(m) };
}
