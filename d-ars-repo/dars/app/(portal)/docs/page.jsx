'use client';
import { useEffect, useState } from 'react';
import { pct } from '@/lib/ui';

export default function Docs() {
  const [docs, setDocs] = useState([]);
  const load = () => fetch('/api/docs').then(r=>r.json()).then(setDocs);
  useEffect(() => { load(); }, []);
  const add = async () => {
    const biz = prompt('업무(대분류)', '반품·교환'); if (biz===null) return;
    const name = prompt('서류명', '새 서류'); if (name===null) return;
    await fetch('/api/docs', { method:'POST', body: JSON.stringify({ biz, name }) }); load();
  };
  const toggle = async (d) => { await fetch('/api/docs/'+d.id, { method:'PUT', body: JSON.stringify({ in_use: !d.in_use }) }); load(); };
  return (
    <>
      <div className="sectionhead"><h2>필요서류 관리</h2><span className="d">보이는 ARS·UMS 안내·발송 서류</span>
        <span className="sp" /><button className="btn primary" onClick={add}>+ 서류</button></div>
      <div className="card"><table className="tbl">
        <thead><tr><th>순위</th><th>업무</th><th>서류명</th><th>요청</th><th>발송</th><th>완료</th><th>완료율</th><th>사용</th><th>조치</th></tr></thead>
        <tbody>{docs.map((d,i)=>{const p=pct(d.done,d.req);return (<tr key={d.id}>
          <td>{i+1}</td><td>{d.biz}</td><td><b>{d.name}</b></td><td>{d.req}</td><td>{d.sent}</td><td><b>{d.done}</b></td>
          <td style={{minWidth:120}}><div className="bar"><i style={{width:p+'%'}}/></div><span className="muted" style={{fontSize:11}}>{p}%</span></td>
          <td><span className={'tag '+(d.in_use?'t-ok':'t-mut')}>{d.in_use?'사용':'미사용'}</span></td>
          <td><button className="btn sm" onClick={()=>toggle(d)}>{d.in_use?'미사용':'사용'}</button></td>
        </tr>);})}</tbody></table></div>
    </>
  );
}
