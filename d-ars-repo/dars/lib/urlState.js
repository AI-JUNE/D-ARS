// lib/urlState.js — 화면 상태(검색어·필터)를 **URL 쿼리에 보존**하는 순수 유틸
// (React/DOM 비의존 → 단위 테스트 가능. 훅은 lib/useUrlState.js).
//
// 배경: 17회차에서 **기간(?range=)** 만 URL 에 보존했다(lib/rangeParam.js). 그러나 목록 화면의
//       **검색어·필터(채널·상태)** 는 여전히 컴포넌트 state 에만 있어
//       (1) 새로고침하면 조건이 날아가고, (2) "'실패' 상태 문자 발송만 보세요"라며 링크를 공유해도
//       상대는 '전체'를 보고, (3) 뒤로가기로 직전 조건에 돌아갈 수 없다(감사·정산 협업 문제).
//       → rangeParam 의 설계를 **임의 키로 일반화**한 것이 이 모듈이다.
//
// 스펙(spec) 형태 — 화면이 선언한다:
//   { q:       { qs: 'q',  def: '' },                       // 자유 입력(트림·길이 제한)
//     channel: { qs: 'ch', def: '전체', values: [...] } }   // 화이트리스트(열거) 값
//
// 설계 원칙(rangeParam 과 동일):
//   - **기본값이면 쿼리에서 제거** → 조건이 없을 때 주소는 기존과 100% 동일(하위호환·깔끔한 공유 링크).
//   - 알 수 없는 값(`?ch=drop%20table`)은 조용히 기본값으로 폴백 → 화면이 깨지지 않는다.
//     (값은 어차피 서버 API 의 화이트리스트/바인딩을 다시 통과한다 — SQL 에 직접 실리지 않는다.)
//   - 스펙에 없는 다른 쿼리 파라미터(`range` 등)는 **그대로 보존** → rangeParam 과 나란히 쓸 수 있다.
//   - 검색어는 서버 API 와 같은 한도(100자)로 자른다(lib/paginate 의 q 정책과 일치).

export const MAX_Q = 100;

// search('?q=a&ch=b') · URLSearchParams · 객체 어느 쪽이든 받아 URLSearchParams 로 정규화.
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

// 스펙 1개 항목의 기본값
function defOf(f) {
  return f && f.def !== undefined ? f.def : '';
}

// 원시 문자열 → 스펙에 맞는 안전한 값(화이트리스트 검증·트림·길이 제한).
export function coerceValue(raw, field) {
  const def = defOf(field);
  if (typeof raw !== 'string') return def;
  const v = raw.trim();
  if (!v) return def;
  if (Array.isArray(field?.values)) return field.values.includes(v) ? v : def; // 열거값: 화이트리스트 밖이면 기본값
  return v.slice(0, field?.max || MAX_Q);                                      // 자유 입력: 길이 제한
}

// 기본값 객체(SSR 첫 렌더에 쓰인다 → 하이드레이션 불일치 없음).
export function defaultState(spec) {
  const out = {};
  for (const [k, f] of Object.entries(spec || {})) out[k] = defOf(f);
  return out;
}

// URL → 상태 객체.
export function parseUrlState(search, spec) {
  const sp = toParams(search);
  const out = {};
  for (const [k, f] of Object.entries(spec || {})) out[k] = coerceValue(sp.get(f?.qs || k), f);
  return out;
}

// 상태 객체 → 새 쿼리 문자열(선행 '?' 없음). 기본값 키는 제거, 스펙 밖 파라미터는 보존.
export function withUrlState(search, state, spec) {
  const sp = toParams(search);
  for (const [k, f] of Object.entries(spec || {})) {
    const qs = f?.qs || k;
    const v = coerceValue(typeof state?.[k] === 'string' ? state[k] : String(state?.[k] ?? ''), f);
    if (v === defOf(f) || v === '') sp.delete(qs);
    else sp.set(qs, v);
  }
  return sp.toString();
}

// 주소창에 넣을 전체 경로(pathname + 쿼리 + 해시) — 훅이 history.replaceState 에 그대로 넘긴다.
export function urlStateHref({ pathname = '/', search = '', hash = '' } = {}, state, spec) {
  const qs = withUrlState(search, state, spec);
  return `${pathname}${qs ? `?${qs}` : ''}${hash || ''}`;
}

export default parseUrlState;
