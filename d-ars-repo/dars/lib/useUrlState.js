'use client';
// lib/useUrlState.js — 화면 상태(검색어·필터) ↔ URL 쿼리 동기화 훅
//
//   const SPEC = { q: { qs:'q', def:'' }, status: { qs:'status', def:'전체', values:['전체','발송완료','대기','실패'] } };
//   const [uq, setUq] = useUrlState(SPEC);
//   <input value={uq.q} onChange={e => setUq({ q: e.target.value })} />
//   <button className={uq.status==='실패'?'on':''} onClick={() => setUq({ status:'실패' })}>실패</button>
//
// 동작(useRangeParam 과 동일한 계약 — 같은 페이지에서 나란히 써도 안전하다):
//  - **SSR 안전**: 서버 렌더와 첫 클라이언트 렌더는 항상 기본값 → 하이드레이션 불일치 없음.
//    마운트 직후 useEffect 에서 URL 을 읽어 반영한다(레이아웃 시프트 없음 — 입력값·세그 강조만 바뀐다).
//  - 값이 바뀌면 `history.replaceState` 로 주소만 갱신한다(**푸시가 아니라 치환** → 글자를 칠 때마다
//    뒤로가기 스택이 쌓이지 않는다). 데이터 재조회는 기존 state 흐름(useList 디바운스) 그대로.
//  - 뒤로/앞으로(popstate) 시 URL 을 다시 읽어 화면과 맞춘다.
//  - 스펙에 없는 쿼리(`range` 등)는 보존하므로 useRangeParam 과 **같은 주소를 서로 지우지 않는다**.
//  - next/navigation(useSearchParams)을 쓰지 않는다 — 정적 프리렌더 경로에 Suspense 경계를 강제해
//    렌더 구조가 바뀌기 때문(useRangeParam 과 동일한 이유).

import { useCallback, useEffect, useRef, useState } from 'react';
import { defaultState, parseUrlState, urlStateHref } from '@/lib/urlState';

export function useUrlState(spec) {
  const specRef = useRef(spec);
  specRef.current = spec;
  const specKey = JSON.stringify(spec || {});

  const [state, setState] = useState(() => defaultState(spec));

  useEffect(() => {
    const sync = () => setState(parseUrlState(window.location.search, specRef.current));
    sync();                                    // 최초 진입·새로고침·공유 링크 → URL 조건 복원
    window.addEventListener('popstate', sync); // 뒤로/앞으로
    return () => window.removeEventListener('popstate', sync);
  }, [specKey]);

  // patch: 바꿀 키만 넘긴다({ q: '...' }) → 나머지 조건은 유지된다.
  const set = useCallback((patch) => {
    setState((prev) => {
      const next = { ...prev, ...(patch || {}) };
      if (typeof window !== 'undefined') {
        try {
          window.history.replaceState(window.history.state, '', urlStateHref(window.location, next, specRef.current));
        } catch {
          /* 히스토리 접근 실패(샌드박스 iframe 등)는 무시 — 화면 상태는 이미 갱신됐다 */
        }
      }
      return next;
    });
  }, []);

  return [state, set];
}

export default useUrlState;
