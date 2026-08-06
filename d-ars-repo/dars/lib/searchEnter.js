// lib/searchEnter.js — 목록 검색 입력의 Enter(모바일 "검색" 키) 공통 처리
//
// 문제: 목록 화면 검색은 300ms 디바운스 후 서버 조회라
//   - Enter(모바일 키보드의 "검색" 키)를 눌러도 아무 일도 없는 것처럼 느껴지고,
//   - 모바일에서는 소프트 키보드가 화면 절반을 가린 채 남아 결과가 보이지 않는다.
// 해결: Enter 시 (1) 디바운스를 즉시 플러시(flush)해 지금 검색어로 바로 조회하고,
//       (2) 터치 기기(pointer: coarse)에서만 입력을 blur 해 키보드를 접는다
//       (데스크톱은 포커스를 유지 — 검색어를 이어서 다듬는 흐름을 방해하지 않는다).
//
// 한글 IME 안전: 조합(composition) 중 Enter 는 글자 확정 동작이므로 무시한다
// (nativeEvent.isComposing · 레거시 keyCode 229 모두 방어 — 삼성 키보드 등).
//
// 저위험: 키 핸들러 + 속성 추가만. 서버 API·레이아웃·인증·개인정보 로직 불변.

// 이 keydown 이 "검색 실행" 의도인가? (Enter + IME 조합 중 아님)
export function isSearchSubmit(e) {
  if (!e || e.key !== 'Enter') return false;
  const ne = e.nativeEvent || e;                    // React 합성 이벤트 → 원본 이벤트
  if (ne.isComposing || e.isComposing) return false; // 한글 IME 조합 확정 Enter 무시
  if (e.keyCode === 229 || ne.keyCode === 229) return false; // 레거시 IME(keyCode 229)
  return true;
}

// 터치 기기(소프트 키보드)인가? matchMedia 미지원/실패 시 false(키보드 유지 — 안전 기본값).
export function shouldDismissKeyboard(win) {
  const w = win || (typeof window !== 'undefined' ? window : null);
  try {
    return !!(w && typeof w.matchMedia === 'function' && w.matchMedia('(pointer: coarse)').matches);
  } catch {
    return false;
  }
}

// 검색 입력 onKeyDown 공통 핸들러. 처리했으면 true.
//   flush: 디바운스 즉시 플러시(useList().flush) — 없으면 생략(디바운스가 곧 반영).
//   win:   테스트 주입용 window 대체.
export function onSearchEnter(e, flush, win) {
  if (!isSearchSubmit(e)) return false;
  if (typeof e.preventDefault === 'function') e.preventDefault(); // 폼 없는 입력이지만 방어
  if (typeof flush === 'function') flush();
  if (shouldDismissKeyboard(win)) {
    const el = e.currentTarget || e.target;
    if (el && typeof el.blur === 'function') el.blur();
  }
  return true;
}
