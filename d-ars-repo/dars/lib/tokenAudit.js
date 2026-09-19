// lib/tokenAudit.js — 발급 토큰 보안 요건 점검(순수 로직 · 값을 절대 반환·출력하지 않는다)
//
// 배경(COMMERCIAL_READINESS "세션 토큰 보안 요건 점검 — 만료·1회용·엔트로피"):
//   D-ARS 는 서명 토큰을 3종 발급한다. 셋 다 **무상태 HMAC 베어러**라, 서명 비밀이 약하거나
//   저장소에 공개된 데모 값이면 토큰을 마음대로 위조할 수 있다. 그런데 "비밀값을 설정했다"와
//   "그 비밀값이 쓸 만하다"는 다른 상태이고, 지금까지는 전자만 확인했다(`lib/authReadiness.js`).
//   여기서는 만료·1회용·엔트로피 세 축을 토큰별로 판정한다.
//
// 안전 원칙: 이 모듈은 **비밀값을 반환하지도, 길이·일부 문자도 노출하지 않는다.**
//   판정은 등급(level)과 불리언으로만 표현한다. 실행하는 것도 없다(토큰을 만들지 않는다).

// 저장소에 그대로 적혀 있는 데모 비밀값 = 공개된 값이다. 운영에서 이 값이 쓰이면 위조가 가능하다.
// (여기에 적는 것 자체는 위험이 아니다 — 이미 lib/auth.js·lib/eumToken.js 에 공개돼 있다.)
export const KNOWN_DEMO_SECRETS = [
  'dars-demo-secret-v1',      // lib/auth.js 기본값
  'dars-eum-demo-secret-v1',  // lib/eumToken.js 기본값
];

// HMAC-SHA256 키 권장 하한. 32자(≈256비트 미만이지만 무작위 문자열 기준 충분히 긴 값)를
// 실무 기준선으로 잡는다. 이 값은 관례에 따른 **운영 기준값**이며 실측 지표가 아니다.
export const MIN_SECRET_LENGTH = 32;
// 서로 다른 문자가 이보다 적으면 반복 패턴('aaaa…', '1111…')으로 본다.
export const MIN_SECRET_VARIETY = 8;

// 비밀값 강도 등급. **값·길이·문자를 반환하지 않는다.**
//   'missing' 미설정 · 'demo' 저장소 공개 데모값 · 'weak' 짧거나 반복 · 'ok' 기준 충족
export function secretStrength(value) {
  if (typeof value !== 'string' || value.trim() === '') return { level: 'missing', meetsMinLength: false, lowVariety: true };
  const v = value.trim();
  if (KNOWN_DEMO_SECRETS.includes(v)) return { level: 'demo', meetsMinLength: false, lowVariety: true };
  const meetsMinLength = v.length >= MIN_SECRET_LENGTH;
  const lowVariety = new Set(v).size < MIN_SECRET_VARIETY;
  if (!meetsMinLength || lowVariety) return { level: 'weak', meetsMinLength, lowVariety };
  return { level: 'ok', meetsMinLength: true, lowVariety: false };
}

// 발급 토큰 목록(단일 출처). 문서 `docs/TOKEN_SECURITY.md` 와 양방향 대조된다.
//   transport 'cookie' — httpOnly 쿠키(스크립트 접근 불가 · 로그에 남지 않음)
//   transport 'url'    — 경로 세그먼트(문자 메시지로 전달 · 로그·리퍼러 노출 위험 → 짧은 TTL 로 상쇄)
//   oneTimeRequired    — 요건상 1회용이어야 하는가(구현 수준은 oneTime)
//   oneTime            — 1회용 구현 수준. 예전에는 참/거짓 하나였는데, 그 모양으로는 지금 상태를
//                        말할 수 없다. 이음 링크는 `lib/eumConsume` 로 **구현됐지만** 소진 기록이
//                        인스턴스 로컬 메모리라 절대 보장이 아니다. 참이라 하면 과장이고
//                        거짓이라 하면(예전 값) 이미 한 일을 안 했다고 말하는 셈이라 둘 다 틀렸다.
export const ONE_TIME_LEVELS = Object.freeze(['none', 'local', 'durable']);

export const TOKEN_SPECS = [
  {
    name: 'auth-session',
    label: '운영자 로그인 세션',
    module: 'lib/auth.js',
    transport: 'cookie',
    ttlMs: 8 * 60 * 60 * 1000,
    maxTtlMs: 12 * 60 * 60 * 1000,
    secretEnv: 'AUTH_SECRET',
    fallbackEnv: null,
    hasDemoFallback: true,
    oneTimeRequired: false,     // 세션은 재사용이 전제다 — 1회용이 요건이 아니다
    oneTime: 'none',
    carriesPii: false,
  },
  {
    name: 'rbac-session',
    label: 'RBAC 미들웨어 세션',
    module: 'lib/session.js',
    transport: 'cookie',
    ttlMs: 8 * 60 * 60 * 1000,
    maxTtlMs: 12 * 60 * 60 * 1000,
    secretEnv: 'RBAC_SESSION_SECRET',
    fallbackEnv: null,
    hasDemoFallback: false,     // 미설정이면 아예 무동작(데모 키로 서명하지 않는다)
    oneTimeRequired: false,
    oneTime: 'none',
    carriesPii: false,
  },
  {
    name: 'eum-link',
    label: '이음 어르신 신청 1회용 링크',
    module: 'lib/eumToken.js',
    transport: 'url',
    ttlMs: 5 * 60 * 1000,
    maxTtlMs: 10 * 60 * 1000,
    secretEnv: 'EUM_TOKEN_SECRET',
    fallbackEnv: 'AUTH_SECRET',
    hasDemoFallback: true,
    oneTimeRequired: true,      // 요건(가이드 §6-2)은 1회용이다
    // 'local': lib/eumConsume 가 첫 제출에서 링크를 소진하고 재제출을 409 로 막는다.
    // 다만 기록이 **인스턴스 로컬 메모리**라 서버리스 인스턴스가 여럿이면 다른 인스턴스로 간
    // 재제출은 걸러지지 않는다 — 실질적 보장이지 절대 보장이 아니다(3장 참조).
    oneTime: 'local',
    carriesPii: false,
  },
];

// 토큰이 실제로 서명에 쓰게 될 비밀값을 고른다(폴백 체인 반영).
// **값을 반환하지 않는다** — 어느 출처가 쓰이는지(source)와 강도만 돌려준다.
export function effectiveSecret(spec, env = {}) {
  const e = env && typeof env === 'object' ? env : {};
  const own = e[spec.secretEnv];
  if (typeof own === 'string' && own.trim() !== '') {
    return { source: spec.secretEnv, ...secretStrength(own) };
  }
  if (spec.fallbackEnv) {
    const fb = e[spec.fallbackEnv];
    if (typeof fb === 'string' && fb.trim() !== '') {
      return { source: spec.fallbackEnv, derived: true, ...secretStrength(fb) };
    }
  }
  if (spec.hasDemoFallback) return { source: 'demo-default', ...secretStrength(KNOWN_DEMO_SECRETS[0]) };
  return { source: 'none', ...secretStrength(null) };
}

// 토큰 1종 판정. profile 이 'production' 이면 약한 비밀값을 차단으로 본다.
export function auditToken(spec, env = {}, profile = 'demo') {
  const sec = effectiveSecret(spec, env);
  const blockers = [];
  const warnings = [];
  const strict = profile === 'production';
  const push = (list, code, msg) => list.push({ token: spec.name, code, msg });

  // ── 엔트로피 ──
  if (sec.level === 'demo' || sec.source === 'demo-default') {
    push(strict ? blockers : warnings, 'TOKEN_SECRET_DEMO',
      `${spec.name}: 저장소에 공개된 데모 비밀값으로 서명한다 — 누구나 토큰을 위조할 수 있다 (${spec.secretEnv} 설정 필요)`);
  } else if (sec.level === 'missing') {
    // 데모 폴백이 없는 경우 = 기능이 아예 꺼진 상태. 위조 위험은 없다.
    push(warnings, 'TOKEN_SECRET_MISSING', `${spec.name}: ${spec.secretEnv} 미설정 — 해당 기능이 동작하지 않는다`);
  } else if (sec.level === 'weak') {
    push(strict ? blockers : warnings, 'TOKEN_SECRET_WEAK',
      `${spec.name}: 서명 비밀값이 권장 기준(${MIN_SECRET_LENGTH}자 이상·반복 아님)에 못 미친다`);
  }
  if (sec.derived) {
    push(warnings, 'TOKEN_SECRET_DERIVED',
      `${spec.name}: 전용 ${spec.secretEnv} 대신 ${spec.fallbackEnv} 를 빌려 쓴다 — 한쪽이 유출되면 둘 다 위조된다`);
  }

  // ── 만료 ──
  const ttl = Number(spec.ttlMs);
  if (!Number.isFinite(ttl) || ttl <= 0) {
    push(blockers, 'TOKEN_NO_EXPIRY', `${spec.name}: 만료가 없다`);
  } else if (Number.isFinite(spec.maxTtlMs) && ttl > spec.maxTtlMs) {
    push(strict ? blockers : warnings, 'TOKEN_TTL_TOO_LONG', `${spec.name}: 수명이 상한을 넘는다`);
  }

  // ── 1회용 ──
  // 요건이 아닌 토큰(세션)은 아무 말도 하지 않는다. 요건인 토큰만 구현 수준을 그대로 보고한다 —
  // 과장(달성했다)도 과소(아무것도 안 했다)도 하지 않는 것이 이 판정의 존재 이유다.
  if (spec.oneTimeRequired) {
    const level = ONE_TIME_LEVELS.includes(spec.oneTime) ? spec.oneTime : 'none';
    if (level === 'none') {
      push(warnings, 'TOKEN_NOT_ONE_TIME',
        `${spec.name}: 요건은 1회용이지만 실제로는 만료 전까지 재사용 가능한 베어러다 — 사용 이력 저장소가 필요하다 [승인 필요]`);
    } else if (level === 'local') {
      push(warnings, 'TOKEN_ONE_TIME_LOCAL',
        `${spec.name}: 1회용 소진은 구현됐으나 기록이 인스턴스 로컬 메모리다 — 인스턴스가 여럿이거나 재배포되면 걸러지지 않는 재제출이 남는다. 공유 저장소(DB·Redis) 영속화 [승인 필요]`);
    }
  }

  // ── 전달 경로 ──
  if (spec.transport === 'url') {
    push(warnings, 'TOKEN_IN_URL',
      `${spec.name}: 토큰이 URL 에 실린다 — 접근로그·리퍼러·메신저 미리보기로 새어나갈 수 있다(짧은 TTL 로 완화)`);
  }

  return {
    name: spec.name, secretSource: sec.source, strength: sec.level,
    oneTime: spec.oneTimeRequired ? (ONE_TIME_LEVELS.includes(spec.oneTime) ? spec.oneTime : 'none') : null,
    blockers, warnings,
  };
}

// 전체 판정. 반환 어디에도 비밀값이 들어가지 않는다.
export function auditTokens(env = {}, profile = 'demo', specs = TOKEN_SPECS) {
  const list = Array.isArray(specs) ? specs : [];
  const rows = list.map((s) => auditToken(s, env, profile));
  const blockers = rows.flatMap((r) => r.blockers);
  const warnings = rows.flatMap((r) => r.warnings);
  return { profile, rows, blockers, warnings, ok: blockers.length === 0 };
}

export default auditTokens;
