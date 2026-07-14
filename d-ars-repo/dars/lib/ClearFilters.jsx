'use client';
// lib/ClearFilters.jsx — **조건 지우기**(URL 조회 조건 초기화) 버튼
//
//   <ClearFilters />            ← 목록 화면 툴바(저장된 뷰 줄)에 함께 배치된다
//
// 무엇을 하나: 현재 주소의 **쿼리 전체를 제거**한다(기간·검색어·필터·뷰·정렬 — 17~19회차로 모두 URL 에 있다).
// 어떻게 되돌리나: `history.pushState` 로 조건 없는 주소를 넣고 **popstate 를 직접 발생**시킨다
//   → useRangeParam·useUrlState·useSortState 세 훅이 모두 popstate 를 듣고 있으므로
//     기간·검색어·필터·뷰·정렬이 **한 번에** 초기값으로 돌아간다(화면별 개별 배선이 필요 없다).
//   pushState(치환 아님)라서 **뒤로가기를 누르면 방금 지운 조건으로 정확히 복귀**한다(실수로 눌러도 안전).
//
// 조건이 하나도 없으면 **비활성**(클릭해도 히스토리를 쌓지 않는다).
// SSR 안전: 서버·첫 클라이언트 렌더의 쿼리 스냅샷은 '' → 비활성 상태로 동일하게 렌더(하이드레이션 불일치 없음).
// 모바일: 한 줄에 들어가지 않으면 저장된 뷰 칩과 함께 줄바꿈(flex-wrap) → 320px 무붕괴·무오버랩. 인쇄 시 숨김.

import { useCallback } from 'react';
import { clearHref, countConditions } from '@/lib/clearParams';
import useQueryString from '@/lib/useQueryString';

export default function ClearFilters({ keep, label = '조건 지우기', style }) {
  const cur = useQueryString();
  const n = countConditions(cur, keep);

  const clear = useCallback(() => {
    if (countConditions(window.location.search, keep) === 0) return; // 지울 것이 없으면 히스토리 오염 금지
    try {
      window.history.pushState(window.history.state, '', clearHref(window.location.pathname, window.location.search, keep));
      window.dispatchEvent(new Event('popstate'));
    } catch { /* 히스토리 접근 실패(iframe 등) → 아무 일도 일어나지 않는다(화면 유지) */ }
  }, [keep]);

  return (
    <button
      type="button"
      className="btn sm noprint"
      disabled={n === 0}
      aria-disabled={n === 0}
      title={n === 0 ? '적용된 조회 조건이 없습니다' : '기간·검색어·필터·정렬 조건을 모두 지우고 기본 화면으로 되돌립니다(뒤로가기로 복구 가능)'}
      onClick={clear}
      style={{ flex: '0 0 auto', ...style }}
    >
      ✕ {label}{n > 0 ? ` (${n})` : ''}
    </button>
  );
}
