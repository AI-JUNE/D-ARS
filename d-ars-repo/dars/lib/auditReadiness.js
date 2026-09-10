// lib/auditReadiness.js — 감사로그 영속화 준비도 판정(순수 로직 · DB/런타임 비의존)
//
// 배경(COMMERCIAL_READINESS "감사로그 영속화 준비"):
//   기록(`lib/audit.js`)과 열람(`/api/admin/audit`) 경로는 이미 있었다. 빠진 것은
//   **"켰다"와 "실제로 남는다"가 다른 상태**를 아무도 알 수 없다는 점이다.
//   - `AUDIT_DB=1` 을 켜고 `DATABASE_URL` 을 안 넣으면 → insert 시도조차 없이 전부 콘솔로만 남는다.
//   - `DATABASE_URL` 은 있는데 `db/audit.sql` 을 적용하지 않았으면 → insert 가 매번 실패하고,
//     감사 기록은 **무해화 계약에 따라 조용히 삼켜진다**(요청을 실패시키면 안 되므로 옳은 동작이다).
//     그 결과 감사 화면은 "0건"을 보여주고, 운영자는 아무 일도 없었다고 읽는다.
//   - `AUDIT_DB=true` 처럼 오타를 내면 꺼진 채로 켠 줄 안다.
//   감사 로그는 사고가 난 뒤에야 들여다보는 자산이라, 그때 비어 있으면 복구할 방법이 없다.
//   그래서 상태를 사람 눈이 아니라 기계가 판정하게 한다.
//
// 이 모듈은 **아무 것도 실행하지 않는다** — DB 에 붙지도, 기록하지도 않는다. 판정만 반환한다.

// 영속화 모드
//   'console'  기본 — 콘솔 구조화 로그만(함수 로그 보존기간에 종속)
//   'db'       DB 영속화 동작 중
//   'db-blind' 스위치는 켰는데 실제로는 남지 않는 상태(=가장 위험) — DB 미설정/적재 실패
export const AUDIT_MODES = ['console', 'db', 'db-blind'];

// 플래그 해석: **정확히 '1'** 일 때만 켠다(lib/audit.js 와 같은 규칙 — 여기서 느슨하게 보면
// 판정과 실제 동작이 어긋나 더 위험하다).
export function auditFlagOn(env = {}) {
  return !!env && env.AUDIT_DB === '1';
}

// 켠 줄 알았는데 안 켜진 오타·유사값. 값 자체는 비밀이 아니지만 그대로 싣지 않고 형태만 알린다.
const TYPO_LIKE = /^(true|yes|on|y|t|enabled?|1\s+|\s+1)$/i;
export function auditFlagTypo(env = {}) {
  const raw = env ? env.AUDIT_DB : undefined;
  if (raw == null || raw === '') return false;
  if (raw === '1') return false;
  const s = String(raw);
  return TYPO_LIKE.test(s) || s.trim() === '1';   // 공백이 섞인 '1 ' 도 꺼진 상태다
}

// 준비도 판정.
//   env          : 환경변수 객체
//   hasDB        : DATABASE_URL 이 있어 DB 클라이언트가 살아 있는가(호출자가 넘긴다)
//   failures     : 이 인스턴스에서 관측된 적재 실패 횟수(lib/audit.auditStats)
//   persisted    : 이 인스턴스에서 성공한 적재 횟수
// 반환에 환경변수 **값**을 담지 않는다.
export function auditReadiness(input) {
  // 기본값 구문은 undefined 에만 적용된다 — null 을 넘겨도 죽지 않도록 직접 정규화한다.
  const o = input && typeof input === 'object' ? input : {};
  const env = o.env && typeof o.env === 'object' ? o.env : {};
  const hasDB = !!o.hasDB;
  const failures = o.failures;
  const persisted = o.persisted;
  const on = auditFlagOn(env);
  const fails = Number.isFinite(failures) && failures > 0 ? Math.trunc(failures) : 0;
  const okCount = Number.isFinite(persisted) && persisted > 0 ? Math.trunc(persisted) : 0;

  const blockers = [];
  const warnings = [];
  let mode = 'console';

  if (!on) {
    mode = 'console';
    if (auditFlagTypo(env)) {
      warnings.push({ code: 'AUDIT_FLAG_TYPO', msg: "AUDIT_DB 가 설정돼 있지만 정확히 '1' 이 아니라 꺼진 상태다" });
    }
    warnings.push({ code: 'AUDIT_CONSOLE_ONLY', msg: '감사 이력이 콘솔(함수 로그)에만 남는다 — 보존기간이 플랫폼 로그 정책에 종속된다' });
  } else if (!hasDB) {
    mode = 'db-blind';
    blockers.push({ code: 'AUDIT_DB_NO_DATABASE', msg: 'AUDIT_DB=1 인데 DATABASE_URL 이 없다 — 영속화가 전혀 일어나지 않는다' });
  } else if (fails > 0 && okCount === 0) {
    mode = 'db-blind';
    blockers.push({ code: 'AUDIT_PERSIST_FAILING', msg: `적재가 ${fails}회 실패하고 성공이 0회다 — db/audit.sql 미적용을 먼저 의심할 것` });
  } else {
    mode = 'db';
    if (fails > 0) {
      warnings.push({ code: 'AUDIT_PERSIST_PARTIAL', msg: `적재 실패 ${fails}회 관측(성공 ${okCount}회) — 간헐적 DB 오류` });
    }
  }

  return { mode, on, hasDB, failures: fails, persisted: okCount, blockers, warnings, ok: blockers.length === 0 };
}

// /api/health 의 deps 항목으로 쓸 상태 어휘로 환산한다(lib/health.DEP_STATUSES).
//   not-configured : 콘솔 모드(미도입 — 장애가 아니다)
//   ok             : 영속화 동작 중
//   degraded       : 동작하지만 일부 실패 관측
//   error          : 켰는데 남지 않는 상태(db-blind)
// required 는 붙이지 않는다 — 감사 영속화 실패로 서비스 전체를 503 으로 만들지 않는다.
export function auditDepStatus(r) {
  const x = r && typeof r === 'object' ? r : {};
  if (x.mode === 'db-blind') return 'error';
  if (x.mode === 'db') return x.failures > 0 ? 'degraded' : 'ok';
  return 'not-configured';
}

export default auditReadiness;
