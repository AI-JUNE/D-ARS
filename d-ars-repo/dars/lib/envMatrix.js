// lib/envMatrix.js — 환경(데모·스테이징·운영) 분리 판정(순수 로직 · 값을 절대 출력하지 않는다)
//
// 배경(COMMERCIAL_READINESS "스테이징·운영 환경 분리"):
//   `docs/STAGING_OPERATIONS.md` 에 환경변수 매트릭스를 적어 뒀지만, 문서는 코드를 따라오지
//   못한다. 실제로 문서 작성(2026-08-07) 이후 코드에 추가된 설정 변수 여러 개가 매트릭스에
//   한 줄도 없었다 — 문서만 보고 운영 환경을 구성하면 그 변수들은 **기본값(대개 데모/OFF)** 으로
//   조용히 배포된다. 그래서 (1) 변수 목록을 코드에 단일 출처로 두고, (2) 소스에서 실제로 읽는
//   변수와 대조하고, (3) 문서 표와 양방향 대조한다.
//
// 안전 원칙: 이 모듈은 **환경변수 값을 읽어 판정만 하고, 값을 반환·출력하지 않는다.**
//   (set/unset/mismatch 상태와 변수 이름만 다룬다.) 게이트 변수(실인증·실발신·실과금)를
//   자동으로 켜지 않는다 — 켜는 것은 사람의 승인 사항이다.

export const PROFILES = ['demo', 'staging', 'production'];

// 기대값 표기(문자열):
//   '미설정' — 설정되어 있으면 안 된다(기본 동작을 쓴다)
//   '필수'   — 값이 있어야 한다(어떤 값인지는 따지지 않는다 · 비밀값)
//   '자유'   — 검사하지 않는다(플랫폼이 주거나 값이 환경마다 다름)
//   그 외    — 정확히 그 값이어야 한다(예: '1', '0')
export const EXPECT_UNSET = '미설정';
export const EXPECT_SET = '필수';
export const EXPECT_ANY = '자유';

// scope:
//   runtime  — 배포된 앱이 읽는다(환경 분리의 대상)
//   platform — Vercel 등 플랫폼이 주입한다(사람이 설정하지 않는다)
//   tooling  — 로컬/CI 스크립트만 읽는다(배포 환경과 무관)
// gate: 켜면 실인증·실발신·실과금·실개인정보가 동작하는 변수 → 자동화가 켜지 않는다. [승인 필요]
// secret: 값 자체가 비밀 → 로그·에러·CLI 출력에 절대 싣지 않는다.
export const ENV_VARS = [
  { name: 'DATABASE_URL', scope: 'runtime', secret: true, gate: false,
    fallbackKo: '무DB 데모 폴백',
    profiles: { demo: EXPECT_UNSET, staging: EXPECT_SET, production: EXPECT_SET },
    note: '환경별 별도 인스턴스. 스테이징과 운영이 같은 값을 쓰면 안 된다' },
  { name: 'AUTH_ENFORCE', scope: 'runtime', secret: false, gate: true,
    fallbackKo: 'OFF(데모 통과)',
    profiles: { demo: EXPECT_UNSET, staging: '1', production: '1' },
    note: '실제 접근 차단 게이트' },
  { name: 'AUTH_USERS', scope: 'runtime', secret: true, gate: true,
    fallbackKo: '저장소에 공개된 데모 계정 3종',
    profiles: { demo: EXPECT_UNSET, staging: EXPECT_SET, production: EXPECT_SET },
    note: '미설정 상태로 AUTH_ENFORCE 를 켜면 데모 계정이 운영 계정이 된다' },
  { name: 'AUTH_SECRET', scope: 'runtime', secret: true, gate: false,
    fallbackKo: '코드에 박힌 데모 고정값(토큰 위조 가능)',
    profiles: { demo: EXPECT_UNSET, staging: EXPECT_SET, production: EXPECT_SET },
    note: '세션 서명 키. 환경마다 다른 랜덤값' },
  { name: 'RBAC_SESSION_SECRET', scope: 'runtime', secret: true, gate: false,
    fallbackKo: 'RBAC 미들웨어 무동작(하위호환)',
    profiles: { demo: EXPECT_UNSET, staging: EXPECT_SET, production: EXPECT_SET },
    note: 'AUTH_SECRET 과 같은 값을 재사용하지 않는다' },
  { name: 'EUM_TOKEN_SECRET', scope: 'runtime', secret: true, gate: false,
    fallbackKo: 'AUTH_SECRET → 없으면 데모 기본값',
    profiles: { demo: EXPECT_UNSET, staging: EXPECT_SET, production: EXPECT_SET },
    note: '이음 어르신 신청 1회용 링크 서명(lib/eumToken.js). 실링크 발급 전 전용 값 필수' },
  { name: 'AUDIT_DB', scope: 'runtime', secret: false, gate: true,
    fallbackKo: 'OFF(콘솔 구조화 로그만)',
    profiles: { demo: EXPECT_UNSET, staging: '1', production: '1' },
    note: 'db/audit.sql 선적용 필요' },
  { name: 'INGEST_KEY', scope: 'runtime', secret: true, gate: true,
    fallbackKo: '수집 API 무검사 통과',
    profiles: { demo: EXPECT_UNSET, staging: EXPECT_SET, production: EXPECT_SET },
    note: 'AUTH_ENFORCE=1 + 키 설정 시에만 검사' },
  { name: 'DEMO_MODE', scope: 'runtime', secret: false, gate: false,
    fallbackKo: '시뮬레이터 허용',
    profiles: { demo: EXPECT_UNSET, staging: '0', production: '0' },
    note: '/api/dev/simulate 가드' },
  { name: 'RATE_LIMIT_DISABLED', scope: 'runtime', secret: false, gate: false,
    fallbackKo: 'rate limit 적용(기본)',
    profiles: { demo: EXPECT_UNSET, staging: EXPECT_UNSET, production: EXPECT_UNSET },
    note: '비상구. 운영에서 켜 두면 공개 API 한도가 사라진다' },
  { name: 'RETENTION_DAYS', scope: 'runtime', secret: false, gate: false,
    fallbackKo: '180일(하한 30일)',
    profiles: { demo: EXPECT_UNSET, staging: EXPECT_ANY, production: EXPECT_ANY },
    note: '개인정보 보관기간(docs/PRIVACY_RETENTION.md)' },
  { name: 'RETENTION_ENABLE', scope: 'runtime', secret: false, gate: true,
    fallbackKo: 'OFF(파기 미수행)',
    profiles: { demo: EXPECT_UNSET, staging: EXPECT_UNSET, production: EXPECT_UNSET },
    note: '비가역 파기 스위치. 운영자가 실행 시점에만 켠다' },
  { name: 'MONITOR_DSN', scope: 'runtime', secret: true, gate: true,
    fallbackKo: 'no-op(콘솔 한 줄만)',
    profiles: { demo: EXPECT_UNSET, staging: EXPECT_ANY, production: EXPECT_ANY },
    note: '에러 리포트 외부 전송. 실 DSN 주입은' },
  { name: 'CPAAS_PROVIDER', scope: 'runtime', secret: false, gate: true,
    fallbackKo: '미연동',
    profiles: { demo: EXPECT_UNSET, staging: EXPECT_ANY, production: EXPECT_ANY },
    note: 'docs/CPAAS_SETUP.md · 실발신·과금' },
  { name: 'CPAAS_API_KEY', scope: 'runtime', secret: true, gate: true,
    fallbackKo: '미연동',
    profiles: { demo: EXPECT_UNSET, staging: EXPECT_ANY, production: EXPECT_ANY },
    note: '실발신·과금' },
  { name: 'CPAAS_SECRET', scope: 'runtime', secret: true, gate: true,
    fallbackKo: '미연동',
    profiles: { demo: EXPECT_UNSET, staging: EXPECT_ANY, production: EXPECT_ANY },
    note: '실발신·과금' },
  { name: 'CPAAS_WEBHOOK_SECRET', scope: 'runtime', secret: true, gate: true,
    fallbackKo: '웹훅 서명 미검증',
    profiles: { demo: EXPECT_UNSET, staging: EXPECT_ANY, production: EXPECT_ANY },
    note: 'CPaaS 콜백 서명 검증 키' },
  { name: 'SMS_GATEWAY_URL', scope: 'runtime', secret: false, gate: true,
    fallbackKo: '미발신',
    profiles: { demo: EXPECT_UNSET, staging: EXPECT_ANY, production: EXPECT_ANY },
    note: '실발신' },
  { name: 'CALLBOT_CALLBACK_URL', scope: 'runtime', secret: false, gate: true,
    fallbackKo: '미발신',
    profiles: { demo: EXPECT_UNSET, staging: EXPECT_ANY, production: EXPECT_ANY },
    note: '콜봇 콜백 엔드포인트' },
  { name: 'PUBLIC_BASE_URL', scope: 'runtime', secret: false, gate: false,
    fallbackKo: 'd-ars.vercel.app',
    profiles: { demo: EXPECT_UNSET, staging: EXPECT_SET, production: EXPECT_SET },
    note: '고객에게 나가는 링크의 베이스. 환경마다 달라야 한다' },
  { name: 'DARS_AICC_LIVE', scope: 'runtime', secret: false, gate: true,
    fallbackKo: 'dry_run(실푸시 없음)',
    profiles: { demo: EXPECT_UNSET, staging: EXPECT_UNSET, production: EXPECT_UNSET },
    note: 'AICC 실푸시. DARS_AICC_APPROVAL_REF 와 함께여야만 켜진다' },
  { name: 'DARS_AICC_APPROVAL_REF', scope: 'runtime', secret: false, gate: true,
    fallbackKo: '없음 → 실푸시 거부',
    profiles: { demo: EXPECT_UNSET, staging: EXPECT_UNSET, production: EXPECT_UNSET },
    note: '실푸시 승인 근거 문서/티켓 식별자' },
  { name: 'DARS_AICC_TIMEOUT_MS', scope: 'runtime', secret: false, gate: false,
    fallbackKo: '전송 계층 기본값',
    profiles: { demo: EXPECT_UNSET, staging: EXPECT_ANY, production: EXPECT_ANY },
    note: '정수만 인정, 이상값은 무시' },
  { name: 'NODE_ENV', scope: 'platform', secret: false, gate: false,
    fallbackKo: 'development',
    profiles: { demo: EXPECT_ANY, staging: EXPECT_ANY, production: EXPECT_ANY },
    note: 'Next.js/플랫폼이 설정' },
  { name: 'VERCEL_ENV', scope: 'platform', secret: false, gate: false,
    fallbackKo: '없음(로컬)',
    profiles: { demo: EXPECT_ANY, staging: EXPECT_ANY, production: EXPECT_ANY },
    note: '환경 판별의 근거(/api/health 의 env)' },
  { name: 'VERCEL_GIT_COMMIT_SHA', scope: 'platform', secret: false, gate: false,
    fallbackKo: '없음(로컬)',
    profiles: { demo: EXPECT_ANY, staging: EXPECT_ANY, production: EXPECT_ANY },
    note: '배포 커밋 식별(/api/health 의 commit)' },
  { name: 'AICC_CORE', scope: 'tooling', secret: false, gate: false,
    fallbackKo: '개발 PC 형제 폴더 경로',
    profiles: { demo: EXPECT_ANY, staging: EXPECT_ANY, production: EXPECT_ANY },
    note: 'scripts/aicc-conformance.mjs 전용(배포와 무관)' },
  { name: 'AICC_TIMEOUT_MS', scope: 'tooling', secret: false, gate: false,
    fallbackKo: '3000',
    profiles: { demo: EXPECT_ANY, staging: EXPECT_ANY, production: EXPECT_ANY },
    note: 'scripts/aicc-conformance.mjs 전용' },
];

const byName = new Map(ENV_VARS.map((v) => [v.name, v]));

export function envVar(name) {
  return byName.get(String(name || '')) || null;
}

// 배포 환경 판별. VERCEL_ENV 가 근거이며, 로컬/미설정은 'demo' 로 본다(가장 안전한 쪽).
// ※ 현행 라이브는 Production 이지만 구성은 데모다 — 그래서 판정 대상 프로필은 호출자가
//   명시적으로 넘길 수 있게 두었다(CLI 의 --profile). 자동 추정만 믿지 않는다.
export function profileOf(env = {}) {
  const v = env && typeof env.VERCEL_ENV === 'string' ? env.VERCEL_ENV.trim().toLowerCase() : '';
  if (v === 'production') return 'production';
  if (v === 'preview') return 'staging';
  return 'demo';
}

function isSet(env, name) {
  const v = env ? env[name] : undefined;
  return typeof v === 'string' ? v.trim() !== '' : v != null;
}

// 변수 하나의 상태. **값은 담지 않는다.**
//   'ok' | 'missing'(필수인데 없음) | 'unexpected'(미설정이어야 하는데 있음) | 'mismatch'(정확값 불일치)
export function checkVar(v, env, profile) {
  const expect = v && v.profiles ? v.profiles[profile] : EXPECT_ANY;
  const set = isSet(env, v.name);
  if (expect === EXPECT_ANY) return { name: v.name, state: 'ok', expect, set };
  if (expect === EXPECT_UNSET) return { name: v.name, state: set ? 'unexpected' : 'ok', expect, set };
  if (expect === EXPECT_SET) return { name: v.name, state: set ? 'ok' : 'missing', expect, set };
  const actual = env ? env[v.name] : undefined;
  const same = typeof actual === 'string' && actual.trim() === expect;
  return { name: v.name, state: set ? (same ? 'ok' : 'mismatch') : 'missing', expect, set };
}

// 같은 비밀값을 두 변수에 재사용했는지. **값은 반환하지 않고 이름 짝만 돌려준다.**
// 스테이징·운영이 시크릿을 공유하면 한쪽이 뚫릴 때 양쪽이 함께 뚫린다.
export function reusedSecrets(env = {}) {
  const groups = new Map();
  for (const v of ENV_VARS) {
    if (!v.secret) continue;
    const raw = env ? env[v.name] : undefined;
    const val = typeof raw === 'string' ? raw.trim() : '';
    if (!val) continue;
    const list = groups.get(val) || [];
    list.push(v.name);
    groups.set(val, list);
  }
  return [...groups.values()].filter((names) => names.length > 1).map((names) => names.slice().sort());
}

// 환경 구성 판정. blockers 가 있으면 그 프로필로 서비스해서는 안 된다.
// 값은 어디에도 담지 않는다(테스트가 감시한다).
export function evaluateEnv(env = {}, profile = 'demo') {
  const prof = PROFILES.includes(profile) ? profile : 'demo';
  const rows = ENV_VARS.filter((v) => v.scope === 'runtime').map((v) => ({ ...checkVar(v, env, prof), gate: !!v.gate, secret: !!v.secret }));

  const blockers = [];
  const warnings = [];
  for (const r of rows) {
    if (r.state === 'ok') continue;
    const v = envVar(r.name);
    const msg = {
      missing: `${r.name} 미설정 — ${prof} 에서는 ${r.expect} (미설정 시 동작: ${v.fallbackKo})`,
      unexpected: `${r.name} 이(가) 설정돼 있다 — ${prof} 에서는 ${EXPECT_UNSET}`,
      mismatch: `${r.name} 값이 기대와 다르다 — ${prof} 기대값 '${r.expect}'`,
    }[r.state];
    const item = { code: `ENV_${r.state.toUpperCase()}`, name: r.name, msg: r.gate ? `${msg} [승인 필요]` : msg };
    // 운영에서의 어긋남은 차단, 그 외 환경은 경고로만 본다(스테이징 구성 실험을 막지 않는다).
    if (prof === 'production') blockers.push(item);
    else warnings.push(item);
  }

  for (const names of reusedSecrets(env)) {
    blockers.push({ code: 'ENV_SECRET_REUSED', name: names.join(','), msg: `같은 비밀값을 ${names.join(' / ')} 에 재사용했다 — 각각 다른 값으로 발급` });
  }

  const gatesOn = ENV_VARS.filter((v) => v.gate && isSet(env, v.name)).map((v) => v.name);
  return { profile: prof, ok: blockers.length === 0, rows, blockers, warnings, gatesOn };
}

// ---- 등록부 썩음 방지 ----

// 소스에서 실제로 읽는 환경변수 이름을 뽑는다.
//   `process.env.X`, `process.env['X']`, 그리고 `env.X`(호출자가 env 를 주입하는 우리 관례).
// 한계: 동적 접근(`env[name]`)은 이름을 알 수 없어 잡히지 않는다.
export function envNamesInSource(source) {
  const out = new Set();
  if (typeof source !== 'string') return out;
  const pats = [
    /process\.env\.([A-Z][A-Z0-9_]{2,})/g,
    /process\.env\[\s*['"]([A-Z][A-Z0-9_]{2,})['"]\s*\]/g,
    /\benv\.([A-Z][A-Z0-9_]{2,})\b/g,
  ];
  for (const re of pats) {
    let m;
    while ((m = re.exec(source)) !== null) out.add(m[1]);
  }
  return out;
}

// 소스는 읽는데 등록부에 없는 변수(=문서·매트릭스에서 통째로 빠진 설정). 항상 비어야 한다.
export function unregisteredEnvNames(sources) {
  const found = new Set();
  for (const s of Array.isArray(sources) ? sources : [sources]) {
    for (const n of envNamesInSource(s)) found.add(n);
  }
  return [...found].filter((n) => !byName.has(n)).sort();
}

// 등록부에만 있고 소스 어디에서도 읽지 않는 변수(=삭제 후 남은 유령 항목). 항상 비어야 한다.
export function unusedEnvNames(sources) {
  const found = new Set();
  for (const s of Array.isArray(sources) ? sources : [sources]) {
    for (const n of envNamesInSource(s)) found.add(n);
  }
  return ENV_VARS.map((v) => v.name).filter((n) => !found.has(n)).sort();
}

export default evaluateEnv;
