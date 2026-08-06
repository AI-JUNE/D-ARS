import Link from 'next/link';
import { LEGAL_META } from '@/lib/legalContent';

const TR='#bd5a40', INK='#3a2b24', MUT='#9c8b80', PAGE='#f6ece2', CARD='#ffffff', LINE='#ece0d5', BADGE='#f4e3da';

// 약관/방침 공용 렌더러 (서버 컴포넌트, 정적).
export default function LegalDoc({ title, sections }) {
  const draft = LEGAL_META.status !== 'published';
  return (
    <main style={{ minHeight:'100vh', background:PAGE, color:INK }}>
      <div style={{ maxWidth:820, margin:'0 auto', padding:'clamp(28px,5vw,56px) 20px' }}>
        <Link href="/" style={{ color:TR, fontWeight:700, fontSize:13.5, textDecoration:'none' }}>← D-ARS 홈</Link>
        <h1 style={{ fontSize:'clamp(24px,5vw,34px)', margin:'14px 0 6px', color:INK }}>{title}</h1>
        <p style={{ color:MUT, fontSize:13.5, margin:'0 0 4px' }}>
          {LEGAL_META.service} · 운영 {LEGAL_META.operator} · 시행일 {LEGAL_META.effectiveDate}
        </p>
        {draft && (
          <div style={{ background:BADGE, color:'#8a3a22', border:'1px solid '+LINE, borderRadius:12, padding:'12px 14px', fontSize:13, lineHeight:1.6, margin:'12px 0 8px' }}>
            ⚠️ 본 문서는 <b>법무 검토 전 초안</b>입니다. 정식 게시 전 회사 정보·연락처·보관기간·수집항목을 확정하고 검토를 받아야 합니다. <b>[승인 필요]</b>
          </div>
        )}
        <div style={{ marginTop:18 }}>
          {sections.map((s, i) => (
            <section key={i} style={{ background:CARD, border:'1px solid '+LINE, borderRadius:16, padding:'18px 20px', marginBottom:12 }}>
              <h2 style={{ fontSize:16.5, fontWeight:800, color:INK, margin:'0 0 8px' }}>{s.h}</h2>
              <p style={{ color:'#5a4a40', fontSize:14.5, lineHeight:1.75, margin:0, whiteSpace:'pre-line' }}>{s.body}</p>
            </section>
          ))}
        </div>
        <footer style={{ color:MUT, fontSize:12.5, textAlign:'center', padding:'24px 0 8px', lineHeight:1.8 }}>
          문의: {LEGAL_META.contactEmail}<br/>
          <Link href="/legal/terms" style={{ color:TR, textDecoration:'none' }}>이용약관</Link>
          {'  ·  '}
          <Link href="/legal/privacy" style={{ color:TR, textDecoration:'none' }}>개인정보처리방침</Link>
          {'  ·  '}
          <Link href="/pricing" style={{ color:TR, textDecoration:'none' }}>요금제</Link>
        </footer>
      </div>
    </main>
  );
}
