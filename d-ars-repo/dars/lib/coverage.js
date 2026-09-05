// ============================================================================
// coverage.js — 테스트 커버리지 게이트(핵심 로직 기준)
//
// 목적: "테스트가 있다"가 아니라 "핵심 로직 모듈마다 그것을 부르는 테스트가 있다"를
//   기계가 확인한다. lib/ 에 새 로직 모듈을 추가하고 테스트를 잊으면 CI 가 실패한다.
//
// 왜 파일명 규칙(lib/foo.js ↔ tests/foo.test.mjs)이 아니라 **참조**로 보는가:
//   파일명만 맞추면 빈 테스트로도 통과한다. 실제로 그 모듈을 import 하는
//   테스트가 하나라도 있어야 커버로 본다(이름이 달라도 된다 — 여러 모듈을
//   한 테스트에서 함께 검증하는 기존 구성을 깨지 않는다).
//
// 한계(정직하게): 이것은 **줄 단위 커버리지가 아니다**. 모듈 도달 여부만 본다.
//   "import 했으니 검증됐다"는 뜻이 아니며, 커버리지 퍼센트로 인용하면 안 된다.
//
// 순수 함수만 둔다(파일시스템 접근 없음) — 호출자가 목록을 넘긴다.
// ============================================================================

/** 검사 대상 확장자 */
const CODE_EXT = /\.(js|jsx|mjs)$/;

/**
 * 모듈 분류.
 *   component — .jsx (React 컴포넌트: node --test 에 DOM 이 없어 유닛 대상 아님)
 *   hook      — useXxx.js (React 렌더 컨텍스트 필요)
 *   logic     — 그 외 순수/서버 로직 → **게이트 대상**
 */
export function moduleKind(file) {
  const name = String(file || '');
  if (/\.jsx$/.test(name)) return 'component';
  if (/^use[A-Z]/.test(name)) return 'hook';
  return 'logic';
}

/** lib/ 아래 코드 파일만 남긴다(디렉터리·비코드 파일 무시). */
export function libModules(names) {
  if (!Array.isArray(names)) return [];
  return names
    .filter((n) => typeof n === 'string' && CODE_EXT.test(n))
    .slice()
    .sort();
}

/**
 * 테스트 소스에서 참조하는 lib 모듈 이름을 뽑는다.
 * `../lib/foo.js`, `@/lib/foo.jsx`, 문자열 안의 'lib/foo.js'(소스린트류 검사) 모두 인정한다.
 * 확장자가 없는 표기는 인정하지 않는다 — 어떤 파일인지 확정할 수 없기 때문이다.
 */
export function referencedModules(source) {
  const out = new Set();
  if (typeof source !== 'string') return out;
  // 확장자 대안은 긴 것부터(js 를 먼저 두면 'charts.jsx' 가 'charts.js' 로 잘린다).
  // 뒤에 식별자 문자가 이어지면 다른 이름이므로 인정하지 않는다.
  const re = /lib\/([A-Za-z0-9_.-]+\.(?:jsx|mjs|js))(?![A-Za-z0-9])/g;
  let m;
  while ((m = re.exec(source)) !== null) out.add(m[1]);
  return out;
}

/**
 * 유닛 테스트 없이 두는 로직 모듈의 명시적 예외.
 *   key = 파일명, value = 사유(한 줄).
 * 비워 두는 것이 정상이다. 채우려면 사유를 남겨야 하고, 아래 두 가지가 자동 검증된다.
 *   - 유령: 파일이 사라졌는데 예외만 남음 → 실패
 *   - 낡음: 테스트가 생겼는데 예외에 남아 있음 → 실패
 */
export const COVERAGE_EXEMPT = Object.freeze({});

/**
 * 커버리지 보고서.
 * @param {{libFiles: string[], testSources: string[]}} input
 */
export function coverageReport(input) {
  const libFiles = libModules(input && input.libFiles);
  const sources = Array.isArray(input && input.testSources) ? input.testSources : [];
  const exempt = (input && input.exempt) || COVERAGE_EXEMPT;

  const referenced = new Set();
  for (const s of sources) for (const name of referencedModules(s)) referenced.add(name);

  const byKind = { logic: [], hook: [], component: [] };
  for (const f of libFiles) byKind[moduleKind(f)].push(f);

  const covered = [];
  const uncovered = [];
  for (const f of byKind.logic) {
    if (referenced.has(f)) covered.push(f);
    else if (Object.prototype.hasOwnProperty.call(exempt, f)) continue;
    else uncovered.push(f);
  }

  const exemptNames = Object.keys(exempt).slice().sort();
  const ghostExempt = exemptNames.filter((n) => !libFiles.includes(n));
  const staleExempt = exemptNames.filter((n) => referenced.has(n));

  return {
    total: libFiles.length,
    logic: byKind.logic.length,
    hooks: byKind.hook.length,
    components: byKind.component.length,
    covered,
    uncovered,
    exempt: exemptNames,
    ghostExempt,
    staleExempt,
    untestedByKind: {
      hook: byKind.hook.filter((f) => !referenced.has(f)),
      component: byKind.component.filter((f) => !referenced.has(f)),
    },
  };
}

/** 사람이 읽는 문제 목록. 비어 있으면 게이트 통과. */
export function coverageProblems(report) {
  const r = report || {};
  const problems = [];
  for (const f of r.uncovered || []) {
    problems.push(`lib/${f}: 이 모듈을 참조하는 테스트가 없습니다(tests/ 에 추가하거나 COVERAGE_EXEMPT 에 사유와 함께 등록)`);
  }
  for (const f of r.ghostExempt || []) {
    problems.push(`COVERAGE_EXEMPT['${f}']: lib/${f} 가 없습니다(예외 항목을 지우세요)`);
  }
  for (const f of r.staleExempt || []) {
    problems.push(`COVERAGE_EXEMPT['${f}']: 이제 테스트가 있습니다(예외 항목을 지우세요)`);
  }
  return problems;
}

/** 한 줄 요약(퍼센트를 성과 지표로 쓰지 않도록 분모·분자를 그대로 적는다). */
export function coverageSummary(report) {
  const r = report || {};
  const done = (r.covered || []).length;
  const ex = (r.exempt || []).length;
  return `로직 ${done}/${r.logic || 0} 참조됨(예외 ${ex}) · 훅 ${r.hooks || 0} · 컴포넌트 ${r.components || 0} (게이트 대상 아님)`;
}
