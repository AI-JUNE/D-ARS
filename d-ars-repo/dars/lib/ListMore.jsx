'use client';
// lib/ListMore.jsx — 목록 하단 "더 보기" + 표시/총 건수 표기 (모바일 무붕괴·무오버랩)
// 레이아웃: 문서 흐름 내 인라인 블록 · flex-wrap · 중앙 정렬. 인쇄 시 숨김(내보내기 리포트 오염 방지).

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
      <span className="muted" style={{ fontSize: 12, wordBreak: 'break-word' }}>
        {total > 0 ? `${shown.toLocaleString()} / 총 ${total.toLocaleString()}${label}` : ''}
      </span>
      {hasMore && (
        <button className="btn sm" onClick={onMore} disabled={loading} aria-busy={loading ? 'true' : 'false'}>
          {loading ? '불러오는 중…' : '더 보기'}
        </button>
      )}
      {done && shown >= total && total > 20 && (
        <span className="muted" style={{ fontSize: 12 }}>· 마지막입니다</span>
      )}
    </div>
  );
}
