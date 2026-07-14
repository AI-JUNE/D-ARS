// lib/statsRange.js — 통계 **기간 파라미터** 공통 유틸 (순수 함수 · React/DB 비의존 → 단위 테스트 가능)
//
// 배경: `/api/stats` 가 기간 개념 없이 daily_stats **전체**를 그대로 내려주고, 서비스별 집계도
//       로그 **전체**를 대상으로 했다. → 데이터가 쌓일수록 (1) 응답이 무한정 커지고,
//       (2) "최근 7일 완료율"처럼 **기간을 좁혀 보는 운영 분석이 불가능**했다(화면 문구는 "최근 7일"인데
//       실제로는 전 기간 합계라 숫자와 라벨이 어긋남 — 리포트 신뢰성 문제).
//
// 설계 원칙: **완전 하위호환** — 파라미터가 없으면 range = null 이고, 라우트는 기존 쿼리를 한 줄도 바꾸지 않는다.
//   - ?days=N            : 오늘 포함 최근 N일(1..MAX_DAYS 클램핑)
//   - ?from=YYYY-MM-DD&to=YYYY-MM-DD : 명시 구간(역전 시 자동 교정)
//   - 잘못된 값·미지정   : null → 전 기간(기존 동작)
//
// 보안: 날짜는 `YYYY-MM-DD` 형식 검증을 통과한 문자열만 반환하고, SQL 에는 항상 $n 바인딩으로 전달한다
//       (라우트가 문자열 보간을 하지 않는다). 개인정보(전화번호)는 집계·필터 대상이 아니다 → 저위험.

export const MAX_DAYS = 365;

// 화면 세그먼트 컨트롤과 API 파라미터의 단일 출처.
export const RANGE_PRESETS = [
  { key: '7d', days: 7, label: '7일' },
  { key: '30d', days: 30, label: '30일' },
  { key: '90d', days: 90, label: '90일' },
  { key: 'all', days: 0, label: '전체' },
];
export const DEFAULT_RANGE = 'all'; // 기존 동작(전 기간)과 동일 → 하위호환

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

// **쿼리 파라미터 전용** 엄격 검증: 문자열 전체가 정확히 YYYY-MM-DD 여야 한다.
// dayKey 는 앞 10자만 잘라 보므로("2026-06-01'; drop table ...;--" → "2026-06-01") 파라미터에는 쓰지 않는다.
// 사용자 입력이 SQL 에 들어가지는 않지만(전부 $n 바인딩), **쓰레기 입력을 조용히 유효 날짜로 바꾸지 않는 것**이
// 예측 가능한 동작이다 → 형식이 어긋나면 구간 미적용(기존 전 기간 조회).
export function strictDay(v) {
  const s = typeof v === 'string' ? v.trim() : '';
  if (!DAY_RE.test(s)) return null;
  const d = new Date(s + 'T00:00:00Z');
  if (Number.isNaN(d.getTime())) return null;
  // JS Date 는 2026-02-31 을 3월 3일로 **말아 넘긴다**(NaN 이 아님) → 왕복 비교로 존재하지 않는 날짜를 배제.
  return d.toISOString().slice(0, 10) === s ? s : null;
}

// 값이 무엇이든(Date · ISO 문자열 · 'YYYY-MM-DD') 날짜 키(YYYY-MM-DD)로 정규화. 실패 시 null.
// **행 데이터(ts·sent_at·day) 정규화 전용** — 쿼리 파라미터에는 strictDay 를 쓴다.
export function dayKey(v) {
  if (v == null) return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.toISOString().slice(0, 10);
  const s = String(v).slice(0, 10);
  return DAY_RE.test(s) ? s : null;
}

// 기준일에서 n일 이동한 날짜 키(UTC 기준 — 서버·클라이언트 시간대 차이로 구간이 흔들리지 않게).
export function shiftDay(key, n) {
  const base = dayKey(key);
  if (!base) return null;
  const d = new Date(base + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function toInt(v) {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

// ?days= / ?from=&to= 파싱. 없거나 잘못됐으면 null(= 전 기간, 기존 동작 유지).
// now: 테스트에서 오늘을 고정하기 위한 주입점(기본 현재 시각).
export function parseRangeParams(url, now = new Date()) {
  let sp;
  try {
    sp = (url instanceof URL ? url : new URL(String(url), 'http://local')).searchParams;
  } catch {
    return null;
  }
  const today = dayKey(now) || new Date().toISOString().slice(0, 10);

  const from = strictDay(sp.get('from'));
  const to = strictDay(sp.get('to'));
  if (from && to) {
    // 역전 입력은 오류 대신 교정(운영자가 날짜를 바꿔 넣어도 화면이 비지 않도록).
    const [a, b] = from <= to ? [from, to] : [to, from];
    return { from: a, to: b, days: 0 };
  }

  const raw = toInt(sp.get('days'));
  if (raw == null || raw <= 0) return null;
  const days = Math.min(raw, MAX_DAYS);
  return { from: shiftDay(today, -(days - 1)), to: today, days };
}

// 구간 포함 여부(날짜 키 문자열 비교 — ISO 날짜는 사전순 = 시간순).
export function inRange(v, range) {
  if (!range) return true;
  const k = dayKey(v);
  if (!k) return false;
  return k >= range.from && k <= range.to;
}

// 데모 폴백/메모리 배열용 기간 필터. field 는 날짜 필드명(daily=day, multimodal=ts, ums=sent_at).
export function filterByDate(rows, range, field = 'day') {
  const list = Array.isArray(rows) ? rows : [];
  if (!range) return list;
  return list.filter((r) => inRange(r?.[field], range));
}

// 데모 daily 폴백 전용: 데모 데이터는 **고정된 과거 날짜**라 오늘 기준 캘린더 필터를 걸면 0건이 된다
// (라이브 데모 화면이 통째로 비어 보이는 회귀). 실데이터가 없을 때만 쓰는 근사로, 마지막 N일을 취한다.
// DB 경로에는 절대 쓰지 않는다(캘린더 구간 그대로 조회).
export function tailDays(rows, range) {
  const list = Array.isArray(rows) ? rows : [];
  if (!range) return list;
  const hit = filterByDate(list, range, 'day');
  if (hit.length) return hit;
  const n = range.days > 0 ? range.days : list.length;
  return list.slice(-n);
}

// SQL 바인딩용 경계값. 구간 미지정이면 { from: null, to: null } → 라우트의
// `(${from}::text is null or ...)` 조건이 통과하므로 **기존 쿼리와 동일한 결과**(하위호환).
// to 는 **포함(inclusive)** 날짜다 — 라우트는 `ts < to::date + 1` 로 그날 24시까지 포함시킨다.
export function rangeBounds(range) {
  const from = dayKey(range?.from);
  const to = dayKey(range?.to);
  if (!from || !to) return { from: null, to: null };
  return { from, to };
}

// 화면(클라이언트)이 요청에 실을 파라미터. 'all'/미지정이면 빈 객체(= 기존 요청과 동일 URL).
export function rangeQuery(key) {
  const p = RANGE_PRESETS.find((r) => r.key === key);
  if (!p || !p.days) return {};
  return { days: p.days };
}

// 통계 요청 URL 조립(파라미터 없으면 base 그대로 → 기존 캐시 키 유지).
export function statsUrl(base, key) {
  const q = rangeQuery(key);
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) sp.set(k, String(v));
  const s = sp.toString();
  return s ? `${base}?${s}` : base;
}

// 화면 라벨: 서버가 돌려준 range(있으면)와 실제 행 수를 함께 보여 준다(라벨-숫자 불일치 방지).
export function rangeLabel(range, count = 0) {
  if (!range || !range.from) return count ? `전체 ${count}일 합계` : '';
  if (range.days > 0) return `최근 ${range.days}일 (${range.from} ~ ${range.to})`;
  return `${range.from} ~ ${range.to}`;
}

// 응답의 range 필드 방어적 정규화(형식이 어긋나도 화면이 깨지지 않게).
export function readRange(v) {
  const from = dayKey(v?.from);
  const to = dayKey(v?.to);
  if (!from || !to) return null;
  const days = Number.isFinite(v?.days) ? v.days : 0;
  return { from, to, days };
}

export default parseRangeParams;
