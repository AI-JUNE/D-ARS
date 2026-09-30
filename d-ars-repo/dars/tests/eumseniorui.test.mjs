// tests/eumseniorui.test.mjs — 「이음 어르신 신청」 화면 소스 불변식(가이드 §6-2 · QUALITY_BAR §4)
//
// JSX 는 node:test 가 import 할 수 없으므로(빌드 필요) 문자열 수준에서 **요건이 사라지지 않았는지**만
// 고정한다. 값(px)까지 강제하지는 않되, 심사에서 바로 떨어지는 항목 — 키보드 포커스 표시,
// 스크린리더 라벨, 375px 가로 스크롤, 금지 표시(로고·도입사례·요금표) — 은 회귀로 잡는다.
// 라우트 파일의 export 규약(route.js 규칙과 같은 취지)도 함께 본다.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dir = resolve(root, 'app/eum/senior/[token]');
const read = (f) => readFileSync(resolve(dir, f), 'utf8');

const page = read('page.jsx');
const flow = read('SeniorFlow.jsx');
const ui = read('ui.jsx');

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

const code = [page, flow, ui].map(stripComments).join('\n');

test('라우트에 페이지·흐름·표현 3개 파일만 있고 route.js 는 두지 않는다', () => {
  const files = readdirSync(dir).sort();
  assert.deepEqual(files, ['SeniorFlow.jsx', 'page.jsx', 'ui.jsx']);
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
  assert.match(flow, /role="alert"/, '오류는 즉시 낭독돼야 한다');
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
  assert.match(flow, /draftRef\.current\.done\)\s*\{\s*setStep\(4\)/, '완료 뒤 뒤로가기는 주소를 따르지 않는다');
});

test('빈 상태·만료 상태 안내가 화면과 같은 문구를 쓴다', () => {
  assert.match(page, /tokenMessage\(result\.reason\)/, '사유별 안내를 문구 단일 출처에서 가져와야 한다');
  assert.match(flow, /링크가 만료되었습니다\. 담당자에게 다시 요청해 주세요/);
  assert.match(ui, /function Notice/, '만료·오류 패널이 양쪽에서 공유돼야 한다');
});

test('색·글자 크기는 lib/eumTheme.js 에서 가져온다(하드코딩 금지)', () => {
  assert.match(ui, /from '@\/lib\/eumTheme'/);
  const hex = [...ui.matchAll(/#[0-9a-fA-F]{3,6}\b/g)].map((m) => m[0]);
  assert.deepEqual(hex, [], `ui.jsx 에 색 하드코딩: ${hex.join(',')}`);
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
  assert.match(shown, /담당자/, '어르신에게 「관리자」는 누구인지 알 수 없는 사람이다');
  assert.ok(!/관리자/.test(shown), '포털 문구(관리자에게 문의)가 남아 있다');
  // 기술 문구를 화면에 내지 않는다(콘솔에만 남긴다).
  for (const jargon of ['stack', 'digest', 'Error:', '오류 코드']) {
    assert.ok(!shown.includes(jargon), `기술 문구 노출: ${jargon}`);
  }
  assert.match(src, /monitorLine\(buildEvent\(/, '원인 추적 한 줄은 남겨야 한다');
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
  const src = boundary['app/eum/senior/page.jsx'];
  assert.match(src, /tokenMessage\('missing'\)/, '안내 문구 단일 출처를 써야 한다');
  assert.ok(!/verifyEumToken|consumeStore|claim\(/.test(src), '판정은 [token]/page.jsx 한 곳뿐이다');
  assert.match(src, /absolute: '이음 어르신 신청'/, '제품 브랜드 템플릿을 쓰지 않는다');
  assert.equal(/<button\b/.test(src), false, '어르신이 스스로 재발급할 수단이 없으므로 단추를 두지 않는다');
});
