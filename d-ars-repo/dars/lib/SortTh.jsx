'use client';
// lib/SortTh.jsx — 정렬 가능한 표 헤더(접근성 하드닝, 2026-07-13)
//
// 배경: docs·ums·sessions 의 정렬 헤더가 `<th className="sort" onClick=...>` 뿐이라
//   (1) 키보드만 쓰는 사용자는 정렬을 아예 실행할 수 없고(포커스 불가·Enter 불가),
//   (2) 스크린리더가 현재 정렬 상태(오름/내림/해제)를 읽어주지 못했다(aria-sort 없음).
//   상용 서비스 접근성(및 공공/기업 납품 기준)에서 흔히 지적되는 항목이라 공통 컴포넌트로 해소한다.
//
// 동작(기존 UX 100% 보존): 클릭/Enter/Space → 오름 ▲ → 내림 ▼ → 해제, 화살표 표시 동일.
// 레이아웃 무영향(기존 th.sort 클래스·마크업 유지) → 모바일 무붕괴·무오버랩.
//
// 사용 예)  <SortTh sort={sort} onSort={setSort} k="biz">업무</SortTh>

import { nextSort, sortArrow, ariaSort } from '@/lib/ui';

export default function SortTh({ sort, onSort, k, children, style }) {
  const activate = () => onSort((s) => nextSort(s, k));
  const onKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
      e.preventDefault();          // Space 로 페이지가 스크롤되지 않도록
      activate();
    }
  };
  return (
    <th
      className="sort"
      style={style}
      aria-sort={ariaSort(sort, k)}
      tabIndex={0}
      role="columnheader"
      onClick={activate}
      onKeyDown={onKeyDown}
    >
      {children}{sortArrow(sort, k)}
    </th>
  );
}
