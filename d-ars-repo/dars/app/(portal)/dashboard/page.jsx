'use client';
import { useEffect, useState } from 'react';
import { pct } from '@/lib/ui';

function Kpi({ n, l, delta }) {
  return <div className="card kpi"><div className="n">{n}</div><div className="l">{l}</div>{delta && <div className="delta up">{delta}</div>}</div>;
}
function Spark({ data, color='#be5535', h=60 }) {
  const max = Math.max(...data), min = Math.min(...data), W=260;
  const pts = data.map((v,i)=>`${(i/(data.length-1))*W},${h-((v-min)/(max-min||1))*(h-8)-4}`).join(' ');
  return <svg viewBox={`0 0 ${W} ${h}`} width="100%" height={h}><polyline fill="none" stroke={color} strokeWidth="2.5" points={pts}/></svg>;
}

export default function Dashboard() {
  const [sessions, setSessions] = useState([]);
  const [docs, setDocs] = useState([]);
  const [stats, setStats] = useState(null);
  useEffect(() => {
    const load = () => fetch('/api/sessions').then(r=>r.json()).then(setSessions).catch(()=>{});
    load(); const t = setInterval(load, 5000);
    fetch('/api/docs').then(r=>r.json()).then(setDocs);
    fetch('/api/stats').then(r=>r.json()).then(setStats);
    return () => clearInterval(t);
  }, []);
  const launch = stats?.daily?.map(d=>d.multimodal) || [];
  return (
    <>
      <div className="grid g4">
        <Kpi n="1,220" l="발송 건수" delta="+6.2%" />
        <Kpi n="540" l="런처 자동런칭" delta="+4.1%" />
        <Kpi n="388" l="문자발송(UMS)" delta="+2.4%" />
        <Kpi n="74%" l="사용 완료율" delta="+3.0%p" />
      </div>
      <div className="grid g2" style={{marginTop:16}}>
        <div className="card"><h3>📈 일별 멀티모달 전환</h3><div className="d">최근 7일</div>
          {launch.length>0 && <Spark data={launch} />}</div>
        <div className="card"><h3>📋 서비스별 완료율</h3><div className="d">멀티모달 서비스 사용 완료</div>
          {docs.filter(d=>d.in_use).slice(0,4).map(d=>{const p=pct(d.done,d.req);return (
            <div key={d.id} style={{margin:'10px 0'}}>
              <div style={{display:'flex',justifyContent:'space-between',fontSize:12.5}}><b>{d.name}</b><span className="muted">{d.done}/{d.req} · {p}%</span></div>
              <div className="bar" style={{marginTop:5}}><i style={{width:p+'%'}}/></div>
            </div>);})}
        </div>
      </div>
      <div className="card" style={{marginTop:16}}><h3>📡 실시간 세션 <span className="tag t-info" style={{marginLeft:6}}>LIVE</span></h3>
        <div className="d">개인정보 자동 마스킹 · 5초 갱신</div>
        <table className="tbl"><thead><tr><th>세션</th><th>고객</th><th>시나리오</th><th>단계</th><th>경과</th></tr></thead>
          <tbody>{sessions.slice(0,6).map(s=>(<tr key={s.id}><td><b>{s.id}</b></td><td>{s.phone}</td><td>{s.scenario}</td>
            <td><span className={'tag '+(s.step>=4?'t-ok':'t-info')}>{['런칭','본인확인','상담','안내·발송','완료'][s.step]}</span></td>
            <td>{Math.floor(s.elapsed/60)}:{String(s.elapsed%60).padStart(2,'0')}</td></tr>))}</tbody></table>
      </div>
    </>
  );
}
