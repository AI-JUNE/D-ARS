// lib/paginate.js — 목록 API 공통 페이지네이션 · 서버 사이드 검색 (상용 하드닝)
//
// 목적: 목록 API가 limit 100/20/200 고정이라 데이터가 쌓이면 (1) 오래된 행이 화면에서 사라지고
//       (2) 전체를 내려받아 클라이언트에서 거르느라 응답이 무거워지던 문제 해결.
// 설계 원칙: **완전 하위호환** — 쿼리 파라미터가 없으면 기존과 똑같이 "배열"을 기존 기본 개수로 반환한다.
//   - limit  : 1..maxLimit 로 클램핑(기본값은 라우트별 기존 고정값)
//   - offset : 0 이상 정수
//   - q      : 서버 사이드 검색어(공백 트림, 최대 100자, ILIKE 부분일치)
//   - meta=1 : 배열 대신 { rows, total, limit, offset, hasMore } 객체로 반환(신규 클라이언트용)
//   - 어떤 경우에도 응답 헤더로 X-Total-Count / X-Has-More / X-Limit / X-Offset 을 제공 →
//     기존 배열 소비 클라이언트도 코드 변경 없이 총 개수를 알 수 있다.
// 개인정보·인증·과금 로직과 무관(읽기 전용 조회 파라미터만 다룸).

export const MAX_LIMIT = 500;
export const MAX_Q = 100;

function toInt(v) {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

// 목록 쿼리 파라미터 파싱. url 은 문자열(req.url) 또는 URL 객체.
export function parseListParams(url, { limit: defLimit = 100, maxLimit = MAX_LIMIT } = {}) {
  let sp;
  try {
    sp = (url instanceof URL ? url : new URL(String(url), 'http://local')).searchParams;
  } catch {
    sp = new URLSearchParams();
  }
  const rawLimit = toInt(sp.get('limit'));
  const rawOffset = toInt(sp.get('offset'));
  const limit = rawLimit == null ? defLimit : Math.min(Math.max(rawLimit, 1), maxLimit);
  const offset = rawOffset == null || rawOffset < 0 ? 0 : rawOffset;
  const rawQ = (sp.get('q') || '').trim();
  const q = rawQ ? rawQ.slice(0, MAX_Q) : null;
  const meta = sp.get('meta') === '1' || sp.get('meta') === 'true';
  return { limit, offset, q, meta };
}

// ILIKE 패턴(와일드카드 이스케이프). q 가 없으면 null.
export function likeParam(q) {
  if (!q) return null;
  const esc = String(q).replace(/[\\%_]/g, (c) => '\\' + c);
  return `%${esc}%`;
}

// 데모 폴백/메모리 배열용 검색 — 지정 필드에 대소문자 무시 부분일치.
export function filterRows(rows, q, fields) {
  if (!q) return rows;
  const needle = String(q).toLowerCase();
  return rows.filter((r) =>
    fields.some((f) => {
      const v = r?.[f];
      return v != null && String(v).toLowerCase().includes(needle);
    })
  );
}

// 데모 폴백/메모리 배열용 페이지 슬라이스.
export function sliceRows(rows, { limit, offset }) {
  return rows.slice(offset, offset + limit);
}

// 목록 응답 생성. 기본은 **배열**(하위호환), meta=1 이면 객체.
export function listResponse(rows, total, params, seconds = 60) {
  const { limit, offset, meta } = params;
  const hasMore = offset + rows.length < total;
  const headers = {
    'Cache-Control': `public, s-maxage=${seconds}, stale-while-revalidate=${seconds * 5}`,
    'X-Total-Count': String(total),
    'X-Has-More': hasMore ? '1' : '0',
    'X-Limit': String(limit),
    'X-Offset': String(offset),
  };
  const body = meta ? { rows, total, limit, offset, hasMore } : rows;
  return Response.json(body, { headers });
}
