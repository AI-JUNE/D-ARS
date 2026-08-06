// tests/sourcelint.test.mjs — <button> type 명시 불변식(111회차)
// 유닛: 스캐너(buttonTags·missingButtonType) 계약. 통합: app/·lib/ 전 JSX 실소스 스캔 → 위반 0.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buttonTags, missingButtonType, openTags, missingThScope, missingTableLabel, buttonElements, unnamedIconButtons, dialogMissingRequirements } from '../lib/sourceLint.js';

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

// ---- 통합: 실소스 전수 스캔(재발 고정) ----
function walkJsx(dir, out = []) {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) walkJsx(p, out);
    else if (p.endsWith('.jsx')) out.push(p);
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
