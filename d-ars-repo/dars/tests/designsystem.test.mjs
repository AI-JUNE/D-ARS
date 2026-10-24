// tests/designsystem.test.mjs — AICC 라인 디자인 시스템 불변식(랜딩 ↔ 콘솔)
//
// 왜 필요한가: 콘솔(`app/globals.css`)과 공개 랜딩(`app/page.jsx`)은 **서로 다른 스타일 한 벌**로
// 자라 왔다. 랜딩은 자기 `<style>` 안에 토큰을 다시 선언했고 그 값이 콘솔과 미세하게 달랐다
// (경계선 #e6ebf3 ↔ #e2e8f0 · 바탕 #f6f8fc ↔ #f8fafc · 보조색 #94a3b8 ↔ #64748b · 그림자).
// 「홈 → 로그인 → 콘솔」로 넘어가는 동안 선과 바탕이 두 번 갈리는데, 눈으로는 알아채기 어렵고
// 다음 사람이 랜딩만 고치면 또 갈린다. 두 파일의 **같은 칸을 대조**해 그 어긋남을 기계가 센다.
//
// 랜딩은 `dangerouslySetInnerHTML` 로 원본 HTML 을 그리므로 JSX 린트·타입 검사가 닿지 않는다
// (tests/landing.test.mjs 가 같은 이유로 소스 문자열 수준의 모바일 불변식을 고정하고 있다).
// 이 파일은 그 옆에 「색·모션·링크 목적지·요금 데이터」 축을 더한다.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { PLANS, contactHref } from '../lib/plans.js';
import { stripSourceComments } from '../lib/sourceLint.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(resolve(root, p), 'utf8');
const landing = read('app/page.jsx');
const globalCss = read('app/globals.css');
const pricing = read('app/pricing/page.jsx');

/** `:root{ … }` 첫 블록에서 `--이름: 값` 사전을 뽑는다(값은 공백을 지운 비교용 문자열). */
function rootTokens(src) {
  const i = src.indexOf(':root{');
  if (i < 0) return {};
  const body = src.slice(i + 6, src.indexOf('}', i));
  const out = {};
  for (const m of body.matchAll(/--([\w-]+)\s*:\s*([^;}]+)/g)) out[m[1]] = m[2].replace(/\s+/g, '');
  return out;
}

/** 균형 괄호로 `@media <질의>{ … }` 블록 본문을 떼어낸다(없으면 빈 문자열). */
function mediaBody(src, queryRe) {
  const m = queryRe.exec(src);
  if (!m) return '';
  let i = m.index + m[0].length;
  let depth = 1;
  const start = i;
  for (; i < src.length && depth > 0; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') depth--;
  }
  return src.slice(start, i - 1);
}

// ── 색·치수 토큰 ────────────────────────────────────────────────────────────

test('랜딩 토큰은 콘솔(globals.css)과 같은 값이다 — 한 제품에 두 벌의 색을 두지 않는다', () => {
  const lp = rootTokens(landing);
  const gl = rootTokens(globalCss);
  for (const k of ['brand', 'brand-d', 'brand-l', 'brand-xl', 'ink', 'line', 'line2', 'bg']) {
    assert.ok(gl[k], `globals.css 에 --${k} 가 없다 — 대조 기준이 사라졌다`);
    assert.equal(lp[k], gl[k], `--${k}: 랜딩 ${lp[k]} ≠ 콘솔 ${gl[k]}`);
  }
  // 이름만 다른 같은 칸: 랜딩의 본문 보조색(--mut) = 콘솔의 --muted.
  assert.equal(lp.mut, gl.muted, `보조색: 랜딩 ${lp.mut} ≠ 콘솔 ${gl.muted}`);
  // 카드 라운드는 AICC 라인 규격 14~18 안이다(콘솔 .card 는 16).
  const r = Number(/(\d+)/.exec(lp.radius || '')?.[1]);
  assert.ok(r >= 14 && r <= 18, `카드 라운드 ${lp.radius} — 규격(14~18) 밖`);
});

test('랜딩 카드 그림자는 콘솔 카드 그림자와 같다(파란빛 섞인 자기 그림자 금지)', () => {
  const lp = rootTokens(landing);
  const gl = rootTokens(globalCss);
  assert.equal(lp.shadow, gl.shadow, '카드 그림자가 두 벌이다');
  // 종전 값: rgba(30,64,120,.18) — 콘솔의 중성 회색(15,23,42)과 다른 파란 섞인 그림자였다.
  assert.ok(!/rgba\(30,\s*64,\s*120/.test(visibleText(landing)), '랜딩 전용 파란 그림자가 남아 있다');
});

test('흰 바탕 본문에 AA 미달 회색(#94a3b8 · 2.56:1)을 쓰지 않는다', () => {
  assert.ok(!/#94a3b8/i.test(visibleText(landing)), '#94a3b8 은 흰 바탕에서 2.56:1 — 본문·단위 표기에 쓸 수 없다');
  // 어두운 면(네이비 푸터)의 보조색은 별도 칸이다 — 흰 바탕 보조색을 그대로 옮기면 3.9:1 로 떨어진다.
  assert.match(landing, /--on-navy:\s*#9fb2d4/i, '어두운 면 보조색 칸이 사라졌다');
});

// ── 모션 ────────────────────────────────────────────────────────────────────

test('랜딩도 모션 민감 설정을 지킨다 — 무한 파형·부드러운 스크롤을 끈다', () => {
  const body = mediaBody(landing, /@media\s*\(\s*prefers-reduced-motion\s*:\s*reduce\s*\)\s*\{/);
  assert.notEqual(body, '', '랜딩에 prefers-reduced-motion 블록이 없다(콘솔에는 있다 — 한 제품 두 약속)');
  // 히어로 음성 파형은 1.1초마다 영영 높이가 바뀐다. 애니메이션만 끄면 높이가 0이 되어
  // 그림이 사라지므로 **정지한 막대**로 남겨야 한다.
  assert.match(body, /\.wave\s+i\s*\{[^{}]*animation\s*:\s*none/, '무한 파형이 꺼지지 않는다');
  assert.match(body, /\.wave\s+i\s*\{[^{}]*height\s*:/, '파형을 끄면서 높이를 주지 않아 막대가 사라진다');
  assert.match(body, /scroll-behavior\s*:\s*auto/, '페이지 내 이동이 여전히 부드럽게 스크롤한다');
  assert.match(body, /transform\s*:\s*none/, '호버 리프트가 꺼지지 않는다');
});

test('호버 리프트는 hover:hover 안에서만 건다(터치 기기 고스트 호버 방지)', () => {
  const guard = mediaBody(landing, /@media\s*\(\s*hover\s*:\s*hover\s*\)\s*\{/);
  assert.notEqual(guard, '', 'hover:hover 가드가 없다');
  assert.match(guard, /translateY\(-/, '가드 안에 리프트가 없다 — 가드만 있고 효과는 밖에 있다는 뜻');
  const outside = landing.replace(guard, '');
  assert.doesNotMatch(outside, /:hover\s*\{[^{}]*transform\s*:\s*translateY\(-/, '가드 밖에 호버 리프트가 남아 있다');
});

test('어두운 면의 투명 버튼은 자기 호버를 선언한다(globals 의 .btn:hover 가 글자를 지운다)', () => {
  // 위험의 근거: globals.css 의 `.btn:hover{background:var(--brand-xl)}` 는 특이도에서
  // `.btn-ghost`(단일 클래스)를 이긴다 → 호버 시 바탕이 #eef4ff 로 바뀌고 흰 글자가 그 위에
  // 남아 1.1:1 이 된다. 기준이 바뀌면 이 테스트가 먼저 알려야 한다.
  assert.match(globalCss, /\.btn:hover\s*\{[^{}]*background\s*:\s*var\(--brand-xl\)/, 'globals 의 .btn:hover 규칙이 바뀌었다 — 아래 전제를 다시 보라');
  assert.match(landing, /\.btn-ghost:hover\s*\{[^{}]*color\s*:\s*#fff/, '.btn-ghost:hover 선언이 없다 — 호버에서 글자가 사라진다');
});

// ── 링크 목적지 ──────────────────────────────────────────────────────────────

test('랜딩 상단의 로그인·요금·데모는 실제 라우트로 간다', () => {
  for (const href of ['/login', '/pricing', '/visual']) {
    assert.ok(landing.includes(`href="${href}"`), `${href} 로 가는 링크가 없다`);
  }
  // 내비 메뉴 다섯 항목은 목적지 없는 <a> 였다(키보드 초점도 받지 못한다).
  const nav = /<div class="navmenu">(.*?)<\/div>/s.exec(landing)?.[1] ?? '';
  assert.notEqual(nav, '', '내비 메뉴를 찾지 못했다');
  const anchors = [...nav.matchAll(/<a\b([^>]*)>/g)];
  assert.ok(anchors.length >= 5, `내비 항목 수 이상(${anchors.length})`);
  for (const a of anchors) assert.match(a[1], /\bhref=/, `목적지 없는 내비 항목: ${a[0]}`);
});

test('페이지 내 이동(#lp-…)은 실제로 있는 섹션을 가리킨다', () => {
  const targets = [...landing.matchAll(/href="#([\w-]+)"/g)].map((m) => m[1]);
  assert.ok(targets.length >= 5, `페이지 내 링크 수 이상(${targets.length})`);
  const ids = new Set([...landing.matchAll(/\bid="([\w-]+)"/g)].map((m) => m[1]));
  for (const t of targets) assert.ok(ids.has(t), `#${t} 로 가는데 그 id 가 없다`);
  // 고정 상단 바(70px) 아래로 제목이 숨지 않게 여백을 둔다.
  assert.match(landing, /scroll-margin-top/, '고정 헤더 보정(scroll-margin-top)이 없다');
});

// ── 요금 데이터는 한 벌 ──────────────────────────────────────────────────────

test('요금제는 lib/plans.js 한 곳에서만 적는다 — 두 공개 화면이 같은 값을 그린다', () => {
  assert.match(landing, /from\s+'@\/lib\/plans'/, '랜딩이 요금 데이터를 직접 적고 있다');
  assert.match(pricing, /from\s+'@\/lib\/plans'/, '요금 페이지가 요금 데이터를 직접 적고 있다');
  assert.equal(PLANS.length, 3);
  assert.equal(PLANS.filter((p) => p.highlight).length, 1, '추천 표시는 한 플랜에만');
  for (const p of PLANS) {
    assert.ok(p.name && p.price && p.unit && p.sub, `${p.id}: 빈 칸이 있다`);
    assert.ok(p.feats.length >= 4, `${p.id}: 포함 항목이 너무 적다`);
  }
});

test('랜딩은 제품에 없는 플랜·통화 건수를 약속하지 않는다', () => {
  // 종전 랜딩: Starter·Business·Enterprise / 월 1,000건 · 월 5,000건 · 무제한 통화 · 24/7 전담 지원.
  // 제품의 요금 페이지에는 그런 플랜도, 그 건수도 없다(지어낸 수치).
  const shown = visibleText(landing);
  for (const ghost of ['Starter', 'Business', 'Enterprise', '월 1,000건', '월 5,000건', '무제한 통화', '24/7']) {
    assert.ok(!shown.includes(ghost), `랜딩에 근거 없는 표기가 남아 있다: ${ghost}`);
  }
  assert.match(landing, /\$\{PLANS\.map\(planCard\)/, '랜딩이 요금 카드를 PLANS 로 그리지 않는다');
  // 두 화면이 같은 값을 그리는지: 플랜 이름·금액이 랜딩 출력에 들어갈 길이 PLANS 하나뿐임을
  // 위에서 고정했으므로, 여기서는 데이터가 화면에 쓸 수 있는 모양인지만 본다.
  for (const p of PLANS) assert.ok(!/[<>]/.test(p.name + p.price + p.unit + p.sub), `${p.id}: 꺾쇠가 든 값은 HTML 로 그릴 수 없다`);
});

/** 사용자에게 보이는 글만 남긴 소스 — 줄·블록 주석은 단일 출처(`lib/sourceLint`)로 걷어내고,
 *  랜딩은 원본 HTML 을 문자열로 들고 있어 HTML 주석(`<!-- … -->`)도 같이 걷어낸다. */
const visibleText = (src) => stripSourceComments(src).replace(/<!--[\s\S]*?-->/g, '');

test('상담 자료로 모델을 학습시킨다는 표현을 쓰지 않는다', () => {
  // 그 일은 하지 않으며 약관·개인정보처리방침에 근거가 없다(AI 학습 표현 금지).
  assert.ok(!/학습/.test(visibleText(landing)), '「학습」 표현이 사용자에게 보이는 글에 남아 있다');
});

test('공개 화면에 사내 표기([승인 필요])를 그리지 않는다 — 사실은 사용자 말로 적는다', () => {
  assert.ok(!visibleText(pricing).includes('[승인 필요]'), '요금 페이지가 사내 표기를 그대로 보여 준다');
  assert.match(pricing, /구독 결제 연동은 준비 중/, '결제 비활성 사실은 그대로 알려야 한다');
});

// ── plans.js 자체 계약 ──────────────────────────────────────────────────────

test('contactHref: 플랜 이름이 있으면 제목에 넣고, 없으면 넣지 않는다', () => {
  const a = contactHref('x@y.test', '표준');
  assert.ok(a.startsWith('mailto:x@y.test?subject='));
  assert.equal(decodeURIComponent(a.split('subject=')[1]), 'D-ARS 표준 도입 문의');
  const b = contactHref('x@y.test', '');
  assert.equal(decodeURIComponent(b.split('subject=')[1]), 'D-ARS 도입 문의');
});
