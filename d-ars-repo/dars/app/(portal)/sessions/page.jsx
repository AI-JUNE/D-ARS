'use client';
import { useEffect, useState } from 'react';
import { NODE_TYPES, journey, fmt } from '@/lib/ui';

export default function Sessions() {
  const [rows, setRows] = useState([]);
  useEffect(() => {
    const load = () => fetch('/api/sessions').then(r=>r.json()).then(setRows).catch(()=>{});
    load(); const t = setInterval(load, 4000); return () => clearInterval(t);
  }, []);
  const active = rows.filter(s=>s.step<4).length;
  const avg = rows.length ? Math.round(rows.reduce((a,s)=>a+s.elapsed,0)/rows.length) : 0;
  return (
    <>
      <div className="sectionhead"><h2>실시간 보이는 ARS 세션</h2><span className="d">4초 자동 갱신 · 번호 마스킹</span></div>
      <div className="grid g4">
        <div className="card kpi"><div className="n">{active}</div><div className="l">진행 세션</div></div>
        <div className="card kpi"><div className="n">{fmt(avg)}</div><div className="l">평균 경과</div></div>
        <div className="card kpi"><div className="n">{rows.filter(s=>s.step===3).length}</div><div className="l">안내·발송 단계</div></div>
        <div className="card kpi"><div className="n">{rows.filter(s=>s.node==='CHANNEL_SWITCH').length}</div><div className="l">상담원 전환 대기</div></div>
      </div>
      <div className="card" style={{marginTop:16}}><h3>세션 보드</h3>
        <table className="tbl"><thead><tr><th>세션ID</th><th>고객</th><th>시나리오</th><th>현재 노드</th><th>여정</th><th>경과</th><th>상태</th></tr></thead>
          <tbody>{rows.map(s=>{const nt=NODE_TYPES[s.node];return (<tr key={s.id}>
            <td><b>{s.id}</b></td><td>{s.phone}</td><td>{s.scenario}</td>
            <td><span className="tag t-info">{nt?nt.ic+' '+nt.name:s.node}</span></td>
            <td><div style={{display:'flex',gap:3,alignItems:'center'}}>{journey.map((j,i)=>
              <span key={i} style={{width:9,height:9,borderRadius:'50%',background:i<=s.step?'#be5535':'#e2d5cd'}}/>)}</div></td>
            <td>{fmt(s.elapsed)}</td><td><span className={'tag '+(s.step>=4?'t-ok':'t-info')}>{s.step>=4?'완료':'진행'}</span></td>
          </tr>);})}</tbody></table>
      </div>
    </>
  );
}
