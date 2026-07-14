'use client';
// lib/useRangeParam.js — 기간 선택 상태 ↔ URL 쿼리(?range=) 동기화 훅
//
//   const [range, setRange] = useRangeParam();   // useState(DEFAULT_RANGE) 자리에 그대로 대체
//   <RangeSeg value={range} onChange={setRange} />
//
// 동작
//  - **SSR 안전**: 서버 렌더와 첫 클라이언트 렌더는 항상 기본값('전체')이라 하이드레이션 불일치가 없다.
//    마운트 직후 useEffect 에서 URL 을 읽어 반영한다(한 번의 상태 갱신 — 레이아웃 시프트 없음: 세그 버튼 강조만 이동).
//  - 선택을 바꾸면 `history.replaceState` 로 주소만 갱신한다(**푸시가 아니라 치환** → '뒤로가기'가 기간 클릭
//    횟수만큼 쌓이지 않는다). 화면 재조회는 기존 state 흐름 그대로라 네트워크 동작 변화 없음.
//  - 뒤로/앞으로(popstate)로 이동하면 URL 의 구간을 다시 읽어 화면과 맞춘다.
//  - next/navigation(useSearchParams)을 쓰지 않는다 — 정적 프리렌더 경로에서 Suspense 경계를 강제해
//    빌드/렌더 동작을 바꾸기 때문. 여기서는 window 만 읽으므로 라우팅 구조에 영향이 없다.

import { useCallback, useEffect, useState } from 'react';
import { DEFAULT_RANGE } from '@/lib/statsRange';
import { isRangeKey, parseRangeKey, rangeHref } from '@/lib/rangeParam';

export function useRangeParam(fallback = DEFAULT_RANGE) {
  const [range, setRangeState] = useState(fallback);

  useEffect(() => {
    const sync = () => setRangeState(parseRangeKey(window.location.search, fallback));
    sync();                                   // 최초 진입·새로고침·공유 링크 → URL 구간 복원
    window.addEventListener('popstate', sync); // 뒤로/앞으로
    return () => window.removeEventListener('popstate', sync);
  }, [fallback]);

  const setRange = useCallback((key) => {
    const k = isRangeKey(key) ? key : fallback;
    setRangeState(k);
    if (typeof window === 'undefined') return;
    const href = rangeHref(window.location, k, fallback);
    try {
      window.history.replaceState(window.history.state, '', href);
    } catch {
      /* 히스토리 접근 실패(샌드박스 iframe 등)는 무시 — 화면 상태는 이미 갱신됐다 */
    }
  }, [fallback]);

  return [range, setRange];
}

export default useRangeParam;
