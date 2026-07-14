// lib/sortUrl.js — 표 **정렬 상태(sort·dir)를 URL 쿼리에 보존**하는 순수 유틸
// (React/DOM 비의존 → 단위 테스트 가능. 훅은 lib/useSortState.js).
//
// 배경: 17·18회차에서 **기간(?range=)** 과 **검색어·필터·뷰(?q=·?status=·?view= …)** 는 URL 에 보존했지만
//       **정렬만 여전히 컴포넌트 state** 였다(각 화면의 `useState(null)`).
//       → 링크를 공유하면 상대는 같은 검색·필터·기간을 보지만 **순서는 다르게** 본다.
//         "완료율 낮은 순 1~3위 보세요"라고 보내면 상대 화면엔 기본(최신순) 정렬이 뜬다.
//         새로고침하면 정렬이 풀리고, 뒤로가기로 직전 정렬로 돌아갈 수도 없다.
//       이제 정렬까지 URL 에 남으면 **주소 하나 = 화면 완전 재현**(기간+검색+필터+뷰+정렬)이 성립한다.
//
// 스펙(spec) = 라우트가 이미 쓰고 있는 **정렬 화이트리스트**(lib/listSorts.js 의 DOC_SORTS·UMS_SORTS …).
//   화면과 서버가 **같은 스펙 객체**를 참조하므로 URL 에서 읽은 키가 서버 화이트리스트를 통과할 것이 보장된다.
//
// 설계 원칙(rangeParam·urlState 와 동일한 계약):
//   - **정렬이 없으면(기본 정렬) 쿼리에서 제거** → 주소는 기존과 100% 동일(하위호환·깔끔한 공유 링크).
//   - 화이트리스트 밖의 키(`?sort=drop%20table`)는 조용히 **정렬 없음**으로 폴백 → 화면이 깨지지 않는다.
//     (값은 어차피 서버 `parseSortParams` 의 화이트리스트를 다시 통과한다 — SQL 에 직접 실리지 않는다.)
//   - dir 은 `desc` 만 인정하고 그 외에는 모두 `asc`(서버 `parseSortParams` 와 **완전히 같은 규칙**).
//   - 스펙에 없는 다른 쿼리(`q`·`range`·`view` 등)는 **그대로 보존** → useUrlState·useRangeParam 과 공존한다.

export const SORT_QS = 'sort';
export const DIR_QS = 'dir';

// search('?sort=req&dir=desc') · URLSearchParams · 객체 어느 쪽이든 받아 URLSearchParams 로 정규화.
function toParams(search) {
  try {
    if (search instanceof URLSearchParams) return new URLSearchParams(search.toString());
    if (typeof search === 'string') return new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
    if (search && typeof search === 'object') {
      const sp = new URLSearchParams();
      for (const [k, v] of Object.entries(search)) if (v != null) sp.set(k, String(v));
      return sp;
    }
  } catch {
    /* 형식이 어긋나면 빈 파라미터로 폴백 */
  }
  return new URLSearchParams();
}

const hasKey = (spec, key) => !!key && Object.prototype.hasOwnProperty.call(spec || {}, key);

// 임의의 값 → 스펙을 통과한 정렬 상태 { key, dir } 또는 null(= 기본 정렬).
// 화면 코드(nextSort)와 URL 양쪽에서 들어오는 값을 같은 규칙으로 정규화한다.
export function coerceSort(sort, spec) {
  const key = typeof sort?.key === 'string' ? sort.key.trim() : '';
  if (!hasKey(spec, key)) return null;
  return { key, dir: sort?.dir === 'desc' ? 'desc' : 'asc' };
}

// URL → 정렬 상태(없거나 화이트리스트 밖이면 null).
export function parseSortState(search, spec) {
  const sp = toParams(search);
  return coerceSort({ key: sp.get(SORT_QS) || '', dir: (sp.get(DIR_QS) || '').trim().toLowerCase() }, spec);
}

// 정렬 상태 → 새 쿼리 문자열(선행 '?' 없음). 정렬이 없으면 sort·dir 키를 제거, 스펙 밖 파라미터는 보존.
export function withSortState(search, sort, spec) {
  const sp = toParams(search);
  const s = coerceSort(sort, spec);
  if (!s) { sp.delete(SORT_QS); sp.delete(DIR_QS); }
  else { sp.set(SORT_QS, s.key); sp.set(DIR_QS, s.dir); }
  return sp.toString();
}

// 주소창에 넣을 전체 경로(pathname + 쿼리 + 해시) — 훅이 history.replaceState 에 그대로 넘긴다.
export function sortStateHref({ pathname = '/', search = '', hash = '' } = {}, sort, spec) {
  const qs = withSortState(search, sort, spec);
  return `${pathname}${qs ? `?${qs}` : ''}${hash || ''}`;
}

export default parseSortState;
