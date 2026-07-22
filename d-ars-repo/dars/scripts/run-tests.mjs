// scripts/run-tests.mjs — `npm test` 진입점(26회차)
//
// tests/ 를 직접 읽어 테스트 파일 목록을 만든 뒤 `node --test <파일들>` 을 실행한다.
// 셸 글롭(Windows cmd 에는 없다)·Node 내장 글롭(v22+ 에서만)에 의존하지 않는다
// → Windows/macOS/Linux · Node 18/20/22 어디서나 같은 결과. (deploy.bat 의 테스트 게이트가 여기에 걸려 있다)
//
// 테스트 파일이 하나도 없으면 **조용히 성공하지 않는다** — 게이트가 무력화된 채 배포되는 것이
// 테스트가 깨진 것보다 위험하다.

import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { testPaths } from './testFiles.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dir = resolve(root, 'tests');

let names = [];
try {
  names = readdirSync(dir);
} catch (e) {
  console.error(`[test] tests 디렉터리를 읽을 수 없습니다: ${dir}\n${e.message}`);
  process.exit(1);
}

const files = testPaths('tests', names);
if (files.length === 0) {
  console.error('[test] 테스트 파일이 없습니다(tests/*.test.js|mjs). 게이트를 통과시키지 않습니다.');
  process.exit(1);
}

console.log(`[test] ${files.length}개 파일 실행 (node ${process.version})`);
const r = spawnSync(process.execPath, ['--test', ...files], { cwd: root, stdio: 'inherit' });
process.exit(r.status == null ? 1 : r.status);
