// tests/eumseniorui.test.mjs — 「이음 어르신 신청」 화면 소스 불변식(가이드 §6-2 · QUALITY_BAR §4)
//
// JSX 는 node:test 가 import 할 수 없으므로(빌드 필요) 문자열 수준에서 **요건이 사라지지 않았는지**만
// 고정한다. 값(px)까지 강제하지는 않되, 심사에서 바로 떨어지는 항목 — 키보드 포커스 표시,
// 스크린리더 라벨, 375px 가로 스크롤, 금지 표시(로고·도입사례·요금표) — 은 회귀로 잡는다.
// 라우트 파일의 export 규약(route.js 규칙과 같은 취지)도 함께 본다.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { EUM_FONT_PX } from '../lib/eumTheme.js';
import { muteSeparatorsIn } from '../lib/eumSenior.js';
import {
  metadataFields, inlineStringConsts, cssBareSelectors, cssBareDecls, cssExternalRefs,
  exportedObjectEntries,
} from '../lib/sourceLint.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dir = resolve(root, 'app/eum/senior/[token]');
const read = (f) => readFileSync(resolve(dir, f), 'utf8');

const page = read('page.jsx');
const flow = read('SeniorFlow.jsx');
const ui = read('ui.jsx');
// 「이 기기에서 전에 신청하신 내용」 한 줄. 이 사실은 어르신 단말의 localStorage 에만 있어
// 서버 컴포넌트(진입 시 만료 안내)가 읽을 수 없다 — 패널 전체를 클라이언트로 돌리지 않고
// 그 한 줄만 조각으로 뗐다.
const prior = read('PriorLocal.jsx');

// 금지 문구 검사는 **주석을 걷어낸 코드**에만 적용한다.
// 설계 의도를 적은 주석("기존 D-ARS 제품과 분리한다")까지 금지하면, 왜 그런지를 적을 수 없게 되어
// 다음 사람이 규칙을 모른 채 되돌리는 쪽이 더 위험하다. 화면에 나가는 것은 코드뿐이다.
function stripComments(src) {
  return String(src)
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n')
    .map((line) => line.replace(/(^|[^:\\w])\/\/.*$/, '$1'))
    .join('\n');
}

const code = [page, flow, ui, prior].map(stripComments).join('\n');

test('라우트에 화면 파일만 있고 route.js 는 두지 않는다', () => {
  const files = readdirSync(dir).sort();
  assert.deepEqual(files, ['PriorLocal.jsx', 'SeniorFlow.jsx', 'page.jsx', 'ui.jsx']);
});

test('page 는 서버에서 토큰을 검증한다("use client" 금지)', () => {
  assert.ok(!/^\s*["']use client["']/m.test(page), 'page.jsx 가 클라이언트가 되면 서명 비밀이 새어 나간다');
  assert.match(page, /verifyEumToken/);
  assert.match(page, /dynamic\s*=\s*'force-dynamic'/, '만료 판정이 정적 캐시되면 안 된다');
});

test('제목이 「이음 어르신 신청」 이고 제품 브랜드 템플릿을 쓰지 않는다', () => {
  assert.match(page, /absolute:\s*'이음 어르신 신청'/);
  assert.ok(/이음 어르신 신청/.test(flow) && /이음 어르신 신청/.test(ui), '화면 상단 표기 누락');
});

test('로고·도입사례·요금표를 표시하지 않는다(표시 금지 요건)', () => {
  for (const banned of ['도입사례', '도입 사례', '요금제', '요금표', '고객사', 'D-ARS']) {
    assert.ok(!code.includes(banned), `어르신 화면에 표시 금지 문구가 있다: ${banned}`);
  }
  assert.ok(!/<img\b/.test(code), '로고를 포함한 이미지 표시 금지');
});

test('키보드: 모든 조작 요소가 button/a 이고 포커스 표시(eum-focus)를 단다', () => {
  const focusable = [...flow.matchAll(/<(button|a)\b[^>]*>/g)].map((m) => m[0]);
  assert.ok(focusable.length >= 4, `조작 요소가 너무 적다: ${focusable.length}`);
  for (const tag of focusable) {
    assert.match(tag, /className="eum-focus"/, `포커스 표시 누락: ${tag.slice(0, 60)}`);
  }
  assert.match(ui, /:focus-visible/, '포커스 링 CSS 누락');
  assert.match(ui, /outline-offset/, '포커스 링은 요소 바깥에 그려야 대비가 성립한다');
  assert.ok(!/onClick=\{[^}]*\}\s*\/?>\s*<\/(div|span|p)>/.test(flow), 'div/span 에 클릭 핸들러 금지');
});

test('키보드: 모든 button 에 type 이 명시돼 있다(암시적 submit 방지)', () => {
  for (const tag of [...flow.matchAll(/<button\b[^>]*>/g)].map((m) => m[0])) {
    assert.match(tag, /type="button"/, `type 누락: ${tag.slice(0, 60)}`);
  }
});

test('스크린리더: 선택지 묶음에 라벨이 있고 단계 전환이 낭독된다', () => {
  assert.match(flow, /role="group"\s+aria-label="희망 활동 고르기"/);
  assert.match(flow, /role="group"\s+aria-label="희망 시간대 고르기"/);
  assert.match(flow, /aria-pressed=/, '선택 여부가 낭독되지 않는다');
  assert.match(flow, /aria-live="polite"/, '단계 표시가 낭독되지 않는다');
  assert.match(flow, /ref=\{headingRef\}\s+tabIndex=\{-1\}/, '단계 전환 시 제목으로 포커스를 옮겨야 한다');
  assert.match(flow, /headingRef\.current\?\.focus\(\)/);
  // 오류는 즉시 낭독돼야 한다. 표현은 ui.jsx 의 Alert 한 곳에 있다 — 자리는 단계마다
  // 다르지만(그 안내가 가리키는 단추를 밀어내지 않는 자리) 그리는 방법은 하나여야 한다.
  assert.match(ui, /role="alert"/, '오류는 즉시 낭독돼야 한다');
  assert.match(flow, /<Alert text=\{alertText\} \/>/, '화면이 안내를 공통 표현으로 그리지 않는다');
  assert.equal(/role="alert"/.test(flow), false, '안내를 화면에서 손으로 그리면 자리마다 모양이 갈라진다');
});

test('375px: 폭 100% 요소가 border-box 라 가로 스크롤이 생기지 않는다', () => {
  assert.match(ui, /boxSizing: 'border-box'/);
  const widthFull = [...ui.matchAll(/width: '100%'/g)].length;
  assert.ok(widthFull >= 2, '폭 100% 요소 정의가 사라졌다');
  assert.match(ui, /maxWidth: '100%'/);
  assert.match(ui, /overflowWrap: 'break-word'/, '긴 문구가 화면을 밀어낸다');
});

test('한 화면 버튼 4개 이내: 되돌아가기는 링크(a)로 둔다', () => {
  // 선택지 4개인 1·2단계에 버튼을 더 두면 요건을 넘는다 → 뒤로가기는 <a>.
  // href 는 고른 것을 함께 실은 주소다(stepQuery) — 자바스크립트 없이 눌러도, 새 탭으로 열어도
  // 선택이 남는다. 예전처럼 "?step=1" 만 적어 두면 그 링크를 따라간 순간 고른 것이 사라진다.
  assert.match(flow, /<a href=\{stepQuery\(1, \{ activity, timeslot \}\)\}/);
  assert.match(flow, /<a href=\{stepQuery\(2, \{ activity, timeslot \}\)\}/);
  const buttonsInJsx = [...flow.matchAll(/<button\b/g)].length;
  assert.ok(buttonsInJsx <= 3, `버튼 정의가 너무 많다: ${buttonsInJsx}`);
});

// 고른 것이 주소에 남는다는 계약을 화면 쪽에서도 고정한다(순수 로직은 tests/eumsenior.test.mjs).
test('고른 것을 주소에 유지한다 — 주소 조립은 stepQuery 한 곳만 쓴다', () => {
  assert.match(page, /parseDraft\(searchParams\)/, '진입 시 주소에서 선택을 복원해야 한다');
  assert.match(flow, /initialDraft/, '복원한 선택을 화면이 받아야 한다');
  // 주소를 손으로 붙이면 파라미터 이름·화이트리스트가 두 곳으로 갈라진다.
  const handmade = [...flow.matchAll(/`\?step=/g)].length;
  assert.equal(handmade, 0, `주소를 손으로 조립한 자리가 있다: ${handmade}`);
  assert.ok(/history\.(push|replace)State\([^)]*stepQuery\(/.test(flow), '히스토리 기록도 stepQuery 를 써야 한다');
});

test('완료 상태는 주소에 싣지 않는다(주소로 완료 화면을 만들 수 없다)', () => {
  // done 을 주소에 실으면 주소 한 줄로 「신청이 접수되었습니다」 화면이 만들어진다 —
  // 접수된 적 없는 신청을 접수됐다고 말하는 화면이다. 완료 판정은 서버 응답에서만 온다.
  assert.ok(!/done=/.test(code), '완료 상태가 주소에 실린다');
  assert.ok(!/DRAFT_PARAM\s*=\s*\{[^}]*done/.test(code), '완료 상태가 주소 파라미터 목록에 있다');
  // 단계를 바꾸는 자리는 enterStep 하나다(방문 번호가 함께 오른다 — 아래 「다른 방문」 참조).
  assert.match(flow, /draftRef\.current\.done\)\s*\{\s*enterStep\(4\)/, '완료 뒤 뒤로가기는 주소를 따르지 않는다');
});

// ── 고친 결함: 되돌아가기가 되돌아가지 않았다 ────────────────────────────────
// 「앞 화면으로」·「다시 고르기」는 href 를 가진 링크인데(버튼 4개 이내 요건) onClick 이
// **조건 없이** preventDefault + history.back() 을 했다. 그래서
//   ① 되돌아갈 항목이 없으면(문서가 ?step=2 로 직접 열린 경우 — 단계 복원은 replaceState 라
//      항목을 쌓지 않는다) history.back() 은 던지지 않고 **조용히 아무것도 하지 않는다**.
//      catch 폴백도 돌지 않고, 멀쩡한 href 를 preventDefault 가 막은 꼴이 된다 —
//      이 화면의 **유일한 되돌리기 수단**이 꼼짝하지 않는 단추가 되어 있었다.
//   ② 두 번 눌리면 -1 이 두 번 쌓여 앞 단계를 지나쳐 **신청 화면 밖**으로 나간다(traversal 은
//      큐에 들어간다). 손이 떨려 두 번 누르는 것은 이 사용자층에서 흔하고, 제출 쪽은 이미
//      같은 이유로 submittingRef 를 두고 있었다 — 되돌아가기에는 없었다.
// 판정 계약은 tests/eumsenior.test.mjs(backAction), 여기서는 화면이 그 판정을 쓰는지만 본다.
test('되돌아가기: 가로채기는 조건부다(되돌아갈 곳이 없으면 링크가 제 일을 한다)', () => {
  const body = flow.slice(flow.indexOf('function back(e)'));
  assert.ok(body.length > 100, 'back 핸들러를 찾지 못했다');
  assert.match(body, /backAction\(state, backFromRef\.current\)/, '판정을 화면에서 손으로 하면 안 된다');

  // preventDefault 는 'follow' 로 빠져나간 **뒤에만** 온다 — 순서가 바뀌면 멀쩡한 href 가 막힌다.
  const guard = body.indexOf("=== 'follow'");
  const prevent = body.indexOf('e.preventDefault()');
  assert.ok(guard > -1, '되돌아갈 곳이 없는 경우를 가려내지 않는다');
  assert.ok(prevent > guard, '되돌아갈 곳을 모른 채 preventDefault 하면 안 된다');
  // 같은 자리의 두 번째 누름을 삼키는 자리.
  assert.match(body, /=== 'ignore'/, '중복 누름을 가려내지 않는다');
  assert.match(body, /backFromRef\.current = historyDepth\(state\)/, '요청한 자리를 적어 두지 않는다');

  // 조건 없는 가로채기가 되살아나면 실패한다(하드 disabled 금지와 같은 취지).
  assert.equal(
    /function back\(e\)\s*\{\s*if \(e\) e\.preventDefault\(\)/.test(flow), false,
    '조건 없는 preventDefault 가 되살아났다',
  );
  // 되돌아간 뒤·새 항목을 쌓은 뒤에 비우지 않으면 한 번만 되돌아갈 수 있다.
  const cleared = [...flow.matchAll(/backFromRef\.current = null/g)].length;
  assert.ok(cleared >= 2, `popstate·새 항목 양쪽에서 비워야 한다: ${cleared}곳`);
});

test('히스토리 항목에 깊이가 함께 실린다(우리가 쌓은 것인지 아는 유일한 단서)', () => {
  // 복원으로 만든 항목은 뿌리다 — 여기서 뒤로 갈 곳은 없다(replaceState 는 쌓지 않는다).
  assert.match(flow, /stepState\(want, EUM_HISTORY_ROOT\)/, '복원 항목이 뿌리로 표시되지 않는다');
  assert.match(flow, /replaceState\(root,/, '복원은 항목을 쌓지 않는다(replaceState)');
  // 고를 때 쌓는 항목은 한 칸 깊다(기준은 지금 항목의 상태 — go 가 한 번만 읽어 둔다).
  assert.match(flow, /const here = window\.history\.state;/, '지금 항목의 상태를 읽지 않는다');
  assert.match(flow, /stepState\(want, nextDepth\(here\)\)/, '쌓는 항목의 깊이가 늘지 않는다');
  assert.match(flow, /pushState\(entry,/, '단계 이동은 항목을 쌓는다(pushState)');
  // 상태를 손으로 적으면 깊이가 빠진 항목이 생기고, 그 자리에서 되돌아가기가 멈춘다.
  assert.equal(/(push|replace)State\(\{\s*step/.test(flow), false, '히스토리 상태를 손으로 조립하면 안 된다');
});

// ── 고친 결함: 떠나는 화면의 주소는 거기서 고른 것을 몰랐다 ──────────────────
//
// 고른 것은 **쌓는 항목**의 주소에만 실렸다. 1단계에서 활동을 고르면 그 값은 2단계 항목의
// 주소에만 적히고, 방금 떠난 1단계 항목의 주소는 단계만 적힌 채였다. 그래서 되돌아오면
// `popstate` 가 그 주소를 읽어 **고른 것을 빈 값으로 되살린다** —
//   · 11회차가 「고른 것이 눈에도 보이게」 넣은 ✓ 표시는 하필 그 회차가 지목한 경로
//     (「2단계에서 앞 화면으로를 눌러 1단계로 돌아갔을 때」)에서 한 번도 보이지 않았다.
//   · 3단계에서 「다시 고르기」를 누르면 방금 고른 시간대가 지워진 채 네 선택지가 처음처럼 나온다.
//   · 같은 단추가 가로채이지 않은 경우('follow')에는 href 에 고른 것이 실려 **남는다** —
//     같은 단추가 경로에 따라 다르게 동작했다.
// 6회차의 "고른 것을 주소에 남긴다" 가 **쌓는 쪽만** 고친 것이었다.
test('떠나는 항목의 주소에도 그 화면에서 고른 것을 적는다(되돌아오면 ✓ 가 살아 있다)', () => {
  const body = flow.slice(flow.indexOf('const go = useCallback'), flow.indexOf('function chooseActivity'));
  assert.ok(body.length > 200, 'go 를 찾지 못했다');
  // 지금 항목의 단계는 **그 항목에 적힌 값**만 믿는다 — 모르면 주소를 건드리지 않는다.
  assert.match(body, /const at = historyStep\(here\);/, '어느 단계의 항목인지 판정하지 않는다');
  assert.match(body, /if \(at\) window\.history\.replaceState\(here, '', stepQuery\(at, d\)\);/,
    '떠나는 항목의 주소를 고치지 않거나, 모르면서 고치고 있다');
  // 쌓기 **전에** 고쳐야 한다 — 뒤에 하면 방금 쌓은 항목을 고치게 된다.
  assert.ok(body.indexOf('replaceState(here') < body.indexOf('pushState(entry'),
    '떠나는 항목이 아니라 새 항목의 주소를 고치고 있다');
  // 항목을 쌓지 않는 쪽이어야 깊이 판정(backAction)이 그대로 남는다.
  assert.equal(/pushState\(here/.test(body), false, '떠나는 항목을 고치는 자리에서 항목을 쌓고 있다');
});

// ── 고친 결함: 화면 문구가 눈에만 맞춰져 있었다 ──────────────────────────────
// 스크린리더는 '·'·'~'·괄호·슬래시를 대개 읽지 않는다(구두점 설정 기본값). 그래서 경계를
// 그 기호에 맡긴 문구는 **귀에서 한 덩어리가 된다**:
//   · 요약     「산책·나들이 · 오전 (9시~12시)」 → "산책 나들이 오전 9시 12시"
//     (활동과 시간대의 경계가 사라진다 — 하필 「이대로 신청하기」를 누르기 직전에 듣는 문장이다)
//   · 단계 표시 「1단계 / 3단계」 → "1단계 3단계" (지금 몇 번째인지가 아니라 단계 둘로 들린다.
//     이 문단은 aria-live 영역이라 단계마다 다시 낭독되는 자리다)
// 표시 이름·구분자 쪽 계약은 tests/eumsenior.test.mjs 가 본다. 여기서는 **화면이 손으로 적는
// 문구**를 본다 — 등록부를 고쳐도 화면이 자기 문장에 기호를 적으면 같은 일이 되풀이된다.
test('화면이 손으로 적는 문구에 낭독되지 않는 경계가 없다', () => {
  const screens = { ...boundary, 'SeniorFlow.jsx': flow, 'ui.jsx': ui, 'page.jsx': page, 'PriorLocal.jsx': prior };
  const bad = [];
  let seen = 0;
  for (const [name, src] of Object.entries(screens)) {
    const shown = stripComments(src);
    // 화면에 나가는 문구가 있는 자리는 둘이다 — 한글이 든 리터럴, 그리고 JSX 글자 노드.
    const texts = [
      ...[...shown.matchAll(/(['"`])((?:[^'"`\\\n]|\\.)*?[가-힣](?:[^'"`\\\n]|\\.)*?)\1/g)].map((m) => m[2]),
      ...[...shown.matchAll(/>\s*([^<>{}\n]*[가-힣][^<>{}\n]*?)\s*</g)].map((m) => m[1]),
    ];
    seen += texts.length;
    for (const s of texts) {
      // 템플릿의 ${…} 자리는 값이지 문구가 아니다.
      const marks = muteSeparatorsIn(s.replace(/\$\{[^}]*\}/g, ' '));
      if (marks.length) bad.push(`${name}: "${s}" → ${marks.join('')}`);
    }
  }
  assert.ok(seen >= 20, `문구를 찾지 못했다(검사가 비어 통과하면 안 된다): ${seen}건`);
  assert.deepEqual(bad, [], `낭독되지 않는 기호로 문구를 가르고 있다\n${bad.join('\n')}`);
});

// 고친 결함: 「문구는 EUM_TOKEN_MESSAGE 단일 출처」는 **서버 쪽 화면에서만** 참이었다.
// 브라우저에서 도는 SeniorFlow 는 만료·401 안내를 손으로 적었고(401 쪽은 마침표가 하나 더 붙은
// 두 번째 판본), 이 테스트는 그 사본이 **있는지**를 확인하며 통과하고 있었다. 사본을 없애는 쪽이
// 맞으므로 표를 비밀 없는 자리(lib/eumMessage)로 떼고, 양쪽이 같은 표를 가리키는지 본다.
// (문장 자체의 계약·사본 금지 대조는 tests/eummessage.test.mjs)
test('빈 상태·만료 상태 안내가 화면과 같은 문구를 쓴다', () => {
  assert.match(page, /tokenMessage\(result\.reason\)/, '사유별 안내를 문구 단일 출처에서 가져와야 한다');
  assert.match(flow, /body=\{tokenMessage\('expired'\)\}/, '작성 중 만료 안내를 손으로 적으면 두 화면이 갈라진다');
  // 401 안내도 같은 표에서 가져온다. 안내는 **그것이 속한 단계와 함께** 들린다(stepError) —
  // 예전에는 글자열 하나라서 고르는 화면까지 따라다녔다.
  assert.match(flow, /setError\(stepError\(at, tokenMessage\('signature'\), atVisit\)\)/, '401 안내도 같은 표에서 가져온다');
  assert.match(ui, /function Notice/, '만료·오류 패널이 양쪽에서 공유돼야 한다');
});

// 고친 결함: 이 테스트의 이름은 「색·**글자 크기**는 … 하드코딩 금지」였는데 정작 검사하던 것은
// 색뿐이었다. 그 사이 ui.jsx 에는 22·26·32 가 손으로 적혀 있었고, 그중 **22px(16.5pt)은 요건
// 아래**였다 — 오류 안내(alert)·만료 임박 경고(warn)·되돌아가기 링크(back). 평소 화면은 크게
// 지어 두고 무언가 잘못됐을 때 읽어야 하는 글자만 작았던 셈이다. 이름이 코드보다 앞서 있었다.
test('색·글자 크기는 lib/eumTheme.js 에서 가져온다(하드코딩 금지)', () => {
  assert.match(ui, /from '@\/lib\/eumTheme'/);
  const hex = [...ui.matchAll(/#[0-9a-fA-F]{3,6}\b/g)].map((m) => m[0]);
  assert.deepEqual(hex, [], `ui.jsx 에 색 하드코딩: ${hex.join(',')}`);

  // fontSize 는 전부 등록부(F.*)를 가리켜야 한다 — 숫자가 되살아나면 여기서 실패한다.
  const sizes = [...ui.matchAll(/fontSize:\s*([^,\n]+)/g)].map((m) => m[1].trim());
  assert.ok(sizes.length >= 8, `글자 크기 선언이 줄었다: ${sizes.length}`);
  const literal = sizes.filter((v) => !/^F\.[A-Za-z]\w*$/.test(v));
  assert.deepEqual(literal, [], `ui.jsx 에 글자 크기 하드코딩: ${literal.join(',')}`);

  // 등록부 ↔ 화면 양방향 대조: 모르는 이름을 쓰면(undefined → 브라우저 기본 16px) 조용히
  // 요건이 깨지고, 아무도 쓰지 않는 이름이 남아 있으면 등록부가 썩는다.
  const used = new Set(sizes.map((v) => v.slice(2)));
  assert.deepEqual([...used].sort(), Object.keys(EUM_FONT_PX).sort(), '등록부와 화면이 어긋난다');
});

test('개인정보를 화면에 그리지 않는다(sid 는 전송 본문에만 쓴다)', () => {
  assert.ok(!/\{\s*sid\s*\}/.test(flow), 'sid 를 화면에 출력하면 안 된다');
  for (const pii of ['이름', '전화번호', '생년월일', '주소']) {
    assert.ok(!code.includes(pii), `개인정보 입력·표시 금지: ${pii}`);
  }
});

// 예전 계약은 "fetch 자체 금지"였다. 지금은 **자기 서버**로는 제출하고(1회용 판정·토큰 재검증을
// 브라우저에 맡길 수 없다), **이음 쪽 외부 전송만** 승인 전까지 막는다. 지켜야 할 선은
// "외부로 보내지 않는다"이지 "아무 데도 보내지 않는다"가 아니었다.
test('제출은 자기 서버까지만 간다 — 이음 등 외부로의 직접 전송은 승인 전까지 금지', () => {
  const targets = [...flow.matchAll(/fetch(?:Once)?\(\s*([`'"])([^`'"]*)\1/g)].map((m) => m[2]);
  assert.ok(targets.length > 0, '제출이 서버를 거치지 않으면 1회용 판정이 성립하지 않는다');
  for (const t of targets) {
    assert.ok(t.startsWith('/api/'), `같은 오리진 API 만 허용: ${t}`);
  }
  assert.equal(/https?:\/\//.test(flow), false, '절대 URL 로의 외부 전송 금지');
  assert.equal(/EUM_API/.test(flow), false, '이음 실연결은 서버 라우트의 일이고, 아직 승인 전이다');
  assert.match(flow, /localStorage\.setItem/, '보조 사본은 유지한다');
  assert.match(flow, /\[승인 필요\]/, '실연결 전 상태임을 소스에 남긴다');
});

// 고친 결함: 보조 사본은 **쓰기만 하고 아무도 읽지 않았다**. `storageKey` 를 부르는 애플리케이션
// 코드는 쓰는 한 줄뿐이었고, 그 자리의 주석이 말한 용도("담당자가 확인할 수 있게")는 성립할 수
// 없는 것이었다 — localStorage 는 어르신 기기 안에만 있다. `issueEumToken`(3회차)·`stats()`(4회차)와
// 같은 모양의 세 번째 자리다. 그 사본이 메울 수 있는 구멍은 「알려진 한계」에 이미 적혀 있었다:
// 만료 뒤 새 링크를 받은 사람에게 서버는 「전에 신청했는가」를 답할 수 없고, 그래서 명단에 두
// 건이 남는다. 그 기기는 답을 들고 있었다.
test('보조 사본을 읽어 「전에 낸 신청」을 알린다(막지는 않는다)', () => {
  assert.match(prior, /^\s*["']use client["']/m, '저장소를 읽으려면 클라이언트 조각이어야 한다');
  assert.match(prior, /localStorage\.getItem/, '쓰기만 하고 읽지 않으면 사본은 아무 일도 하지 않는다');
  assert.match(prior, /parsePriorLocal\(/, '저장소 값은 화이트리스트를 거쳐야 한다(누구나 고칠 수 있다)');
  assert.match(prior, /priorLocalNotice\(prior, where\)/, '문구는 lib/eumSenior 단일 출처에서 가져온다');
  assert.match(prior, /if \(!message\) return null;/, '할 말이 없으면 빈 줄도 그리지 않는다');
  // 하이드레이션: 서버 렌더에는 localStorage 가 없으므로 렌더 중에 읽으면 화면이 어긋난다.
  assert.ok(!/useState\([^)]*localStorage/.test(prior), '저장소는 효과 안에서만 읽는다');
  assert.match(prior, /useEffect\(\(\) => \{\s*try \{/, '저장소 접근이 막혀도(시크릿 모드) 던지면 안 된다');
  // 이 조각은 sid 가 아니라 **저장소 키**를 받는다 — 키 조립은 lib/eumSenior 한 곳뿐이다.
  assert.ok(!/storageKey\(/.test(prior), '키 조립이 두 곳으로 갈라진다');
  // 알리기만 한다 — 단추를 늘리지 않는다(버튼 4개 이내 요건 · 재신청이 정당한 경우가 있다).
  assert.equal(/<button\b|<a\b/.test(prior), false, '안내가 조작 요소로 늘어났다');
  const buttonsInJsx = [...flow.matchAll(/<button\b/g)].length;
  assert.ok(buttonsInJsx <= 3, `안내가 단추로 늘어났다: ${buttonsInJsx}`);
  // 안내 자리 하나는 **확인 화면(3단계)** 이다 — 고르는 화면에 넣으면 375px 에서 선택지가 밀리고,
  // 중복이 만들어지는 순간은 「이대로 신청하기」를 누르는 그 순간이다.
  const step3 = flow.slice(flow.indexOf('{step === 3 ?'), flow.indexOf('{step === 4 ?'));
  assert.ok(step3.length > 100, '3단계 블록을 찾지 못했다');
  assert.match(step3, /<PriorLocal storeKey=\{storageKey\(sid\)\} where="confirm" \/>/, '안내가 확인 화면에 없다');
  // 제출을 막지 않는다 — 눌림을 말하는 것은 전송 중(busy)일 때뿐이다.
  const disabled = [...flow.matchAll(/\baria-disabled=\{([^}]*)\}/g)].map((m) => m[1].trim());
  assert.deepEqual(disabled, ['busy'], `전에 냈다는 이유로 제출을 막으면 안 된다: ${disabled.join(',')}`);
});

// ── 만료 화면도 그 기기가 아는 것을 말한다 ────────────────────────────────
//
// 고친 결함: 「알려진 한계」가 적어 둔 대로, 소진 기록은 토큰 만료와 함께 사라지므로 **서버는**
// 만료 뒤 다시 연 사람에게 "전에 신청했는가" 를 답할 수 없다. 그래서 만료 화면은 「담당자에게
// 다시 요청해 주세요」 한 줄로 끝났다 — 신청을 이미 마친 어르신에게 그것은 **헛수고로 가는 길**
// 이다(새 링크를 받아 네 화면을 또 걷는다). 중복 접수 자체는 7회차에 넣은 확인 화면 안내가
// 막지만, 헛수고는 그대로 남아 있었다. 그런데 **그 기기는 처음부터 알고 있었다**(보조 사본) —
// 세 회차 연속 같은 교훈이다: 한계 문장이 원인을 가리키고 있었다.
test('만료 화면이 이 기기의 사본을 읽어 헛수고를 줄인다(진입·작성 중 양쪽)', () => {
  const elements = (src) => [...stripComments(src).matchAll(/<Notice\b[\s\S]*?(?:\/>|<\/Notice>)/g)].map((m) => m[0]);
  const expired = [];
  for (const [name, src] of Object.entries({ 'page.jsx': page, 'SeniorFlow.jsx': flow })) {
    for (const el of elements(src)) {
      if (!/EUM_NOTICE_FOOT\.expired/.test(el)) continue;
      assert.match(el, /<PriorLocal\b/, `${name}: 만료 안내가 그 기기가 아는 것을 말하지 않는다`);
      assert.match(el, /where="expired"/, `${name}: 만료 화면에서 할 수 없는 말을 한다(자리 이름)`);
      expired.push(el);
    }
  }
  assert.equal(expired.length, 2, `만료 안내가 두 자리(진입·작성 중)에 있어야 한다: ${expired.length}`);
  // 진입 화면은 **서명이 검증된 만료**에만 조각을 둔다 — 잘못된 링크에는 sid 가 없고,
  // 없는 것을 지어내 다른 사람의 사본을 읽게 하지 않는다.
  assert.match(page, /\{expired \? <PriorLocal storeKey=\{storageKey\(result\.sid\)\} where="expired" \/> : null\}/);
});

test('보조 사본 안내의 자리 이름이 등록부와 양방향으로 맞는다', () => {
  const keys = exportedObjectEntries(readFileSync(resolve(root, 'lib/eumSenior.js'), 'utf8'), 'EUM_PRIOR_TAIL')
    .map((e) => e.key);
  assert.ok(keys.length >= 2, `등록부를 읽지 못했다: ${keys.length}`);
  const used = [...new Set(
    Object.values(eumSources)
      .flatMap((src) => [...stripComments(src).matchAll(/<PriorLocal\b[^>]*where="(\w+)"/g)].map((m) => m[1])),
  )];
  // 없는 이름을 적으면 조각이 **아무 말도 하지 않고**(기본값을 두지 않는다) 아무 신호도 나지
  // 않는다. 쓰이지 않는 이름이 남으면 등록부가 썩는다.
  assert.deepEqual(used.sort(), keys.sort(), '등록부와 화면이 어긋난다');
});

// ── 전송 중의 상태가 **양쪽 감각에** 전해진다 ──────────────────────────────
//
// 고친 결함: 눌림을 `disabled` 로 말하고 있었다. HTML 에서 disabled 요소는 포커스를 가질 수
// 없으므로, 누른 순간 브라우저가 포커스를 버튼에서 떼어 문서(body)로 보낸다. 그래서
// 키보드·스크린리더로 쓰는 어르신에게는 ① 기다리는 동안(상한 8초) 들리는 말이 없고
// (바뀐 글자 「신청하는 중…」을 읽어 줄 대상이 사라졌다 — 멈춘 것과 구별되지 않는다),
// ② 실패 안내가 「아래 단추를 한 번 더 눌러 주세요」라고 말하는데 그 단추가 어디 있는지 알 수
// 없다(포커스는 문서 맨 앞). 직전 두 회차가 고친 "작을 때 읽는 글자"·"흐릴 때 읽는 글자" 와
// **같은 순간**이고, 이번에는 들리지 않았다.
test('전송 중: 눌림을 aria-disabled 로 말해 포커스를 잃지 않는다', () => {
  const submit = flow.slice(flow.indexOf('{step === 3 ?'), flow.indexOf('{step === 4 ?'));
  assert.ok(submit.length > 100, '3단계 블록을 찾지 못했다');
  assert.match(submit, /aria-disabled=\{busy\}/, '눌림이 낭독되지 않는다');
  // 하드 disabled 가 되살아나면 포커스가 다시 사라진다 — aria- 접두어 없는 disabled 를 금지한다.
  const hard = [...stripComments(flow).matchAll(/(^|[^-\w])disabled\s*=/g)].length;
  assert.equal(hard, 0, `disabled 속성이 되살아났다: ${hard}곳`);
  // 브라우저가 막아 주던 중복 전송은 이제 우리가 막는다 — 상태보다 먼저 반영되는 ref 로.
  assert.match(flow, /submittingRef\.current/, '중복 누름을 막는 수단이 없다');
  assert.match(flow, /if \(busy \|\| submittingRef\.current\) return;/);
  // 글자가 바뀐 것을 포커스 위치와 무관하게 알린다.
  assert.match(submit, /aria-live="polite"/, '전송 중 바뀐 글자가 낭독되지 않는다');
  assert.match(submit, /신청하는 중…/);
});

// ── 안내는 자기 단계에만 머물고, 가리키는 단추를 밀어내지 않는다 ─────────────
//
// 고친 결함 둘(같은 한 줄에서 나왔다).
//   ① **안내가 자기 화면을 떠났다.** 글자열 하나로만 들고 있었고(`useState('')`) 비우는 곳은
//      다음 제출의 첫 줄뿐이라, 확인 화면에서 실패한 안내가 「다시 고르기」를 누른 뒤 고르는
//      화면까지 따라왔다 — 거기서 「아래 단추」는 **선택지 버튼**이고, 401 안내는 아직 멀쩡히
//      고르고 있는 어르신에게 링크가 죽었다고 말한다.
//   ② **안내가 가리키는 단추를 자기가 밀어냈다.** 자리가 주버튼보다 **위**였으므로, 실패
//      안내가 끼어드는 순간 주버튼이 아래로 밀려났다. 하필 그 문장이 「한 번 더 눌러
//      주세요」다 — 자리를 외워 누르는 저시력 어르신의 손 아래에서 단추가 사라진다.
//      직전 세 회차가 고친 자리와 같은 순간이다(작았다 · 흐렸다 · 들리지 않았다 → 움직였다).
test('제출 실패 안내가 자기 단계에만 머문다(화면을 떠나 따라다니지 않는다)', () => {
  // 안내는 단계와 함께 들린다 — setError 를 부르는 **모든** 자리가 stepError 를 거쳐야 한다.
  const calls = [...stripComments(flow).matchAll(/setError\(([^\n]*)/g)].map((m) => m[1].trim());
  assert.ok(calls.length >= 5, `setError 호출을 찾지 못했다: ${calls.length}`);
  for (const arg of calls) {
    assert.ok(/^(stepError\(|null\))/.test(arg), `단계를 적지 않은 안내가 있다: setError(${arg}`);
  }
  // 비우는 길을 늘려 막는 방식이 되살아나면(글자열 하나 + 단계 이동마다 비우기) 한 곳을
  // 빠뜨리는 날 결함이 그대로 돌아온다 — 안내가 자기 자리를 아는 쪽으로 고정한다.
  assert.match(flow, /const \[error, setError\] = useState\(null\)/, '안내가 다시 글자열 하나가 됐다');
  assert.match(flow, /const alertText = errorFor\(error, step, visit\)/, '그리는 자리가 단계·방문을 보지 않는다');
  assert.equal(/\{error \?/.test(flow), false, '단계를 묻지 않고 안내를 그리는 자리가 되살아났다');
  // 기다리는 사이 되돌아갔다면 그 화면에는 뜨지 않는다 — 누른 순간의 단계·방문에 매단다.
  assert.match(flow, /const at = step;/, '안내를 매달 단계를 누른 순간에 붙잡지 않는다');
  assert.match(flow, /const atVisit = visitRef\.current;/, '방문 번호를 누른 순간에 붙잡지 않는다');
});

// ── 고친 결함: 같은 화면의 **다른 방문**에 조금 전의 실패가 되살아났다 ───────
//
// 안내에 적힌 것이 단계뿐이었는데, 단계는 같은 번호로 몇 번이고 되돌아오는 자리다 —
// 확인 화면에서 실패한 뒤 「다시 고르기」 → 시간대 재선택으로 돌아오면 **그 시도의 안내**가
// 다시 뜬다(아직 아무것도 누르지 않았는데 「한 번 더 눌러 주세요」가 떠 있다). 그 고침이
// 성립하려면 **단계를 바꾸는 자리가 하나**여야 한다 — 새 이동 경로가 생겨 방문 번호를
// 올리지 않으면 결함이 그대로 돌아오기 때문이다(비우는 쪽이 아니라 적는 쪽으로 고치는
// 이 과제의 계약: EUM_NOTICE_FOOT·EUM_PRIOR_TAIL 과 같은 모양).
test('단계를 바꾸는 자리는 enterStep 하나뿐이고, 거기서 방문 번호가 오른다', () => {
  const shown = stripComments(flow);
  const head = shown.indexOf('const enterStep = useCallback(');
  assert.ok(head > -1, 'enterStep 이 없다 — 단계 이동이 흩어지면 방문 번호가 어긋난다');
  const body = shown.slice(head, shown.indexOf('}, []);', head) + 7);
  assert.match(body, /visitRef\.current \+= 1;/, '방문 번호를 올리지 않는다');
  assert.match(body, /setVisit\(visitRef\.current\);/, '상태에 방문 번호를 반영하지 않는다');
  assert.match(body, /setStep\(next\);/, '단계를 바꾸지 않는다');

  // 양방향 대조: setStep·setVisit 은 **이 함수 안에만** 있어야 한다. 바깥에 하나라도 남으면
  // 그 경로로 들어온 화면은 조금 전의 안내를 그대로 들고 있다.
  for (const name of ['setStep', 'setVisit']) {
    const at = [...shown.matchAll(new RegExp(`${name}\\(`, 'g'))].map((m) => m.index);
    assert.equal(at.length, 1, `${name} 호출이 흩어졌다: ${at.length}곳`);
    assert.ok(at[0] > head && at[0] < head + body.length, `${name} 이 enterStep 밖에 있다`);
  }
  // 단계를 옮기는 알려진 길이 전부 enterStep 을 거치는지 — 수가 줄면 어딘가 직접 바꾸고 있다.
  const uses = [...shown.matchAll(/enterStep\(/g)].length;
  assert.ok(uses >= 5, `enterStep 을 거치는 자리가 줄었다: ${uses}`);
});

// ── 고친 결함: 되지 않는 신청에 「다시 골라 주세요」라고 말하고 있었다 ────────
//
// 제출 직전 판정이 `buildPreferences(…) === null` 하나였고 화면은 그것을 전부 「처음부터 다시
// 골라 주세요」로 안내하며 `setStep(1)` 만 했다. 두 가지가 함께 어긋나 있었다 —
//   ① 링크에 식별자가 없는 경우에는 몇 번을 다시 골라도 같은 자리에서 막힌다(되돌릴 길은
//      담당자에게 새 링크를 청하는 것이다). 끝없이 처음으로 돌려보내는 사이 5분이 준다.
//   ② 주소는 **확인 화면을 가리킨 채** 남았다(`go` 를 거치지 않았다) — 그 상태에서 화면이
//      다시 그려지면 주소가 이기므로 어르신은 같은 막다른 확인 화면으로 돌아온다.
test('제출이 막힌 이유에 따라 할 말과 되돌릴 길이 다르다(주소도 함께 따라간다)', () => {
  const shown = stripComments(flow);
  assert.match(shown, /submitBlock\(\{ sid, activity, timeslot \}\) === 'link'/,
    '막힌 이유를 구분하지 않는다 — 되지 않는 신청에 다시 고르라고 말하게 된다');
  // 링크 쪽: 잘못된 링크와 **같은 문장**(401 과 같은 자리·같은 말). 단계를 옮기지 않는다.
  const linkAt = shown.indexOf("=== 'link'");
  const linkBranch = shown.slice(linkAt, shown.indexOf('return;', linkAt));
  assert.match(linkBranch, /setError\(stepError\(at, tokenMessage\('malformed'\), atVisit\)\)/,
    '링크가 통하지 않는 사실을 다른 화면과 다른 말로 하고 있다');
  assert.ok(!/go\(1,|enterStep\(/.test(linkBranch), '되지 않는 길(다시 고르기)로 데려가고 있다');
  // 선택 쪽: `go` 를 거쳐 주소가 화면을 따라오고, 안내는 **옮겨 간 뒤의 방문**에 매달린다.
  const goAt = shown.indexOf('go(1, { activity, timeslot, done: false });');
  assert.ok(goAt > -1, '주소가 확인 화면을 가리킨 채 남는다 — 다시 그려지면 주소가 이긴다');
  const selErrAt = shown.indexOf("setError(stepError(1, submitMessage('selection'), visitRef.current))");
  assert.ok(selErrAt > -1, '고르는 화면의 안내가 그 화면의 방문에 매달리지 않는다');
  // 순서 대조: 먼저 적으면 **떠나기 전 방문 번호**가 박혀 안내가 한 번도 그려지지 않는다.
  assert.ok(selErrAt > goAt, '안내가 이동보다 먼저 적힌다');
});

test('실패 안내는 주버튼 뒤에 온다(안내가 가리키는 단추를 밀어내지 않게)', () => {
  const step3 = flow.slice(flow.indexOf('{step === 3 ?'), flow.indexOf('{step === 4 ?'));
  assert.ok(step3.length > 100, '3단계 블록을 찾지 못했다');
  const button = step3.indexOf('onClick={submit}');
  const alert = step3.indexOf('<Alert');
  assert.ok(button > -1 && alert > -1, '확인 화면에 주버튼과 안내 자리가 모두 있어야 한다');
  assert.ok(alert > button, '안내가 주버튼보다 앞에 있다 — 생기는 순간 그 단추를 밀어낸다');

  // 고르는 화면(1단계)의 안내는 반대다 — 그 문장이 가리키는 것은 **선택지**이므로 위에 온다.
  const step1 = flow.slice(flow.indexOf('{step === 1 ?'), flow.indexOf('{step === 2 ?'));
  assert.ok(step1.indexOf('<Alert') > -1, '고르는 화면에 안내 자리가 없다');
  assert.ok(step1.indexOf('<Alert') < step1.indexOf('희망 활동 고르기'), '안내가 선택지보다 뒤에 있다');

  // 자리가 둘로 갈렸으므로 **표현은 한 곳**이어야 한다(ui.jsx 의 Alert).
  assert.match(ui, /export function Alert\(\{ text = '' \}\)/, '안내 표현의 단일 출처가 없다');
  assert.match(ui, /if \(!text\) return null;/, '할 말이 없으면 빈 줄도 그리지 않는다');
  assert.equal([...flow.matchAll(/<Alert\b/g)].length, 2, '안내 자리가 두 화면에 하나씩 있어야 한다');
  // 문구는 자리를 가리키지 않는다 — 문장 쪽 계약은 tests/eummessage.test.mjs 가 본다.
  assert.equal(/아래 단추/.test(stripComments(flow)), false, '자리를 가리키는 안내가 되살아났다');
  assert.match(flow, /from '@\/lib\/eumMessage'/, '실패 문구를 단일 출처에서 가져오지 않는다');
});

// ── 고친 결함: 만료로 화면이 뒤집히는데 아무 말도 하지 않았다 ────────────────
// 작성 도중 5분이 지나면 흐름이 만료 안내 패널로 통째로 바뀐다. 그때 포커스가 얹혀 있던
// 요소(선택지·「이대로 신청하기」)가 문서에서 사라지므로 브라우저는 포커스를 body 로
// 돌려보낸다 — 새로 태어난 `role="status"` 는 리더가 변화로 보지 않는 경우가 많아 들리는
// 말이 한 마디도 없고, 다음 Tab 은 조작 요소가 없는 이 화면을 지나 브라우저 바깥으로 빠진다.
// 흐름은 단계마다 제목으로 포커스를 옮기고 있었는데, **화면이 가장 크게 바뀌는 전환**만
// 빠져 있었다(8회차의 「전송 중 포커스를 잃었다」와 같은 모양).
test('만료로 화면이 뒤집히는 순간 새 제목으로 포커스를 옮긴다', () => {
  assert.match(ui, /<h1 style=\{S\.h1\} ref=\{headingRef\} tabIndex=\{-1\}>/, '패널 제목에 포커스를 줄 수 없다');
  assert.match(ui, /headingRef = null/, '서버 컴포넌트도 쓰는 패널이라 기본값이 있어야 한다');
  assert.match(flow, /headingRef=\{expiredHeadingRef\}/, '만료 패널이 포커스를 받을 자리를 넘기지 않는다');
  assert.match(flow, /expiredHeadingRef\.current\?\.focus\(\)/, '전환에서 포커스를 옮기지 않는다');
  // 판정을 이른 return 보다 먼저 구해야 효과(훅)를 조건 뒤에 두지 않을 수 있다.
  assert.ok(flow.indexOf('const expiredNow =') < flow.indexOf('if (expiredNow)'), '판정이 효과보다 뒤에 있다');
  // 서버 쪽 세 화면은 ref 를 넘기지 않는다 — 새로 열린 문서라 브라우저가 문서 앞에서 시작한다.
  assert.equal(/headingRef=/.test(page), false, '서버 컴포넌트가 ref 를 넘기고 있다');
});

// ── 고른 것이 **눈에도** 보인다 ───────────────────────────────────────────
//
// 고친 결함: 선택 여부가 `aria-pressed` 하나로만 있었고 네 버튼의 style 은 똑같았다 —
// 브라우저는 `[aria-pressed=true]` 를 저절로 꾸미지 않는다. 그래서 이 사실은 스크린리더에만
// 전해졌고 보는 어르신에게는 한 픽셀도 달라지지 않았다. 보이는 자리는 2단계에서 「앞 화면으로」로
// 1단계에 돌아갔을 때(그리고 탭이 되살아나 복원됐을 때)다 — 고른 것은 주소에도 상태에도 남아
// 있는데 화면은 처음과 구별되지 않는다. 6회차에 "다시 그려져도 고른 것이 살아남는다" 를 고쳐
// 놓고 **살아남은 것을 보여 주지 않고 있었다**(위 전송 중 결함과 정반대 방향의 같은 결함 —
// 한쪽 감각에만 전해진 사실이다).
test('고른 것이 눈에도 보인다(낭독에만 있던 사실을 화면이 함께 말한다)', () => {
  // 고른 것과 고르지 않은 것의 style 이 달라야 한다.
  assert.match(ui, /choiceOn:\s*\{\s*\.\.\.CHOICE/, '고른 선택지의 style 이 없다');
  assert.match(ui, /choice:\s*CHOICE/, '기본 선택지 style 이 사라졌다');
  for (const key of ['activity', 'timeslot']) {
    const re = new RegExp(`style=\\{${key} === o\\.k \\? S\\.choiceOn : S\\.choice\\}`);
    assert.match(flow, re, `${key} 선택이 화면에 반영되지 않는다`);
  }
  // 색만으로 말하지 않는다(WCAG 1.4.1) — 표시 글자가 함께 붙고, 자리는 늘 비워 둔다.
  assert.match(ui, /export const EUM_CHOICE_MARK = '/, '표시 문자의 단일 출처가 없다');
  assert.match(ui, /mark:\s*\{[^}]*display: 'inline-block'/, '표시 칸이 자리를 비워 두지 않는다');
  const marks = [...flow.matchAll(/<span aria-hidden="true" style=\{S\.mark\}>/g)].length;
  assert.equal(marks, 2, `표시 칸이 두 고르기 화면에 모두 있어야 한다: ${marks}`);
  // 같은 사실을 두 번 낭독하지 않는다 — aria-pressed 가 이미 말한다.
  assert.match(flow, /aria-pressed=\{activity === o\.k\}/);
  assert.match(flow, /aria-pressed=\{timeslot === o\.k\}/);
  // 새 색을 들이지 않는다 — 흰 글자 대 주색은 이미 대비 검사를 받는 조합이다.
  assert.match(ui, /choiceOn:[^\n]*color: C\.onBrand[^\n]*background: C\.brand/);
});

// ── 경계 상태 화면(로딩·오류·토큰 없음) ───────────────────────────────────
//
// 고친 결함: 어르신 화면에는 오류·로딩 경계와 토큰 없는 진입 경로가 없어, 그 세 상태에서
// 가장 가까운 화면이 **운영 포털의 것**이었다(app/loading.jsx · app/error.jsx · app/not-found.jsx).
// 어르신이 보던 것은 13~20px 글자와 「대시보드」·「홈으로」 단추 — 요건(18pt 이상)을 어기고,
// 신청 흐름 밖의 제품 화면으로 데려가는 문이다. 링크는 문자 안에 있고 수명은 5분이라,
// 한 번 나가면 돌아오는 길을 스스로 찾지 못한다.
const boundary = {
  'app/eum/error.jsx': readFileSync(resolve(root, 'app/eum/error.jsx'), 'utf8'),
  'app/eum/loading.jsx': readFileSync(resolve(root, 'app/eum/loading.jsx'), 'utf8'),
  'app/eum/senior/page.jsx': readFileSync(resolve(root, 'app/eum/senior/page.jsx'), 'utf8'),
  // 더 짧게 잘린 링크(`/eum`). 이 주소는 「알려진 한계」에 "루트 404(포털)로 간다" 고 적혀
  // 있었지만, 한 칸 아래에서 이미 쓴 수단(세그먼트 page)으로 그대로 받을 수 있었다.
  'app/eum/page.jsx': readFileSync(resolve(root, 'app/eum/page.jsx'), 'utf8'),
};

test('경계 상태(로딩·오류·토큰 없음) 화면이 모두 어르신 화면으로 존재한다', () => {
  for (const [name, src] of Object.entries(boundary)) {
    assert.ok(src.length > 200, `${name}: 비어 있다`);
    assert.match(src, /이음 어르신 신청/, `${name}: 어르신 화면 표기 누락`);
    // 표현은 어르신 화면의 단일 출처(ui.jsx)를 쓴다 — 크기·색 요건이 한 곳에서만 관리되도록.
    assert.match(src, /ui\.jsx'/, `${name}: 어르신 화면 표현을 쓰지 않는다`);
  }
});

test('경계 화면에 포털로 나가는 문이 없다(제품 화면 노출·흐름 이탈 금지)', () => {
  for (const [name, src] of Object.entries(boundary)) {
    const shown = stripComments(src);
    for (const banned of ['도입사례', '도입 사례', '요금제', '요금표', '고객사', 'D-ARS']) {
      assert.ok(!shown.includes(banned), `${name}: 표시 금지 문구 ${banned}`);
    }
    assert.ok(!/next\/link/.test(shown), `${name}: 포털 화면으로 가는 Link 금지`);
    for (const portal of ['/dashboard', '/login', '/sessions', '/scenarios', 'href="/"']) {
      assert.ok(!shown.includes(portal), `${name}: 신청 흐름 밖으로 나가는 경로 ${portal}`);
    }
    assert.ok(!/<img\b/.test(shown), `${name}: 로고를 포함한 이미지 표시 금지`);
    // 색 하드코딩 금지 — ui.jsx / lib/eumTheme 가 단일 출처다.
    const hex = [...shown.matchAll(/#[0-9a-fA-F]{3,6}\b/g)].map((m) => m[0]);
    assert.deepEqual(hex, [], `${name}: 색 하드코딩 ${hex.join(',')}`);
  }
});

test('오류 화면: 되돌릴 길은 다시 시도 하나뿐이고 담당자를 가리킨다', () => {
  const src = boundary['app/eum/error.jsx'];
  assert.match(src, /^\s*'use client'/m, '오류 경계는 클라이언트 컴포넌트여야 한다');
  assert.match(src, /type="button"/, '암시적 submit 금지');
  const buttons = [...src.matchAll(/<button\b/g)].length;
  assert.equal(buttons, 1, `버튼 4개 이내 요건 — 오류 화면은 하나로 충분하다: ${buttons}`);
  assert.match(src, /reset\(\)/, '일시적 오류를 되돌릴 수단이 없으면 5분 링크를 잃는다');
  const shown = stripComments(src);
  // 정정: 예전에는 이 자리에서 `/담당자/` 를 **화면 소스**에서 찾았다. 그 넷은 이 파일 안에
  // 손으로 적혀 있었고(그중 본문은 11회차가 없앤 「아래 단추」였다) 지금은 문구 단일 출처에
  // 있다 — 문장 자체의 계약은 tests/eummessage.test.mjs 가 들고, 여기서는 그 표를 쓰는지 본다.
  assert.match(shown, /EUM_BOUNDARY_MESSAGE/, '문구를 단일 출처에서 가져오지 않는다');
  assert.match(shown, /M\.errorHint/, '담당자를 가리키는 한 줄이 사라졌다');
  assert.ok(!/관리자/.test(shown), '포털 문구(관리자에게 문의)가 남아 있다');
  // 기술 문구를 화면에 내지 않는다(콘솔에만 남긴다).
  for (const jargon of ['stack', 'digest', 'Error:', '오류 코드']) {
    assert.ok(!shown.includes(jargon), `기술 문구 노출: ${jargon}`);
  }
  assert.match(src, /monitorLine\(buildEvent\(/, '원인 추적 한 줄은 남겨야 한다');
});

// ── 고친 결함: **오류 화면으로 뒤집히는데도** 아무 말도 하지 않았다 ──────────
// 11회차는 만료 패널에서 이것을 고쳤다(ui.jsx 의 Notice headingRef) — 흐름이 통째로 다른
// 화면으로 바뀔 때 포커스가 body 로 떨어져 ① 들리는 말이 한 마디도 없고(새로 태어난
// role="status" 는 리더가 변화로 보지 않는 경우가 많다) ② 다음 Tab 이 문서 맨 앞에서 시작한다.
// 그런데 **같은 모양으로 뒤집히는 오류 경계**는 손대지 않았다. 하이드레이션 뒤에 터진 오류는
// 문서를 그대로 두고 신청 흐름이 있던 자리만 이 화면으로 바꾸므로 조건이 똑같고, 이 화면의
// 유일한 되돌리기 수단(「다시 시도」)까지 Tab 으로 다시 내려오는 사이 5분 링크가 줄어든다.
// 「고침이 절반이었던 자리」가 또 한 번 남아 있었다.
test('오류 화면: 뒤집히는 순간 새 제목으로 포커스를 옮긴다(흐름·만료 전환과 같은 방식)', () => {
  const src = boundary['app/eum/error.jsx'];
  assert.match(src, /<h1 style=\{S\.h1\} ref=\{headingRef\} tabIndex=\{-1\}>/,
    '제목에 포커스를 줄 수 없다 — 탭 순서에는 끼어들지 않게 tabIndex=-1 이어야 한다');
  assert.match(src, /headingRef\.current\?\.focus\(\)/, '전환에서 포커스를 옮기지 않는다');
  // 마운트 한 번만 옮긴다 — 오류가 바뀔 때마다(error 의존성) 다시 낚아채면 어르신이 단추로
  // 옮긴 포커스를 빼앗는다. 원인 기록 쪽만 error 를 본다.
  assert.match(src, /headingRef\.current\?\.focus\(\)[\s\S]{0,200}\}, \[\]\);/, '마운트 전환이 아니다');
  assert.match(src, /buildEvent\(\{ err: error[\s\S]{0,200}\}, \[error\]\);/, '원인 기록이 오류를 따라가지 않는다');
  // 대기 화면은 서버 컴포넌트이고 **문서가 처음 열릴 때만** 보인다(신청 화면은 pushState 로
  // 단계를 옮긴다) — ref 를 넘길 수 없고 넘길 필요도 없다(Notice 의 서버 쪽 세 화면과 같다).
  const loading = boundary['app/eum/loading.jsx'];
  assert.equal(/use client/.test(loading), false, '대기 화면이 클라이언트가 되면 판단 근거가 바뀐다');
  assert.equal(/headingRef|tabIndex/.test(loading), false, '서버 컴포넌트가 ref 를 넘기고 있다');
});

// ── 고친 결함: **나오는 길에서도** 아무 말도 하지 않았다 ────────────────────
//
// 위 고침은 이 화면으로 **들어오는** 전환만 받았다. 그런데 「다시 시도」는 눌린 순간 자기
// 자신이 사라지는 단추다 — reset() 이 이 화면을 걷어내고 신청 흐름이 그 자리에 되살아나므로
// 포커스는 다시 body 로 떨어진다. 그리고 되살아난 흐름은 **첫 렌더에서 포커스를 옮기지
// 않는다** — 그 규칙의 근거("아직 아무 조작도 하지 않았다")가 여기서는 성립하지 않는다
// (조작해서 온 것이다). 11~13회차가 세 번 고친 모양이 **같은 전환의 반대 방향**으로 한 번 더
// 남아 있었던 셈이다. 두 화면은 서로를 모르므로 사실 하나를 문서에 적어 넘긴다.
test('「다시 시도」 뒤에도 되살아난 화면이 제목으로 포커스를 옮긴다(양쪽 대조)', () => {
  const src = stripComments(boundary['app/eum/error.jsx']);
  // 적는 쪽 — reset() **보다 먼저** 적어야 한다(이 화면은 그 뒤 사라진다).
  assert.match(src, /markRetried\(/, '되살아난 화면에 넘길 사실을 적지 않는다');
  assert.ok(src.indexOf('markRetried(') < src.indexOf('reset()'), '적기 전에 화면이 사라진다');
  assert.match(src, /from '@\/lib\/eumSenior'/, '판정을 화면이 손으로 짓고 있다');
  // 읽는 쪽 — 흐름의 **첫 렌더**에서만 예외로 쓰이고, 읽은 뒤 지운다(지움은 lib 쪽 계약).
  const first = flow.indexOf('if (!mountedRef.current) {');
  assert.ok(first > -1, '첫 렌더 분기를 찾지 못했다');
  const branch = flow.slice(first, flow.indexOf('}', flow.indexOf('return;', first)));
  assert.match(branch, /takeRetried\(/, '되살아난 화면이 그 사실을 읽지 않는다');
  assert.match(branch, /document\.documentElement/, '문서 뿌리 말고 다른 자리를 보고 있다');
  // 저장소로 넘기면 문서를 넘겨 살아남아, 다음에 링크를 여는 어르신이 누른 적 없는 누름의
  // 뒤처리를 받는다. 모듈 변수는 번들 경계마다 갈라진다(12회차의 소진 스토어).
  for (const wrong of ['sessionStorage', 'localStorage']) {
    assert.ok(!src.includes(wrong), `오류 화면이 ${wrong} 로 사실을 넘기고 있다`);
  }
});

test('오류·로딩 특수 파일은 기본 export 만 둔다(route.js 규칙과 같은 취지)', () => {
  for (const name of ['app/eum/error.jsx', 'app/eum/loading.jsx']) {
    const names = [...boundary[name].matchAll(/^export\s+(?:async\s+)?(?:function|const|let|var|class)\s+(\w+)/gm)]
      .map((m) => m[1]);
    assert.deepEqual(names, [], `${name}: 기본 export 외 export 금지 — ${names.join(',')}`);
    assert.match(boundary[name], /export default function/, `${name}: 기본 export 누락`);
  }
});

test('토큰 없는 진입은 잘못된 링크와 같은 문구를 쓰고, 토큰을 다루지 않는다', () => {
  // 문자에서 잘린 주소는 어디서 잘리느냐에 따라 둘이다 — `/eum/senior` 와 한 칸 더 짧은 `/eum`.
  // 앞의 것만 받아 두면 뒤의 것은 루트 404(운영 포털 · 커다란 「404」와 「대시보드」 단추)로 간다.
  for (const name of ['app/eum/senior/page.jsx', 'app/eum/page.jsx']) {
    const src = boundary[name];
    assert.match(src, /tokenMessage\('missing'\)/, `${name}: 안내 문구 단일 출처를 써야 한다`);
    assert.ok(!/verifyEumToken|consumeStore|claim\(/.test(src), `${name}: 판정은 [token]/page.jsx 한 곳뿐이다`);
    assert.match(src, /absolute: '이음 어르신 신청'/, `${name}: 제품 브랜드 템플릿을 쓰지 않는다`);
    assert.equal(/<button\b/.test(src), false, `${name}: 어르신이 스스로 재발급할 수단이 없으므로 단추를 두지 않는다`);
    assert.match(src, /링크를 열 수 없습니다/, `${name}: 무엇이 잘못됐는지 말해야 한다`);
  }
});

// ── 안내 패널의 마무리 문구 ───────────────────────────────────────────────
//
// 고친 결함: 마무리 문구에 기본값이 있었고(「이 화면은 안전을 위해 5분이 지나면 닫힙니다」),
// 그 기본값은 **나오는 모든 자리에서 거짓**이었다 —
//   · 진입 시 만료 · 작성 중 만료 → 5분은 **이미 지났다**(앞으로 닫힌다는 말이 아니다).
//   · 잘린 링크(`/eum` · `/eum/senior`) → 토큰이 없는 정적 페이지라 **닫히지 않는다**.
//   · 이미 접수됨 → 이 한 자리만 foot 을 따로 넘겨 맞는 말을 하고 있었다.
// 정작 그 문장이 맞는 화면(신청 흐름 1~4단계)은 Notice 를 쓰지 않는다. 맞는 자리에는 없고
// 틀린 자리에만 있던 문장이고, 기본값이라 아무도 적지 않아도 조용히 붙었다 — metadata 상속·
// 전역 CSS 와 같은 모양이다("조용히 내려오는 것"). 그래서 기본값을 없애고 호출마다 적게 한다.
const noticeTags = (src) => [...stripComments(src).matchAll(/<Notice\b[^>]*>/g)].map((m) => m[0]);

test('마무리 문구: Notice 를 그리는 모든 자리가 foot 을 직접 적는다(기본값이 없다)', () => {
  const found = [];
  for (const [name, src] of Object.entries({
    'app/eum/senior/[token]/page.jsx': page,
    'app/eum/senior/[token]/SeniorFlow.jsx': flow,
    'app/eum/senior/page.jsx': boundary['app/eum/senior/page.jsx'],
    'app/eum/page.jsx': boundary['app/eum/page.jsx'],
  })) {
    const tags = noticeTags(src);
    assert.ok(tags.length >= 1, `${name}: Notice 호출을 찾지 못했다 — 대조가 무의미해지기 전에 고쳐라`);
    for (const tag of tags) {
      assert.match(tag, /\bfoot=/, `${name}: foot 을 적지 않은 Notice — ${tag.slice(0, 70)}`);
      assert.match(tag, /foot=\{[^}]*EUM_NOTICE_FOOT\./,
        `${name}: 마무리 문구를 손으로 적었다(등록부 단일 출처) — ${tag.slice(0, 70)}`);
    }
    found.push(...tags);
  }
  assert.ok(found.length >= 4, `Notice 호출이 줄었다: ${found.length}`);
});

test('마무리 문구: 등록부와 쓰이는 곳이 양방향으로 맞는다', () => {
  const keys = exportedObjectEntries(ui, 'EUM_NOTICE_FOOT').map((e) => e.key);
  assert.ok(keys.length >= 3, `등록부를 읽지 못했다: ${keys.length}`);
  // 쓰는 쪽(화면 전부)에서 실제로 가리키는 이름.
  const text = Object.values(eumSources).map(stripComments).join('\n');
  const used = [...new Set([...text.matchAll(/EUM_NOTICE_FOOT\.(\w+)/g)].map((m) => m[1]))];
  // 등록만 하고 아무도 쓰지 않으면 등록부가 썩고, 없는 이름을 가리키면 화면이 **빈 줄**이 된다
  // (undefined → Notice 의 foot 이 거짓값 → 아무 말도 하지 않는다. 조용한 실패를 막는다).
  assert.deepEqual(used.sort(), keys.sort(), '등록부와 화면이 어긋난다');
  // 「5분이 지나면 닫힙니다」류의 문장이 되살아나면 그 거짓이 다시 모든 자리에 붙는다.
  assert.equal(/지나면 닫힙니다/.test(text), false, '닫히지 않는 화면에 닫힌다고 적은 문장이 되살아났다');
});

// ── 어르신 화면이 head 로 말하는 이름 ─────────────────────────────────────
//
// 고친 결함: 어르신 화면은 `title` 만 덮어쓰고 있었다. 그런데 Next 의 metadata 는 레이아웃에서
// 상속되고, 자식이 적지 않은 최상위 키는 부모 값이 그대로 내려간다. 루트 레이아웃이 운영
// 포털용으로 선언한 `openGraph`·`twitter`·`applicationName`·`appleWebApp` 이 그대로 실려 있었다.
// 어르신은 링크를 **문자로** 받고, 문자·메신저 앱은 그 주소를 긁어 `og:*` 로 미리보기 카드를
// 만든다 — 신청 화면보다 먼저 보이는 그 카드에 적혀 있던 것이 운영 포털의 제목·사이트 이름이다.
// 「제품 화면을 어르신에게 노출하지 않는다」가 화면 코드에서만 지켜지고 head 에서는 아무도
// 보지 않고 있었다. 이제 `app/eum/layout.jsx` 가 묶음 전체의 단일 출처다.
const rootLayout = readFileSync(resolve(root, 'app/layout.jsx'), 'utf8');
const eumLayout = readFileSync(resolve(root, 'app/eum/layout.jsx'), 'utf8');

// 어르신 화면이 **자기 값으로 덮어써야** 하는 키.
const OWN = {
  title: '브라우저 탭·공유 제목',
  description: '미리보기 카드의 설명문',
  openGraph: '문자·메신저가 읽어 만드는 미리보기 카드 — 어르신이 신청 화면보다 먼저 본다',
  twitter: '같은 카드의 다른 규격',
  applicationName: '브라우저가 말하는 앱 이름',
  appleWebApp: '홈 화면에 추가했을 때 남는 이름',
  robots: '토큰이 든 주소가 색인되지 않게',
  // 아래 둘은 **값을 덮는** 것이 아니라 **비우는** 것이다 — 어르신용 아이콘·매니페스트를
  // 자동화가 지어내지 않는다는 판단은 그대로 두고, 포털 것을 가리키지 않는 쪽을 골랐다.
  icons: '탭·공유·홈 화면의 그림 — 제품 로고라 「로고 표시 금지」 요건에 걸린다',
};

// 상속받아 두는 키와 **그 사유**. 사유 없는 상속은 다음 사람이 늘린다.
const INHERITED = {
  metadataBase: '상대 주소 해석의 기준일 뿐 문구가 아니다 — 지우면 상대 URL 해석이 깨진다',
  formatDetection: '전화번호 자동 링크 끄기 — 어르신 화면에도 그대로 맞는 설정이다',
  keywords: '검색엔진용이고 화면·미리보기에 나오지 않는다(색인 자체는 robots 로 막는다)',
  authors: '운영 주체 표기 — 사람 눈에 닿지 않고, 지우는 것이 더 정직하지도 않다',
  creator: '운영 주체 표기 — authors 와 같은 이유',
  publisher: '운영 주체 표기 — authors 와 같은 이유',
};

// 제품 브랜드로 읽히는 낱말. 미리보기 카드·홈 화면 이름에 이것이 있으면 안 된다.
const BRAND = ['D-ARS', 'GOWON', '보이는 ARS', 'Visual ARS', '콜봇', '관리자', '운영 포털'];
const brandedIn = (text) => BRAND.filter((w) => text.includes(w));

test('어르신 레이아웃이 상속받은 제품 브랜드를 전부 자기 문구로 덮는다', () => {
  const own = metadataFields(eumLayout);
  assert.ok(Object.keys(own).length >= 7, 'metadata 를 읽지 못했다 — 대조가 무의미해지기 전에 고쳐라');
  for (const [key, why] of Object.entries(OWN)) {
    assert.ok(own[key], `어르신 화면이 덮지 않은 키: ${key}(${why})`);
    const leaked = brandedIn(inlineStringConsts(eumLayout, own[key]));
    assert.deepEqual(leaked, [], `${key} 에 제품 브랜드가 남아 있다: ${leaked.join(',')}`);
  }
});

test('루트 레이아웃의 metadata 키가 전부 분류돼 있다(새 키는 결정을 강제한다)', () => {
  const rootKeys = Object.keys(metadataFields(rootLayout));
  assert.ok(rootKeys.length >= 10, `루트 metadata 를 읽지 못했다: ${rootKeys.length}`);
  const unclassified = rootKeys.filter((k) => !(k in OWN) && !(k in INHERITED));
  assert.deepEqual(unclassified, [], `어르신 화면에서 덮을지 말지 정하지 않은 키: ${unclassified.join(',')}`);
  // 유령 분류도 잡는다 — 루트에서 사라진 키가 목록에 남아 있으면 판정이 썩는다.
  const ghost = Object.keys(INHERITED).filter((k) => !rootKeys.includes(k));
  assert.deepEqual(ghost, [], `루트에 없는 상속 항목: ${ghost.join(',')}`);
  for (const [k, why] of Object.entries(INHERITED)) {
    assert.ok(typeof why === 'string' && why.length >= 10, `사유 없는 상속: ${k}`);
  }
});

test('브랜드를 담은 루트 키를 상속으로 넘길 수 있는 범위는 고정돼 있다', () => {
  const fields = metadataFields(rootLayout);
  const branded = Object.keys(fields).filter((k) => brandedIn(inlineStringConsts(rootLayout, fields[k])).length);
  assert.ok(branded.includes('openGraph') && branded.includes('title'), `브랜드 탐지가 느슨해졌다: ${branded.join(',')}`);
  // 사람 눈·미리보기에 닿지 않는다는 이유로 상속을 허용한 것은 이 넷뿐이다. 브랜드를 담은 키가
  // 하나 늘어 상속 쪽으로 분류되면 여기서 실패한다(상속은 **조용히** 내려오기 때문).
  const inheritedBranded = branded.filter((k) => k in INHERITED).sort();
  assert.deepEqual(inheritedBranded, ['authors', 'creator', 'keywords', 'publisher']);
});

// ── 파일 규약으로 head 에 끼어드는 것 ─────────────────────────────────────
//
// 고친 결함: 위 세 테스트는 루트 레이아웃의 `metadata` **export 키**를 전부 분류하게 한다.
// 그런데 head 로 들어오는 길은 그것만이 아니다 — Next 는 `app/` 의 **파일 규약**
// (`app/manifest.js` · `app/icon.svg`)도 긁어 head 에 끼워 넣고, 그것들은 어느 metadata export 에도
// 적혀 있지 않아 **키 대조가 보지 못했다**. 그래서 지난 회차의 브랜드 차단막은 절반이었다:
// `appleWebApp.title`(iOS 홈 화면 이름)은 어르신 문구로 덮였는데, 안드로이드가 읽는
// `rel="manifest"` 는 **포털 매니페스트를 그대로 가리키고 있었다**(`name: D-ARS …` ·
// `start_url: /dashboard`). 두 절반이 서로 다른 말을 하고 있었던 것이 고침이 절반이었다는 증거다.
// 어르신이 그 링크를 홈 화면에 추가하면 제품 로고·제품 이름이 남고, 누르면 운영 포털이 열린다 —
// 경계 화면에서 없앤 「대시보드」 단추와 **같은 문**이 head 에 남아 있었다.
//
// 지난 회차가 이것을 「알려진 한계」로 남긴 이유는 "무엇으로 덮을지가 디자인 결정"이었다.
// 그 이유는 **덮는 것**에는 맞고 **치우는 것**에는 맞지 않는다 — 치우는 쪽에는 지어낼 값이 없다.
//
// 그리고 이 둘은 끊는 자리가 다르다(빌드 산출물로 확인한 사실이다).
//   · `icons` 는 레이아웃에서 끊을 수 있다 — Next 는 `metadata.icons` 가 **비어 있을 때만**
//     파일 규약 아이콘을 끼워 넣으므로, 빈 선언이 그 자리를 막는다(`null` 이면 되살아난다).
//   · `manifest` 는 레이아웃에서 끊을 수 없다 — 파일 규약 정적 metadata 는 `app/manifest.js` 가
//     있는 폴더 **바로 아래 세그먼트**(=이 레이아웃)에 붙고, 그 세그먼트의 `metadata` export
//     **뒤에** 무조건 덮어쓴다. 레이아웃에 `manifest: null` 을 적어 보고 산출물에 `rel="manifest"`
//     가 그대로 남는 것을 확인했다 — 적었는데 아무 일도 일어나지 않는, 가장 나쁜 모양이다.
//     그래서 한 칸 아래(각 page)에서 끊고, 빠뜨린 page 가 생기지 않게 여기서 전부 긁어 대조한다.
const manifestRoute = readFileSync(resolve(root, 'app/manifest.js'), 'utf8');

// `app/eum/**` 의 page 파일 전부. 새 어르신 화면이 생기면 자동으로 대조 대상에 들어온다.
function eumPageFiles(dir = resolve(root, 'app/eum'), out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = resolve(dir, entry.name);
    if (entry.isDirectory()) eumPageFiles(full, out);
    else if (entry.name === 'page.jsx') out.push(full);
  }
  return out;
}

test('파일 규약으로 끼어드는 head 항목(매니페스트·아이콘)을 어르신 화면에서는 끊는다', () => {
  // 끊어야 하는 이유를 먼저 고정한다 — 이 파일이 포털을 가리키는 동안에만 아래 결정이 유효하다.
  // 포털용이 아니게 바뀌면 여기서 실패해 결정을 다시 하게 만든다(유령 분류 방지).
  assert.ok(brandedIn(manifestRoute).length > 0, 'app/manifest.js 가 더 이상 포털 것이 아니다 — 끊을 이유를 다시 보라');
  assert.match(manifestRoute, /start_url:\s*'\/dashboard'/, '시작 주소가 바뀌었다 — 흐름 이탈 판단을 다시 하라');

  // 아이콘: 레이아웃의 **빈 선언**이 파일 규약의 끼어들기를 막는다.
  const own = metadataFields(eumLayout);
  assert.match(own.icons || '', /icon:\s*\[\s*\]/, '아이콘 선언이 비어 있지 않다');
  assert.match(own.icons || '', /apple:\s*\[\s*\]/, 'apple-touch-icon 선언이 비어 있지 않다');
  assert.ok(existsSync(resolve(root, 'app/icon.svg')), 'app/icon.svg 가 사라졌다 — 빈 선언의 이유를 다시 보라');

  // 매니페스트: 레이아웃에 적으면 **조용히 덮인다** → 적혀 있으면 실패로 알린다.
  assert.ok(!('manifest' in own), '레이아웃의 manifest 선언은 파일 규약에 덮인다 — 각 page 에서 끊어야 한다');
  const pages = eumPageFiles();
  assert.ok(pages.length >= 3, `어르신 page 를 찾지 못했다: ${pages.length}`);
  for (const file of pages) {
    const fields = metadataFields(readFileSync(file, 'utf8'));
    assert.equal(fields.manifest, 'null', `${file.slice(root.length + 1)}: 포털 매니페스트가 매달린다`);
  }
});

test('어르신 화면의 주소창 색은 제품 브랜드색이 아니라 이 화면의 바탕색이다', () => {
  // 루트는 포털 브랜드색(#be5535)을 themeColor 로 선언하고, viewport 도 metadata 처럼 상속된다.
  assert.match(rootLayout, /themeColor:\s*'#be5535'/, '루트 선언이 바뀌었다 — 덮을 값을 다시 보라');
  assert.match(eumLayout, /export const viewport\s*=/, '어르신 화면이 viewport 를 덮지 않는다');
  assert.match(eumLayout, /themeColor:\s*EUM_COLORS\.bg/, '색은 lib/eumTheme 단일 출처에서 가져와야 한다');
  const hex = [...stripComments(eumLayout).matchAll(/#[0-9a-fA-F]{3,6}\b/g)].map((m) => m[0]);
  assert.deepEqual(hex, [], `app/eum/layout.jsx 에 색 하드코딩: ${hex.join(',')}`);
  // 확대를 막는 설정은 어디에도 없어야 한다 — 저시력 어르신이 손가락으로 키울 수 있어야 한다.
  for (const src of [rootLayout, eumLayout]) {
    assert.ok(!/maximumScale|userScalable/.test(src), '확대 제한은 저시력 요건과 정면으로 어긋난다');
  }
});

// ── 어르신 화면에 내려오는 포털 전역 CSS ──────────────────────────────────
//
// 고친 결함: 어르신 화면은 요건(18pt · 대비 4.5:1)을 **인라인 style 로만** 지켜 왔다. 그런데
// `app/globals.css` 는 루트 레이아웃이 import 하므로 이 화면에도 그대로 내려오고, 인라인 style 은
// **자기가 적은 속성만** 이긴다 — 적지 않은 속성은 전역 규칙이 가져간다. 클래스 선택자
// (`.btn:disabled`)는 이 화면에 닿지 않지만 요소·의사 선택자는 닿는다. 그래서 화면 코드를 한 줄도
// 건드리지 않은 채 요건이 깨져 있었다:
//   · `button:disabled{opacity:.55}` → 「신청하는 중…」 동안 주버튼 대비 2.87:1(요건 4.5:1).
//     제출이 실패했는지 성공했는지 기다리며 읽는 그 글자가 가장 흐렸다.
//   · `a,button{transition:…}` → 이 화면의 `prefers-reduced-motion` 질의가 **거꾸로**여서
//     움직임을 꺼 달라고 **한** 사람에게만 전환이 남아 있었다.
//   · `letter-spacing` 음수 → 자간이 포털 취향으로 눌렸다.
//   · `:focus-visible{box-shadow:var(--ring)}` → 포커스 링에 제품 브랜드색이 한 겹 끼었다.
// metadata 상속과 **같은 모양**의 결함이다 — 조용히 내려오고, 이 화면의 파일만 읽어서는 보이지
// 않는다. 그래서 재발 방지도 같은 모양으로 둔다: 전역 CSS 의 요소 선택자를 **전부 분류**하게 하고
// 양방향으로 대조한다. 새 전역 규칙이 하나 늘었을 때 아무 일도 일어나지 않는 것이 위험이다.
const globalCss = readFileSync(resolve(root, 'app/globals.css'), 'utf8');

// 어르신 화면이 **그 요소를 아예 쓰지 않아서** 닿지 않는 선택자 → 없어야 하는 태그 이름.
// 주석이 아니라 테스트가 그 전제를 확인한다 — 어르신 화면에 <input> 하나가 생기면 여기서 실패한다.
const CSS_ABSENT = {
  select: 'select',
  textarea: 'textarea',
  svg: 'svg',
  table: 'table',
  tr: 'tr',
  td: 'td',
  th: 'th',
  b: 'b',
  strong: 'strong',
  h2: 'h2',
  h3: 'h3',
  h4: 'h4',
  img: 'img',
  'input:focus-visible': 'input',
  'select:focus-visible': 'select',
  'textarea:focus-visible': 'textarea',
  '::placeholder': 'input',
};

// 닿는데 **요건을 깨뜨리므로** 어르신 화면이 끄는 선택자 → ui.jsx 가 반드시 담아야 하는 선언.
const CSS_NEUTRALIZED = {
  body: 'letter-spacing: normal',
  h1: 'letter-spacing: normal',
  a: 'transition: none',
  button: 'transition: none',
  'button:disabled': 'opacity: 1',
  ':focus-visible': 'box-shadow: none',
};

// 닿지만 어르신 화면에도 그대로 맞는 선택자 → **사유**. 사유 없는 허용은 다음 사람이 늘린다.
const CSS_ACCEPTED = {
  ':root': '커스텀 속성(--brand 등) 선언뿐이고 어르신 화면은 그 변수를 쓰지 않는다',
  '*': 'box-sizing:border-box — 375px 가로 스크롤을 막는 쪽이고 ui.jsx 도 같은 값을 쓴다',
  html: 'margin·padding 0 · overflow-x:hidden · text-size-adjust 100% — 어르신 화면에도 맞다',
  '*::-webkit-scrollbar': '스크롤바 모양 — 글자 크기·대비·배치에 닿지 않는다',
  '*::-webkit-scrollbar-thumb': '스크롤바 모양 — 위와 같은 이유',
  '*::-webkit-scrollbar-thumb:hover': '스크롤바 모양 — 위와 같은 이유',
  '::selection': '글자를 끌어 선택했을 때의 반투명 하이라이트 — 글자 자체의 대비는 바뀌지 않는다',
};

// ── 고친 결함: 분류가 **선택자 이름**까지였다 ─────────────────────────────
//
// 위 세 목록은 선택자 이름을 전부 분류하게 한다. 그런데 `cssBareSelectors` 는 이름을 **중복
// 제거**해 돌려주므로, 같은 선택자에 선언이 늘어나는 길에는 아무 신호가 없었다 — 같은 이름의
// **두 번째 규칙**이든, 기존 규칙에 한 줄 추가든. 실제로 그렇게 들어온 것이 둘 있었다.
//   · `*` 를 box-sizing 으로 분류해 둔 뒤 파일 아래쪽에 `*{scrollbar-width;scrollbar-color}` 가
//     생겼다.
//   · `body` 를 「자간을 끈다」로 분류해 둔 사이, 같은 규칙이 들고 있던 `background:var(--bg)` 는
//     아무도 판정하지 않았다 — 그 색이 **문서 캔버스**(오버스크롤에서 보이는 자리)를 칠하므로,
//     어르신 화면의 바탕이 그 한 겹만 포털 색이었다. 8회차가 주소창 색을 이 화면의 바탕색으로
//     맞춰 둔 자리가 하필 그 띠의 바로 위다(고침이 절반이었다 · ui.jsx 의 EumStyles (3)).
// 「요소 선택자를 전부 분류한다」는 이름은 그 사이에도 참이었다 — 검사하지 않는 낱말이 이름에
// 들어 있던 또 한 자리다. 그래서 **닿는 선택자의 선언 이름까지** 등록하고 양방향으로 대조한다.
// 값은 고정하지 않는다(포털 색 한 번 손질에 어르신 테스트가 깨지면 안 된다) — 판단에 필요한
// 것은 "무엇이 닿는가" 다. 닿지 않는다고 분류한 선택자(CSS_ABSENT)는 그 요소가 화면에 없다는
// 사실을 다른 테스트가 확인하므로 선언을 세지 않는다.
const CSS_REACHING_DECLS = {
  ':root': ['--bad', '--bg', '--brand', '--brand-d', '--brand-l', '--brand-xl', '--info', '--ink',
    '--line', '--muted', '--nav-h', '--ok', '--panel', '--ring', '--shadow', '--shadow-sm',
    '--side-w', '--sidebar', '--sidebar-2', '--warn'],
  // scrollbar-* 는 허용이다 — 어르신 흐름의 기기는 스크롤바가 겹쳐 그려지는 휴대폰이고,
  // 창 스크롤바를 칠하는 것은 문서의 뿌리라 `.eum-screen` 안쪽에서는 닿을 수도 없다.
  '*': ['box-sizing', 'scrollbar-color', 'scrollbar-width'],
  html: ['-webkit-text-size-adjust', 'margin', 'overflow-x', 'padding'],
  // background 는 이제 EumStyles 가 덮는다(캔버스). color·font-family·line-height 는 화면의
  // <main> 이 인라인으로 다시 적으므로 그 안쪽에는 닿지 않는다.
  body: ['-moz-osx-font-smoothing', '-webkit-font-smoothing', '-webkit-text-size-adjust',
    'background', 'color', 'font-family', 'letter-spacing', 'line-height', 'margin',
    'overflow-x', 'padding'],
  // color·text-decoration 은 되돌아가기 링크가 인라인으로 다시 적는다(밑줄·주색).
  a: ['color', 'text-decoration', 'transition'],
  button: ['font-family', 'transition'],
  // text-wrap:balance 는 제목 줄바꿈을 고르게 한다 — 크기·대비에 닿지 않고 읽기에 이롭다.
  h1: ['font-weight', 'letter-spacing', 'text-wrap'],
  '*::-webkit-scrollbar': ['height', 'width'],
  '*::-webkit-scrollbar-thumb': ['background', 'background-clip', 'border', 'border-radius'],
  '*::-webkit-scrollbar-thumb:hover': ['background', 'background-clip'],
  '::selection': ['background'],
  // outline:none 은 포커스 링을 지운다. 어르신 화면의 조작 요소는 **전부** .eum-focus 를 달고
  // (위 「키보드」 테스트가 대조한다) 그 규칙이 링을 다시 그린다.
  ':focus-visible': ['border-radius', 'box-shadow', 'outline'],
  'button:disabled': ['box-shadow', 'cursor', 'opacity'],
};

const eumSources = {
  'app/eum/senior/[token]/page.jsx': page,
  'app/eum/senior/[token]/SeniorFlow.jsx': flow,
  'app/eum/senior/[token]/ui.jsx': ui,
  'app/eum/senior/[token]/PriorLocal.jsx': prior,
  ...boundary,
};

test('포털 전역 CSS 의 요소 선택자가 전부 분류돼 있다(새 규칙은 결정을 강제한다)', () => {
  const bare = cssBareSelectors(globalCss);
  assert.ok(bare.length >= 25, `전역 CSS 를 읽지 못했다 — 대조가 무의미해지기 전에 고쳐라: ${bare.length}`);
  const unclassified = bare.filter((s) => !(s in CSS_ABSENT) && !(s in CSS_NEUTRALIZED) && !(s in CSS_ACCEPTED));
  assert.deepEqual(unclassified, [], `어르신 화면에서 어떻게 처리할지 정하지 않은 전역 선택자: ${unclassified.join(' | ')}`);
  // 유령 분류도 잡는다 — 전역 CSS 에서 사라진 선택자가 목록에 남아 있으면 판정이 썩는다.
  const known = [...Object.keys(CSS_ABSENT), ...Object.keys(CSS_NEUTRALIZED), ...Object.keys(CSS_ACCEPTED)];
  const ghost = known.filter((s) => !bare.includes(s));
  assert.deepEqual(ghost, [], `전역 CSS 에 없는 분류 항목: ${ghost.join(' | ')}`);
  for (const [s, why] of Object.entries(CSS_ACCEPTED)) {
    assert.ok(typeof why === 'string' && why.length >= 10, `사유 없는 허용: ${s}`);
  }
});

test('닿지 않는다고 분류한 전역 선택자는 그 요소가 어르신 화면에 실제로 없다', () => {
  for (const [selector, tag] of Object.entries(CSS_ABSENT)) {
    for (const [name, src] of Object.entries(eumSources)) {
      const re = new RegExp(`<${tag}\\b`);
      assert.ok(!re.test(stripComments(src)), `${name}: <${tag}> 가 생겼다 — 전역 규칙 ${selector} 가 이제 닿는다`);
    }
  }
});

// ── 규칙이 아닌 것도 닿는다: 전역 CSS 가 바깥으로 걸어 둔 요청 ───────────────
//
// 찾았으나 **고치지 못한 것**이라 여기에 사유와 함께 못박아 둔다. `app/globals.css` 의 첫 줄은
// 제3자 CDN 의 글꼴 스타일시트를 `@import` 하고, 그 파일은 루트 레이아웃이 import 하므로 어르신
// 화면에도 그대로 내려온다(빌드 산출물로 확인: `/eum`·`/eum/senior` 가 그 CSS 를 링크한다).
// `@import` 는 중괄호가 없어 규칙 스캐너가 보지 못했고 — 「전역 CSS 를 전부 분류한다」는 대조는
// 그 줄을 한 번도 지나가지 않았다 — 결과는 이렇다.
//   · 어르신 화면의 **첫 그림이 제3자 응답을 기다린다**(@import 는 렌더 블로킹이고, 자기 CSS
//     뒤에 사슬로 붙는다). 느린 회선에서 그 사이 보이는 것은 대기 화면조차 아닌 **빈 화면**이고,
//     링크 수명은 5분이다.
//   · 그런데 이 화면은 그 글꼴을 **쓰지도 않는다** — fontFamily 는 system-ui 로 인라인이다.
// 떼어 내려면 `globals.css` 를 고쳐야 하고 그것은 **포털 전체의 타이포그래피**를 바꾸는 일이라
// 이 과제의 손 밖이다(**[승인 필요]**). 할 수 있는 것은 새 제3자 요청이 조용히 늘지 않게
// 막는 것이다 — 호스트가 하나라도 늘면 여기서 실패한다.
const CSS_EXTERNAL = {
  'cdn.jsdelivr.net': '포털 글꼴(Pretendard) @import — 어르신 화면은 쓰지 않지만 떼면 포털 타이포그래피가 바뀐다 [승인 필요]',
};

test('전역 CSS 가 바깥으로 거는 요청이 전부 분류돼 있다(새 제3자는 결정을 강제한다)', () => {
  const hosts = cssExternalRefs(globalCss);
  assert.deepEqual(hosts.sort(), Object.keys(CSS_EXTERNAL).sort(),
    `어르신 화면까지 따라 내려오는 제3자 요청: ${hosts.join(' | ')}`);
  for (const [host, why] of Object.entries(CSS_EXTERNAL)) {
    assert.ok(typeof why === 'string' && why.length >= 10, `사유 없는 외부 요청: ${host}`);
  }
  // 어르신 화면은 그 글꼴을 쓰지 않는다 — 기다리는 값이 실제로 쓰이지 않는다는 사실을 고정한다.
  assert.match(ui, /fontFamily: 'system-ui/, '어르신 화면이 제3자 글꼴에 의존하기 시작했다');
  assert.equal(/Pretendard/.test(ui), false, '어르신 화면이 포털 글꼴을 가리키고 있다');
});

test('닿는 전역 선택자의 선언까지 분류돼 있다(이름은 그대로인데 늘어나는 길을 막는다)', () => {
  const decls = cssBareDecls(globalCss);
  assert.ok(Object.keys(decls).length >= 25, '전역 CSS 를 읽지 못했다 — 대조가 무의미해지기 전에 고쳐라');
  // 닿는 선택자(끄는 것 + 허용하는 것)는 전부 선언 목록을 가져야 한다.
  const reaching = [...Object.keys(CSS_NEUTRALIZED), ...Object.keys(CSS_ACCEPTED)].sort();
  assert.deepEqual(Object.keys(CSS_REACHING_DECLS).sort(), reaching,
    '닿는 선택자와 선언 목록이 어긋난다(분류를 늘렸으면 선언도 적어야 한다)');
  for (const [selector, props] of Object.entries(CSS_REACHING_DECLS)) {
    assert.deepEqual(decls[selector], props,
      `${selector} 에 닿는 선언이 바뀌었다 — 어르신 화면에서 어떻게 할지 다시 정하라`);
  }
});

// 정정: 이 테스트의 범위 검사는 한동안 `.` 으로 시작하는 줄만 보았다(`if (!/^\s*\./…) continue`).
// 그래서 **범위가 아예 없는** 규칙(`button{…}` 꼴)은 그대로 통과했다 — 「범위 안쪽에서만 끈다」는
// 이름이 코드보다 앞서 있던 자리다. 지금은 범위 없는 선택자를 `cssBareSelectors` 로 긁어
// (클래스를 가진 선택자는 그 함수가 애초에 세지 않는다) **사유와 함께 등록된 것만** 통과시킨다.
const EUM_UNSCOPED = {
  html: '문서 캔버스(오버스크롤에서 보이는 바탕)를 칠하는 것은 문서의 뿌리다 — 범위 안쪽에서는 닿을 수 없다',
  body: '위와 같은 이유 — html 에 배경이 없으면 브라우저는 body 의 색으로 캔버스를 칠한다',
};

test('요건을 깨뜨리는 전역 선택자는 ui.jsx 가 어르신 화면 범위 안에서만 끈다', () => {
  assert.match(ui, /EUM_SCOPE = 'eum-screen'/, '범위 표시의 단일 출처가 사라졌다');
  const block = ui.slice(ui.indexOf('export function EumStyles'));
  assert.ok(block.length > 100, 'EumStyles 를 찾지 못했다');
  for (const [selector, decl] of Object.entries(CSS_NEUTRALIZED)) {
    assert.ok(block.includes(decl), `전역 규칙 ${selector} 를 끄는 선언이 없다: ${decl}`);
  }
  // 포털 화면을 건드리면 안 된다 — 끄는 규칙은 전부 .eum-screen 안쪽에만 적용돼야 한다.
  for (const line of block.split('\n')) {
    if (!line.includes('{') || !line.includes(':') || line.trim().startsWith('//')) continue;
    if (!/^\s*\./.test(line)) continue;
    assert.match(line, /\.(?:\$\{EUM_SCOPE\}|eum-screen|eum-focus)/, `범위 없는 전역 규칙: ${line.trim()}`);
  }

  // 범위가 **아예 없는** 규칙은 사유와 함께 등록된 것만 허용한다(양방향 대조).
  const css = (block.match(/<style>\{`([\s\S]*?)`\}<\/style>/) || [])[1] || '';
  assert.ok(css.length > 50, 'EumStyles 의 CSS 를 읽지 못했다');
  const bare = cssBareSelectors(css.replace(/\$\{EUM_SCOPE\}/g, 'eum-screen').replace(/\$\{[^}]*\}/g, 'x'));
  assert.deepEqual(bare.sort(), Object.keys(EUM_UNSCOPED).sort(),
    `어르신 화면 밖까지 닿을 수 있는 규칙: ${bare.join(' | ')}`);
  for (const [selector, why] of Object.entries(EUM_UNSCOPED)) {
    assert.ok(typeof why === 'string' && why.length >= 10, `사유 없는 범위 예외: ${selector}`);
  }
  // 예외는 **바탕색 한 줄**까지다 — 글자 크기·대비를 여기서 손보면 포털까지 따라간다.
  const rootRule = css.match(/\bhtml,\s*body\s*\{((?:[^{}]|\$\{[^}]*\})*)\}/);
  assert.ok(rootRule, '캔버스 색을 칠하는 규칙이 사라졌다(오버스크롤이 포털 색으로 돌아간다)');
  assert.match(rootRule[1], /background:\s*\$\{C\.bg\};/, '캔버스 색이 어르신 색 단일 출처에서 오지 않는다');
  assert.deepEqual(
    [...rootRule[1].matchAll(/([a-z-]+)\s*:/g)].map((m) => m[1]), ['background'],
    '범위 밖 규칙에 선언이 늘었다',
  );
});

test('어르신 화면 전부가 범위 표시와 EumStyles 를 함께 단다(한 화면만 빠지면 그 화면에서 깨진다)', () => {
  for (const [name, src] of Object.entries(eumSources)) {
    const code = stripComments(src);
    const mains = [...code.matchAll(/<main\b[^>]*>/g)].map((m) => m[0]);
    for (const tag of mains) {
      assert.match(tag, /className=\{EUM_SCOPE\}/, `${name}: <main> 에 범위 표시가 없다`);
    }
    if (!mains.length) continue;
    assert.match(code, /<EumStyles \/>/, `${name}: EumStyles 를 그리지 않는다`);
  }
  // Notice·SeniorFlow·오류·대기 — 화면을 그리는 파일은 빠짐없이 들어 있어야 한다.
  const drawing = Object.entries(eumSources).filter(([, src]) => /<main\b/.test(stripComments(src))).map(([n]) => n).sort();
  assert.deepEqual(drawing, [
    'app/eum/error.jsx',
    'app/eum/loading.jsx',
    'app/eum/senior/[token]/SeniorFlow.jsx',
    'app/eum/senior/[token]/ui.jsx',
  ]);
});
