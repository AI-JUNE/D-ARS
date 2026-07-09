'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

const TR='#bd5a40', TRD='#9c4025', INK='#3a2b24', MUT='#9c8b80';
const PAGE='#f6ece2', CARD='#ffffff', SCR='#f8f1ea', BADGE='#f4e3da', LINE='#ece0d5', ALERT='#c0392b';
const wrap={maxWidth:1120,margin:'0 auto',padding:'0 20px'};

function useCount(target,dur=1200){
  const [v,setV]=useState(0); const ref=useRef(null);
  useEffect(()=>{ let raf,start;
    const io=new IntersectionObserver(([e])=>{ if(e.isIntersecting){
      const step=(t)=>{start??=t;const p=Math.min((t-start)/dur,1);setV(Math.round(target*(1-Math.pow(1-p,3))));if(p<1)raf=requestAnimationFrame(step);};
      raf=requestAnimationFrame(step); io.disconnect(); } },{threshold:0.4});
    if(ref.current) io.observe(ref.current);
    return ()=>{io.disconnect();cancelAnimationFrame(raf);};
  },[target,dur]);
  return [v,ref];
}
function Stat({n,suffix='',label}){
  const [v,ref]=useCount(n);
  return <div ref={ref} style={{textAlign:'center'}}>
    <div style={{fontSize:'clamp(28px,7vw,44px)',fontWeight:800,color:TRD,lineHeight:1}}>{v.toLocaleString()}{suffix}</div>
    <div style={{fontSize:13.5,color:MUT,marginTop:8,fontWeight:600}}>{label}</div>
  </div>;
}

const S=(k)=><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={TR} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{k}</svg>;
const IcHead=()=>S(<><path d="M5 13a7 7 0 0 1 14 0"/><rect x="3" y="12" width="4" height="7" rx="2" fill={TR} stroke="none"/><rect x="17" y="12" width="4" height="7" rx="2" fill={TR} stroke="none"/></>);
const IcCal=()=>S(<><rect x="4" y="5" width="16" height="16" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/></>);
const IcHeart=()=>S(<path d="M12 20s-7-4.5-7-9.5A3.5 3.5 0 0 1 12 8a3.5 3.5 0 0 1 7 2.5c0 5-7 9.5-7 9.5z" fill={TR} stroke="none"/>);
const IcInfo=()=>S(<><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></>);
const IcBowl=()=>S(<><path d="M4 11a8 7 0 0 0 16 0z" fill={TR} stroke="none"/><path d="M9 7c2-2 0-3 0-4M15 7c2-2 0-3 0-4"/></>);
const IcCar=()=>S(<><path d="M4 13l2-5h12l2 5"/><rect x="3" y="13" width="18" height="5" rx="2" fill={TR} stroke="none"/><circle cx="7.5" cy="19" r="1.6" fill={TR}/><circle cx="16.5" cy="19" r="1.6" fill={TR}/></>);
const IcHome=()=>S(<><path d="M4 11l8-7 8 7"/><path d="M6 10v9h12v-9" fill={TR} stroke="none"/></>);
const IcPerson=()=>S(<><circle cx="12" cy="8" r="3.5" fill={TR} stroke="none"/><path d="M5 20a7 7 0 0 1 14 0z" fill={TR} stroke="none"/></>);
const IcMic=(c)=><svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke={c||'#fff'} strokeWidth="2" strokeLinecap="round"><rect x="9" y="3" width="6" height="11" rx="3" fill={c||'#fff'} stroke="none"/><path d="M6 11a6 6 0 0 0 12 0M12 17v3M9 20h6"/></svg>;

function Badge({children,bg}){return <span style={{width:44,height:44,borderRadius:'50%',background:bg||BADGE,display:'inline-grid',placeItems:'center',flex:'0 0 auto'}}>{children}</span>;}
function Section({eyebrow,title,desc,children,style}){
  return <section style={{...wrap,padding:'clamp(36px,6vw,64px) 20px',...style}}>
    {eyebrow&&<div style={{textAlign:'center',color:TR,fontWeight:800,fontSize:13,letterSpacing:1}}>{eyebrow}</div>}
    {title&&<h2 style={{textAlign:'center',fontSize:'clamp(22px,5vw,34px)',margin:'10px 0 8px',color:INK,lineHeight:1.25}}>{title}</h2>}
    {desc&&<p style={{textAlign:'center',color:MUT,fontSize:'clamp(14px,3.5vw,16px)',maxWidth:620,margin:'0 auto 28px',lineHeight:1.6}}>{desc}</p>}
    {children}
  </section>;
}
function Phone({title,sub,children}){
  return <div style={{background:'#e7d9cb',borderRadius:34,padding:10,boxShadow:'0 18px 44px rgba(80,45,30,.14)',width:'100%',maxWidth:320,margin:'0 auto'}}>
    <div style={{background:SCR,borderRadius:26,overflow:'hidden',minHeight:520}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'10px 16px 4px',fontSize:12,fontWeight:700,color:INK}}><span>9:41</span><span style={{letterSpacing:2}}>••▪</span></div>
      <div style={{textAlign:'center',padding:'4px 12px 10px',borderBottom:'1px solid '+LINE}}>
        <div style={{fontSize:14,fontWeight:800,color:INK}}><span style={{display:'inline-grid',placeItems:'center',width:18,height:18,borderRadius:'50%',background:TR,color:'#fff',fontSize:10,marginRight:6,verticalAlign:'middle'}}>이</span>{title}</div>
        <div style={{fontSize:11.5,color:MUT,marginTop:2}}>{sub}</div>
      </div>
      <div style={{padding:14}}>{children}</div>
    </div>
  </div>;
}
function MRow({icon,title,desc}){
  return <div style={{display:'flex',alignItems:'center',gap:12,background:CARD,border:'1px solid '+LINE,borderRadius:14,padding:10,marginBottom:8}}>
    <Badge>{icon}</Badge>
    <div style={{flex:1,minWidth:0}}><div style={{fontSize:14.5,fontWeight:800,color:INK}}>{title}</div>{desc&&<div style={{fontSize:12,color:MUT,marginTop:1}}>{desc}</div>}</div>
    <span style={{color:'#c8b8ac',fontSize:16}}>›</span>
  </div>;
}
function Tile({icon,label}){
  return <div style={{background:CARD,border:'1px solid '+LINE,borderRadius:14,padding:'14px 6px',textAlign:'center'}}><Badge>{icon}</Badge><div style={{fontSize:13.5,fontWeight:800,color:INK,marginTop:8}}>{label}</div></div>;
}
function Chip({children}){return <span style={{fontSize:12.5,fontWeight:700,color:TRD,background:BADGE,borderRadius:999,padding:'5px 12px'}}>{children}</span>;}

const FAQS=[
  ['보이는 ARS가 뭔가요?','통화 중 고객 스마트폰에 화면을 띄워, 음성 안내를 텍스트·버튼·카드로 함께 보여주는 서비스입니다. 말하기 어려워도 화면을 눌러 신청·조회할 수 있어요.'],
  ['기존 콜봇과 어떻게 연계되나요?','콜봇의 STT·LLM·시나리오·TTS·CTI를 그대로 재사용합니다. D-ARS는 그 대화를 화면으로 보여주고 손으로 처리하게 하는 시각 계층입니다.'],
  ['어르신·취약계층 접근성은요?','대형 버튼·큰글씨·단순한 흐름으로 설계했습니다. 음성과 화면을 동시에 제공해 정보를 놓치지 않게 하고, 필요 시 문자·상담원으로 즉시 전환합니다.'],
  ['이상징후 감지는 어떻게 동작하나요?','통화 음성·내용의 다중 신호를 분석해 우울·고립·건강 위험을 점수화하고, 임계 초과 시 코디네이터·담당자에게 자동 연계합니다.'],
];
function FAQ(){
  const [open,setOpen]=useState(0);
  return <div style={{maxWidth:760,margin:'0 auto'}}>
    {FAQS.map(([q,a],i)=>(
      <div key={i} style={{background:CARD,border:'1px solid '+LINE,borderRadius:14,marginBottom:10,overflow:'hidden'}}>
        <button onClick={()=>setOpen(open===i?-1:i)} style={{width:'100%',textAlign:'left',background:'transparent',border:0,padding:'16px 18px',fontSize:15.5,fontWeight:700,color:INK,cursor:'pointer',display:'flex',justifyContent:'space-between',gap:10}}>
          <span>{q}</span><span style={{color:TR,transform:open===i?'rotate(45deg)':'none',transition:'.2s'}}>+</span>
        </button>
        {open===i&&<div style={{padding:'0 18px 18px',fontSize:14,color:MUT,lineHeight:1.65}}>{a}</div>}
      </div>
    ))}
  </div>;
}

export default function Landing(){
  return (
    <main style={{background:PAGE,color:INK,minHeight:'100dvh'}}>
      <header style={{background:'#faf3ec',borderBottom:'1px solid '+LINE}}>
        <div style={{...wrap,display:'flex',alignItems:'center',gap:12,height:62}}>
          <span style={{width:30,height:30,borderRadius:'50%',background:TR,color:'#fff',display:'grid',placeItems:'center',fontWeight:800,fontSize:14}}>D</span>
          <b style={{fontSize:18}}>D-ARS</b><span style={{fontSize:12,fontWeight:600,color:MUT}}>보이는 ARS</span>
          <div style={{flex:1}}/>
          <Link href="/visual" style={{fontSize:13.5,fontWeight:700,color:TRD,marginRight:6}}>데모 체험</Link>
          <Link href="/dashboard" style={{fontSize:13.5,fontWeight:800,color:'#fff',background:TR,borderRadius:999,padding:'9px 16px'}}>운영 콘솔</Link>
        </div>
      </header>

      <section style={{background:'radial-gradient(1100px 520px at 50% -10%, #fbeee5, '+PAGE+')'}}>
        <div style={{...wrap,textAlign:'center',padding:'clamp(44px,7vw,84px) 20px 24px'}}>
          <Chip>쉽고 빠른 상담 · 보이는 ARS</Chip>
          <h1 style={{fontSize:'clamp(30px,7.5vw,56px)',margin:'18px 0 8px',lineHeight:1.15,letterSpacing:'-.5px',color:INK}}>전화 상담을<br/><span style={{color:TRD}}>보고, 누르고, 끝내다</span></h1>
          <p style={{color:MUT,fontSize:'clamp(15px,3.6vw,18px)',maxWidth:580,margin:'0 auto 24px',lineHeight:1.6}}>복잡한 ARS 메뉴 탐색 없이, 통화 중 스마트폰 화면에서 안내·서류·문자를 몇 번의 터치로 해결하세요.</p>
          <div style={{display:'flex',gap:10,justifyContent:'center',flexWrap:'wrap'}}>
            <Link href="/visual" style={{fontWeight:800,color:'#fff',background:TR,borderRadius:12,padding:'13px 22px'}}>보이는 ARS 체험 →</Link>
            <Link href="/dashboard" style={{fontWeight:800,color:TRD,background:'#fff',border:'1px solid '+LINE,borderRadius:12,padding:'13px 22px'}}>운영 콘솔 열기</Link>
          </div>
          <div style={{display:'flex',gap:8,justifyContent:'center',flexWrap:'wrap',marginTop:22}}>
            {['음성·화면 동기','필요서류·UMS','상담원 Fallback','실시간 모니터링'].map((t)=><Chip key={t}>{t}</Chip>)}
          </div>
        </div>
      </section>

      <Section eyebrow="WHY D-ARS" title="듣는 ARS를 넘어, 보는 ARS로" desc="음성만으로 놓치던 정보를 화면으로 함께 보여주고, 서류·문자·상담원 전환을 통화 한 번에 끝냅니다.">
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(260px,1fr))',gap:16}}>
          {[[<IcHead key="a"/>,'음성 + 화면 동시 안내','고객이 말하는 동안 화면에 안내·메뉴·카드를 실시간 표출해 정보 전달 정확도를 높입니다.'],
            [<IcCal key="b"/>,'서류·문자 자동 처리','필요서류 안내부터 UMS 문자 발송, 영수증·확인서 발급까지 화면에서 바로 처리합니다.'],
            [<IcPerson key="c"/>,'상담원 Fallback','자동으로 해결되지 않으면 대화 맥락과 함께 상담원에게 즉시 인계합니다.']].map(([ic,t,d],i)=>(
            <div key={i} style={{background:CARD,border:'1px solid '+LINE,borderRadius:18,padding:22}}>
              <Badge>{ic}</Badge><div style={{fontSize:17,fontWeight:800,marginTop:12,color:INK}}>{t}</div>
              <p style={{color:MUT,fontSize:14,lineHeight:1.65,margin:'8px 0 0'}}>{d}</p>
            </div>))}
        </div>
      </Section>

      <Section eyebrow="AX · AI EXPERIENCE" title="화면으로 완성하는 복지 상담" desc="어르신·청년 눈높이에 맞춘 세대별 맞춤 화면. 말하기 어려우면 버튼만 눌러도 신청·안내됩니다." style={{background:'#faf3ec',maxWidth:'none'}}>
        <div style={{...wrap,padding:0,display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(280px,1fr))',gap:24,marginTop:8}}>
          <div>
            <Phone title="복지 상담 전화" sub="어르신 음성 복지 신청">
              <div style={{fontSize:21,fontWeight:800,color:INK}}>말씀만 하세요</div>
              <div style={{fontSize:13,color:MUT,marginBottom:12}}>복지 신청·안내를 도와드려요</div>
              <div style={{display:'grid',placeItems:'center',margin:'6px 0 10px'}}><div style={{width:92,height:92,borderRadius:'50%',background:TR,display:'grid',placeItems:'center',boxShadow:'0 0 0 10px '+BADGE}}>{IcMic('#fff')}</div></div>
              <div style={{textAlign:'center',fontSize:12.5,fontWeight:700,color:TRD,marginBottom:12}}>● 듣고 있어요…</div>
              <div style={{background:BADGE,borderRadius:14,padding:'9px 12px',fontSize:13,color:TRD,marginBottom:8,marginLeft:40,textAlign:'right'}}>기초연금 신청하고 싶어요</div>
              <div style={{background:CARD,border:'1px solid '+LINE,borderRadius:14,padding:'9px 12px',fontSize:13,color:INK,marginRight:30}}>네, 기초연금 신청을 도와드릴게요. 생년월일을 말씀해 주세요.</div>
            </Phone>
            <p style={{textAlign:'center',marginTop:16,fontWeight:800,color:INK}}>어르신 · 음성으로 복지 신청</p>
          </div>
          <div>
            <Phone title="복지 서비스 시작" sub="어르신 대상">
              <div style={{fontSize:19,fontWeight:800,color:INK,marginBottom:12}}>무엇을 도와드릴까요?</div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
                <Tile icon={<IcHeart/>} label="돌봄 신청"/><Tile icon={<IcCal/>} label="방문 예약"/>
                <Tile icon={<IcInfo/>} label="복지 정보"/><Tile icon={<IcBowl/>} label="식사·배달"/>
                <Tile icon={<IcCar/>} label="교통 지원"/><Tile icon={<IcHead/>} label="상담 연결"/>
              </div>
              <div style={{background:TR,color:'#fff',textAlign:'center',fontWeight:800,fontSize:15,borderRadius:14,padding:'13px 0',marginTop:10}}>상담사 문자 받기</div>
            </Phone>
            <p style={{textAlign:'center',marginTop:16,fontWeight:800,color:INK}}>버튼만으로 셀프 신청</p>
          </div>
          <div>
            <Phone title="AI 안심 케어" sub="이상 징후 감지">
              <div style={{display:'flex',alignItems:'center',gap:10,background:CARD,border:'1px solid '+LINE,borderRadius:12,padding:10,marginBottom:8}}><Badge>{<IcPerson/>}</Badge><div><div style={{fontSize:14,fontWeight:800,color:INK}}>박순자 어르신</div><div style={{fontSize:12,color:MUT}}>통화 중 · 우울·고립 신호</div></div></div>
              <div style={{background:'#fbe9e3',borderRadius:12,padding:'10px 12px',marginBottom:10}}><div style={{fontSize:13.5,fontWeight:800,color:ALERT}}>⚠ 이상 징후 감지 · 위험</div><div style={{fontSize:12,color:ALERT,marginTop:3}}>식사 이슈 · 활동량 저하 · 위험도 높음</div></div>
              <MRow icon={<IcHead/>} title="코디네이터 즉시 연결" desc="지금 바로 도와드려요"/>
              <MRow icon={<IcHome/>} title="긴급 방문 요청" desc="담당자에게 전달"/>
              <MRow icon={<IcPerson/>} title="가족에게 알림" desc="보호자에게 상황 알림"/>
            </Phone>
            <p style={{textAlign:'center',marginTop:16,fontWeight:800,color:INK}}>이상징후 · 사각지대 발굴</p>
          </div>
        </div>
      </Section>

      <Section eyebrow="보이는 ARS" title="세대별 맞춤 화면" desc="문자·웹·D-ARS로 어르신·청년 눈높이에 맞춘 복지 상담 창구를 제공합니다.">
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(200px,1fr))',gap:14,maxWidth:820,margin:'0 auto'}}>
          {[['1세대','TEXT','IVR 음성 · 텍스트 안내',false],['2세대','WEB','웹 메뉴 셀프서비스',false],['3세대','DIGITAL','음성+화면 동기 · 멀티채널',true]].map(([g,t,d,on])=>(
            <div key={g} style={{background:on?TR:CARD,border:'2px solid '+TR,borderRadius:16,padding:20,textAlign:'center'}}>
              <div style={{fontSize:20,fontWeight:800,color:on?'#fff':TRD}}>{g}</div>
              <div style={{fontSize:12,fontWeight:800,letterSpacing:1,color:on?'#ffe4d8':MUT,marginTop:2}}>{t}</div>
              <div style={{fontSize:13,color:on?'#ffe9e0':MUT,marginTop:10,lineHeight:1.5}}>{d}</div>
            </div>))}
        </div>
      </Section>

      <Section eyebrow="이음만의 것" title="차별화 · 특허 포인트" desc="아이디어가 아니라, 이미 작동하는 접근성·안전·정산 기술이 진입장벽입니다." style={{background:'#faf3ec',maxWidth:'none'}}>
        <div style={{...wrap,padding:0,display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(260px,1fr))',gap:16}}>
          {[['멀티모달 접근성','음성+화면 동시 안내로 고령·취약계층도 화면 버튼으로 신청. 대기업 범용 AICC가 들어오지 않은 복지 도메인.'],
            ['이상징후 스코어링','통화 음성·내용의 다중 신호를 점수화해 우울·고립·건강 위험을 감지하고 자동 개입 (특허 후보).'],
            ['확인콜 → 매칭 → 정산 폐루프','D-ARS 통화 결과를 매칭 신뢰도·1365 실적·바우처 정산에 피드백하는 폐루프 (BM 특허 결합).']].map(([t,d],i)=>(
            <div key={i} style={{background:CARD,border:'1px solid '+LINE,borderRadius:18,padding:22}}>
              <div style={{width:34,height:34,borderRadius:10,background:BADGE,color:TRD,display:'grid',placeItems:'center',fontWeight:800}}>{i+1}</div>
              <div style={{fontSize:17,fontWeight:800,marginTop:12,color:INK}}>{t}</div>
              <p style={{color:MUT,fontSize:14,lineHeight:1.65,margin:'8px 0 0'}}>{d}</p>
            </div>))}
        </div>
      </Section>

      <Section title="역할을 골라 들어가 보세요" desc="데모 데이터로 모든 기능을 직접 조작할 수 있어요.">
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(240px,1fr))',gap:16}}>
          {[[<IcHead key="a"/>,'운영 관리자','시나리오·서류·세션·통계를 한 화면에서 운영','/dashboard','운영 콘솔 입장'],
            [<IcMic key="b"/>,'고객 (보이는 ARS)','통화 중 스마트폰 화면을 그대로 체험','/visual','고객 화면 체험'],
            [<IcCal key="c"/>,'시나리오 빌더','보이는 ARS 화면 흐름을 노드로 구성','/scenarios','시나리오 편집']].map(([ic,t,d,href,cta])=>(
            <Link key={t} href={href} style={{display:'block',background:CARD,border:'1px solid '+LINE,borderRadius:18,padding:22,textDecoration:'none'}}>
              <Badge>{ic}</Badge><b style={{fontSize:17,display:'block',marginTop:12,color:INK}}>{t}</b>
              <p style={{color:MUT,fontSize:14,lineHeight:1.55,margin:'6px 0 14px'}}>{d}</p>
              <span style={{fontWeight:800,color:'#fff',background:TR,borderRadius:10,padding:'9px 14px',fontSize:13.5}}>{cta} →</span>
            </Link>))}
        </div>
      </Section>

      <Section eyebrow="숫자로 보는 D-ARS" title="이미 돌아가는 지표" desc="데모 시연용 샘플 데이터">
        <div style={{background:CARD,border:'1px solid '+LINE,borderRadius:20,padding:'clamp(24px,4vw,40px)',display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(130px,1fr))',gap:20,maxWidth:820,margin:'0 auto'}}>
          <Stat n={1220} label="멀티모달 발송"/><Stat n={540} label="런처 자동런칭"/><Stat n={74} suffix="%" label="사용 완료율"/><Stat n={99} suffix=".9%" label="서비스 가용율"/>
        </div>
      </Section>

      <Section eyebrow="FAQ" title="궁금한 점, 먼저 답해드려요"><FAQ/></Section>

      <section style={{background:INK,color:'#fff'}}>
        <div style={{...wrap,textAlign:'center',padding:'clamp(44px,6vw,72px) 20px'}}>
          <div style={{color:'#e6b8a6',fontWeight:800,fontSize:13,letterSpacing:1}}>START TODAY</div>
          <h2 style={{fontSize:'clamp(24px,5.5vw,38px)',margin:'12px 0 8px'}}>지금, 보이는 ARS를 경험해 보세요</h2>
          <p style={{color:'#c9b6ab',fontSize:15,marginBottom:22}}>체험은 1분이면 충분합니다.</p>
          <div style={{display:'flex',gap:10,justifyContent:'center',flexWrap:'wrap'}}>
            <Link href="/visual" style={{fontWeight:800,color:'#fff',background:TR,borderRadius:12,padding:'13px 24px'}}>보이는 ARS 체험 →</Link>
            <Link href="/dashboard" style={{fontWeight:800,color:'#fff',background:'rgba(255,255,255,.12)',borderRadius:12,padding:'13px 24px'}}>운영 콘솔</Link>
          </div>
        </div>
      </section>

      <footer style={{...wrap,padding:'28px 20px 44px',textAlign:'center',color:MUT,fontSize:12.5,lineHeight:1.8}}>D-ARS · 보이는 ARS · 콜봇 연계 모듈 · 운영 GOWON<br/><span style={{opacity:0.7}}>© 2026 · 데모 모드</span></footer>
    </main>
  );
}
