// tests/importcase.test.mjs — import 경로 대소문자 ↔ 디스크 파일명 대조(회귀 방지)
//
// 왜 필요한가: lib/ 에 `Toast.jsx`(컴포넌트)·`toast.js`(순수 로직)처럼 **대소문자만 다른** 짝이 있다.
//   확장자 없는 `@/lib/Toast` 는 webpack 이 `.js` → `.jsx` 순으로 찾으므로
//   - Linux/Vercel(대소문자 구분): `Toast.js` 없음 → `Toast.jsx` ✓
//   - Windows(대소문자 무시):      `Toast.js` 가 `toast.js` 에 **맞아 버림** → `useToast` undefined → /scenarios 프리렌더 실패
//   OS 에 따라 다른 파일이 열리는 import 는 전부 잡아낸다. 해법은 확장자 명시(`@/lib/Toast.jsx`)다.
//
// 판정(순수 함수 `caseProblems`):
//   1) 확장자 있는 import → 디스크에 **정확히 같은** 이름이 있어야 한다(대소문자 포함).
//   2) 확장자 없는 import → 같은 디렉터리에 stem 이 대소문자 무시로는 같지만 정확히는 다른 항목이 하나라도 있으면 위험.
//   디렉터리 항목은 fs.readdirSync 로 얻는다(Windows 에서도 디스크의 **진짜 대소문자**를 돌려준다).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SKIP = new Set(['node_modules', '.next', '.git', 'public', '_지울것']);
const SRC_EXT = /\.(js|jsx|mjs|ts|tsx)$/;
const RESOLVE_EXT = ['.js', '.mjs', '.jsx', '.ts', '.tsx', '.json'];
// 정적 import/export-from · 동적 import() 의 specifier 중 프로젝트 내부 경로(@/ · ./ · ../)만.
const SPEC_RE = /(?:\bfrom\s*|\bimport\s*\(?\s*)['"]((?:@\/|\.\.?\/)[^'"]+)['"]/g;

// ---- 순수 판정 ----

// specifier → ROOT 기준 상대 경로('/' 구분자). '@/lib/x' → 'lib/x', '../lib/x'(tests/ 기준) → 'lib/x'
// 쿼리(`?bundle=2` 같은 캐시 무효화)는 파일명이 아니므로 떼어 낸다.
export function resolveSpec(fromFile, spec) {
  const clean = spec.replace(/[?#].*$/, '');
  if (clean.startsWith('@/')) return clean.slice(2).replace(/\\/g, '/');
  const dir = path.posix.dirname(fromFile.replace(/\\/g, '/'));
  return path.posix.normalize(path.posix.join(dir, clean));
}

// 한 specifier 를 디렉터리 항목 목록과 대조한다. 문제 없으면 null, 있으면 사유 문자열.
//   entries: 해당 디렉터리의 실제 항목명 배열(진짜 대소문자). null 이면 디렉터리 자체가 없는 것.
export function checkSpec(base, entries) {
  if (!Array.isArray(entries)) return '디렉터리 없음';
  const hasExt = RESOLVE_EXT.some((e) => base.endsWith(e));
  if (hasExt) {
    if (entries.includes(base)) return null;
    const near = entries.find((n) => n.toLowerCase() === base.toLowerCase());
    return near ? `대소문자 불일치: 디스크는 ${near}` : '파일 없음';
  }
  const lower = base.toLowerCase();
  const stem = (n) => n.replace(SRC_EXT, '').replace(/\.json$/, '');
  const exact = entries.filter((n) => stem(n) === base || n === base);
  const loose = entries.filter((n) => stem(n).toLowerCase() === lower && !exact.includes(n));
  if (loose.length) {
    return `확장자 없는 import 가 OS 에 따라 다른 파일을 연다(디스크: ${[...exact, ...loose].join(', ')}) → 확장자를 명시하세요`;
  }
  return exact.length ? null : '파일 없음';
}

// 여러 소스 → 문제 목록. readdir 은 주입 가능(단위 테스트는 가짜 FS 로).
//   sources: [{ file: 'app/x/page.jsx', text: '...' }]
//   readdir: (relDir) => string[] | null
export function caseProblems(sources, readdir) {
  const out = [];
  for (const { file, text } of sources) {
    for (const m of text.matchAll(SPEC_RE)) {
      const rel = resolveSpec(file, m[1]);
      const dir = path.posix.dirname(rel);
      const base = path.posix.basename(rel);
      const why = checkSpec(base, readdir(dir));
      if (why) out.push(`${file}: '${m[1]}' — ${why}`);
    }
  }
  return out;
}

// ---- 단위: 가짜 디렉터리로 판정 규칙 고정 ----

const fakeFs = (map) => (dir) => (Object.hasOwn(map, dir) ? map[dir] : null);

test('Toast 사례: 확장자 없는 @/lib/Toast 는 toast.js 와 충돌하므로 문제로 잡는다', () => {
  const probs = caseProblems(
    [{ file: 'app/(portal)/scenarios/page.jsx', text: "import Toast, { useToast } from '@/lib/Toast';" }],
    fakeFs({ lib: ['Toast.jsx', 'toast.js'] }),
  );
  assert.equal(probs.length, 1);
  assert.match(probs[0], /Toast\.jsx, toast\.js/);
});

test('확장자를 명시하면 같은 디렉터리라도 통과한다', () => {
  const probs = caseProblems(
    [{ file: 'app/x/page.jsx', text: "import Toast from '@/lib/Toast.jsx';\nimport { makeToast } from '@/lib/toast.js';" }],
    fakeFs({ lib: ['Toast.jsx', 'toast.js'] }),
  );
  assert.deepEqual(probs, []);
});

test('확장자 있는 import 의 대소문자 오타는 디스크 이름을 알려 준다', () => {
  const probs = caseProblems(
    [{ file: 'tests/a.test.mjs', text: "import x from '../lib/ApiError.js';" }],
    fakeFs({ lib: ['apiError.js'] }),
  );
  assert.equal(probs.length, 1);
  assert.match(probs[0], /디스크는 apiError\.js/);
});

test('충돌 짝이 없는 확장자 없는 import 는 통과(기존 관례 유지)', () => {
  const probs = caseProblems(
    [{ file: 'app/x/page.jsx', text: "import { fmtNum } from '@/lib/kpi';\nimport ErrorBanner from '@/lib/ErrorBanner';" }],
    fakeFs({ lib: ['kpi.js', 'ErrorBanner.jsx', 'kpiExtra.js'] }),
  );
  assert.deepEqual(probs, []);
});

test('상대경로·동적 import() 도 같은 규칙으로 본다', () => {
  const probs = caseProblems(
    [{ file: 'lib/auth.js', text: "const { audit } = await import('./Audit.js');\nimport y from '../lib/db.js';" }],
    fakeFs({ lib: ['audit.js', 'db.js'] }),
  );
  assert.equal(probs.length, 1);
  assert.match(probs[0], /'\.\/Audit\.js'/);
});

test('없는 파일·없는 디렉터리는 각각 사유를 남긴다', () => {
  const probs = caseProblems(
    [{ file: 'app/x/page.jsx', text: "import a from '@/lib/nope';\nimport b from '@/nowhere/x.js';" }],
    fakeFs({ lib: ['kpi.js'] }),
  );
  assert.equal(probs.length, 2);
  assert.match(probs[0], /파일 없음/);
  assert.match(probs[1], /디렉터리 없음/);
});

test('디렉터리 import(index 파일) 는 디렉터리명이 정확히 맞으면 통과', () => {
  const probs = caseProblems(
    [{ file: 'app/x/page.jsx', text: "import s from './senior';" }],
    fakeFs({ 'app/x': ['page.jsx', 'senior'] }),
  );
  assert.deepEqual(probs, []);
});

// ---- 통합: 실제 저장소의 app/·lib/·scripts/·tests/ 를 전부 대조 ----

const SELF = path.relative(ROOT, fileURLToPath(import.meta.url)).replace(/\\/g, '/'); // 위 단위 테스트의 가짜 경로 문자열은 대조 대상이 아니다

function collect(dir, out = []) {
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    if (SKIP.has(e.name)) continue;
    const p = path.join(dir, e.name);
    const rel = path.relative(ROOT, p).replace(/\\/g, '/');
    if (e.isDirectory()) collect(p, out);
    else if (SRC_EXT.test(e.name) && rel !== SELF) out.push({ file: rel, text: fs.readFileSync(p, 'utf8') });
  }
  return out;
}

const realReaddir = (() => {
  const cache = new Map();
  return (relDir) => {
    if (!cache.has(relDir)) {
      try { cache.set(relDir, fs.readdirSync(path.join(ROOT, relDir))); } catch { cache.set(relDir, null); }
    }
    return cache.get(relDir);
  };
})();

test('저장소 전체: 프로젝트 내부 import 경로가 디스크 파일명과 대소문자까지 일치한다', () => {
  const sources = ['app', 'lib', 'scripts', 'tests'].flatMap((d) => collect(path.join(ROOT, d)));
  assert.ok(sources.length > 50, '소스 수집이 비정상적으로 적다');
  const probs = caseProblems(sources, realReaddir);
  assert.deepEqual(probs, [], '\n' + probs.join('\n'));
});

test('저장소 전체: lib/ 에 대소문자만 다른 짝이 있으면 양쪽 모두 확장자 없는 import 로 불리지 않는다', () => {
  // 짝 자체는 허용(컴포넌트/로직 분리 관례)하되, 그 짝을 부르는 쪽은 반드시 확장자를 적어야 한다.
  const names = realReaddir('lib') || [];
  const byStem = new Map();
  for (const n of names) {
    const k = n.replace(SRC_EXT, '').toLowerCase();
    byStem.set(k, [...(byStem.get(k) || []), n]);
  }
  const pairs = [...byStem.values()].filter((v) => v.length > 1);
  assert.ok(pairs.some((p) => p.includes('Toast.jsx')), 'Toast.jsx/toast.js 짝이 사라졌다면 이 테스트의 전제를 다시 보세요');
  const sources = ['app', 'lib'].flatMap((d) => collect(path.join(ROOT, d)));
  const bad = [];
  for (const { file, text } of sources) {
    for (const m of text.matchAll(SPEC_RE)) {
      const base = path.posix.basename(resolveSpec(file, m[1]));
      if (RESOLVE_EXT.some((e) => base.endsWith(e))) continue;
      if (pairs.some((p) => p.some((n) => n.replace(SRC_EXT, '').toLowerCase() === base.toLowerCase()))) {
        bad.push(`${file}: '${m[1]}'`);
      }
    }
  }
  assert.deepEqual(bad, [], '\n' + bad.join('\n'));
});
