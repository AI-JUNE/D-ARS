'use client';
// lib/ListMore.jsx — 목록 하단 "더 보기" + 표시/총 건수 표기 (모바일 무붕괴·무오버랩)
// 레이아웃: 문서 흐름 내 인라인 블록 · flex-wrap · 중앙 정렬. 인쇄 시 숨김(내보내기 리포트 오염 방지).
// 건수 표기는 공통 방어 포매터 fmtNum(ko-KR 고정·비유한값 0 방어)으로 통일 — SSR/클라이언트 로케일 일관 + 서버 total 문자열/undefined 방어.
// 접근성(2026-08-03): 건수 스팬에 role="status"(암시적 aria-live=polite) — 검색·더 보기로 건수가
// 갱신될 때 스크린리더가 "N / 총 M건"을 낭독한다(WCAG 4.1.3 Status Messages). 표시·레이아웃 불변.
import { fmtNum } from '@/lib/kpi';

export default function ListMore({ shown, total, hasMore, loading, onMore, label = '건' }) {
  const done = !hasMore && total > 0;
  return (
    <div
      className="noprint"
      style={{
        display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', justifyContent: 'center',
        padding: '12px 4px 4px', minHeight: 40,
      }}
    >
      <span className="muted" role="status" style={{ fontSize: 12, wordBreak: 'break-word' }}>
        {total > 0 ? `${fmtNum(shown)} / 총 ${fmtNum(total)}${label}` : ''}
      </span>
      {hasMore && (
        <button type="button" className="btn sm" onClick={onMore} disabled={loading} aria-busy={loading ? 'true' : 'false'}>
          {loading ? '불러오는 중…' : '더 보기'}
        </button>
      )}
      {done && shown >= total && total > 20 && (
        <span className="muted" style={{ fontSize: 12 }}>· 마지막입니다</span>
      )}
    </div>
  );
}
