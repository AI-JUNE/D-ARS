// lib/clearParams.js — **조회 조건 초기화(조건 지우기)** 순수 유틸
// (React/DOM 비의존 → 단위 테스트 가능. UI 는 lib/ClearFilters.jsx)
//
// 배경: 17~19회차로 기간(`range`)·검색어(`q`)·필터(`ch`·`status`)·뷰(`view`)·정렬(`sort`·`dir`)이
//       전부 URL 쿼리에 보존된다 → **주소 하나 = 화면 완전 재현**. 그런데 조건이 URL 에 쌓이면서
//       반대 방향의 조작(**"전부 지우고 처음 상태로"**)이 사라졌다:
//       사용자는 기간 세그를 '전체'로, 상태 세그를 '전체'로, 검색창을 비우고, 정렬 헤더를 두 번 눌러
//       해제하는 식으로 **조건 개수만큼 클릭**해야 초기 화면으로 돌아갈 수 있었다(정렬 해제는 3단계 토글의
//       마지막 단계라 특히 발견하기 어렵다). → 한 번의 클릭으로 **쿼리 전체를 제거**한다.
//
// 설계:
//   - 지우는 단위는 **쿼리 문자열 그 자체**(선행 '?' 없음) — 화면별 상태 모델을 몰라도 되고,
//     새 조건 파라미터가 추가돼도 이 모듈은 바뀌지 않는다(URL 이 단일 진실 공급원이므로).
//   - `keep` 로 **보존할 키**를 지정할 수 있다(예: 조건이 아닌 추적/딥링크 파라미터). 기본은 전부 제거.
//   - 조건이 하나도 없으면 **아무것도 하지 않는다**(버튼 비활성) → 히스토리 스택 오염 방지.
//   - 지운 뒤 주소는 파라미터가 없는 순수 경로 → 조건 없는 기본 화면과 **100% 동일한 주소**.
//   - 개인정보(전화번호)는 애초에 URL 쿼리에 실리지 않는다(PII 정책 유지) → 저장·삭제 대상 자체가 없다.

// search('?q=a&ch=b') · URLSearchParams · 객체 어느 쪽이든 받아 URLSearchParams 로 정규화.
// (형식이 어긋나면 빈 파라미터로 폴백 → 화면이 절대 깨지지 않는다.)
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
    /* noop */
  }
  return new URLSearchParams();
}

const keepSet = (keep) => new Set((Array.isArray(keep) ? keep : []).map((k) => String(k)));

// 지워질 조건 항목들 [key, value][] — `keep` 에 없는 모든 파라미터.
export function conditionEntries(search, keep) {
  const skip = keepSet(keep);
  const out = [];
  for (const [k, v] of toParams(search).entries()) if (!skip.has(k)) out.push([k, v]);
  return out;
}

// 지울 수 있는 조건 개수(버튼 배지에 표시). 같은 키가 여러 값이면 각각 1개로 센다.
export function countConditions(search, keep) {
  return conditionEntries(search, keep).length;
}

export function hasConditions(search, keep) {
  return countConditions(search, keep) > 0;
}

// 조건을 제거한 새 쿼리 문자열(선행 '?' 없음). `keep` 키는 **원래 순서대로** 보존한다.
export function clearQuery(search, keep) {
  const skip = keepSet(keep);
  const sp = new URLSearchParams();
  for (const [k, v] of toParams(search).entries()) if (skip.has(k)) sp.append(k, v);
  return sp.toString();
}

// 주소창에 넣을 경로 — 남길 파라미터가 없으면 **순수 경로**(조건 없는 기본 화면과 동일한 주소).
export function clearHref(pathname, search, keep) {
  const p = String(pathname || '/') || '/';
  const qs = clearQuery(search, keep);
  return qs ? `${p}?${qs}` : p;
}

export default clearQuery;
