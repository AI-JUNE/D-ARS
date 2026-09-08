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
  assert.match(flow, /<a href="\?step=1"/);
  assert.match(flow, /<a href="\?step=2"/);
  const buttonsInJsx = [...flow.matchAll(/<button\b/g)].length;
  assert.ok(buttonsInJsx <= 3, `버튼 정의가 너무 많다: ${buttonsInJsx}`);
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

test('이음 API 실연결 전이므로 제출은 콘솔 로그 + 로컬 저장까지만 한다', () => {
  assert.ok(!/\bfetch\s*\(/.test(flow), '실연결 승인 전에는 외부 전송 금지');
  assert.match(flow, /localStorage\.setItem/);
  assert.match(flow, /\[승인 필요\]/, '실연결 전 상태임을 소스에 남긴다');
});
