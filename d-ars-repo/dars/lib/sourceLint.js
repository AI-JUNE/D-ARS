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

// <button> 요소 전체를 {tag(여는 태그), inner(내용), line(시작 행)}으로 수집한다.
// 중첩 <button> 은 HTML 스펙상 금지(폼 콘텐츠 모델)라 비탐욕 매칭으로 충분하다.
// 자기닫힘(<button …/>)은 내용 없음으로 취급한다.
export function buttonElements(src) {
  if (typeof src !== 'string' || !src) return [];
  const out = [];
  const re = /<button\b[^>]*\/>|<button\b[^>]*>[\s\S]*?<\/button>/g;
  let m;
  while ((m = re.exec(src))) {
    const whole = m[0];
    const line = src.slice(0, m.index).split('\n').length;
    const selfClose = whole.indexOf('</') === -1;
    const gt = whole.indexOf('>');
    out.push({
      tag: selfClose ? whole : whole.slice(0, gt + 1),
      inner: selfClose ? '' : whole.slice(gt + 1, whole.lastIndexOf('</button>')),
      line,
    });
  }
  return out;
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
