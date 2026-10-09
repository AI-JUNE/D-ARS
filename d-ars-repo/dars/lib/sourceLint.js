// lib/sourceLint.js — 소스 불변식 스캐너(순수 로직 · node:test 전용)
//
// 배경(2026-08-05, 111회차): <button> 은 type 미지정 시 **암시적 submit** — 현재 폼은 /login 뿐이라
// 당장은 무해하지만, 이후 어떤 화면이든 <form> 으로 감싸는 순간 목록·내보내기 버튼이 폼 전송으로
// 페이지를 리로드시키는 **잠복 회귀**가 된다(엔터키 기본 버튼 오작동 포함). 앱 전역 40곳(14파일)을
// type="button" 으로 명시 통일했고, 이 스캐너를 테스트에서 전 JSX 에 돌려 재발을 회귀 고정한다.
//
// 설계: 순수 문자열 입력 → 결과 배열 출력(파일시스템 무관 → 유닛 테스트 가능).
//   태그는 여러 줄에 걸칠 수 있으므로 줄 단위 grep 이 아니라 **여는 태그 전체**([^>]* 는 개행 포함
//   문자 클래스라 멀티라인 태그도 잡는다)를 대상으로 type= 존재를 판정한다.

// JSX 소스에서 <name …> 여는 태그 전부(여러 줄 태그 포함)를 {tag, line}으로 수집한다.
// line 은 태그 시작 행(1부터) — 위반 보고 시 사람이 바로 찾아갈 수 있게 한다.
// name 은 테스트가 선언하는 상수 태그명만 사용(사용자 입력 아님 · 테스트 전용 모듈).
export function openTags(src, name) {
  if (typeof src !== 'string' || !src || typeof name !== 'string' || !/^[a-z][a-z0-9]*$/.test(name)) return [];
  const out = [];
  const re = new RegExp(`<${name}\\b[^>]*>`, 'g');
  let m;
  while ((m = re.exec(src))) {
    out.push({ tag: m[0], line: src.slice(0, m.index).split('\n').length });
  }
  return out;
}

// 여는 태그 중 attrRe(속성 존재 정규식)를 만족하지 않는 태그의 시작 행 번호 목록.
function missingAttr(src, name, attrRe) {
  return openTags(src, name).filter((t) => !attrRe.test(t.tag)).map((t) => t.line);
}

// <button> 여는 태그 수집(111회차 API 유지 — 기존 테스트 하위호환).
export function buttonTags(src) {
  return openTags(src, 'button');
}

// type= 명시가 없는 <button> 태그의 시작 행 번호 목록. **항상 빈 배열이어야 한다.**
// type="submit"·type="button" 등 명시된 값은 모두 통과(의도 표현이 목적 — 값 강제는 하지 않는다).
export function missingButtonType(src) {
  return missingAttr(src, 'button', /\btype\s*=/);
}

// ---- 112회차: 데이터 표 접근성 불변식 ----
// 배경: 99회차에서 전 데이터 표 <th> 에 scope="col"(헤더-셀 연결), 107회차에서 전 <table> 에
// aria-label(표 이름 낭독)을 부여 완료했다. 둘 다 "새 표·새 컬럼이 추가되는 순간 조용히 깨지는"
// 성격이라(빌드·런타임 오류 없음), 버튼 type 과 동일하게 소스 스캔으로 재발을 회귀 고정한다.

// scope= 명시가 없는 <th> 태그의 시작 행 번호 목록. **항상 빈 배열이어야 한다.**
// (<thead> 는 \b 경계로 매칭되지 않는다. scope 값 강제는 하지 않음 — row 헤더 확장 허용.)
export function missingThScope(src) {
  return missingAttr(src, 'th', /\bscope\s*=/);
}

// 접근 가능한 이름(aria-label 또는 aria-labelledby)이 없는 <table> 태그의 시작 행 번호 목록.
// **항상 빈 배열이어야 한다.**
export function missingTableLabel(src) {
  return missingAttr(src, 'table', /\baria-label(?:ledby)?\s*=/);
}

// ---- 113회차: 기호 전용 버튼 이름 · 다이얼로그 요건 불변식 ----
// 배경: 103~110회차에서 앱 전역의 기호 전용 버튼(↑·↓·✕·⚙·🔗 등)에 aria-label 을 부여 완료했다
// (WCAG 4.1.2 Name). 이것도 "새 아이콘 버튼이 추가되는 순간 조용히 깨지는" 성격이라 소스 스캔으로
// 재발을 회귀 고정한다. 판정은 **내용까지** 봐야 하므로(여는 태그만으로는 기호 전용 여부를 모른다)
// 요소 전체(<button …>…</button>)를 수집하는 buttonElements 를 신설한다.

// <name> 요소 전체를 {tag(여는 태그), inner(내용), line(시작 행)}으로 수집한다.
// 자기 중첩이 HTML 스펙상 금지인 요소(button·label 등 — 폼 콘텐츠 모델)에만 사용하며,
// 그 전제에서 비탐욕 매칭으로 충분하다. 자기닫힘(<name …/>)은 내용 없음으로 취급한다.
// (116회차: buttonElements 를 일반화 — 수집 계약 동일, 기존 테스트 하위호환)
export function elementsOf(src, name) {
  if (typeof src !== 'string' || !src || typeof name !== 'string' || !/^[a-z][a-z0-9]*$/.test(name)) return [];
  const out = [];
  const re = new RegExp(`<${name}\\b[^>]*\\/>|<${name}\\b[^>]*>[\\s\\S]*?<\\/${name}>`, 'g');
  let m;
  while ((m = re.exec(src))) {
    const whole = m[0];
    const line = src.slice(0, m.index).split('\n').length;
    const selfClose = whole.indexOf('</') === -1;
    const gt = whole.indexOf('>');
    out.push({
      tag: selfClose ? whole : whole.slice(0, gt + 1),
      inner: selfClose ? '' : whole.slice(gt + 1, whole.lastIndexOf(`</${name}>`)),
      line,
    });
  }
  return out;
}

// <button> 요소 전체 수집(113회차 API 유지 — 기존 테스트 하위호환).
export function buttonElements(src) {
  return elementsOf(src, 'button');
}

// 접근 가능한 이름이 없는 **기호/공백 전용** <button> 의 시작 행 번호 목록. **항상 빈 배열이어야 한다.**
// 판정(보수적 — 오탐 방지 우선):
//   1) 여는 태그에 aria-label/aria-labelledby 있으면 통과.
//   2) 내용에서 하위 태그를 제거하고, JSX 표현식({…})을 안쪽부터 반복 제거한 잔여 텍스트에
//      글자·숫자(\p{L}\p{N} — 한글 포함)가 있으면 이름 보유로 통과.
//   3) 표현식이 있었으면 내용을 정적으로 알 수 없으므로 **판정 보류(통과)** — 삼항 라벨 등 오탐 방지.
//   4) 남는 것(기호·공백·빈 내용뿐인데 라벨 없음)만 위반.
export function unnamedIconButtons(src) {
  const bad = [];
  for (const b of buttonElements(src)) {
    if (/\baria-label(?:ledby)?\s*=/.test(b.tag)) continue;
    let t = b.inner.replace(/<[^>]*>/g, ' ');
    let hadExpr = false;
    let prev;
    do {
      prev = t;
      t = t.replace(/\{[^{}]*\}/g, () => { hadExpr = true; return ' '; });
    } while (t !== prev);
    if (/[\p{L}\p{N}]/u.test(t)) continue;
    if (hadExpr) continue;
    bad.push(b.line);
  }
  return bad;
}

// role="dialog" 여는 태그 중 aria-modal= 또는 접근 가능한 이름(aria-label/aria-labelledby)이
// 빠진 태그의 시작 행 번호 목록. **항상 빈 배열이어야 한다.** (WAI-ARIA dialog 규격 — 모달 다이얼로그는
// aria-modal 과 이름을 함께 가져야 배경 격리·용도 낭독이 된다. CommandPalette 가 현재 유일한 준수 사례.)
export function dialogMissingRequirements(src) {
  if (typeof src !== 'string' || !src) return [];
  const bad = [];
  const re = /<[a-zA-Z][^>]*\brole\s*=\s*"dialog"[^>]*>/g;
  let m;
  while ((m = re.exec(src))) {
    const tag = m[0];
    if (/\baria-modal\s*=/.test(tag) && /\baria-label(?:ledby)?\s*=/.test(tag)) continue;
    bad.push(src.slice(0, m.index).split('\n').length);
  }
  return bad;
}

// ---- 114회차: 이미지·SVG 접근성 · 새 창 링크 보안 불변식 ----
// 배경(113회차 예고 항목): (1) <img> alt 부재·<svg> 스크린리더 방침 부재는 빌드·런타임 오류 없이
// 조용히 깨지는 접근성 회귀(WCAG 1.1.1 Non-text Content). 현재 <img> 0건 · <svg> 5곳(charts 3=
// role="img"+aria-label 정보성 · page 2=aria-hidden 장식) 전부 준수라 지금 불변식으로 고정한다.
// (2) target="_blank" 링크의 rel=noopener 부재는 reverse tabnabbing(새 창이 window.opener 로
// 원 페이지를 바꿔치기) 보안 결함 — 현재 0건이므로 앞으로 추가될 외부 링크를 소스 스캔으로 고정한다.

// alt= 명시가 없는 <img> 태그의 시작 행 번호 목록. **항상 빈 배열이어야 한다.**
// (alt="" 장식 이미지도 명시적 선언이므로 통과 — 속성 존재만 강제, 값은 강제하지 않는다.)
export function missingImgAlt(src) {
  return missingAttr(src, 'img', /\balt\s*=/);
}

// 스크린리더 처리 방침이 없는 <svg> 태그의 시작 행 번호 목록. **항상 빈 배열이어야 한다.**
// 장식이면 aria-hidden, 정보성이면 접근 가능한 이름(aria-label/aria-labelledby) — 둘 중 하나는
// 반드시 선언해야 한다(무선언 = 스크린리더가 도형 좌표를 낭독하거나 침묵 — 둘 다 회귀).
export function unlabeledSvgs(src) {
  return missingAttr(src, 'svg', /\baria-hidden\s*=|\baria-label(?:ledby)?\s*=/);
}

// target="_blank" 인데 rel 에 noopener/noreferrer 가 없는 <a> 태그의 시작 행 번호 목록.
// **항상 빈 배열이어야 한다.** rel 이 JSX 표현식({…})이면 정적 판정 불가 → 보류(통과 · 보수적,
// unnamedIconButtons 의 표현식 보류와 동일 계약). target 이 표현식인 것은 판정 대상 아님.
export function blankTargetMissingRel(src) {
  if (typeof src !== 'string' || !src) return [];
  const bad = [];
  for (const t of openTags(src, 'a')) {
    if (!/\btarget\s*=\s*"_blank"/.test(t.tag)) continue;
    if (/\brel\s*=\s*\{/.test(t.tag)) continue; // 표현식 — 판정 보류
    const m = t.tag.match(/\brel\s*=\s*"([^"]*)"/);
    if (m && /\bno(?:opener|referrer)\b/.test(m[1])) continue;
    bad.push(t.line);
  }
  return bad;
}

// ---- 115회차: 포커스 순서 불변식(tabIndex 양수 금지 · autoFocus 허용목록) ----
// 배경(114회차 예고 항목): (1) **양수 tabIndex** 는 문서 순서와 다른 탭 순서를 강제해 키보드
// 탐색을 예측 불가로 만든다(WCAG 2.4.3 Focus Order — 업계 공통 금지 규칙 · eslint-plugin-jsx-a11y
// no-positive-tabindex 와 동일 취지). 현재 앱은 tabIndex 0(도달 가능)만 사용 — 양수 0건을
// 소스 불변식으로 고정한다. (2) **autoFocus** 는 화면 진입 시 포커스를 강탈해 스크린리더 문맥을
// 끊고 모바일 키보드를 불쑥 띄운다 — 단일 목적 폼(/login 아이디 입력)·방금 연 편집 입력
// (SavedViews 이름 입력)만 정당 사례. 전면 금지 대신 **허용목록 대조**로 고정해, 새 autoFocus 가
// 추가되면 테스트가 실패하며 의도 확인(허용목록 갱신)을 강제한다.

// 정적 양수 tabIndex 의 행 번호 목록. **항상 빈 배열이어야 한다.**
// JSX 속성(tabIndex={1}·tabIndex="1")과 JS 객체 속성(tabIndex: 1 — pressableProps 등 헬퍼가
// .js 에서 속성 묶음을 만드는 경우)을 함께 잡는다. 0·음수(-1 프로그램 포커스)·표현식은
// 판정 대상 아님(보수적 — 오탐 방지 우선).
export function positiveTabIndex(src) {
  if (typeof src !== 'string' || !src) return [];
  const bad = [];
  const re = /\btabIndex\s*(?:=\s*(?:\{\s*\+?(\d+)\s*\}|"\+?(\d+)")|:\s*\+?(\d+))/g;
  let m;
  while ((m = re.exec(src))) {
    const v = Number(m[1] ?? m[2] ?? m[3]);
    if (v > 0) bad.push(src.slice(0, m.index).split('\n').length);
  }
  return bad;
}

// autoFocus 식별자 출현 행 번호 목록(JSX 속성·JS 객체 속성 — 식별자 단위·주석 포함).
// 스캐너는 수집만 담당하고, 통합 테스트가 허용목록(login·SavedViews)과 대조한다.
// autoFocused 등 다른 식별자는 \b 경계로 잡지 않는다.
export function autoFocusLines(src) {
  if (typeof src !== 'string' || !src) return [];
  const out = [];
  const re = /\bautoFocus\b/g;
  let m;
  while ((m = re.exec(src))) out.push(src.slice(0, m.index).split('\n').length);
  return out;
}

// ---- 116회차: 폼 라벨 연결 · 비대화형 onClick 불변식 ----
// 배경(115회차 예고 항목): (1) 연결(htmlFor 또는 컨트롤 감싸기) 없는 <label> 은 스크린리더가
// 입력의 이름을 낭독하지 못하고 라벨 클릭-포커스도 안 된다(WCAG 1.3.1 / 3.3.2 — 현재 3곳 전부
// 준수: login 2=htmlFor · notifications 1=input 감싸기). (2) 비대화형 태그(div·span 등)의
// onClick 은 키보드 도달·활성화가 불가한 잠복 회귀(WCAG 2.1.1) — 110회차에 pressableProps 로
// 마감했지만 새 div onClick 이 추가되는 순간 조용히 깨진다. 정당한 포인터 전용 사례
// (스크림·바깥클릭 캐처·전파 차단)만 통합 테스트 허용목록으로 대조한다.

// 연결 근거가 없는 <label> 의 시작 행 번호 목록. **항상 빈 배열이어야 한다.**
// 통과(보수적 — 오탐 방지 우선): htmlFor= 명시 · 내용에 컨트롤(input/select/textarea) 감싸기 ·
// 컴포넌트(<대문자)나 JSX 표현식({…}) 내용은 정적 판정 불가 → 보류.
// 위반: 순수 텍스트/기호뿐이거나 빈 내용인데 htmlFor 도 없는 label.
export function unassociatedLabels(src) {
  const bad = [];
  for (const el of elementsOf(src, 'label')) {
    if (/\bhtmlFor\s*=/.test(el.tag)) continue;
    if (/<(?:input|select|textarea)\b/.test(el.inner)) continue;
    if (/<[A-Z]/.test(el.inner)) continue; // 컴포넌트가 컨트롤을 렌더할 수 있음 — 보류
    if (/\{/.test(el.inner)) continue; // 표현식 내용 — 보류
    bad.push(el.line);
  }
  return bad;
}

// onClick 이 있는데 키보드 대책이 없는 **비대화형 태그**의 시작 행 번호 목록.
// 통과: onKeyDown 동반(자체 키보드 활성화 처리 — SortTh 패턴). 보류(보수적): 전개 속성
// ({...pressableProps(…)} 류 — onClick·onKeyDown 을 묶음으로 부여하므로 정적 판정 불가).
// role·tabIndex 만으로는 통과가 아니다 — 포커스는 되는데 Enter/Space 가 죽어 있는 상태도 회귀다.
// 남는 것(마우스 전용 onClick)은 보고하되, 스크림·바깥클릭 캐처 같은 정당한 포인터 전용
// 중복 장치(키보드엔 Esc 등 별도 경로 존재)는 통합 테스트의 허용목록이 걸러낸다.
export function nonInteractiveOnClick(src) {
  if (typeof src !== 'string' || !src) return [];
  const bad = [];
  const re = /<(?:div|span|li|ul|ol|tr|td|th|p|section|header|footer|main|nav|table|img|svg)\b[^>]*>/g;
  let m;
  while ((m = re.exec(src))) {
    const tag = m[0];
    if (!/\bonClick\s*=/.test(tag)) continue;
    if (/\bonKeyDown\s*=/.test(tag)) continue;
    if (/\{\s*\.\.\./.test(tag)) continue; // 전개 속성 — 판정 보류
    bad.push(src.slice(0, m.index).split('\n').length);
  }
  return bad;
}

// ---- 119회차: 제어 컴포넌트 배선 · 팝업 토글 상태 낭독 불변식 ----
// 배경(118회차 예고 항목): (1) value=(또는 checked=)만 있고 변경 핸들러가 없는 입력은 React 가
// "read-only field" 경고를 내며 **타이핑·클릭이 조용히 무시되는** 잠복 회귀다(제어 컴포넌트 배선
// 누락 — 빌드는 통과하고 화면도 멀쩡해 보여서 실사용에서만 드러난다). 현재 앱은 위반 0건 —
// 소스 불변식으로 고정한다. (2) aria-haspopup 을 선언한 트리거는 aria-expanded 로 열림/닫힘
// 상태를 함께 낭독해야 한다(WAI-ARIA — 팝업 존재만 알리고 상태를 안 알리면 스크린리더 사용자는
// 눌렀는지 알 수 없다). 현재 2곳(사용자 메뉴 데스크톱/모바일) 전부 준수 — 불변식으로 고정한다.

// value= 또는 checked= 는 있는데 변경 핸들러(onChange/onInput)도 읽기 전용 선언(readOnly/disabled)도
// 없는 input/select/textarea 의 시작 행 번호 목록(오름차순). **항상 빈 배열이어야 한다.**
// defaultValue/defaultChecked(비제어)는 대소문자 경계로 매칭되지 않아 판정 대상 아님.
// 전개 속성({...props})은 핸들러가 묶음으로 올 수 있으므로 판정 보류(통과 · 보수적 —
// unnamedIconButtons·nonInteractiveOnClick 의 보류와 동일 계약).
export function deadControlledInputs(src) {
  if (typeof src !== 'string' || !src) return [];
  const bad = [];
  for (const name of ['input', 'select', 'textarea']) {
    for (const t of openTags(src, name)) {
      if (!/\bvalue\s*=|\bchecked\s*=/.test(t.tag)) continue;
      if (/\bonChange\s*=|\bonInput\s*=/.test(t.tag)) continue;
      if (/\breadOnly\b|\bdisabled\b/.test(t.tag)) continue;
      if (/\{\s*\.\.\./.test(t.tag)) continue; // 전개 속성 — 판정 보류
      bad.push(t.line);
    }
  }
  return bad.sort((a, b) => a - b);
}

// aria-haspopup 선언이 있는데 aria-expanded 가 없는 여는 태그의 시작 행 번호 목록.
// **항상 빈 배열이어야 한다.** 새 드롭다운/메뉴 트리거가 추가될 때 조용히 깨지는 성격이라
// 소스 스캔으로 고정한다. aria-expanded 값은 강제하지 않는다(표현식 {open} 허용 —
// 상태 배선 자체가 목적이고, 값 검증은 런타임 영역).
export function hasPopupMissingExpanded(src) {
  if (typeof src !== 'string' || !src) return [];
  const bad = [];
  const re = /<[a-zA-Z][^>]*\baria-haspopup\s*=[^>]*>/g;
  let m;
  while ((m = re.exec(src))) {
    if (/\baria-expanded\s*=/.test(m[0])) continue;
    bad.push(src.slice(0, m.index).split('\n').length);
  }
  return bad;
}

// ---- 120회차: 프레임 이름 · 문서 언어 선언 불변식 ----
// 배경(119회차 예고 항목): (1) 이름 없는 <iframe> 은 스크린리더가 "프레임"이라고만 낭독해
// 무엇이 들어 있는지 알 수 없다(WCAG 4.1.2 / H64 — 프레임은 title 로 용도를 밝혀야 한다).
// 현재 JSX <iframe> 0건(내보내기 인쇄 프레임은 DOM 생성 + aria-hidden 이라 판정 대상 아님) —
// 앞으로 추가될 임베드(지도·미리보기 등)를 소스 불변식으로 고정한다. (2) lang 없는 <html> 은
// 스크린리더가 문서 언어를 추정해 한국어를 영어 음성으로 읽는 회귀(WCAG 3.1.1 Language of Page).
// 앱 문서 2곳(layout·global-error)과 내보내기 생성 문서(export.js 인쇄/Excel HTML)까지
// 전부 lang="ko" 명시 상태를 고정한다.

// title 도 aria-hidden(장식·숨김 프레임) 도 없는 <iframe> 태그의 시작 행 번호 목록.
// **항상 빈 배열이어야 한다.** title 값은 강제하지 않는다(표현식 {t} 허용 — 선언 자체가 목적).
export function iframeMissingTitle(src) {
  return missingAttr(src, 'iframe', /\btitle\s*=|\baria-hidden\s*=/);
}

// lang= 선언이 없는 <html> 태그의 시작 행 번호 목록. **항상 빈 배열이어야 한다.**
// JSX 루트 레이아웃뿐 아니라 템플릿 문자열로 생성하는 문서(인쇄 리포트·Excel HTML)도 잡는다.
// 오탐 방지: 줄 주석(공백 뒤 // …)은 행을 보존한 채 제거 후 판정 — 주석 속 <html> 언급
// (global-error 규약 주석 등)은 판정 대상이 아니다. URL 의 //(https:// 등)는 공백이 앞서지
// 않아 제거되지 않는다(보수적 — 같은 줄 주석 뒤 실코드는 보류).
export function htmlMissingLang(src) {
  if (typeof src !== 'string' || !src) return [];
  const stripped = src.split('\n').map((l) => l.replace(/(^|\s)\/\/.*$/, '$1')).join('\n');
  return missingAttr(stripped, 'html', /\blang\s*=/);
}

// ---- 125회차: 목적지 없는 링크 · id 중복 불변식 ----
// 배경(121회차 예고 항목): (1) href 없는 <a> 는 **링크가 아니다** — 키보드 탭으로 도달할 수 없고
// (기본 포커스 가능 대상에서 제외) 스크린리더도 "링크"로 낭독하지 않는다(WCAG 2.1.1 / 4.1.2 ·
// eslint-plugin-jsx-a11y anchor-is-valid 와 동일 취지). 마우스로는 눌러 보이지만 아무 일도
// 일어나지 않는 "죽은 링크"가 되어 상용 화면에서 즉시 신뢰를 잃는다. (2) 같은 문서에 **중복 id**
// 가 있으면 htmlFor·aria-labelledby·aria-controls·앵커(#id)가 항상 첫 번째 요소로만 연결돼
// 라벨·설명·이동이 조용히 엉킨다(HTML 명세 위반 · 빌드/런타임 오류 없음 = 잠복 회귀).
// 현재 앱 전 소스 중복 id 0건 — 불변식으로 고정한다.

// href= 선언이 없는 <a> 여는 태그의 시작 행 번호 목록.
// 통과(보수적 — 오탐 방지 우선): href= 명시(값은 강제하지 않음 — 표현식 {url} 허용) ·
// 전개 속성({...props})으로 href 가 주입될 수 있는 태그는 판정 보류
// (unnamedIconButtons·deadControlledInputs 의 보류와 동일 계약).
// 정책: 앱(포털) 소스는 **항상 빈 배열**이어야 한다. 랜딩(app/page.jsx)의 원본 마크업 유래
// 죽은 링크는 목적지·카피 결정이 필요해 통합 테스트가 파일 단위 허용목록으로 분리 관리한다.
export function anchorWithoutHref(src) {
  if (typeof src !== 'string' || !src) return [];
  const bad = [];
  for (const t of openTags(src, 'a')) {
    if (/\bhref\s*=/.test(t.tag)) continue;
    if (/\{\s*\.\.\./.test(t.tag)) continue; // 전개 속성 — 판정 보류
    bad.push(t.line);
  }
  return bad;
}

// 같은 소스 안에서 두 번 이상 나타나는 정적 id 값의 **2번째 이후** 출현 행 번호 목록(오름차순).
// **항상 빈 배열이어야 한다.** 문자열 리터럴 id 만 판정하고 표현식(id={`x-${i}`} — 리스트 렌더에서
// 의도적으로 고유화하는 패턴)은 정적 판정 불가 → 대상 아님(보수적). 첫 출현은 보고하지 않는다
// (위반은 "다시 쓴 쪽"이므로 사람이 고칠 지점을 가리킨다).
export function duplicateIdAttrs(src) {
  if (typeof src !== 'string' || !src) return [];
  const seen = new Set();
  const bad = [];
  const re = /\bid\s*=\s*"([^"]+)"/g;
  let m;
  while ((m = re.exec(src))) {
    const v = m[1];
    if (seen.has(v)) bad.push(src.slice(0, m.index).split('\n').length);
    else seen.add(v);
  }
  return bad.sort((a, b) => a - b);
}

// ---- metadata 상속 대조용 파서 ----
//
// 배경: Next 의 `metadata` 는 레이아웃 → 페이지로 **상속**된다. 자식이 어떤 최상위 키를
// 적지 않으면 부모가 선언한 값이 그대로 내려간다. 「이음 어르신 신청」 화면은 `title` 만
// 덮어쓰고 있었고, 루트 레이아웃의 `openGraph`·`twitter`·`applicationName`·`appleWebApp` 은
// 손대지 않아 **운영 포털 브랜드가 그대로** head 에 실렸다 — 화면 본문의 금지 문구는 테스트가
// 막고 있었지만 head 는 아무도 보지 않았다(어르신이 문자로 받는 링크의 미리보기 카드가 그것이다).
// 그 상속을 사람 눈이 아니라 테스트가 대조하게 하려면 **최상위 키**를 긁을 수단이 필요하다.
//
// 설계: 순수 문자열 입력 → 배열 출력. 던지지 않는다(소스가 바뀌어 못 읽으면 빈 배열이고,
// 호출측 테스트가 "대조가 무의미해졌다"로 실패한다 — 조용한 통과보다 낫다).
// 한계(정직하게): 정규식·중괄호 세기 수준의 파서다. 문자열·주석 안의 괄호와 쉼표는 세지 않지만,
// 템플릿 리터럴 안의 `${…}` 중첩이나 동적으로 조립한 metadata 객체는 판정 대상이 아니다.

// 문자열 리터럴의 **끝 다음** 위치. 여는 따옴표 위치(i)를 받는다. 이스케이프를 건너뛴다.
function endOfStringLiteral(src, i) {
  const q = src[i];
  let j = i + 1;
  while (j < src.length) {
    if (src[j] === '\\') { j += 2; continue; }
    if (src[j] === q) return j + 1;
    j += 1;
  }
  return src.length;
}

// `export const <name> = { … }` 의 **최상위 항목**을 [{ key, value, line }] 로 돌려준다.
// 전개(`...x`)는 키를 만들 수 없으므로 건너뛴다. 괄호가 닫히지 않으면 [].
export function exportedObjectEntries(src, name) {
  if (typeof src !== 'string' || !src) return [];
  if (typeof name !== 'string' || !/^[A-Za-z_$][\w$]*$/.test(name)) return [];
  const head = new RegExp(`export\\s+const\\s+${name}\\s*=\\s*\\{`).exec(src);
  if (!head) return [];

  const segments = [];
  let text = '';
  let segStart = head.index + head[0].length;
  let depth = 0;
  let i = segStart;
  let closed = false;
  while (i < src.length) {
    const c = src[i];
    const two = src.slice(i, i + 2);
    if (two === '//') { const n = src.indexOf('\n', i); i = n === -1 ? src.length : n; continue; }
    if (two === '/*') { const n = src.indexOf('*/', i); i = n === -1 ? src.length : n + 2; continue; }
    if (c === '"' || c === "'" || c === '`') {
      const end = endOfStringLiteral(src, i);
      text += src.slice(i, end);
      i = end;
      continue;
    }
    if (c === '{' || c === '[' || c === '(') { depth += 1; text += c; i += 1; continue; }
    if (c === '}' && depth === 0) { closed = true; i += 1; break; }
    if (c === '}' || c === ']' || c === ')') { depth -= 1; text += c; i += 1; continue; }
    if (c === ',' && depth === 0) {
      segments.push({ text, start: segStart });
      text = '';
      i += 1;
      segStart = i;
      continue;
    }
    text += c;
    i += 1;
  }
  if (!closed) return [];
  segments.push({ text, start: segStart });

  const out = [];
  for (const seg of segments) {
    const s = seg.text.trim();
    if (!s || s.startsWith('...')) continue;
    const pair = /^([A-Za-z_$][\w$]*|'[^']*'|"[^"]*")\s*:([\s\S]*)$/.exec(s);
    const key = pair ? pair[1].replace(/^['"]|['"]$/g, '') : s;
    if (!pair && !/^[A-Za-z_$][\w$]*$/.test(s)) continue; // 해석할 수 없는 조각은 세지 않는다
    out.push({
      key,
      value: (pair ? pair[2] : s).trim(),
      line: src.slice(0, seg.start).split('\n').length,
    });
  }
  return out;
}

// `export const metadata = { … }` 의 최상위 키 → 값 텍스트. 못 읽으면 빈 객체.
export function metadataFields(src) {
  const out = {};
  for (const e of exportedObjectEntries(src, 'metadata')) out[e.key] = e.value;
  return out;
}

// ---- 전역 CSS 상속 대조용 스캐너 ----
//
// 배경: `app/globals.css` 는 **루트 레이아웃이 import** 하므로 어르신 화면(`/eum/**`)에도
// 그대로 내려온다. 클래스를 가진 선택자(`.btn:disabled`)는 어르신 화면에 닿지 않지만
// (그 화면은 클래스를 거의 쓰지 않는다) **요소·의사 선택자**(`button:disabled` · `a` · `h1` ·
// `:focus-visible`)는 닿는다 — metadata 상속과 똑같이 **조용히** 닿는다. 그래서 어르신 화면이
// 인라인 style 로 지켜 온 요건(18pt · 대비 4.5:1)이 그 화면 코드를 하나도 건드리지 않은 채
// 깨질 수 있다. 사람 눈이 아니라 테스트가 대조하게 하려면 그 선택자들을 긁을 수단이 필요하다.
//
// 설계: 순수 문자열 입력 → 배열 출력. 던지지 않는다(못 읽으면 빈 배열이고, 호출측 테스트가
// "대조가 무의미해졌다"로 실패한다 — 조용한 통과보다 낫다).
// 한계(정직하게): 중괄호를 세는 수준의 파서다. `:not(.x)` 처럼 괄호 안에 클래스를 품은 선택자는
// 클래스 있음으로 보아 대상에서 빠지고(보수적), CSS-in-JS·외부 스타일시트는 보지 않는다.

// 여는 중괄호(open)의 짝 위치. 주석은 건너뛴다. 짝이 없으면 end.
function matchBrace(src, open, end) {
  let depth = 0;
  let i = open;
  while (i < end) {
    if (src.startsWith('/*', i)) { const n = src.indexOf('*/', i); i = n === -1 ? end : n + 2; continue; }
    if (src[i] === '{') depth += 1;
    else if (src[i] === '}') { depth -= 1; if (depth === 0) return i; }
    i += 1;
  }
  return end;
}

// 선택자를 품을 수 있는 @규칙(본문이 다시 규칙 목록인 것). 나머지 @규칙(@keyframes·@font-face·
// @page 등)의 본문은 선택자가 아니므로 통째로 건너뛴다.
const NESTED_AT_RULE = /^@(?:media|supports|layer|container|document)\b/i;

function scanRules(src, start, end, out) {
  let i = start;
  let prelude = '';
  while (i < end) {
    if (src.startsWith('/*', i)) { const n = src.indexOf('*/', i); i = n === -1 ? end : n + 2; continue; }
    const c = src[i];
    if (c === '{') {
      const close = matchBrace(src, i, end);
      const sel = prelude.trim();
      if (sel.startsWith('@')) {
        if (NESTED_AT_RULE.test(sel)) scanRules(src, i + 1, close, out);
      } else if (sel) {
        const body = src.slice(i + 1, close);
        for (const part of sel.split(',')) {
          const s = part.trim().replace(/\s+/g, ' ');
          if (s && !s.includes('.') && !s.includes('#')) out.push({ selector: s, body });
        }
      }
      i = close + 1;
      prelude = '';
      continue;
    }
    if (c === ';' || c === '}') { prelude = ''; i += 1; continue; }
    prelude += c;
    i += 1;
  }
}

// CSS 소스에서 **클래스·id 없이도 요소에 닿는** 선택자 목록(선언 순서 · 중복 제거).
export function cssBareSelectors(css) {
  if (typeof css !== 'string' || !css) return [];
  const found = [];
  scanRules(css, 0, css.length, found);
  const out = [];
  const seen = new Set();
  for (const { selector } of found) {
    if (seen.has(selector)) continue;
    seen.add(selector);
    out.push(selector);
  }
  return out;
}

// ── 선택자 이름이 아니라 **선언**까지 센다 ────────────────────────────────
//
// 왜 더 필요한가 — 고친 결함: 위 함수는 선택자를 **중복 제거**해서 돌려주고, 어르신 화면의
// 대조는 그 이름 목록만 분류하게 했다. 그래서 같은 선택자에 선언이 늘어나는 길
// (같은 이름의 **두 번째 규칙**이든, 기존 규칙에 한 줄 추가든)에는 아무 신호가 없었다.
// 실제로 그렇게 들어온 것이 있었다 —
//   · `*{box-sizing}` 로 분류해 둔 뒤 한참 아래에 `*{scrollbar-width;scrollbar-color}` 가 생겼고,
//   · `body` 는 「자간만 끈다」로 분류돼 있었는데 같은 규칙이 `background:var(--bg)` 도 들고 있어
//     어르신 화면의 **문서 바탕색이 포털 것**이었다(ui.jsx 의 EumStyles 참조).
// 선택자 이름은 그대로인데 닿는 속성이 늘어난 것이고, 「요소 선택자를 전부 분류한다」는
// 이름은 그 사이에도 참인 채였다 — 검사하지 않는 낱말이 이름에 들어 있던 또 한 자리다.
//
// 그래서 **선택자 → 닿는 속성 이름 목록**을 돌려준다(여러 규칙에 흩어져 있어도 한 벌로 합친다 ·
// 중복 제거 · 이름순). 값은 보지 않는다 — 값까지 고정하면 포털의 색 한 번 손질에 어르신
// 테스트가 깨지고, 판단에 필요한 것은 "무엇이 닿는가" 다.
export function cssBareDecls(css) {
  const out = {};
  if (typeof css !== 'string' || !css) return out;
  const found = [];
  scanRules(css, 0, css.length, found);
  for (const { selector, body } of found) {
    const bag = out[selector] || (out[selector] = new Set());
    // 중첩 블록(있다면)과 주석을 걷어낸 뒤 `prop:` 꼴만 센다. 값 안의 콜론(url(http://…))은
    // 속성 이름이 될 수 없으므로 **선언 시작 위치**에서만 읽는다.
    const clean = body.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\{[^}]*\}/g, ' ');
    for (const m of clean.matchAll(/(^|[;{])\s*(-{0,2}[A-Za-z][\w-]*)\s*:/g)) bag.add(m[2].toLowerCase());
  }
  for (const k of Object.keys(out)) out[k] = [...out[k]].sort();
  return out;
}

// CSS 가 **바깥으로 걸어 둔 요청**의 출처(호스트) 목록 — `@import` 와 `url(…)` 둘 다 본다.
// 중복 제거 · 나타난 순서.
//
// 왜 필요한가: 위 두 함수는 규칙(선택자·선언)만 본다. 그런데 어르신 화면에 닿는 것은 그것만이
// 아니다 — `app/globals.css` 의 **첫 줄**은 제3자 CDN 의 글꼴 스타일시트를 `@import` 하고,
// 그 파일은 루트 레이아웃이 import 하므로 `/eum` 아래에도 그대로 내려온다. `@import` 는
// 중괄호가 없어 규칙 스캐너가 보지 못했고, 그래서 「전역 CSS 를 전부 분류한다」는 대조는
// 그 줄을 **한 번도** 지나가지 않았다(어르신 화면은 그 글꼴을 쓰지도 않는다 — 인라인
// fontFamily 는 system-ui 다). 새 제3자 요청이 조용히 늘어나는 것을 막는 수단이다.
export function cssExternalRefs(css) {
  if (typeof css !== 'string' || !css) return [];
  const out = [];
  const seen = new Set();
  for (const m of css.matchAll(/https?:\/\/([^/\s'")]+)/g)) {
    const host = m[1].toLowerCase();
    if (seen.has(host)) continue;
    seen.add(host);
    out.push(host);
  }
  return out;
}

// 같은 파일 최상위의 `const NAME = '…'` 문자열 상수를 text 안에서 **값으로 펼친다**.
// 이유: `description: DESC` 처럼 상수를 가리키는 값은 텍스트만 봐서는 무엇이 들었는지 알 수 없다 —
// 브랜드 문구가 상수 뒤에 숨으면 대조가 조용히 통과한다.
export function inlineStringConsts(src, text) {
  if (typeof text !== 'string') return '';
  if (typeof src !== 'string' || !src) return text;
  const map = new Map();
  const re = /\bconst\s+([A-Za-z_$][\w$]*)\s*=\s*(['"])((?:\\.|(?!\2)[^\\])*)\2/g;
  let m;
  while ((m = re.exec(src))) map.set(m[1], m[3]);
  if (!map.size) return text;
  return text.replace(/\b[A-Za-z_$][\w$]*\b/g, (w) => (map.has(w) ? map.get(w) : w));
}
