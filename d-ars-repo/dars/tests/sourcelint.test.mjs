// tests/sourcelint.test.mjs — <button> type 명시 불변식(111회차)
// 유닛: 스캐너(buttonTags·missingButtonType) 계약. 통합: app/·lib/ 전 JSX 실소스 스캔 → 위반 0.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buttonTags, missingButtonType, openTags, missingThScope, missingTableLabel, buttonElements, elementsOf, unnamedIconButtons, dialogMissingRequirements, missingImgAlt, unlabeledSvgs, blankTargetMissingRel, positiveTabIndex, autoFocusLines, unassociatedLabels, nonInteractiveOnClick, deadControlledInputs, hasPopupMissingExpanded } from '../lib/sourceLint.js';

test('한 줄 태그: type 없는 <button> 을 행 번호로 보고한다', () => {
  const src = 'a\n<button onClick={x}>go</button>\n';
  assert.deepEqual(missingButtonType(src), [2]);
});

test('여러 줄 태그: 다음 줄에 type 이 있으면 위반이 아니다(줄 grep 오탐 방지)', () => {
  const src = '<button\n  type="button"\n  onClick={x}\n>go</button>';
  assert.deepEqual(missingButtonType(src), []);
  assert.equal(buttonTags(src).length, 1);
});

test('type="submit" 등 명시된 값은 전부 통과한다(값 강제 없음)', () => {
  assert.deepEqual(missingButtonType('<button type="submit">로그인</button>'), []);
  assert.deepEqual(missingButtonType("<button type={t}>x</button>"), []);
});

test('한 줄의 여러 태그를 각각 판정한다', () => {
  const src = '<button type="button">a</button><button onClick={x}>b</button>';
  assert.deepEqual(missingButtonType(src), [1]);
  assert.equal(buttonTags(src).length, 2);
});

test('버튼 태그가 아닌 텍스트(주석 언급 button·ButtonLike 컴포넌트)는 잡지 않는다', () => {
  assert.deepEqual(buttonTags('// button 은 type 을 명시한다\n<Button x/>\n<buttonlike/>'), []);
});

test('이상 입력에 throw 하지 않는다', () => {
  assert.deepEqual(buttonTags(null), []);
  assert.deepEqual(buttonTags(undefined), []);
  assert.deepEqual(buttonTags(''), []);
  assert.deepEqual(missingButtonType(123), []);
});

// ---- 112회차: 표 접근성 불변식(th scope · table aria-label) ----

test('openTags: 태그명 경계를 지킨다(<th> 는 <thead> 를 잡지 않는다)', () => {
  const src = '<thead><tr><th scope="col">a</th></tr></thead>';
  assert.equal(openTags(src, 'th').length, 1);
  assert.equal(openTags(src, 'thead').length, 1);
});

test('openTags: 이상 입력에 throw 하지 않는다', () => {
  assert.deepEqual(openTags(null, 'th'), []);
  assert.deepEqual(openTags('<th>', null), []);
  assert.deepEqual(openTags('<th>', 'TH-잘못된이름'), []);
});

test('missingThScope: scope 없는 <th> 를 행 번호로 보고, 여러 줄 태그는 오탐하지 않는다', () => {
  assert.deepEqual(missingThScope('<tr>\n<th>이름</th></tr>'), [2]);
  assert.deepEqual(missingThScope('<th\n  scope="col"\n>이름</th>'), []);
  assert.deepEqual(missingThScope('<th scope={s}>x</th>'), []);
});

test('missingTableLabel: aria-label 또는 aria-labelledby 있으면 통과, 없으면 보고', () => {
  assert.deepEqual(missingTableLabel('<table className="tbl">'), [1]);
  assert.deepEqual(missingTableLabel('<table aria-label="목록">'), []);
  assert.deepEqual(missingTableLabel('<table\n  aria-labelledby="cap"\n>'), []);
});

// ---- 113회차: 기호 전용 버튼 이름 · 다이얼로그 요건 불변식 ----

test('buttonElements: 여는 태그·내용·시작 행을 수집하고 자기닫힘은 내용 없음이다', () => {
  const els = buttonElements('a\n<button type="button">go</button>\n<button type="button"/>');
  assert.equal(els.length, 2);
  assert.equal(els[0].line, 2);
  assert.equal(els[0].inner, 'go');
  assert.equal(els[1].inner, '');
  assert.deepEqual(buttonElements(null), []);
});

test('unnamedIconButtons: 라벨 없는 기호 전용 버튼을 행 번호로 보고한다', () => {
  assert.deepEqual(unnamedIconButtons('<button type="button">✕</button>'), [1]);
  assert.deepEqual(unnamedIconButtons('a\n<button type="button">\n  ↑\n</button>'), [2]);
  assert.deepEqual(unnamedIconButtons('<button type="button"/>'), [1]);
});

test('unnamedIconButtons: aria-label(ledby)·글자/숫자/한글 내용은 통과한다', () => {
  assert.deepEqual(unnamedIconButtons('<button type="button" aria-label="닫기">✕</button>'), []);
  assert.deepEqual(unnamedIconButtons('<button type="button"\n  aria-labelledby="t"\n>✕</button>'), []);
  assert.deepEqual(unnamedIconButtons('<button type="button">저장</button>'), []);
  assert.deepEqual(unnamedIconButtons('<button type="button">1</button>'), []);
});

test('unnamedIconButtons: JSX 표현식 내용은 정적 판정 불가 → 보류(오탐 방지)한다', () => {
  assert.deepEqual(unnamedIconButtons("<button type=\"button\">{busy ? '…' : '실행'}</button>"), []);
  assert.deepEqual(unnamedIconButtons('<button type="button">✕ {label}</button>'), []);
  assert.deepEqual(unnamedIconButtons('<button type="button"><Icon name={x}/></button>'), [1]);
});

test('dialogMissingRequirements: aria-modal·이름 둘 다 있어야 통과한다', () => {
  assert.deepEqual(dialogMissingRequirements('<div role="dialog" aria-modal="true" aria-label="빠른 이동">'), []);
  assert.deepEqual(dialogMissingRequirements('a\n<div role="dialog" aria-label="이동">'), [2]);
  assert.deepEqual(dialogMissingRequirements('<div role="dialog" aria-modal="true">'), [1]);
  assert.deepEqual(dialogMissingRequirements('<div className="box">'), []);
  assert.deepEqual(dialogMissingRequirements(null), []);
});

// ---- 114회차: 이미지·SVG 접근성 · 새 창 링크 보안 불변식 ----

test('missingImgAlt: alt 없는 <img> 를 행 번호로 보고, alt=""·표현식·여러 줄은 통과한다', () => {
  assert.deepEqual(missingImgAlt('a\n<img src="/x.png"/>'), [2]);
  assert.deepEqual(missingImgAlt('<img src="/x.png" alt=""/>'), []);
  assert.deepEqual(missingImgAlt('<img\n  src="/x.png"\n  alt={t}\n/>'), []);
  assert.deepEqual(missingImgAlt(null), []);
});

test('unlabeledSvgs: aria-hidden(장식) 또는 aria-label(ledby)(정보성) 둘 중 하나는 필수다', () => {
  assert.deepEqual(unlabeledSvgs('<svg viewBox="0 0 24 24">'), [1]);
  assert.deepEqual(unlabeledSvgs('<svg aria-hidden="true" focusable="false">'), []);
  assert.deepEqual(unlabeledSvgs('<svg role="img" aria-label={trendLabel(D, unit)}>'), []);
  assert.deepEqual(unlabeledSvgs('<svg\n  role="img"\n  aria-labelledby="t"\n>'), []);
  assert.deepEqual(unlabeledSvgs(null), []);
});

test('blankTargetMissingRel: rel 없는 target="_blank" 를 보고하고, noopener/noreferrer·표현식은 통과한다', () => {
  assert.deepEqual(blankTargetMissingRel('a\n<a href="https://x.y" target="_blank">외부</a>'), [2]);
  assert.deepEqual(blankTargetMissingRel('<a href="/x" target="_blank" rel="nofollow">x</a>'), [1]);
  assert.deepEqual(blankTargetMissingRel('<a href="/x" target="_blank" rel="noopener">x</a>'), []);
  assert.deepEqual(blankTargetMissingRel('<a href="/x"\n  target="_blank"\n  rel="noopener noreferrer"\n>x</a>'), []);
  assert.deepEqual(blankTargetMissingRel('<a href="/x" target="_blank" rel={relValue}>x</a>'), []);
  assert.deepEqual(blankTargetMissingRel('<a href="/x">내부</a>'), []);
  assert.deepEqual(blankTargetMissingRel(null), []);
});

// ---- 115회차: 포커스 순서 불변식(tabIndex 양수 금지 · autoFocus 허용목록) ----

test('positiveTabIndex: 양수 tabIndex 를 JSX 세 표기·JS 객체 표기 모두에서 행 번호로 보고한다', () => {
  assert.deepEqual(positiveTabIndex('a\n<div tabIndex={1}>x</div>'), [2]);
  assert.deepEqual(positiveTabIndex('<div tabIndex="2">x</div>'), [1]);
  assert.deepEqual(positiveTabIndex('const p = {\n  tabIndex: 3,\n};'), [2]);
  assert.deepEqual(positiveTabIndex('<a tabIndex={1}/>\n<b tabIndex={2}/>'), [1, 2]);
});

test('positiveTabIndex: 0·음수·표현식은 판정 대상이 아니고 이상 입력에 throw 하지 않는다', () => {
  assert.deepEqual(positiveTabIndex('<div tabIndex={0}>x</div>'), []);
  assert.deepEqual(positiveTabIndex('const p = { tabIndex: 0 };'), []);
  assert.deepEqual(positiveTabIndex('<div tabIndex={-1}>x</div>'), []);
  assert.deepEqual(positiveTabIndex('<div tabIndex={open ? 0 : -1}>x</div>'), []);
  assert.deepEqual(positiveTabIndex(null), []);
  assert.deepEqual(positiveTabIndex(''), []);
});

test('autoFocusLines: autoFocus 식별자를 행 번호로 수집하고 다른 식별자·이상 입력엔 불개입한다', () => {
  assert.deepEqual(autoFocusLines('<input\n  autoFocus\n  type="text"\n/>'), [2]);
  assert.deepEqual(autoFocusLines('<input autoFocus={x}/> <input autoFocus/>'), [1, 1]);
  assert.deepEqual(autoFocusLines('const autoFocused = true; noAutoFocus();'), []);
  assert.deepEqual(autoFocusLines(null), []);
  assert.deepEqual(autoFocusLines(''), []);
});

// ---- 116회차: 폼 라벨 연결 · 비대화형 onClick 불변식 ----

test('elementsOf: 요소 전체를 수집하고(버튼과 동일 계약) 이상 입력에 throw 하지 않는다', () => {
  const els = elementsOf('a\n<label htmlFor="x">이름</label>\n<label/>', 'label');
  assert.equal(els.length, 2);
  assert.equal(els[0].line, 2);
  assert.equal(els[0].inner, '이름');
  assert.equal(els[1].inner, '');
  assert.deepEqual(elementsOf(null, 'label'), []);
  assert.deepEqual(elementsOf('<label>x</label>', 'LABEL-잘못된이름'), []);
});

test('unassociatedLabels: htmlFor 없는 텍스트 전용 label 을 보고하고, htmlFor·컨트롤 감싸기는 통과한다', () => {
  assert.deepEqual(unassociatedLabels('a\n<label className="f">이름</label>'), [2]);
  assert.deepEqual(unassociatedLabels('<label/>'), [1]);
  assert.deepEqual(unassociatedLabels('<label htmlFor="in-name">이름</label>'), []);
  assert.deepEqual(unassociatedLabels('<label className="f">\n  <span>이름</span>\n  <input type="text"/>\n</label>'), []);
  assert.deepEqual(unassociatedLabels('<label>\n  <select><option>a</option></select>\n</label>'), []);
});

test('unassociatedLabels: 컴포넌트·표현식 내용은 정적 판정 불가 → 보류하고 이상 입력에 throw 하지 않는다', () => {
  assert.deepEqual(unassociatedLabels('<label><Field name="x"/></label>'), []);
  assert.deepEqual(unassociatedLabels('<label>{children}</label>'), []);
  assert.deepEqual(unassociatedLabels(null), []);
  assert.deepEqual(unassociatedLabels(''), []);
});

test('nonInteractiveOnClick: onClick 있는 비대화형 태그를 행 번호로 보고한다(여러 줄 포함)', () => {
  assert.deepEqual(nonInteractiveOnClick('a\n<div className="card" onClick={go}>x</div>'), [2]);
  assert.deepEqual(nonInteractiveOnClick('<span onClick={f}>x</span>\n<li\n  onClick={g}\n>y</li>'), [1, 2]);
  assert.deepEqual(nonInteractiveOnClick('<div className="plain">x</div>'), []);
  assert.deepEqual(nonInteractiveOnClick('<button type="button" onClick={f}>x</button>'), []);
});

test('nonInteractiveOnClick: onKeyDown·role+tabIndex·전개 속성은 통과/보류하고 이상 입력에 throw 하지 않는다', () => {
  assert.deepEqual(nonInteractiveOnClick('<div onClick={f} onKeyDown={k}>x</div>'), []);
  assert.deepEqual(nonInteractiveOnClick('<th\n  scope="col"\n  role="button"\n  tabIndex={0}\n  onClick={f}\n>x</th>'), [1]);
  assert.deepEqual(nonInteractiveOnClick('<th role="button" tabIndex={0} onClick={f} onKeyDown={k}>x</th>'), []);
  assert.deepEqual(nonInteractiveOnClick('<div {...pressableProps(f, "열기")}>x</div>'), []);
  assert.deepEqual(nonInteractiveOnClick('<div role="button" onClick={f}>x</div>'), [1]);
  assert.deepEqual(nonInteractiveOnClick(null), []);
  assert.deepEqual(nonInteractiveOnClick(''), []);
});

// ---- 통합: 실소스 전수 스캔(재발 고정) ----
function walkJsx(dir, out = []) {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) walkJsx(p, out);
    else if (p.endsWith('.jsx')) out.push(p);
  }
  return out;
}

// .js 도 포함(포커스 속성은 pressableProps 처럼 .js 헬퍼가 만들 수 있다).
function walkSrc(dir, out = []) {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) walkSrc(p, out);
    else if (p.endsWith('.jsx') || p.endsWith('.js')) out.push(p);
  }
  return out;
}

test('app/·lib/ 전 JSX: type 미명시 <button> 0건(암시적 submit 금지)', () => {
  // fileURLToPath: Windows(호스트)에서도 올바른 경로(`/C:/…` 오변환 방지) — 크로스 플랫폼.
  const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
  const files = [...walkJsx(path.join(root, 'app')), ...walkJsx(path.join(root, 'lib'))];
  assert.ok(files.length >= 20, `JSX 파일 수집 이상(${files.length}개) — 경로 확인`);
  const bad = [];
  for (const f of files) {
    const lines = missingButtonType(fs.readFileSync(f, 'utf8'));
    if (lines.length) bad.push(`${path.relative(root, f)}:${lines.join(',')}`);
  }
  assert.deepEqual(bad, [], `type 미명시 <button> 발견: ${bad.join(' · ')}`);
});

test('app/·lib/ 전 JSX: scope 미명시 <th> 0건 · 이름 없는 <table> 0건(표 접근성 불변식)', () => {
  const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
  const files = [...walkJsx(path.join(root, 'app')), ...walkJsx(path.join(root, 'lib'))];
  assert.ok(files.length >= 20, `JSX 파일 수집 이상(${files.length}개) — 경로 확인`);
  const bad = [];
  for (const f of files) {
    const src = fs.readFileSync(f, 'utf8');
    const th = missingThScope(src);
    const tbl = missingTableLabel(src);
    if (th.length) bad.push(`${path.relative(root, f)} th:${th.join(',')}`);
    if (tbl.length) bad.push(`${path.relative(root, f)} table:${tbl.join(',')}`);
  }
  assert.deepEqual(bad, [], `표 접근성 위반 발견: ${bad.join(' · ')}`);
});

test('app/·lib/ 전 JSX: 무명 기호 버튼 0건 · 요건 미달 dialog 0건(113회차 불변식)', () => {
  const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
  const files = [...walkJsx(path.join(root, 'app')), ...walkJsx(path.join(root, 'lib'))];
  assert.ok(files.length >= 20, `JSX 파일 수집 이상(${files.length}개) — 경로 확인`);
  const bad = [];
  for (const f of files) {
    const src = fs.readFileSync(f, 'utf8');
    const btn = unnamedIconButtons(src);
    const dlg = dialogMissingRequirements(src);
    if (btn.length) bad.push(`${path.relative(root, f)} button:${btn.join(',')}`);
    if (dlg.length) bad.push(`${path.relative(root, f)} dialog:${dlg.join(',')}`);
  }
  assert.deepEqual(bad, [], `기호 버튼/다이얼로그 불변식 위반: ${bad.join(' · ')}`);
});

test('app/·lib/ 전 JSX: alt 없는 <img> 0건 · 방침 없는 <svg> 0건 · rel 없는 _blank 링크 0건(114회차 불변식)', () => {
  const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
  const files = [...walkJsx(path.join(root, 'app')), ...walkJsx(path.join(root, 'lib'))];
  assert.ok(files.length >= 20, `JSX 파일 수집 이상(${files.length}개) — 경로 확인`);
  const bad = [];
  for (const f of files) {
    const src = fs.readFileSync(f, 'utf8');
    const img = missingImgAlt(src);
    const svg = unlabeledSvgs(src);
    const a = blankTargetMissingRel(src);
    if (img.length) bad.push(`${path.relative(root, f)} img:${img.join(',')}`);
    if (svg.length) bad.push(`${path.relative(root, f)} svg:${svg.join(',')}`);
    if (a.length) bad.push(`${path.relative(root, f)} a:${a.join(',')}`);
  }
  assert.deepEqual(bad, [], `이미지/SVG/새 창 링크 불변식 위반: ${bad.join(' · ')}`);
});

test('app/·lib/ 전 소스: 양수 tabIndex 0건 · autoFocus 는 허용목록뿐(115회차 포커스 불변식)', () => {
  const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
  const files = [...walkSrc(path.join(root, 'app')), ...walkSrc(path.join(root, 'lib'))];
  assert.ok(files.length >= 40, `소스 파일 수집 이상(${files.length}개) — 경로 확인`);
  // autoFocus 정당 사례 허용목록: 단일 목적 폼(로그인 아이디)·방금 연 편집 입력(저장된 보기 이름).
  // 새 autoFocus 를 추가하려면 여기에 의도를 명시하고 추가하라(포커스 강탈은 기본 금지).
  const AUTOFOCUS_ALLOW = new Set(['app/login/page.jsx', 'lib/SavedViews.jsx']);
  const bad = [];
  for (const f of files) {
    const rel = path.relative(root, f).split(path.sep).join('/');
    // 스캐너 자신은 제외 — 주석·정규식이 금지 패턴을 서술하므로 자기 참조 오탐이 난다.
    if (rel === 'lib/sourceLint.js') continue;
    const src = fs.readFileSync(f, 'utf8');
    const ti = positiveTabIndex(src);
    if (ti.length) bad.push(`${rel} tabIndex:${ti.join(',')}`);
    const af = autoFocusLines(src);
    if (af.length && !AUTOFOCUS_ALLOW.has(rel)) bad.push(`${rel} autoFocus:${af.join(',')}`);
  }
  assert.deepEqual(bad, [], `포커스 순서 불변식 위반: ${bad.join(' · ')}`);
});

test('app/·lib/ 전 JSX: 연결 없는 <label> 0건 · 마우스 전용 onClick 은 허용목록뿐(116회차 불변식)', () => {
  const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
  const files = [...walkJsx(path.join(root, 'app')), ...walkJsx(path.join(root, 'lib'))];
  assert.ok(files.length >= 20, `JSX 파일 수집 이상(${files.length}개) — 경로 확인`);
  // 마우스 전용 onClick 허용목록(파일별 허용 건수): 전부 **포인터 전용 중복 장치**로,
  // 키보드 사용자는 Esc·메뉴 버튼 등 별도 경로로 같은 동작이 가능하다(WCAG 2.1.1 비저촉).
  //   CommandPalette 2 = 스크림 클릭 닫기(키보드는 Esc) + 내부 상자 전파 차단(stopPropagation).
  //   layout 3 = 모바일 오버레이 닫기(키보드는 ☰ aria-expanded 버튼) + 사용자 메뉴 바깥클릭 캐처 2곳.
  // 새 비대화형 onClick 을 추가하려면 pressableProps/onKeyDown 으로 마감하거나(기본),
  // 정당한 포인터 전용 중복 장치일 때만 여기 건수를 갱신하며 의도를 명시하라.
  const ONCLICK_ALLOW = new Map([
    ['app/(portal)/CommandPalette.jsx', 2],
    ['app/(portal)/layout.jsx', 3],
  ]);
  const bad = [];
  for (const f of files) {
    const rel = path.relative(root, f).split(path.sep).join('/');
    const src = fs.readFileSync(f, 'utf8');
    const lb = unassociatedLabels(src);
    if (lb.length) bad.push(`${rel} label:${lb.join(',')}`);
    const oc = nonInteractiveOnClick(src);
    const allow = ONCLICK_ALLOW.get(rel) ?? 0;
    if (oc.length !== allow) bad.push(`${rel} onClick:${oc.join(',') || '없음'} (허용 ${allow}건·발견 ${oc.length}건)`);
  }
  assert.deepEqual(bad, [], `라벨 연결/비대화형 onClick 불변식 위반: ${bad.join(' · ')}`);
});

// ---- 119회차: 제어 컴포넌트 배선 · 팝업 토글 상태 낭독 불변식 ----

test('deadControlledInputs: 변경 핸들러 없는 value=/checked= 입력을 행 번호로 보고한다(여러 줄·3종 태그)', () => {
  assert.deepEqual(deadControlledInputs('a\n<input value={q}/>'), [2]);
  assert.deepEqual(deadControlledInputs('<input\n  type="text"\n  value={q}\n/>'), [1]);
  assert.deepEqual(deadControlledInputs('<select value={v}><option>a</option></select>'), [1]);
  assert.deepEqual(deadControlledInputs('<textarea value={t}/>'), [1]);
  assert.deepEqual(deadControlledInputs('<input type="checkbox" checked={on}/>'), [1]);
  assert.deepEqual(deadControlledInputs('<select value={v}/>\n<input value={q}/>'), [1, 2]);
});

test('deadControlledInputs: onChange/onInput·readOnly/disabled·전개·defaultValue 는 통과/보류한다', () => {
  assert.deepEqual(deadControlledInputs('<input value={q} onChange={e => setQ(e.target.value)}/>'), []);
  assert.deepEqual(deadControlledInputs('<input type="range" value={v} onInput={f}/>'), []);
  assert.deepEqual(deadControlledInputs('<input value={q} readOnly/>'), []);
  assert.deepEqual(deadControlledInputs('<select value={v} disabled><option>a</option></select>'), []);
  assert.deepEqual(deadControlledInputs('<input {...fieldProps}/>'), []);
  assert.deepEqual(deadControlledInputs('<input defaultValue={q}/>'), []);
  assert.deepEqual(deadControlledInputs('<input type="checkbox" defaultChecked/>'), []);
  assert.deepEqual(deadControlledInputs('<input type="text" placeholder="검색"/>'), []);
});

test('deadControlledInputs: 이상 입력에 throw 하지 않는다', () => {
  assert.deepEqual(deadControlledInputs(null), []);
  assert.deepEqual(deadControlledInputs(undefined), []);
  assert.deepEqual(deadControlledInputs(''), []);
  assert.deepEqual(deadControlledInputs(123), []);
});

test('hasPopupMissingExpanded: aria-expanded 없는 aria-haspopup 태그를 행 번호로 보고한다', () => {
  assert.deepEqual(hasPopupMissingExpanded('a\n<button type="button" aria-haspopup="menu">👤</button>'), [2]);
  assert.deepEqual(hasPopupMissingExpanded('<div\n  aria-haspopup="listbox"\n  className="combo"\n>'), [1]);
});

test('hasPopupMissingExpanded: aria-expanded 동반(표현식 포함)·무관 태그·이상 입력엔 불개입한다', () => {
  assert.deepEqual(hasPopupMissingExpanded('<button type="button" aria-haspopup="menu" aria-expanded={menu}>👤</button>'), []);
  assert.deepEqual(hasPopupMissingExpanded('<button type="button"\n  aria-haspopup="dialog"\n  aria-expanded="false"\n>열기</button>'), []);
  assert.deepEqual(hasPopupMissingExpanded('<button type="button" aria-expanded={open}>⚙</button>'), []);
  assert.deepEqual(hasPopupMissingExpanded('<div className="box">x</div>'), []);
  assert.deepEqual(hasPopupMissingExpanded(null), []);
  assert.deepEqual(hasPopupMissingExpanded(''), []);
});

test('app/·lib/ 전 소스: 배선 없는 제어 입력 0건 · aria-expanded 없는 haspopup 트리거 0건(119회차 불변식)', () => {
  const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
  const files = [...walkSrc(path.join(root, 'app')), ...walkSrc(path.join(root, 'lib'))];
  assert.ok(files.length >= 40, `소스 파일 수집 이상(${files.length}개) — 경로 확인`);
  const bad = [];
  for (const f of files) {
    const rel = path.relative(root, f).split(path.sep).join('/');
    // 스캐너 자신은 제외 — 주석·정규식이 금지 패턴을 서술하므로 자기 참조 오탐이 난다(115회차와 동일).
    if (rel === 'lib/sourceLint.js') continue;
    const src = fs.readFileSync(f, 'utf8');
    const ci = deadControlledInputs(src);
    if (ci.length) bad.push(`${rel} input:${ci.join(',')}`);
    const hp = hasPopupMissingExpanded(src);
    if (hp.length) bad.push(`${rel} haspopup:${hp.join(',')}`);
  }
  assert.deepEqual(bad, [], `제어 입력/팝업 토글 불변식 위반: ${bad.join(' · ')}`);
});
