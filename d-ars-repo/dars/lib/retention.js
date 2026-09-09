// D-ARS 개인정보 보관/파기 공통 (순수 함수 · DB/런타임 비의존 · Node/Edge 겸용)
// 목적: 상용 서비스에서 요구되는 "개인정보 보관기간 경과분 파기(익명화)" 정책을
//       코드로 명시하고, 화면/내보내기에서 쓸 마스킹 유틸을 한곳에 모은다.
//
// 안전장치: 이 모듈은 **아무 것도 실행하지 않는다**. 파기 SQL 문자열을 만들어 반환할 뿐이며,
//   실제 실행은 scripts/retention-purge.mjs 가 DRY-RUN(미실행) 기본으로만 다룬다.
//   파기(비가역)는 운영자가 명시적으로 승인해야 한다.

// 보관기간 경과분은 행 삭제 대신 '식별 컬럼 익명화(NULL)'로 처리하여
// 통계(집계)는 보존하고 식별정보만 제거한다.
// call_id 는 교환기가 발급한 통화 식별자로, 통신사 원장과 대조하면 개인이 재식별될 수 있어
// 전화번호와 같은 기준으로 파기한다(장애 추적 목적의 보존은 보관기간 안에서만 유효).
export const PII_TABLES = [
  { table: 'visual_sessions', dateCol: 'started_at', piiCol: 'phone',   label: '상담 세션(전화번호)' },
  { table: 'visual_sessions', dateCol: 'started_at', piiCol: 'call_id', label: '상담 세션(통화 식별자)' },
  { table: 'ums_log',         dateCol: 'sent_at',    piiCol: 'phone',   label: 'UMS 발송로그(전화번호)' },
];

// 기본 보관기간(일). 운영자는 RETENTION_DAYS 환경변수로 조정한다.
export const DEFAULT_RETENTION_DAYS = 180;
// 최소 보관기간 하한(오설정으로 최근 데이터가 지워지는 사고 방지). 0/음수/과소값을 막는다.
export const MIN_RETENTION_DAYS = 30;

// RETENTION_DAYS 파싱: 정수·하한(MIN) 보장. 값이 없거나 이상하면 안전 기본값.
export function retentionDays(env = (typeof process !== 'undefined' ? process.env : {})) {
  const raw = env && env.RETENTION_DAYS;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < MIN_RETENTION_DAYS) return DEFAULT_RETENTION_DAYS;
  return n;
}

// 파기 실행 스위치: 명시적으로 RETENTION_ENABLE=1 을 켠 경우에만 true(그 외 항상 false).
export function retentionEnabled(env = (typeof process !== 'undefined' ? process.env : {})) {
  return !!env && env.RETENTION_ENABLE === '1';
}

// 보관 경계 시각(ISO). 이보다 오래된 데이터가 파기 대상.
export function cutoffISO(now = new Date(), days = DEFAULT_RETENTION_DAYS) {
  const base = now instanceof Date ? now.getTime() : new Date(now).getTime();
  const t = base - days * 24 * 3600 * 1000;
  return new Date(t).toISOString();
}

// 전화번호 마스킹: 가운데 자리를 가린다. 화면/내보내기에서 식별 위험을 낮추기 위한 표시용.
//  '010-1234-5678' → '010-****-5678',  '01012345678' → '010****5678'
//  숫자만 7자리 미만/빈 값/비문자열 → 원본을 안전하게 반환(형식을 강제하지 않음).
export function maskPhone(phone) {
  if (phone == null) return phone;
  const s = String(phone);
  const digits = s.replace(/\D/g, '');
  if (digits.length < 7) return s; // 전화번호로 보기 어려우면 손대지 않음
  const head = digits.slice(0, 3);
  const tail = digits.slice(-4);
  const midLen = digits.length - head.length - tail.length;
  const masked = head + '*'.repeat(Math.max(0, midLen)) + tail;
  // 구분자(-) 유무를 원본 형식에 맞춰 복원
  if (s.includes('-')) {
    return midLen > 0 ? `${head}-${'*'.repeat(midLen)}-${tail}` : `${head}-${tail}`;
  }
  return masked;
}

// 파기(익명화) 실행문 생성. 각 PII 테이블에 대해
//   - count: 대상 행 수 미리보기(DRY-RUN)
//   - purge: 경과분 전화번호 익명화(UPDATE ... set phone = NULL)
// 를 파라미터화된 SQL 로 반환한다. **문자열만 생성**하며 실행하지 않는다.
export function purgePlan(cutoff, tables = PII_TABLES) {
  return tables.map(({ table, dateCol, piiCol, label }) => ({
    table,
    label,
    params: [cutoff],
    count: `select count(*)::int as n from ${table} where ${dateCol} < $1 and ${piiCol} is not null`,
    purge: `update ${table} set ${piiCol} = null where ${dateCol} < $1 and ${piiCol} is not null`,
  }));
}
