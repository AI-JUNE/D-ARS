// scripts/testFiles.mjs — 테스트 파일 선별(순수 함수, 26회차)
//
// 왜 필요한가: package.json 의 테스트 스크립트가 `node --test tests/*.test.js tests/*.test.mjs` 였다.
//   - Linux/macOS(sh): **셸이** 글롭을 펼쳐 준다 → 동작한다(CI 는 ubuntu 라 여태 문제가 없었다).
//   - Windows(cmd.exe): 셸이 글롭을 **펼치지 않는다**. Node 자체 글롭 해석은 v22+ 에서만 되고,
//     v20 이하(=CI 가 쓰는 버전)에서는 `tests/*.test.js` 를 **파일명 그대로** 열려다 실패한다.
//   → 즉 사람이 Windows 에서 `deploy.bat` 을 돌리면 [2/5] npm test 단계가 **코드와 무관하게** 터지고
//     스크립트는 "tests failed - aborting" 으로 배포를 중단한다. 배포를 막는 진짜 지뢰였다.
//   → 셸·Node 버전에 의존하지 않도록 **디렉터리를 직접 읽어** 파일 목록을 만든다(이 모듈).
//
// 순수 함수라 파일시스템 없이 단위 테스트할 수 있다.

export const TEST_RE = /\.test\.(m?js)$/;

// 파일명 배열 → 테스트 파일만, **사전순 안정 정렬**(실행 순서 재현성).
// 디렉터리·README·헬퍼(.mjs 지만 .test 가 아닌 것)는 제외한다.
export function pickTestFiles(names) {
  if (!Array.isArray(names)) return [];
  return names
    .filter((n) => typeof n === 'string' && TEST_RE.test(n))
    .slice()
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

// 'tests' + ['a.test.mjs'] → ['tests/a.test.mjs'] (구분자는 항상 '/' — Node 는 Windows 에서도 받는다)
export function testPaths(dir, names) {
  const base = String(dir || '').replace(/[\\/]+$/, '');
  return pickTestFiles(names).map((n) => (base ? `${base}/${n}` : n));
}

export default pickTestFiles;
