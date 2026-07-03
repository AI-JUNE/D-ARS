'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

function useCount(target, dur=1100) {
  const [v, setV] = useState(0);
  const ref = useRef(null);
  useEffect(() => {
    let raf, start;
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) {
        const step = (t) => { start ??= t; const p = Math.min((t-start)/dur, 1);
          setV(Math.round(target * (1 - Math.pow(1-p,3)))); if (p<1) raf = requestAnimationFrame(step); };
        raf = requestAnimationFrame(step); io.disconnect();
      }
    }, { threshold: .4 });
    if (ref.current) io.observe(ref.current);
    return () => { io.disconnect(); cancelAnimationFrame(raf); };
  }, [target, dur]);
  return [v, ref];
}
function Stat({ n, suffix='', label }) {
  const [v, ref] = useCount(n);
  return <div ref={ref} style={{textAlign:'center'}}>
    <div style={{fontSize:'clamp(26px,7vw,40px)',fontWeight:800,color:'var(--brand-d)',lineHeight:1}}>{v.toLocaleString()}{suffix}</div>
    <div style={{fontSize:13,color:'var(--muted)',marginTop:6,fontWeight:600}}>{label}</div>
  </div>;
}

export default function Landing() {
  const wrap = { maxWidth:1080, margin:'0 auto', padding:'0 20px' };
  return (
    <main style={{background:'radial-gradient(1100px 520px at 50% -8%, #fbf1ea, var(--bg))', minHeight:'100dvh'}}>
      {/* nav */}
      <header style={{...wrap, display:'flex', alignItems:'center', gap:12, height:64}}>
        <span style={{width:12,height:12,borderRadius:'50%',background:'var(--brand)',boxShadow:'0 0 0 4px rgba(190,85,53,.22)'}}/>
        <b style={{fontSize:18}}>D-ARS</b><span className="muted" style={{fontSize:12,fontWeight:600}}>보이는 ARS</span>
        <div style={{flex:1}}/>
        <Link href="/dashboard" className="btn sm">운영 콘솔</Link>
      </header>

      {/* hero */}
      <section style={{...wrap, textAlign:'center', padding:'40px 20px 20px'}}>
        <span className="tag t-mut" style={{background:'var(--brand-xl)',color:'var(--brand-d)'}}>AI 컨택센터 · 보이는 ARS</span>
        <h1 style={{fontSize:'clamp(28px,7vw,52px)',margin:'16px 0 6px',lineHeight:1.15,letterSpacing:'-.5px'}}>
          상담을 완결하는<br/><span style={{color:'var(--brand-d)'}}>보이는 ARS</span></h1>
        <p style={{color:'var(--muted)',fontSize:'clamp(14px,3.6vw,17px)',maxWidth:560,margin:'0 auto 22px',lineHeight:1.6}}>
          AI 음성상담에 실시간 화면을 더해, 안내·서류·문자·상담원 전환을 통화 한 번에 처리합니다.</p>
        <div style={{display:'flex',gap:10,justifyContent:'center',flexWrap:'wrap'}}>
          <Link href="/visual" className="btn primary">📱 보이는 ARS 체험</Link>
          <Link href="/dashboard" className="btn">🖥️ 운영 콘솔 열기</Link>
        </div>
        <div style={{display:'flex',gap:8,justifyContent:'center',flexWrap:'wrap',marginTop:18}}>
          {['음성·화면 동기','필요서류·UMS','상담원 Fallback','실시간 모니터링'].map(t=>
            <span key={t} className="tag t-mut">{t}</span>)}
        </div>
      </section>

      {/* role entry */}
      <section style={{...wrap, padding:'20px'}}>
        <h2 style={{textAlign:'center',fontSize:'clamp(18px,5vw,24px)',margin:'12px 0 4px'}}>역할을 골라 들어가 보세요</h2>
        <p style={{textAlign:'center',color:'var(--muted)',fontSize:13,margin:'0 0 18px'}}>데모 데이터로 모든 기능을 직접 조작할 수 있어요.</p>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))',gap:14}}>
          {[
            ['🖥️','운영 관리자','시나리오·서류·세션·통계를 한 화면에서 운영','/dashboard','운영 콘솔 입장'],
            ['📱','고객 (보이는 ARS)','통화 중 스마트폰 화면을 그대로 체험','/visual','고객 화면 체험'],
            ['🧩','시나리오 빌더','보이는 ARS 화면 흐름을 노드로 구성','/scenarios','시나리오 편집'],
          ].map(([e,t,d,href,cta])=>(
            <Link key={t} href={href} className="card" style={{display:'block'}}>
              <div style={{fontSize:30}}>{e}</div>
              <b style={{fontSize:16,display:'block',marginTop:8}}>{t}</b>
              <p className="muted" style={{fontSize:13,lineHeight:1.5,margin:'6px 0 12px'}}>{d}</p>
              <span className="btn sm primary">{cta} →</span>
            </Link>
          ))}
        </div>
      </section>

      {/* stats */}
      <section style={{...wrap, padding:'20px'}}>
        <div className="card">
          <h3 style={{textAlign:'center',justifyContent:'center'}}>숫자로 보는 D-ARS</h3>
          <p className="muted" style={{textAlign:'center',fontSize:12,margin:'0 0 16px'}}>데모 시연용 샘플 데이터</p>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(120px,1fr))',gap:18}}>
            <Stat n={1220} label="멀티모달 발송" />
            <Stat n={540} label="런처 자동런칭" />
            <Stat n={74} suffix="%" label="사용 완료율" />
            <Stat n={99} suffix=".9%" label="서비스 가용율" />
          </div>
        </div>
      </section>

      <footer style={{...wrap, padding:'24px 20px 40px', textAlign:'center', color:'var(--muted)', fontSize:12}}>
        D-ARS · 보이는 ARS · 콜봇 연계 모듈 · 운영 GOWON<br/>
        <span style={{opacity:.7}}>© 2026 · 데모 모드</span>
      </footer>
    </main>
  );
}
