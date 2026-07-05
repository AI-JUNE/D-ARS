'use client';
import { useEffect, useMemo, useState } from 'react';
import { pct } from '@/lib/ui';
import { downloadCSV, downloadExcel, printPDF } from '@/lib/export';

export default function Docs() {
  const [docs, setDocs] = useState([]);
  const [q, setQ] = useState('');
  const [sort, setSort] = useState(null); // { key, dir }
  const load = () => fetch('/api/docs').then(r=>r.json()).then(setDocs);
  useEffect(() => { load(); }, []);
  const add = async () => {
    const biz = prompt('업무(대분류)', '반품·교환'); if (biz===null) return;
    const name = prompt('서류명', '새 서류'); if (name===null) return;
    await fetch('/api/docs', { method:'POST', body: JSON.stringify({ biz, name }) }); load();
  };
  const toggle = async (d) => { await fetch('/api/docs/'+d.id, { method:'PUT', body: JSON.stringify({ in_use: !d.in_use }) }); load(); };

  const val = (d, key) => key==='rate' ? pct(d.done, d.req) : d[key];
  const view = useMemo(() => {
    const kw = q.trim().toLowerCase();
    let r = docs.filter(d => !kw || [d.biz, d.name].some(v => String(v||'').toLowerCase().includes(kw)));
    if (sort) {
      r = [...r].sort((a,b) => {
        const av = val(a, sort.key), bv = val(b, sort.key);
        const c = (typeof av==='number' && typeof bv==='number')
          ? av - bv : String(av??'').localeCompare(String(bv??''), 'ko', { numeric:true });
        return sort.dir==='desc' ? -c : c;
      });
    }
    return r;
  }, [docs, q, sort]);
  const sortBy = (key) => setSort(s => s && s.key===key ? (s.dir==='asc' ? {key,dir:'desc'} : null) : {key,dir:'asc'});
  const arw = (key) => !sort || sort.key!==key ? '' : (sort.dir==='asc' ? ' ▲' : ' ▼');

  const exportCols = [
    {label:'업무',value:'biz'},{label:'서류명',value:'name'},{label:'요청',value:'req'},
    {label:'발송',value:'sent'},{label:'완료',value:'done'},{label:'완료율%',value:d=>pct(d.done,d.req)},{label:'사용',value:d=>d.in_use?'Y':'N'}];
  const exportCsv = () => downloadCSV('docs.csv', view, exportCols);
  const exportXlsx = () => downloadExcel('docs.xls', view, exportCols, '서류');
  const exportPdf = () => printPDF('필요서류 현황', view, exportCols);
  return (
    <>
      <div className="sectionhead"><h2>필요서류 관리</h2><span className="d">보이는 ARS·UMS 안내·발송 서류</span>
        <span className="sp" /><button className="btn sm" onClick={exportCsv}>⬇ CSV</button><button className="btn sm" onClick={exportXlsx}>⬇ Excel</button><button className="btn sm" onClick={exportPdf}>🖨 PDF</button><button className="btn primary sm" onClick={add}>+ 서류</button></div>
      <div className="toolbar">
        <input className="input" placeholder="업무·서류명 검색" value={q} onChange={e=>setQ(e.target.value)} style={{flex:'1 1 200px'}} />
        <span className="muted" style={{fontSize:12}}>{view.length}건</span>
      </div>
      <div className="card"><table className="tbl">
        <thead><tr>
          <th>순위</th>
          <th className="sort" onClick={()=>sortBy('biz')}>업무{arw('biz')}</th>
          <th className="sort" onClick={()=>sortBy('name')}>서류명{arw('name')}</th>
          <th className="sort" onClick={()=>sortBy('req')}>요청{arw('req')}</th>
          <th className="sort" onClick={()=>sortBy('sent')}>발송{arw('sent')}</th>
          <th className="sort" onClick={()=>sortBy('done')}>완료{arw('done')}</th>
          <th className="sort" onClick={()=>sortBy('rate')}>완료율{arw('rate')}</th>
          <th>사용</th><th>조치</th>
        </tr></thead>
        <tbody>{view.map((d,i)=>{const p=pct(d.done,d.req);return (<tr key={d.id}>
          <td>{i+1}</td><td>{d.biz}</td><td><b>{d.name}</b></td><td>{d.req}</td><td>{d.sent}</td><td><b>{d.done}</b></td>
          <td style={{minWidth:120}}><div className="bar"><i style={{width:p+'%'}}/></div><span className="muted" style={{fontSize:11}}>{p}%</span></td>
          <td><span className={'tag '+(d.in_use?'t-ok':'t-mut')}>{d.in_use?'사용':'미사용'}</span></td>
          <td><button className="btn sm" onClick={()=>toggle(d)}>{d.in_use?'미사용':'사용'}</button></td>
        </tr>);})}
        {view.length===0 && <tr><td colSpan="9" style={{textAlign:'center'}} className="muted">검색 결과가 없습니다</td></tr>}</tbody></table></div>
    </>
  );
}
