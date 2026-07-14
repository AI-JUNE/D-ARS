'use client';
// lib/SavedViews.jsx — **저장된 뷰(조회 조건 프리셋)** 공통 UI
//
//   <SavedViews screen="ums" />   ← 목록 화면 툴바 아래에 한 줄 추가하면 끝
//
// 무엇을 저장하나: **현재 주소의 쿼리 문자열 전체**(기간·검색어·필터·뷰·정렬 — 19회차로 전부 URL 에 있다).
// 어떻게 되돌리나: `history.pushState` 로 저장된 주소를 넣고 **popstate 를 직접 발생**시킨다
//   → useRangeParam·useUrlState·useSortState 세 훅이 모두 popstate 를 듣고 있으므로
//     한 번에 기간·검색어·필터·뷰·정렬이 함께 복원된다(각 화면에 개별 배선이 필요 없다).
//   pushState(치환 아님)라서 **뒤로가기를 누르면 직전에 보던 조건으로 정확히 되돌아간다**.
//
// 저장소: 브라우저 localStorage(화면별 키) — **DB 스키마 변경 없음 · 서버 무관 · 읽기 전용 · 저위험**.
// SSR 안전: 첫 렌더는 저장 버튼만(칩 없음) → 하이드레이션 불일치 없음. 칩은 마운트 후 채워진다.
// 모바일: 칩은 flex-wrap 으로 줄바꿈 → 320px 에서도 무붕괴·무오버랩. 인쇄 시 숨김(noprint).

import { useCallback, useEffect, useState } from 'react';
import ClearFilters from '@/lib/ClearFilters';
import CopyLink from '@/lib/CopyLink';
import {
  MAX_NAME, MAX_VIEWS,
  addView, parseViews, removeView, sameQuery, serializeViews, storageKey, viewHref,
} from '@/lib/savedViews';
import useQueryString from '@/lib/useQueryString';

const readStore = (key) => {
  try { return parseViews(window.localStorage.getItem(key)); } catch { return []; } // 사생활 보호 모드 등 → 조용히 비활성
};
const writeStore = (key, list) => {
  try { window.localStorage.setItem(key, serializeViews(list)); } catch { /* 저장 실패는 무시(화면은 그대로 동작) */ }
};

// 현재 쿼리 문자열은 공통 훅 `useQueryString`(useSyncExternalStore 기반 · SSR 스냅샷 '')으로 구독한다
// — 20회차에 ClearFilters 와 공유하기 위해 분리했다(동작 동일).

export default function SavedViews({ screen, label = '저장된 뷰', clearable = true, shareable = true, keep }) {
  const key = storageKey(screen);
  const [views, setViews] = useState([]);   // 첫 렌더는 항상 빈 배열(SSR 안전)
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState('');

  // 현재 쿼리(활성 칩 강조용) — 서버 렌더·첫 클라이언트 렌더는 ''(하이드레이션 불일치 없음).
  const cur = useQueryString();

  // 저장소 로드 + 다른 탭에서의 변경 동기화
  useEffect(() => {
    setViews(readStore(key));
    const onStorage = (e) => { if (e.key === key) setViews(readStore(key)); };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [key]);

  // 뷰 적용 — 주소를 넣고 popstate 를 발생시켜 URL 상태 훅들이 스스로 복원하게 한다.
  const apply = useCallback((q) => {
    try {
      window.history.pushState(window.history.state, '', viewHref(window.location.pathname, q));
      window.dispatchEvent(new Event('popstate'));
    } catch { /* 히스토리 접근 실패(iframe 등) → 아무 일도 일어나지 않는다(화면 유지) */ }
  }, []);

  const commit = () => {
    const next = addView(views, name, window.location.search);
    if (next.length === views.length && !name.trim()) { setNaming(false); return; } // 빈 이름 → 취소와 동일
    setViews(next); writeStore(key, next);
    setName(''); setNaming(false);
  };
  const del = (v) => {
    if (!window.confirm(`저장된 뷰 '${v.name}' 을(를) 삭제할까요?`)) return;
    const next = removeView(views, v.name);
    setViews(next); writeStore(key, next);
  };

  const full = views.length >= MAX_VIEWS;

  return (
    <div
      className="noprint"
      style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, margin: '0 0 10px', minWidth: 0 }}
    >
      <span className="muted" style={{ fontSize: 12, flex: '0 0 auto' }}>{label}</span>

      {views.map((v) => {
        const on = sameQuery(v.q, cur);
        return (
          <span
            key={v.name}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 2, maxWidth: '100%',
              border: '1px solid ' + (on ? '#be5535' : '#e2d5cd'), borderRadius: 999,
              background: on ? 'rgba(190,85,53,.08)' : '#fff', overflow: 'hidden',
            }}
          >
            <button
              type="button"
              className="btn sm"
              aria-pressed={on}
              title={v.q ? `${v.name} · ?${v.q}` : `${v.name} · 조건 없음(전체)`}
              onClick={() => apply(v.q)}
              style={{
                border: 0, background: 'transparent', borderRadius: 0, maxWidth: 180,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                color: on ? '#be5535' : 'inherit', fontWeight: on ? 700 : 500,
              }}
            >
              {v.name}
            </button>
            <button
              type="button"
              className="btn sm"
              aria-label={`저장된 뷰 ${v.name} 삭제`}
              title="삭제"
              onClick={() => del(v)}
              style={{ border: 0, background: 'transparent', borderRadius: 0, padding: '0 8px 0 0', color: '#a2938b', flex: '0 0 auto' }}
            >
              ×
            </button>
          </span>
        );
      })}

      {naming ? (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, flexWrap: 'wrap', minWidth: 0 }}>
          <input
            className="input"
            autoFocus
            maxLength={MAX_NAME}
            value={name}
            placeholder="뷰 이름(예: 실패 발송 7일)"
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); commit(); }
              if (e.key === 'Escape') { setName(''); setNaming(false); }
            }}
            style={{ width: 190, maxWidth: '55vw', height: 30, fontSize: 12.5 }}
          />
          <button type="button" className="btn primary sm" onClick={commit}>저장</button>
          <button type="button" className="btn sm" onClick={() => { setName(''); setNaming(false); }}>취소</button>
        </span>
      ) : (
        <button
          type="button"
          className="btn sm"
          disabled={full}
          title={full ? `저장된 뷰는 최대 ${MAX_VIEWS}개까지입니다(하나를 삭제한 뒤 저장하세요)` : '현재 기간·검색어·필터·정렬 조건을 이름 붙여 저장'}
          onClick={() => setNaming(true)}
          style={{ flex: '0 0 auto' }}
        >
          ＋ 현재 조건 저장
        </button>
      )}

      {/* 링크 복사 · 조건 지우기 — 같은 줄 오른쪽. 폭이 모자라면 flex-wrap 으로 다음 줄로 내려간다(모바일 무붕괴).
          링크 복사(21회차): 저장된 뷰는 브라우저 localStorage 전용이라 남에게 건넬 수 없었다
          → 현재 조건이 담긴 **절대 URL** 을 한 번에 복사해 공유한다(받는 사람은 같은 화면을 본다). */}
      {shareable ? <CopyLink style={{ marginLeft: 'auto' }} /> : null}
      {clearable ? <ClearFilters keep={keep} style={shareable ? undefined : { marginLeft: 'auto' }} /> : null}
    </div>
  );
}
