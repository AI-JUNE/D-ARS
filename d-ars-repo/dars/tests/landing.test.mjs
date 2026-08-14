// tests/landing.test.mjs — 랜딩(app/page.jsx) 모바일 불변식(121회차)
//
// 랜딩은 원본 HTML 을 dangerouslySetInnerHTML 로 렌더하므로 JSX 린트가 닿지 않는 영역이 넓다.
// "모바일 우선·무붕괴·무오버랩" 설계 원칙이 다음 교체(디자인 재반입)에서 조용히 사라지지
// 않도록, 소스 문자열 수준에서 최소 불변식만 고정한다. 값(px)까지는 강제하지 않는다.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const page = readFileSync(resolve(root, 'app/page.jsx'), 'utf8');
const layout = readFileSync(resolve(root, 'app/layout.jsx'), 'utf8');

/** max-width 미디어쿼리 중단점(px) 목록 */
function breakpoints(src) {
  return [...src.matchAll(/@media\s*\(\s*max-width\s*:\s*(\d+)px\s*\)/g)].map((m) => Number(m[1]));
}

/** 특정 중단점 블록 본문(중첩 1단계까지 — @media{ ... } 균형 괄호) */
function mediaBlock(src, px) {
  const head = new RegExp(`@media\\s*\\(\\s*max-width\\s*:\\s*${px}px\\s*\\)\\s*\\{`);
  const m = head.exec(src);
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

test('랜딩: 소형 뷰포트 중단점을 보유한다(720px 이하 1개 + 480px 이하 1개)', () => {
  const bps = breakpoints(page);
  assert.ok(bps.some((b) => b <= 720), `720px 이하 중단점 없음: ${bps.join(',')}`);
  assert.ok(bps.some((b) => b <= 480), `480px 이하 중단점 없음: ${bps.join(',')}`);
});

test('랜딩: 다열 그리드는 소형에서 1열로 내려온다(카드 압착 방지)', () => {
  const small = mediaBlock(page, 720);
  assert.notEqual(small, '', '720px 블록을 찾지 못했다');
  for (const cls of ['cards4', 'cards3', 'price', 'proc', 'fgrid']) {
    assert.ok(
      new RegExp(`\\.${cls}[^{}]*\\{[^{}]*grid-template-columns\\s*:\\s*1fr\\s*[;}]`).test(small),
      `.${cls} 1열 규칙 없음`,
    );
  }
});

test('랜딩: 가로 넘침 유발 요소가 소형에서 정리된다(내비 링크·확대 카드)', () => {
  const small = mediaBlock(page, 720);
  assert.match(small, /\.navmenu\s*\{[^{}]*display\s*:\s*none/);
  assert.match(small, /\.pcard\.hot\s*\{[^{}]*transform\s*:\s*none/);
});

test('랜딩: 초소형에서 히어로 목업 위 떠 있는 칩이 겹치지 않는다', () => {
  const xs = mediaBlock(page, 480);
  assert.notEqual(xs, '', '480px 블록을 찾지 못했다');
  assert.match(xs, /\.chip\s*\{[^{}]*display\s*:\s*none/);
});

test('랜딩: 모든 button 은 type 을 명시한다(암시적 submit 차단)', () => {
  const bad = [...page.matchAll(/<button\b([^>]*)>/g)].filter((m) => !/\btype\s*=/.test(m[1]));
  assert.equal(bad.length, 0, `type 미명시 button ${bad.length}건`);
});

test('레이아웃: viewport 선언이 존재한다(모바일 스케일 고정 금지 확인)', () => {
  assert.match(layout, /export\s+const\s+viewport\s*=/);
  assert.doesNotMatch(layout, /maximumScale\s*:\s*1\b/, '확대 금지는 접근성 위반(WCAG 1.4.4)');
});
