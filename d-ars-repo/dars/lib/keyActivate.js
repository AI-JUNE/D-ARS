// lib/keyActivate.js — 클릭 전용 요소(role="button" div 등)의 키보드 활성화 공통 처리
//
// 문제: /scenarios 보드 카드·빌더 사이드 목록은 <div onClick> 이라
//   - Tab 으로 도달할 수 없고(tabIndex 없음), 도달해도 Enter/Space 가 무반응이라
//     키보드 사용자는 시나리오를 선택할 수 없었다(WCAG 2.1.1 Keyboard).
// 해결: pressableProps(fn, label) 한 묶음으로 role="button"·tabIndex=0·
//       onClick·onKeyDown(Enter/Space → fn)을 부여한다. 네이티브 <button> 규격과 동일하게
//       Space 는 preventDefault 로 페이지 스크롤을 막는다(SortTh 와 같은 계약).
//
// 한글 IME 안전: 조합(composition) 중 Enter 는 글자 확정 동작이므로 무시한다
// (nativeEvent.isComposing · 레거시 keyCode 229 이중 방어 — lib/searchEnter.js 와 동일).
//
// 저위험: 순수 로직(테스트 가능) + 속성 추가만. 서버 API·레이아웃·인증·개인정보 로직 불변.

// 이 keydown 이 "활성화" 의도인가? (Enter·Space + IME 조합 중 아님)
export function isActivateKey(e) {
  if (!e || typeof e !== 'object') return false;
  const k = e.key;
  if (k !== 'Enter' && k !== ' ' && k !== 'Spacebar') return false;
  const ne = e.nativeEvent || e;                     // React 합성 이벤트 → 원본 이벤트
  if (ne.isComposing || e.isComposing) return false; // 한글 IME 조합 확정 Enter 무시
  if (e.keyCode === 229 || ne.keyCode === 229) return false; // 레거시 IME(keyCode 229)
  return true;
}

// role="button" 요소의 onKeyDown 공통 핸들러. 처리했으면 true.
export function onActivateKey(e, fn) {
  if (!isActivateKey(e)) return false;
  if (typeof e.preventDefault === 'function') e.preventDefault(); // Space 스크롤 방지
  if (typeof fn === 'function') fn(e);
  return true;
}

// 클릭 전용 div 를 키보드 조작 가능하게 만드는 속성 묶음.
//   fn:    활성화 콜백(클릭·Enter·Space 공통)
//   label: 접근 가능한 이름(aria-label) — 생략 시 요소 텍스트가 이름이 된다.
// 반환 속성은 JSX 에 {...pressableProps(...)} 로 전개한다(표시·레이아웃 불변 — 속성만 추가).
export function pressableProps(fn, label) {
  const props = {
    role: 'button',
    tabIndex: 0,
    onClick: fn,
    onKeyDown: (e) => onActivateKey(e, fn),
  };
  if (label) props['aria-label'] = label;
  return props;
}
