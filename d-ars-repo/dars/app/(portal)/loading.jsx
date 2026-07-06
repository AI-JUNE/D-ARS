// 포털 라우트 전환 스켈레톤 (perceived performance · prism/callbot 리치 관리자 톤)
// 서버 컴포넌트 · 데이터 페치 전 브랜드 스켈레톤 표시. prefers-reduced-motion 존중(globals.css).
export default function Loading() {
  const bar = (w, h = 12) => (
    <span className="skl" style={{ display: 'block', width: w, height: h, borderRadius: 6 }} />
  );
  return (
    <div aria-busy="true" aria-live="polite">
      <span className="sr-only">불러오는 중…</span>

      {/* 섹션 헤더 */}
      <div className="sectionhead">
        {bar('190px', 20)}
        <span className="sp" />
        {bar('64px', 30)}
        {bar('64px', 30)}
      </div>

      {/* KPI 카드 4종 */}
      <div className="grid g4">
        {[0, 1, 2, 3].map((i) => (
          <div className="card kpi" key={i}>
            {bar('58%', 24)}
            <div style={{ height: 8 }} />
            {bar('42%', 12)}
          </div>
        ))}
      </div>

      {/* 표 스켈레톤 */}
      <div className="card" style={{ marginTop: 16 }}>
        {bar('130px', 15)}
        <div style={{ height: 14 }} />
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '10px 0', borderTop: i ? '1px solid var(--line)' : '0' }}>
            {bar('16%')}{bar('22%')}{bar('30%')}<span className="sp" />{bar('64px', 18)}
          </div>
        ))}
      </div>
    </div>
  );
}
