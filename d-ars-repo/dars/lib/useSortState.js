'use client';
// lib/useSortState.js — 표 정렬 상태 ↔ URL 쿼리(?sort=&dir=) 동기화 훅
//
//   const [sort, setSort] = useSortState(DOC_SORTS);   // 기존 useState(null) 자리를 그대로 대체
//   <SortTh sort={sort} onSort={setSort} k="req">요청</SortTh>
//
// 계약(useRangeParam·useUrlState 와 동일 — 같은 페이지에서 나란히 써도 서로의 파라미터를 지우지 않는다):
//  - **SSR 안전**: 서버 렌더와 첫 클라이언트 렌더는 항상 null(기본 정렬) → 하이드레이션 불일치 없음.
//    마운트 직후 useEffect 에서 URL 을 읽어 반영한다(표 헤더의 ▲▼ 표시만 바뀐다 — 레이아웃 시프트 없음).
//  - `history.replaceState` 로 주소만 갱신(푸시 아님) → 정렬을 3번 토글해도 뒤로가기 스택이 오염되지 않는다.
//  - 뒤로/앞으로(popstate) 시 URL 을 다시 읽어 화면과 맞춘다.
//  - **SortTh 호환**: `onSort((s) => nextSort(s, k))` 처럼 **함수형 갱신**으로 호출되므로 그대로 지원한다.
//  - 반환하는 sort 는 항상 스펙(화이트리스트)을 통과한 값이거나 null → 그대로 `sortQuery(sort)` 에 넘기면 된다.
//  - next/navigation(useSearchParams)을 쓰지 않는다 — 정적 프리렌더 경로에 Suspense 경계를 강제하기 때문.

import { useCallback, useEffect, useRef, useState } from 'react';
import { coerceSort, parseSortState, sortStateHref } from '@/lib/sortUrl';

export function useSortState(spec) {
  const specRef = useRef(spec);
  specRef.current = spec;
  const specKey = Object.keys(spec || {}).join(','); // 스펙은 모듈 상수라 사실상 불변 — 키 목록으로 안정된 의존성

  const [sort, setSort] = useState(null); // 첫 렌더는 항상 기본 정렬(SSR 안전)

  useEffect(() => {
    const sync = () => setSort(parseSortState(window.location.search, specRef.current));
    sync();                                    // 최초 진입·새로고침·공유 링크 → URL 의 정렬 복원
    window.addEventListener('popstate', sync); // 뒤로/앞으로
    return () => window.removeEventListener('popstate', sync);
  }, [specKey]);

  // next: { key, dir } · null · 또는 (prev) => next  (SortTh 는 함수형으로 호출한다)
  const set = useCallback((next) => {
    setSort((prev) => {
      const raw = typeof next === 'function' ? next(prev) : next;
      const norm = coerceSort(raw, specRef.current); // 화이트리스트 밖·해제 → null(기본 정렬)
      if (typeof window !== 'undefined') {
        try {
          window.history.replaceState(window.history.state, '', sortStateHref(window.location, norm, specRef.current));
        } catch {
          /* 히스토리 접근 실패(샌드박스 iframe 등)는 무시 — 화면 상태는 이미 갱신됐다 */
        }
      }
      return norm;
    });
  }, []);

  return [sort, set];
}

export default useSortState;
