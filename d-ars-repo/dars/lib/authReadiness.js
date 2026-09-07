// ============================================================================
// lib/authReadiness.js — AUTH_ENFORCE 실인증 전환 준비도 판정 (순수 로직)
//
// 배경(COMMERCIAL_READINESS "AUTH_ENFORCE 실인증 전환 준비 — 운영 계정·역할 매핑 문서화"):
//   지금 라이브는 비강제(데모) 모드다. AUTH_ENFORCE=1 을 켜는 순간 **데모 계정 3종이 그대로
//   운영 계정이 된다**(lib/auth.js DEMO_USERS · AUTH_USERS 미설정 시). 서명키도 코드에 박힌
//   데모 고정값이라, 같은 값을 아는 누구든 세션 토큰을 위조할 수 있다.
//   즉 "스위치를 켰다"와 "실인증이 됐다"는 전혀 다른 상태이고, 그 차이를 사람이 눈으로
//   확인하는 절차는 반드시 빠진다. 이 모듈은 그 차이를 **기계가 판정**하게 만든다.
//
// 이 모듈이 하지 않는 것(중요):
//   - 아무 것도 켜지 않는다. 환경변수를 스스로 읽지 않는다(호출자가 env 객체를 넘긴다).
//   - 비밀값을 반환·출력하지 않는다. 설정 여부·길이·마스킹된 계정까지만 다룬다.
//   - 실제 전환(AUTH_ENFORCE=1 주입)은 사람이 Vercel 대시보드에서 한다. [승인 필요]
//
// 판정 등급: blocker(이 상태로 켜면 안 된다) / warning(켜도 되지만 남는 위험).
// ============================================================================

import { ROLES } from './auth.js';

// lib/auth.js 에 하드코딩된 데모 값. 운영에서 이 값이 그대로면 인증은 장식이다.
export const DEMO_SECRET = 'dars-demo-secret-v1';
export const DEMO_PASSWORDS = ['dars2026!'];
export const DEMO_ACCOUNTS = ['admin', 'operator', 'viewer'];

// 서명키 최소 길이. 실측치가 아니라 관례값 — HMAC-SHA256 키를 32자 이상 두자는 통상 권고.
export const MIN_SECRET_LEN = 32;
// 사람이 외워 쓰는 비밀번호를 막기 위한 최소 길이(관례값).
export const MIN_PASSWORD_LEN = 12;

const s = (v) => (typeof v === 'string' ? v : v === undefined || v === null ? '' : String(v));

// 계정 아이디 마스킹 — 보고서·CLI 출력에 원문을 남기지 않는다(감사 로그와 같은 취지).
// 'operator' -> 'op******', 2자 이하는 전부 가린다.
export function maskAccount(u) {
  const v = s(u);
  if (!v) return '';
  if (v.length <= 2) return '*'.repeat(v.length);
  return v.slice(0, 2) + '*'.repeat(Math.min(v.length - 2, 6));
}

/**
 * AUTH_USERS(JSON 문자열) 파싱·스키마 검증.
 * 반환: { ok, users:[{u,role,name}], problems:[{code, account}] }
 *   - users 에 **비밀번호를 담지 않는다**(호출측이 실수로 로그에 흘리는 경로를 없앤다).
 *   - 어떤 입력에도 throw 하지 않는다.
 */
export function parseUsersSpec(raw) {
  const problems = [];
  const text = s(raw).trim();
  if (!text) return { ok: false, users: [], problems: [{ code: 'users_missing' }] };
  let arr;
  try { arr = JSON.parse(text); } catch { return { ok: false, users: [], problems: [{ code: 'users_invalid_json' }] }; }
  if (!Array.isArray(arr)) return { ok: false, users: [], problems: [{ code: 'users_not_array' }] };
  if (!arr.length) return { ok: false, users: [], problems: [{ code: 'users_empty' }] };

  const users = [];
  const seen = new Set();
  for (const entry of arr) {
    const e = entry && typeof entry === 'object' ? entry : {};
    const u = s(e.u).trim();
    const p = s(e.p);
    const role = s(e.role).trim();
    const account = maskAccount(u);
    if (!u) { problems.push({ code: 'user_no_id' }); continue; }
    if (seen.has(u)) problems.push({ code: 'user_duplicate', account });
    seen.add(u);
    if (!ROLES.includes(role)) problems.push({ code: 'user_bad_role', account });
    if (!p) problems.push({ code: 'user_no_password', account });
    else if (DEMO_PASSWORDS.includes(p)) problems.push({ code: 'user_demo_password', account });
    else if (p.length < MIN_PASSWORD_LEN) problems.push({ code: 'user_weak_password', account });
    if (DEMO_ACCOUNTS.includes(u) && DEMO_PASSWORDS.includes(p)) problems.push({ code: 'user_demo_account', account });
    users.push({ u, role, name: s(e.name) });
  }
  if (!users.some((x) => x.role === 'admin')) problems.push({ code: 'users_no_admin' });
  return { ok: problems.length === 0, users, problems };
}

// 문제 코드 -> 등급·설명. 목록에 없는 코드는 blocker 로 보수적으로 취급한다.
const ISSUE = {
  users_missing: ['blocker', 'AUTH_USERS 미설정 — 켜는 즉시 데모 계정 3종이 운영 계정이 된다'],
  users_invalid_json: ['blocker', 'AUTH_USERS 가 JSON 이 아니다 — 파싱 실패 시 조용히 데모 계정으로 되돌아간다'],
  users_not_array: ['blocker', 'AUTH_USERS 는 배열이어야 한다'],
  users_empty: ['blocker', 'AUTH_USERS 가 빈 배열 — 아무도 로그인할 수 없다'],
  users_no_admin: ['blocker', 'admin 역할 계정이 없다 — 관리 화면에 아무도 들어갈 수 없다'],
  user_no_id: ['blocker', '아이디(u)가 없는 항목'],
  user_duplicate: ['blocker', '아이디 중복 — 뒤 항목이 무시된다'],
  user_bad_role: ['blocker', '역할이 viewer/operator/admin 중 하나가 아니다 — 권한 판정에서 항상 탈락한다'],
  user_no_password: ['blocker', '비밀번호(p)가 없다'],
  user_demo_password: ['blocker', '저장소에 공개된 데모 비밀번호를 그대로 쓴다'],
  user_demo_account: ['blocker', '데모 계정(아이디+비밀번호)이 그대로 남아 있다'],
  user_weak_password: ['warning', '비밀번호가 12자 미만'],
  secret_missing: ['blocker', 'AUTH_SECRET 미설정 — 코드에 박힌 데모 키로 서명한다(토큰 위조 가능)'],
  secret_demo: ['blocker', 'AUTH_SECRET 이 데모 고정값 그대로다(토큰 위조 가능)'],
  secret_short: ['blocker', 'AUTH_SECRET 이 32자 미만'],
  ratelimit_disabled: ['blocker', 'RATE_LIMIT_DISABLED=1 — 로그인 시도 제한이 풀려 있다'],
  demo_mode_open: ['warning', 'DEMO_MODE 가 0 이 아니다 — 시뮬레이터(/api/dev/simulate)가 열려 있다'],
  ingest_key_missing: ['warning', 'INGEST_KEY 미설정 — 수집 API 가 키 없이 통과한다'],
  audit_console_only: ['warning', 'AUDIT_DB 미설정 — 감사 이력이 함수 로그 보존기간에만 남는다'],
  rbac_secret_missing: ['warning', 'RBAC_SESSION_SECRET 미설정 — 해당 미들웨어 경로가 무동작'],
};

export function issueInfo(code) {
  const e = ISSUE[code];
  return { level: e ? e[0] : 'blocker', msg: e ? e[1] : String(code) };
}

/**
 * 전환 준비도 판정. env 는 { AUTH_SECRET, AUTH_USERS, ... } 형태의 평범한 객체.
 * 반환: { enforced, blockers[], warnings[], ready, accounts[] }
 *   ready=true 는 "이 환경에서 AUTH_ENFORCE=1 을 켤 준비가 됐다"는 뜻이며,
 *   **켜는 행위 자체는 사람의 승인 사항**이다.
 */
export function checkAuthEnv(env) {
  const e = env && typeof env === 'object' ? env : {};
  const found = [];

  const secret = s(e.AUTH_SECRET);
  if (!secret) found.push({ code: 'secret_missing' });
  else if (secret === DEMO_SECRET) found.push({ code: 'secret_demo' });
  else if (secret.length < MIN_SECRET_LEN) found.push({ code: 'secret_short' });

  const parsed = parseUsersSpec(e.AUTH_USERS);
  for (const p of parsed.problems) found.push(p);

  if (s(e.RATE_LIMIT_DISABLED) === '1') found.push({ code: 'ratelimit_disabled' });
  if (s(e.DEMO_MODE) !== '0') found.push({ code: 'demo_mode_open' });
  if (!s(e.INGEST_KEY)) found.push({ code: 'ingest_key_missing' });
  if (s(e.AUDIT_DB) !== '1') found.push({ code: 'audit_console_only' });
  if (!s(e.RBAC_SESSION_SECRET)) found.push({ code: 'rbac_secret_missing' });

  const blockers = [];
  const warnings = [];
  for (const p of found) {
    const info = issueInfo(p.code);
    const item = { code: p.code, msg: info.msg, ...(p.account ? { account: p.account } : {}) };
    (info.level === 'blocker' ? blockers : warnings).push(item);
  }
  return {
    enforced: s(e.AUTH_ENFORCE) === '1',
    blockers,
    warnings,
    ready: blockers.length === 0,
    accounts: parsed.users.map((u) => ({ account: maskAccount(u.u), role: u.role })),
  };
}

// ---- 역할-경로 매핑 문서 드리프트 검사 ----
//
// 문서(docs/AUTH_ROLLOUT.md)의 매핑 표와 코드(lib/auth.js routeRoleMatrix)가 어긋나면
// 운영자는 틀린 표를 보고 계정 권한을 발급한다. backupCheck 와 같은 방식으로 **양방향** 대조한다.

// 마크다운 표에서 `| \`/경로\` | 역할 |` 행만 뽑는다(문장 속 경로는 무시).
export function matrixFromDoc(text) {
  const out = {};
  const src = s(text);
  const re = /^\|\s*`(\/[^`]*)`\s*\|\s*([a-z_]+)\s*\|/gm;
  let m;
  while ((m = re.exec(src))) out[m[1]] = m[2];
  return out;
}

// 코드 매핑과 문서 매핑의 차이. 세 목록 모두 항상 비어 있어야 한다.
export function matrixDrift(code, doc) {
  const c = code && typeof code === 'object' ? code : {};
  const d = doc && typeof doc === 'object' ? doc : {};
  const missingInDoc = Object.keys(c).filter((k) => !(k in d)).sort();
  const ghostInDoc = Object.keys(d).filter((k) => !(k in c)).sort();
  const mismatched = Object.keys(c).filter((k) => k in d && d[k] !== c[k]).sort()
    .map((k) => ({ path: k, code: c[k], doc: d[k] }));
  return { missingInDoc, ghostInDoc, mismatched, ok: !missingInDoc.length && !ghostInDoc.length && !mismatched.length };
}
