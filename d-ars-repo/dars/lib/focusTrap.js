// lib/focusTrap.js — 모달 다이얼로그 Tab 포커스 트랩 + 오버레이 닫힘 포커스 복귀(순수 로직 — 테스트 가능)
//
// 문제: CommandPalette 는 aria-modal="true" 다이얼로그인데 Tab 이 경계를 넘으면
//   포커스가 배경 페이지(사이드바·헤더)로 새어 나간다 — 모달 규격(WAI-ARIA dialog) 위반.
//   또 사용자 메뉴·모바일 드로어가 Esc/스크림으로 닫히면 포커스가 body 로 유실돼
//   키보드 사용자가 문서 처음부터 다시 탐색해야 한다(WCAG 2.4.3 Focus Order).
// 해결: (1) Tab/Shift+Tab 이 다이얼로그 경계에서만 반대쪽 끝으로 순환(중간 이동은
//   브라우저 기본 동작 그대로 — preventDefault 최소화), (2) 닫힘 후 포커스가
//   유실(body)됐을 때만 열었던 트리거로 복귀(링크 이동 등 정상 흐름은 방해하지 않음).
//
// 저위험: 키 핸들러·ref 추가만. 서버 API·레이아웃·인증·개인정보 로직 불변.

// 포커스 가능 후보 셀렉터(표준 상호작용 요소 + tabindex 부여 요소, tabindex=-1 제외)
export const FOCUS_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

// 컨테이너 안에서 실제 포커스 가능한 요소 목록(숨김·비활성 방어).
// DOM API 가 없는 요소(테스트 목 등)는 안전하게 포함(과차단보다 과포함이 무해).
export function focusables(container) {
  if (!container || typeof container.querySelectorAll !== 'function') return [];
  let all;
  try { all = Array.from(container.querySelectorAll(FOCUS_SELECTOR)); } catch { return []; }
  return all.filter((el) => {
    if (!el || el.disabled) return false;
    if (typeof el.getAttribute === 'function' && el.getAttribute('aria-hidden') === 'true') return false;
    if (typeof el.getClientRects === 'function') {
      try { return el.getClientRects().length > 0; } catch { return true; } // 렌더 안 된 요소(display:none) 제외
    }
    return true;
  });
}

// Tab 순환 목표 계산(순수): 경계에서만 반대쪽 끝을 반환, 그 외 null(브라우저 기본 이동 유지).
// 포커스가 목록 밖(배경으로 이미 새어 나감)이면 안쪽 끝으로 회수한다.
export function wrapTarget(list, active, shiftKey) {
  if (!Array.isArray(list) || list.length === 0) return null;
  const first = list[0];
  const last = list[list.length - 1];
  const idx = list.indexOf(active);
  if (idx === -1) return shiftKey ? last : first; // 다이얼로그 밖 → 안으로 회수
  if (shiftKey) return idx === 0 ? last : null;   // 첫 요소에서 뒤로 → 끝으로 순환
  return idx === list.length - 1 ? first : null;  // 끝 요소에서 앞으로 → 처음으로 순환
}

// 다이얼로그 컨테이너 keydown 공통 핸들러: Tab 경계 순환. 포커스를 이동했으면 true.
//   doc: 테스트 주입용 document 대체.
export function trapTabKey(e, container, doc) {
  if (!e || e.key !== 'Tab') return false;
  const list = focusables(container);
  const d = doc || (typeof document !== 'undefined' ? document : null);
  const target = wrapTarget(list, d ? d.activeElement : null, !!e.shiftKey);
  if (!target) {
    // 포커스 가능 요소가 0개면 탈출만 차단(빈 다이얼로그 방어 — 실제 화면엔 항상 입력이 있다)
    if (list.length === 0 && typeof e.preventDefault === 'function') e.preventDefault();
    return false;
  }
  if (typeof e.preventDefault === 'function') e.preventDefault();
  if (typeof target.focus === 'function') target.focus();
  return true;
}

// 오버레이 닫힘 후 포커스가 유실(body/null)됐을 때만 트리거로 복귀. 복귀했으면 true.
// 링크 클릭으로 이동해 다른 요소가 포커스를 가진 경우엔 개입하지 않는다.
export function restoreFocus(prev, doc) {
  if (!prev || typeof prev.focus !== 'function') return false;
  const d = doc || (typeof document !== 'undefined' ? document : null);
  const active = d ? d.activeElement : null;
  if (active && active !== d.body) return false; // 포커스가 살아 있으면 정상 흐름 존중
  try { prev.focus(); } catch { return false; }
  return true;
}
