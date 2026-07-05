'use client';
import Link from 'next/link';
import { useEffect } from 'react';

export default function Error({ error, reset }) {
  useEffect(() => { if (typeof console !== 'undefined') console.error(error); }, [error]);
  return (
    <main style={{minHeight:'100dvh',display:'grid',placeItems:'center',padding:'24px',
      background:'var(--bg)',color:'var(--ink)',
      fontFamily:'"Segoe UI","Malgun Gothic","맑은 고딕",system-ui,sans-serif'}}>
      <div style={{maxWidth:460,width:'100%',textAlign:'center',
        background:'var(--panel)',border:'1px solid var(--line)',borderRadius:16,
        padding:'40px 26px',boxShadow:'var(--shadow)'}}>
        <div aria-hidden style={{width:64,height:64,margin:'0 auto 18px',borderRadius:'50%',
          display:'grid',placeItems:'center',fontSize:30,
          background:'var(--brand-xl)',color:'var(--bad,#c0392b)'}}>⚠️</div>
        <h1 style={{margin:'0 0 8px',fontSize:'clamp(17px,5vw,20px)',wordBreak:'keep-all'}}>
          일시적인 오류가 발생했어요
        </h1>
        <p style={{margin:'0 0 22px',fontSize:14,color:'var(--muted)',lineHeight:1.55,wordBreak:'keep-all'}}>
          잠시 후 다시 시도해 주세요. 문제가 계속되면 관리자에게 문의해 주세요.
        </p>
        <div style={{display:'flex',gap:10,justifyContent:'center',flexWrap:'wrap'}}>
          <button onClick={() => reset()} style={{background:'var(--brand)',color:'#fff',
            border:'1px solid var(--brand)',borderRadius:9,padding:'10px 16px',fontWeight:700,
            fontSize:14,cursor:'pointer'}}>다시 시도</button>
          <Link href="/dashboard" style={{background:'#fff',color:'var(--ink)',border:'1px solid var(--line)',
            borderRadius:9,padding:'10px 16px',fontWeight:700,fontSize:14}}>대시보드</Link>
        </div>
      </div>
    </main>
  );
}
