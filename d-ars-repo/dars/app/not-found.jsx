import Link from 'next/link';

export const metadata = { title: '페이지를 찾을 수 없어요 · D-ARS' };

export default function NotFound() {
  return (
    <main style={{minHeight:'100dvh',display:'grid',placeItems:'center',padding:'24px',
      background:'var(--bg)',color:'var(--ink)',
      fontFamily:'"Segoe UI","Malgun Gothic","맑은 고딕",system-ui,sans-serif'}}>
      <div style={{maxWidth:440,width:'100%',textAlign:'center',
        background:'var(--panel)',border:'1px solid var(--line)',borderRadius:16,
        padding:'40px 26px',boxShadow:'var(--shadow)'}}>
        <div aria-hidden style={{fontSize:'clamp(48px,16vw,72px)',fontWeight:800,
          lineHeight:1,color:'var(--brand)',wordBreak:'keep-all'}}>404</div>
        <h1 style={{margin:'18px 0 8px',fontSize:'clamp(17px,5vw,20px)',wordBreak:'keep-all'}}>
          페이지를 찾을 수 없어요
        </h1>
        <p style={{margin:'0 0 22px',fontSize:14,color:'var(--muted)',lineHeight:1.55,wordBreak:'keep-all'}}>
          주소가 변경되었거나 삭제된 페이지일 수 있어요. 홈으로 돌아가 다시 시도해 주세요.
        </p>
        <div style={{display:'flex',gap:10,justifyContent:'center',flexWrap:'wrap'}}>
          <Link href="/" style={{background:'var(--brand)',color:'#fff',border:'1px solid var(--brand)',
            borderRadius:9,padding:'10px 16px',fontWeight:700,fontSize:14}}>홈으로</Link>
          <Link href="/dashboard" style={{background:'#fff',color:'var(--ink)',border:'1px solid var(--line)',
            borderRadius:9,padding:'10px 16px',fontWeight:700,fontSize:14}}>대시보드</Link>
        </div>
      </div>
    </main>
  );
}
