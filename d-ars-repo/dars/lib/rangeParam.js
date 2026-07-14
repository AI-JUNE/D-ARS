// lib/rangeParam.js — 기간 선택 상태를 **URL 쿼리(?range=)에 보존**하는 순수 유틸
// (React/DOM 비의존 → 단위 테스트 가능. 훅은 lib/useRangeParam.js).
//
// 배경: 기간 선택(7·30·90일/전체)이 dashboard·stats·report·history·ums 5개 화면에 있지만
//       **컴포넌트 state 에만** 있었다 → (1) 새로고침하면 '전체'로 되돌아가고,
//       (2) "최근 7일 이탈률 좀 보세요"라며 URL 을 공유해도 상대는 다른 구간을 본다(감사·정산 협업 문제),
//       (3) 브라우저 뒤로가기로 직전 구간으로 돌아갈 수 없다.
//
// 설계: 화면이 쓰는 값은 **프리셋 키**('7d'·'30d'·'90d'·'all') 하나뿐이므로 URL 에도 키만 싣는다
//       (`?range=7d`). API 파라미터(`days=7`)는 기존대로 rangeQuery/statsUrl 이 만든다 → API 계약 불변.
//   - 기본값('all')은 **쿼리에서 제거**한다 → 기존 URL(`/ums`)과 100% 동일한 주소를 유지(하위호환·깔끔한 공유 링크).
//   - 알 수 없는 값(`?range=drop%20table`)은 조용히 기본값으로 폴백 → 화면이 깨지지 않는다.
//   - 다른 쿼리 파라미터(향후 검색어·필터 보존 등)는 **그대로 보존**한다.

// 순수 모듈은 relative import 를 쓴다(node:test 러너가 alias 없이 그대로 임포트할 수 있게 — 기존 관례).
import { RANGE_PRESETS, DEFAULT_RANGE } from './statsRange.js';

export const RANGE_QS = 'range';

// 유효한 프리셋 키인가?
export function isRangeKey(v) {
  return typeof v === 'string' && RANGE_PRESETS.some((p) => p.key === v);
}

// location.search('?range=7d&x=1') · URLSearchParams · 객체 어느 쪽이든 받아 프리셋 키를 뽑는다.
// 없거나 형식이 어긋나면 fallback(기본 '전체') → 예측 가능한 폴백.
export function parseRangeKey(search, fallback = DEFAULT_RANGE) {
  let raw = null;
  try {
    if (search instanceof URLSearchParams) raw = search.get(RANGE_QS);
    else if (typeof search === 'string') raw = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search).get(RANGE_QS);
    else if (search && typeof search === 'object') raw = search[RANGE_QS] ?? null;
  } catch {
    raw = null;
  }
  const key = typeof raw === 'string' ? raw.trim() : '';
  return isRangeKey(key) ? key : fallback;
}

// 현재 search 문자열에 range 키를 반영한 **새 쿼리 문자열**(선행 '?' 없음)을 만든다.
// 기본값이면 파라미터를 지운다 → 주소가 원래대로 깨끗해진다.
export function withRangeParam(search, key, fallback = DEFAULT_RANGE) {
  let sp;
  try {
    const s = typeof search === 'string' ? (search.startsWith('?') ? search.slice(1) : search) : '';
    sp = new URLSearchParams(s);
  } catch {
    sp = new URLSearchParams();
  }
  const k = isRangeKey(key) ? key : fallback;
  if (k === fallback) sp.delete(RANGE_QS);
  else sp.set(RANGE_QS, k);
  return sp.toString();
}

// 주소창에 넣을 전체 경로(pathname + 쿼리 + 해시). 훅이 history.replaceState 에 그대로 넘긴다.
export function rangeHref({ pathname = '/', search = '', hash = '' } = {}, key, fallback = DEFAULT_RANGE) {
  const qs = withRangeParam(search, key, fallback);
  return `${pathname}${qs ? `?${qs}` : ''}${hash || ''}`;
}

export default parseRangeKey;
