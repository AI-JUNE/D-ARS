// scripts/coverage-check.mjs — 핵심 로직 커버리지 게이트(읽기 전용 · 128회차)
//
// 하는 일: lib/ 의 **로직 모듈**마다 그 모듈을 참조하는 테스트가 있는지 확인한다.
//   줄 단위 커버리지가 아니라 **모듈 도달 여부**다(lib/coverage.js 주석 참조).
// 실행: npm run coverage:check · CI(.github/workflows/ci.yml)에서 npm test 뒤에 돈다.
// 종료코드: 누락·유령 예외가 있으면 1, 없으면 0. 아무 파일도 바꾸지 않는다.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { coverageReport, coverageProblems, coverageSummary } from '../lib/coverage.js';
import { pickTestFiles } from './testFiles.mjs';

// fileURLToPath: 경로에 공백·한글이 있으면 URL.pathname 은 %20 인코딩이라 fs 가 못 연다.
const root = fileURLToPath(new URL('..', import.meta.url));
const libDir = path.join(root, 'lib');
const testDir = path.join(root, 'tests');

const libFiles = fs.readdirSync(libDir);
const testSources = pickTestFiles(fs.readdirSync(testDir))
  .map((n) => fs.readFileSync(path.join(testDir, n), 'utf8'));

const report = coverageReport({ libFiles, testSources });
console.log(coverageSummary(report));

const untestedHooks = report.untestedByKind.hook.length;
const untestedComponents = report.untestedByKind.component.length;
if (untestedHooks || untestedComponents) {
  console.log(`  참고(게이트 아님): 훅 ${untestedHooks}개 · 컴포넌트 ${untestedComponents}개는 렌더 환경이 필요해 유닛 대상이 아니다.`);
}

const problems = coverageProblems(report);
if (problems.length === 0) {
  console.log('  게이트 통과');
  process.exit(0);
}
for (const p of problems) console.error('  [문제]', p);
process.exit(1);
