'use client';
import { useEffect, useMemo, useState } from 'react';
import { tagClass } from '@/lib/ui';
import { downloadCSV, downloadExcel, printPDF } from '@/lib/export';

export default function Ums() {
  const [rows, setRows] = useState([]);
  const [filter, setFilter] = useState('전체');
  const [q, setQ] = useState('');
  const [sort, setSort] = useState(null);
  const load = (f=filter) => fetch('/api/ums?status='+encodeURIComponent(f)).then(r=>r.json()).then(setRows);
  useEffect(() => { load('전체'); }, []);
  const pick = (f) => { setFilter(f); load(f); };
  const test = async () => { await fetch('/api/ums', { method:'POST', body: JSON.stringify({ service:'영수증 발급', doc:'거래 영수증' }) }); load(); };
  const time = (t) => new Date(t).toTimeString().slice(0,5);

  const val = (r, key) => key==='sent_at' ? new Date(r.sent_at).getTime() : r[key];
  const view = useMemo(() => {
    const kw = q.trim().toLowerCase();
    let r = rows.filter(x => !kw || [x.phone, x.service, x.doc].some(v => String(v||'').toLowerCase().includes(kw)));
    if (sort) {
      r = [...r].sort((a,b) => {
        const av = val(a, sort.key), bv = val(b, sort.key);
        const c = (typeof av==='number' && typeof bv==='number')
          ? av - bv : String(av??'').localeCompare(String(bv??''), 'ko', { numeric:true });
        return sort.dir==='desc' ? -c : c;
      });
    }
    return r;
  }, [rows, q, sort]);
  const sortBy = (key) => setSort(s => s && s.key===key ? (s.dir==='asc' ? {key,dir:'desc'} : null) : {key,dir:'asc'});
  const arw = (key) => !sort || sort.key!==key ? '' : (sort.dir==='asc' ? ' ▲' : ' ▼');

  const exportCols = [
    {label:'시각',value:r=>time(r.sent_at)},{label:'휴대폰',value:'phone'},{label:'서비스',value:'service'},
    {label:'서류',value:'doc'},{label:'상태',value:'status'}];
  const exportCsv = () => downloadCSV('ums.csv', view, exportCols);
  const exportXlsx = () => downloadExcel('ums.xls', view, exportCols, 'UMS');
  const exportPdf = () => printPDF('UMS 발송 내역', view, exportCols);
  return (
    <>
      <div className="sectionhead"><h2>UMS 문자발송</h2><span className="d">보이는 ARS 서류·영수증 링크 발송 로그</span></div>
      <div className="grid g4">
        <div className="card kpi"><div className="n">388</div><div className="l">오늘 발송</div></div>
        <div className="card kpi"><div className="n">86%</div><div className="l">발송 성공률</div></div>
        <div className="card kpi"><div className="n">{rows.filter(r=>r.status==='대기').length}</div><div className="l">대기</div></div>
        <div className="card kpi"><div className="n">{rows.filter(r=>r.status==='실패').length}</div><div className="l">실패</div></div>
      </div>
      <div className="toolbar" style={{marginTop:16}}>
        <div className="seg">{['전체','발송완료','대기','실패'].map(f=>(
          <button key={f} className={filter===f?'on':''} onClick={()=>pick(f)}>{f}</button>))}</div>
        <input className="input" placeholder="번호·서비스·서류 검색" value={q} onChange={e=>setQ(e.target.value)} style={{flex:'1 1 160px'}} />
        <span className="sp" />
        <button className="btn sm" onClick={exportCsv}>⬇ CSV</button><button className="btn sm" onClick={exportXlsx}>⬇ Excel</button><button className="btn sm" onClick={exportPdf}>🖨 PDF</button>
        <button className="btn primary sm" onClick={test}>✉️ 테스트 발송</button>
      </div>
      <div className="card"><table className="tbl"><thead><tr>
        <th className="sort" onClick={()=>sortBy('sent_at')}>시각{arw('sent_at')}</th>
        <th className="sort" onClick={()=>sortBy('phone')}>휴대폰{arw('phone')}</th>
        <th className="sort" onClick={()=>sortBy('service')}>서비스{arw('service')}</th>
        <th className="sort" onClick={()=>sortBy('doc')}>서류{arw('doc')}</th>
        <th className="sort" onClick={()=>sortBy('status')}>상태{arw('status')}</th>
      </tr></thead>
        <tbody>{view.map(r=>(<tr key={r.id}><td>{time(r.sent_at)}</td><td>{r.phone}</td><td>{r.service}</td><td>{r.doc}</td>
          <td><span className={'tag '+tagClass(r.status)}>{r.status}</span></td></tr>))}
          {view.length===0 && <tr><td colSpan="5" style={{textAlign:'center'}} className="muted">해당 조건의 발송이 없습니다</td></tr>}</tbody></table></div>
    </>
  );
}
