// lib/backupCheck.js — 백업·복구 준비도 판정(순수 로직 · DB/파일시스템 비의존)
//
// 배경(126회차, COMMERCIAL_READINESS "백업·복구 절차"): 복구 절차는 문서만 있으면 반드시 썩는다.
//   (1) 새 표가 db/*.sql 에 추가돼도 RUNBOOK 의 "복구 후 확인 대상"에는 아무도 추가하지 않는다
//       → 복구는 "성공"으로 보이는데 한 표가 통째로 비어 있는 상태를 아무도 눈치채지 못한다.
//       빌드도 테스트도 통과하는 전형적 잠복 회귀라, 소스 스캔(sourceLint 와 동일 취지)으로 고정한다.
//   (2) 리허설은 "언젠가 했다"가 아니라 **언제·무엇을·누가** 확인했는지가 근거다. 기록 형식을
//       코드로 정의해 두면 빈 기록·누락 단계·오래된 기록을 기계가 판정할 수 있다.
//
// 이 모듈은 **아무 것도 실행하지 않는다** — 백업·복구·삭제 명령을 만들지도, 보내지도 않는다.
//   판정 결과만 반환한다. 실제 복구는 사람이 RUNBOOK.md 절차대로 수행한다. [승인 필요]

// ---- (1) 스키마 선언 테이블 추출 ----

// SQL 줄 주석(-- …)을 **행을 보존한 채** 제거한다. db/retention.sql 처럼 주석으로 적어 둔
// 미적용 DDL(create table … 예시)이 선언으로 잘못 잡히는 것을 막는다.
// 문자열 리터럴 안의 '--' 까지 구분하지는 않는다(스키마 파일에 그런 사례가 없고, 보수적으로
// 주석 취급해도 테이블명을 놓칠 뿐 없는 표를 만들어 내지는 않는다).
//
// CRLF 주의(2026-09-09 수정): 이전 구현은 `/--.*$/` 였다. JS 정규식에서 `.` 는 `\r` 을 매칭하지
//   않고, `m` 플래그 없는 `$` 는 문자열 끝에서만 맞으므로 **CRLF 파일에서는 주석이 하나도
//   제거되지 않았다**(db/schema.sql 이 CRLF). 오류 없이 조용히 no-op 이 되는 종류의 버그다.
//   `[^\n]` 은 `\r` 을 포함하므로 개행 방식과 무관하게 동작한다.
export function stripSqlComments(sql) {
  if (typeof sql !== 'string' || !sql) return '';
  return sql.split('\n').map((l) => l.replace(/--[^\n]*$/, '')).join('\n');
}

// SQL 에서 `create table [if not exists] <name>` 로 선언된 테이블 이름을 사전순·중복 제거로 반환.
// 스키마·큰따옴표 인용(public."audit_events")도 이름만 뽑는다. 이상 입력에 throw 하지 않는다.
export function tablesInSql(sql) {
  const text = stripSqlComments(sql);
  if (!text) return [];
  const out = new Set();
  const re = /create\s+table\s+(?:if\s+not\s+exists\s+)?([a-zA-Z0-9_."]+)/gi;
  let m;
  while ((m = re.exec(text))) {
    const name = m[1].replace(/"/g, '').split('.').pop().toLowerCase();
    if (name) out.add(name);
  }
  return [...out].sort();
}

// RUNBOOK.md 가 "복구 후 존재·행수를 확인한다"고 선언한 표 목록(단일 출처).
// **db/*.sql 의 선언과 정확히 일치해야 한다** — 통합 테스트가 양방향으로 대조한다.
export const COVERED_TABLES = [
  'audit_events',    // db/audit.sql — 감사 이벤트(AUDIT_DB=1 일 때만 적재)
  'daily_stats',     // db/schema.sql — 일별 집계
  'docs',            // db/schema.sql — 서류 마스터
  'scenarios',       // db/schema.sql — 시나리오
  'ums_log',         // db/schema.sql — UMS 발송로그(PII: phone)
  'visual_sessions', // db/schema.sql — 상담 세션(PII: phone)
];

// 스키마에는 선언됐는데 커버리지 목록에 없는 표(=복구 검증에서 조용히 빠지는 표).
// **항상 빈 배열이어야 한다.**
export function uncoveredTables(declared, covered = COVERED_TABLES) {
  const has = new Set(Array.isArray(covered) ? covered : []);
  return (Array.isArray(declared) ? declared : []).filter((t) => typeof t === 'string' && !has.has(t)).sort();
}

// 커버리지 목록에만 있고 스키마에는 없는 표(=삭제·개명 후 남은 유령 항목).
// **항상 빈 배열이어야 한다.**
export function staleCoverage(declared, covered = COVERED_TABLES) {
  const has = new Set(Array.isArray(declared) ? declared : []);
  return (Array.isArray(covered) ? covered : []).filter((t) => typeof t === 'string' && !has.has(t)).sort();
}

// ---- (2) 복구 리허설 기록 판정 ----

// 리허설에서 반드시 밟아야 하는 단계(순서 고정 — RUNBOOK.md 5장과 1:1).
// 하나라도 빠지면 "복구했다"의 근거가 되지 않는다.
export const REHEARSAL_STEPS = [
  'snapshot',  // 복구 시점(스냅샷/브랜치) 선택 근거를 남겼다
  'restore',   // 별도 대상(운영 아님)으로 복구를 실제 수행했다
  'schema',    // COVERED_TABLES 전부의 존재·컬럼을 확인했다
  'rowcount',  // 표별 행수를 원본과 대조했다
  'app',       // 복구본을 가리키게 하고 /api/health 200·주요 화면을 확인했다
  'signoff',   // 사람이 결과를 확인·서명했다
];

// 리허설 기록의 유효기간(일). 이보다 오래된 기록은 '근거'로 보지 않는다.
// 근거: 분기 1회 점검 관례에 맞춘 운영 기준값이며, 실측 지표가 아니다. 운영에서 조정 가능.
export const DEFAULT_REHEARSAL_MAX_AGE_DAYS = 90;

const DAY_MS = 86400000;

// 기록 1건 정규화 → { at(ms|null), steps(REHEARSAL_STEPS 부분집합), by, note }.
// 알 수 없는 단계명은 버린다(오타가 '완료'로 둔갑하지 않게).
export function normalizeRehearsal(rec) {
  const r = rec && typeof rec === 'object' ? rec : {};
  const t = Date.parse(r.at);
  const known = new Set(REHEARSAL_STEPS);
  const steps = Array.isArray(r.steps) ? [...new Set(r.steps.filter((s) => known.has(s)))] : [];
  return {
    at: Number.isFinite(t) ? t : null,
    steps: REHEARSAL_STEPS.filter((s) => steps.includes(s)),
    by: typeof r.by === 'string' ? r.by : '',
    note: typeof r.note === 'string' ? r.note : '',
  };
}

// 기록에서 빠진 필수 단계(선언 순서 유지).
export function missingSteps(rec) {
  const n = normalizeRehearsal(rec);
  return REHEARSAL_STEPS.filter((s) => !n.steps.includes(s));
}

// 기록 목록 → 준비 상태.
//   'none'       기록 없음(또는 날짜가 없는 기록뿐) — 아직 리허설한 적 없음
//   'incomplete' 기록은 있으나 필수 단계를 다 밟은 건이 하나도 없음
//   'stale'      완주 기록은 있으나 유효기간을 넘김
//   'ok'         유효기간 안의 완주 기록 있음
// 판정 기준은 **완주(missingSteps 없음) 기록 중 가장 최근 것**이다. 미완주 기록이 아무리
// 최신이어도 'ok' 로 만들지 않는다(부분 수행을 근거로 착각하지 않게).
// 이상 입력·미래 날짜에 throw 하지 않는다(ageDays 는 0 아래로 내려가지 않는다).
export function rehearsalStatus(records, nowMs = Date.now(), maxAgeDays = DEFAULT_REHEARSAL_MAX_AGE_DAYS) {
  const now = Number.isFinite(nowMs) ? nowMs : Date.now();
  const limit = Number.isFinite(maxAgeDays) && maxAgeDays > 0 ? maxAgeDays : DEFAULT_REHEARSAL_MAX_AGE_DAYS;
  const list = (Array.isArray(records) ? records : []).map(normalizeRehearsal).filter((r) => r.at !== null);
  if (!list.length) return { state: 'none', at: null, ageDays: null, missing: REHEARSAL_STEPS.slice(), by: '' };

  const latest = list.reduce((a, b) => (b.at > a.at ? b : a));
  const complete = list.filter((r) => r.steps.length === REHEARSAL_STEPS.length);
  if (!complete.length) {
    return { state: 'incomplete', at: latest.at, ageDays: ageOf(latest.at, now), missing: missingSteps(latest), by: latest.by };
  }
  const best = complete.reduce((a, b) => (b.at > a.at ? b : a));
  const ageDays = ageOf(best.at, now);
  return { state: ageDays > limit ? 'stale' : 'ok', at: best.at, ageDays, missing: [], by: best.by };
}

function ageOf(atMs, now) {
  return Math.max(0, Math.floor((now - atMs) / DAY_MS));
}

// ---- (3) 복구 후 행수 대조 ----

// 원본/복구본 행수 맵을 표 단위로 대조한다. 복구 검증의 마지막 관문이며, 사람이 눈으로
// 두 화면을 비교하다 놓치는 것을 막는다. 값이 없는 쪽은 null 로 두고 ok=false(=확인 못 함)로
// 보고한다 — "모르는 것"을 "같다"로 처리하지 않는다.
// tolerance: 복구 시점 이후 신규 유입으로 생길 수 있는 허용 증가분(행). 감소는 허용하지 않는다.
export function compareRowCounts(before, after, tolerance = 0) {
  const a = before && typeof before === 'object' ? before : {};
  const b = after && typeof after === 'object' ? after : {};
  const tol = Number.isFinite(tolerance) && tolerance > 0 ? Math.floor(tolerance) : 0;
  const names = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
  return names.map((table) => {
    const x = Number.isFinite(a[table]) ? a[table] : null;
    const y = Number.isFinite(b[table]) ? b[table] : null;
    if (x === null || y === null) return { table, before: x, after: y, delta: null, ok: false };
    const delta = y - x;
    return { table, before: x, after: y, delta, ok: delta >= 0 && delta <= tol };
  });
}

// 대조 결과 중 문제가 있는 항목만.
export function rowCountProblems(rows) {
  return (Array.isArray(rows) ? rows : []).filter((r) => r && r.ok !== true);
}

export default rehearsalStatus;
