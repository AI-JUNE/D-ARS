'use client';
import { useState, useRef } from 'react';

const journey = ['연결','본인확인','상담','안내·발송','완료'];
export default function Visual() {
  const [msgs, setMsgs] = useState([{ who:'bot', text:'통화가 연결되면 여기에서 음성과 함께 안내가 표시됩니다. 아래 메뉴로 바로 시작할 수도 있어요.' }]);
  const [step, setStep] = useState(0);
  const [listening, setListening] = useState(false);
  const boxRef = useRef(null);
  const wait = (ms) => new Promise(r=>setTimeout(r,ms));
  const push = (m) => setMsgs(prev => { const n=[...prev,m]; setTimeout(()=>{if(boxRef.current)boxRef.current.scrollTop=boxRef.current.scrollHeight;},30); return n; });

  const play = async () => {
    setMsgs([]); setStep(0);
    await bot('안녕하세요, 고객센터입니다. 무엇을 도와드릴까요? 화면으로도 함께 안내해 드릴게요.');
    setStep(1); await cust('어제 받은 한우세트가 불량이에요');
    await bot('불편을 드려 죄송합니다. 해당 주문을 확인했어요.', card('order'));
    setStep(2); await cust('환불해 주세요');
    await bot('환불 접수를 도와드릴게요. 아래 반품 접수서를 작성하시면 바로 처리됩니다.', card('doc'));
    setStep(3); await bot('작성 링크는 문자로도 보내드릴 수 있어요.');
  };
  async function bot(text, extra) { setListening(false); push({ who:'bot', text, extra }); await wait(500); }
  async function cust(text) { setListening(true); await wait(700); setListening(false); push({ who:'cust', text }); await wait(300); }
  function card(kind) { return { kind }; }
  const pick = async (kind) => {
    setStep(2);
    if (kind==='order') { await cust('내 주문 내역 보여줘'); await bot('최근 주문 내역이에요.', card('order')); }
    if (kind==='track') { await cust('배송 어디쯤 왔어요?'); await bot('현재 배송 현황이에요.', card('track')); }
    if (kind==='doc') { await cust('반품하려면 뭐가 필요해요?'); await bot('반품 접수에 필요한 서류예요.', card('doc')); setStep(3); }
  };

  return (
    <div style={{minHeight:'100vh',display:'grid',placeItems:'center',background:'radial-gradient(1200px 600px at 50% -10%, #f7ece6, #e7ddd5)',padding:20}}>
      <div style={{width:390,background:'#0d0b0a',borderRadius:44,padding:12,boxShadow:'0 8px 30px rgba(60,30,20,.2)'}}>
        <div style={{background:'#f4f1ee',borderRadius:34,overflow:'hidden',height:720,display:'flex',flexDirection:'column'}}>
          <div style={{background:'linear-gradient(135deg,#be5535,#9c4025)',color:'#fff',padding:'22px 18px 14px'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              <b>📞 고객센터 상담</b><span style={{fontSize:11,background:'rgba(255,255,255,.18)',padding:'4px 9px',borderRadius:999}}>● 통화 연결됨</span>
            </div>
            <div style={{fontSize:12,opacity:.9,marginTop:6}}>보이는 ARS · 대표번호 1600-1234</div>
          </div>
          <div style={{background:'#fff7f3',borderBottom:'1px solid #e6ddd7',color:'#8a5a44',fontSize:11,padding:'7px 16px'}}>
            ℹ️ 본 상담은 생성형 AI가 함께 응대합니다 (AI 기본법 제31조 고지).</div>
          <div style={{display:'flex',padding:'10px 14px 4px'}}>
            {journey.map((j,i)=>(<div key={i} style={{flex:1,textAlign:'center',fontSize:10,color:i<=step?'#9c4025':'#8a7a72',fontWeight:600}}>
              <div style={{width:16,height:16,borderRadius:'50%',margin:'0 auto 4px',background:i<=step?'#be5535':'#e2d5cd'}}/>{j}</div>))}
          </div>
          <div ref={boxRef} style={{flex:1,overflowY:'auto',padding:'12px 14px',display:'flex',flexDirection:'column',gap:10}}>
            {msgs.map((m,i)=>(<Bubble key={i} m={m} />))}
          </div>
          <div style={{padding:'8px 14px',minHeight:34,fontSize:12,color:listening?'#9c4025':'#8a7a72',fontWeight:600}}>
            {listening ? '🎙️ 고객님 말씀을 듣고 있어요…' : '메뉴를 누르거나 통화를 시작하세요'}</div>
          <div style={{padding:'6px 12px',display:'flex',flexWrap:'wrap',gap:7}}>
            {[['order','🧾 주문상세'],['track','🚚 배송추적'],['doc','📋 필요서류']].map(([k,l])=>(
              <button key={k} onClick={()=>pick(k)} style={btnStyle}>{l}</button>))}
            <button onClick={play} style={{...btnStyle,background:'#be5535',color:'#fff',flex:'1 1 100%'}}>▶ 자동 시연</button>
          </div>
        </div>
      </div>
    </div>
  );
}
const btnStyle = { flex:'1 1 30%', border:'1px solid #e6ddd7', background:'#fff', borderRadius:11, padding:'11px 6px', fontWeight:700, fontSize:12.5, cursor:'pointer', fontFamily:'inherit' };
function Bubble({ m }) {
  const bot = m.who==='bot';
  return (
    <div style={{maxWidth:'86%',alignSelf:bot?'flex-start':'flex-end',background:bot?'#fff':'#f7e7df',border:bot?'1px solid #e6ddd7':'0',
      borderRadius:16,padding:'10px 13px',fontSize:13.5,lineHeight:1.5,color:bot?'#241a16':'#4a2c1e'}}>
      <div style={{fontSize:10,fontWeight:800,marginBottom:3,color:bot?'#be5535':'#a06a4e'}}>{bot?'보이는 ARS · AI':'고객 발화 (STT)'}</div>
      {m.text}
      {m.extra && <Card kind={m.extra.kind} />}
    </div>
  );
}
function Card({ kind }) {
  const box = { background:'#fff',border:'1px solid #e6ddd7',borderRadius:12,padding:10,marginTop:8,fontSize:12.5 };
  const kv = (k,v)=>(<div style={{display:'flex',justifyContent:'space-between',padding:'4px 0',borderBottom:'1px dashed #eee'}}><span className="muted">{k}</span><b>{v}</b></div>);
  if (kind==='order') return <div style={box}><b>🧾 주문 상세</b>{kv('상품','한우 등심 세트 1.2kg')}{kv('주문번호','2026-0703-8841')}{kv('결제금액','₩129,000')}</div>;
  if (kind==='track') return <div style={box}><b>🚚 배송 추적</b>{kv('송장번호','6483-1120-7755')}{kv('현재 위치','동서울 물류센터')}</div>;
  if (kind==='doc') return <div style={box}><b>📋 반품 접수서</b><div style={{display:'flex',gap:8,marginTop:6,alignItems:'center'}}>
    <span style={{flex:1}} className="muted">불량 사유·환불 계좌 입력</span>
    <button onClick={(e)=>{e.currentTarget.textContent='발송완료 ✓';e.currentTarget.style.background='#2e8b57';}}
      style={{border:0,background:'#be5535',color:'#fff',fontWeight:800,fontSize:12,padding:'8px 12px',borderRadius:9,cursor:'pointer'}}>문자 발송</button></div></div>;
  return null;
}
