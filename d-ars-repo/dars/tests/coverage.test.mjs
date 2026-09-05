// tests/coverage.test.mjs — 커버리지 게이트 자체의 계약(128회차)
// 유닛: 순수 판정 로직. 통합: 실제 lib/·tests/ 에 대해 게이트가 통과하는지.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  moduleKind, libModules, referencedModules, coverageReport, coverageProblems,
  coverageSummary, COVERAGE_EXEMPT,
} from '../lib/coverage.js';
import { pickTestFiles } from '../scripts/testFiles.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// ---- 분류 ----

test('.jsx 는 컴포넌트, useXxx 는 훅, 나머지는 로직으로 나눈다', () => {
  assert.equal(moduleKind('Toast.jsx'), 'component');
  assert.equal(moduleKind('useList.js'), 'hook');
  assert.equal(moduleKind('apiError.js'), 'logic');
});

test('user.js 처럼 use 로 시작하지만 훅이 아닌 이름은 로직으로 본다(대문자 규칙)', () => {
  assert.equal(moduleKind('user.js'), 'logic');
  assert.equal(moduleKind('used.js'), 'logic');
  assert.equal(moduleKind('useUrlState.js'), 'hook');
});

test('훅이면서 .jsx 인 파일은 컴포넌트로 본다(렌더 환경 필요 — 판정이 겹쳐도 게이트 밖은 동일)', () => {
  assert.equal(moduleKind('useThing.jsx'), 'component');
});

test('이상 입력에도 throw 하지 않는다', () => {
  assert.equal(moduleKind(null), 'logic');
  assert.deepEqual(libModules(null), []);
  assert.deepEqual(libModules(['a.js', 42, null, 'sub', 'b.md']), ['a.js']);
});

test('코드 파일만 사전순으로 남긴다(README·디렉터리 제외)', () => {
  assert.deepEqual(libModules(['z.js', 'a.jsx', 'README.md', 'b.mjs']), ['a.jsx', 'b.mjs', 'z.js']);
});

// ---- 참조 추출 ----

test('상대경로·별칭·문자열 안의 lib 참조를 모두 인정한다', () => {
  const src = "import x from '../lib/apiError.js';\nimport y from '@/lib/ui.js';\nconst p = 'lib/charts.jsx';";
  const got = referencedModules(src);
  assert.ok(got.has('apiError.js') && got.has('ui.js') && got.has('charts.jsx'));
});

test('.jsx 참조가 .js 로 잘리지 않는다(정규식 대안 순서 회귀)', () => {
  const got = referencedModules("'../lib/charts.jsx' '../lib/x.mjs'");
  assert.ok(got.has('charts.jsx'), '.jsx 가 .js 로 잘렸다');
  assert.ok(!got.has('charts.js'));
  assert.ok(got.has('x.mjs'));
});

test('확장자 없는 표기는 참조로 인정하지 않는다(어느 파일인지 확정 불가)', () => {
  assert.equal(referencedModules("from '../lib/apiError'").size, 0);
});

test('접두어가 같은 다른 이름을 같은 모듈로 착각하지 않는다', () => {
  const got = referencedModules("'../lib/auth.js' '../lib/authView.js'");
  assert.ok(got.has('auth.js') && got.has('authView.js'));
  assert.equal(got.size, 2);
});

test('문자열이 아닌 입력에는 빈 집합을 준다', () => {
  assert.equal(referencedModules(undefined).size, 0);
});

// ---- 보고서 ----

test('참조되는 로직 모듈은 커버, 안 되는 것은 누락으로 보고한다', () => {
  const r = coverageReport({ libFiles: ['a.js', 'b.js'], testSources: ["'../lib/a.js'"] });
  assert.deepEqual(r.covered, ['a.js']);
  assert.deepEqual(r.uncovered, ['b.js']);
  assert.equal(coverageProblems(r).length, 1);
});

test('훅·컴포넌트는 게이트에 걸지 않되 수를 감춘 채 통과시키지 않는다', () => {
  const r = coverageReport({ libFiles: ['useList.js', 'Toast.jsx', 'a.js'], testSources: ["'../lib/a.js'"] });
  assert.deepEqual(r.uncovered, []);
  assert.deepEqual(r.untestedByKind.hook, ['useList.js']);
  assert.deepEqual(r.untestedByKind.component, ['Toast.jsx']);
  assert.equal(coverageProblems(r).length, 0);
});

test('예외 등록 모듈은 누락에서 빠지지만 목록에는 남는다', () => {
  const r = coverageReport({ libFiles: ['a.js'], testSources: [], exempt: { 'a.js': '사유' } });
  assert.deepEqual(r.uncovered, []);
  assert.deepEqual(r.exempt, ['a.js']);
  assert.equal(coverageProblems(r).length, 0);
});

test('유령 예외 — 파일이 사라졌는데 예외만 남으면 실패한다', () => {
  const r = coverageReport({ libFiles: ['a.js'], testSources: ["'../lib/a.js'"], exempt: { 'gone.js': '사유' } });
  assert.deepEqual(r.ghostExempt, ['gone.js']);
  assert.ok(coverageProblems(r).some((p) => p.includes('gone.js')));
});

test('낡은 예외 — 테스트가 생겼는데 예외에 남아 있으면 실패한다', () => {
  const r = coverageReport({ libFiles: ['a.js'], testSources: ["'../lib/a.js'"], exempt: { 'a.js': '사유' } });
  assert.deepEqual(r.staleExempt, ['a.js']);
  assert.ok(coverageProblems(r).some((p) => p.includes('a.js')));
});

test('빈 테스트 목록이면 로직 모듈 전부가 누락으로 보고된다(조용한 통과 금지)', () => {
  const r = coverageReport({ libFiles: ['a.js', 'b.js'], testSources: [] });
  assert.deepEqual(r.uncovered, ['a.js', 'b.js']);
});

test('이상 입력에도 throw 하지 않고 0 으로 보고한다', () => {
  const r = coverageReport(null);
  assert.equal(r.total, 0);
  assert.deepEqual(coverageProblems(null), []);
  assert.equal(typeof coverageSummary(null), 'string');
});

test('요약은 퍼센트가 아니라 분자·분모를 적는다(성과 수치 오인 방지)', () => {
  const s = coverageSummary(coverageReport({ libFiles: ['a.js', 'b.js'], testSources: ["'../lib/a.js'"] }));
  assert.ok(s.includes('1/2'));
  assert.ok(!s.includes('%'));
});

// ---- 실제 저장소 ----

test('저장소의 모든 로직 모듈에는 그것을 참조하는 테스트가 있다', () => {
  const libFiles = fs.readdirSync(path.join(ROOT, 'lib'));
  const testSources = pickTestFiles(fs.readdirSync(path.join(ROOT, 'tests')))
    .map((n) => fs.readFileSync(path.join(ROOT, 'tests', n), 'utf8'));
  const r = coverageReport({ libFiles, testSources });
  assert.deepEqual(coverageProblems(r), [], `커버리지 문제:\n${coverageProblems(r).join('\n')}`);
  assert.ok(r.logic > 0);
});

test('예외 목록의 모든 항목에는 사유 문자열이 붙어 있다', () => {
  for (const [k, v] of Object.entries(COVERAGE_EXEMPT)) {
    assert.equal(typeof v, 'string', `${k} 예외에 사유가 없다`);
    assert.ok(v.trim().length > 0, `${k} 예외 사유가 비어 있다`);
  }
});

test('package.json 에 coverage:check 스크립트가 배선돼 있다(CI 가 부르는 이름)', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  assert.equal(pkg.scripts['coverage:check'], 'node scripts/coverage-check.mjs');
});
