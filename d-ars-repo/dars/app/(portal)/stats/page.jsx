'use client';
import { useEffect, useState } from 'react';
import { pct } from '@/lib/ui';

function Bars({ data }) {
  const max = Math.max(...data.map(d=>d.v));
  return <svg viewBox="0 0 300 160" width="100%" height="160">
    {data.map((d,i)=>{const h=(d.v/max)*120;const x=i*(300/data.length)+12;const w=300/data.length*0.5;
      return <g key={i}><rect x={x} y={140-h} width={w} height={h} fill="#be5535" rx="3"/>
        <text x={x+w/2} y={135-h} fontSize="10" fill="#241a16" textAnchor="middle">{d.v}</text>
        <text x={x+w/2} y={155} fontSize="9" fill="#8a7a72" textAnchor="middle">{d.l}</text></g>;})}
  </svg>;
}
export default function Stats() {
  const [s, setS] = useState(null);
  useEffect(() => { fetch('/api/stats').then(r=>r.json()).then(setS); }, []);
  if (!s) return <div className="card">불러오는 중…</div>;
  const bars = s.daily.map(d=>({ l:d.day.slice(5), v:d.multimodal }));
  return (
    <>
      <div className="sectionhead"><h2>이용 통계</h2><span className="d">멀티모달·스마트ARS 이용 분석</span></div>
      <div className="grid g4">
        <div className="card kpi"><div className="n">4,182</div><div className="l">총 인입</div></div>
        <div className="card kpi"><div className="n">540</div><div className="l">멀티모달 전환</div></div>
        <div className="card kpi"><div className="n">902</div><div className="l">완료</div></div>
        <div className="card kpi"><div className="n">318</div><div className="l">이탈</div></div>
      </div>
      <div className="card" style={{marginTop:16}}><h3>📈 일별 멀티모달 전환</h3><Bars data={bars} /></div>
      <div className="card" style={{marginTop:16}}><h3>📋 서비스별 상세</h3>
        <table className="tbl"><thead><tr><th>서비스</th><th>발송</th><th>자동런칭</th><th>문자발송</th><th>이탈</th><th>완료</th><th>완료율</th></tr></thead>
          <tbody>{s.services.map(r=>{const p=pct(r.done,r.sent);return (<tr key={r.name}>
            <td><b>{r.name}</b></td><td>{r.sent}</td><td>{r.launch}</td><td>{r.sms}</td><td>{r.drop}</td><td><b>{r.done}</b></td>
            <td style={{minWidth:110}}><div className="bar"><i style={{width:p+'%'}}/></div></td></tr>);})}</tbody></table></div>
    </>
  );
}
