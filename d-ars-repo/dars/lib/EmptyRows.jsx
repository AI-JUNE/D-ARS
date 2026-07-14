'use client';
// lib/EmptyRows.jsx — **빈 결과 안내**(0건일 때 다음 행동을 즉시 제시)
//
//   <EmptyRow colSpan={7} loading={L.loading} error={L.error} />   ← 표 <tbody> 안
//   <EmptyBox loading={L.loading} error={L.error} />               ← 카드/보드 안
//
// 배경: 20회차의 **✕ 조건 지우기**는 툴바(화면 위쪽)에만 있다. 그런데 사용자가 조건을 좁혀
//       **0건**이 되는 순간 시선은 표 한가운데(빈 자리)에 있고, 화면을 다시 위로 훑어야
//       탈출구를 찾을 수 있었다. 게다가 `/docs`·`/ums` 는 **빈 안내 자체가 없어** 표가 그냥
//       비어 있었다(로딩 중인지, 조건이 과한지, 장애인지 구분되지 않는다).
//       → 0건 자리에 **상태에 맞는 문구 + 인라인 ✕ 조건 지우기**를 함께 놓는다.
//
// 상태별 문구: 로딩('불러오는 중…') · 오류('데이터를 불러오지 못했습니다') ·
//              조건 있음('조건에 맞는 결과가 없습니다' + 조건 지우기 버튼) ·
//              조건 없음(데이터 자체가 없음 → 버튼을 띄우지 않는다, 지울 것이 없으므로).
// 버튼은 공통 `ClearFilters` 를 그대로 쓴다(같은 동작·같은 배지·뒤로가기로 복구 가능).
// SSR 안전: 조건 수는 useQueryString(SSR 스냅샷 '')으로 읽는다 → 하이드레이션 불일치 없음.
// 모바일: flex-wrap·중앙 정렬 → 320px 무붕괴·무오버랩.

import ClearFilters from '@/lib/ClearFilters';
import { countConditions } from '@/lib/clearParams';
import useQueryString from '@/lib/useQueryString';

export function EmptyMessage({ loading, error, keep, empty = '데이터가 없습니다', filtered = '조건에 맞는 결과가 없습니다' }) {
  const cur = useQueryString();
  const n = countConditions(cur, keep);

  if (loading) return <span className="muted">불러오는 중…</span>;
  if (error) return <span className="muted">데이터를 불러오지 못했습니다</span>;

  return (
    <span
      style={{ display: 'inline-flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', justifyContent: 'center', minWidth: 0 }}
    >
      <span className="muted">{n > 0 ? filtered : empty}</span>
      {n > 0 && <ClearFilters keep={keep} />}
    </span>
  );
}

export default function EmptyRow({ colSpan = 1, ...rest }) {
  return (
    <tr>
      <td colSpan={colSpan} style={{ textAlign: 'center', padding: 24 }}>
        <EmptyMessage {...rest} />
      </td>
    </tr>
  );
}

export function EmptyBox({ style, ...rest }) {
  return (
    <div style={{ textAlign: 'center', padding: '18px 0', ...style }}>
      <EmptyMessage {...rest} />
    </div>
  );
}
