// lib/listUrl.js — 목록 화면(서버 검색·페이징) 순수 유틸 (React 비의존 → 단위 테스트 가능)
//
// 배경: 목록 API(`lib/paginate.js`)가 limit/offset/q/meta 를 지원하게 되었으나
//       포털 화면은 여전히 전체를 받아 클라이언트에서 거르고 있었다(데이터가 쌓이면 오래된 행이 사라짐).
// 여기서는 화면이 쓸 (1) 요청 URL 조립, (2) 응답(배열/메타객체) 정규화, (3) 페이지 누적 병합을 담당한다.
// 개인정보·인증·과금 로직과 무관(조회 파라미터만 다룸).

export const PAGE_SIZE = 50;      // "더 보기" 1회 로드 건수
export const SEARCH_DEBOUNCE = 300; // 입력 디바운스(ms) — 타이핑마다 서버를 두드리지 않는다.

// 목록 요청 URL 조립. meta=1 로 { rows,total,limit,offset,hasMore } 를 받는다.
// params: 화면별 추가 파라미터(예: ums status, history channel). 빈 값·'전체'는 생략.
export function buildListUrl(base, { q = '', limit = PAGE_SIZE, offset = 0, params = {} } = {}) {
  const sp = new URLSearchParams();
  sp.set('limit', String(limit));
  sp.set('offset', String(offset));
  const kw = String(q || '').trim();
  if (kw) sp.set('q', kw);
  for (const [k, v] of Object.entries(params || {})) {
    if (v == null || v === '' || v === '전체') continue;
    sp.set(k, String(v));
  }
  sp.set('meta', '1');
  return `${base}?${sp.toString()}`;
}

// 응답 정규화: meta 객체와 (하위호환) 배열 응답을 모두 받아들인다.
export function readPage(data, { limit = PAGE_SIZE, offset = 0 } = {}) {
  if (Array.isArray(data)) {
    // 구형(배열) 응답: 총계를 알 수 없으므로 받은 개수로 추정한다.
    const full = data.length >= limit;
    return { rows: data, total: offset + data.length, hasMore: full };
  }
  if (data && Array.isArray(data.rows)) {
    const rows = data.rows;
    const total = Number.isFinite(data.total) ? data.total : offset + rows.length;
    const hasMore = typeof data.hasMore === 'boolean' ? data.hasMore : offset + rows.length < total;
    return { rows, total, hasMore };
  }
  return { rows: [], total: 0, hasMore: false };
}

// 페이지 누적: offset 0(첫 페이지·검색어 변경)은 교체, 그 외는 뒤에 이어붙인다.
// 같은 행이 두 번 오면(삽입으로 인한 오프셋 밀림) id 기준으로 중복 제거한다.
export function mergePage(prev, next, offset) {
  if (!offset) return next.slice();
  const seen = new Set(prev.map((r) => r && r.id).filter((v) => v != null));
  const add = next.filter((r) => !(r && r.id != null && seen.has(r.id)));
  return prev.concat(add);
}
