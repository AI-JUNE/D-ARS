'use client';
import { useEffect, useState } from 'react';
import { tagClass } from '@/lib/ui';
import { downloadCSV, downloadExcel, printPDF } from '@/lib/export';

export default function Ums() {
  const [rows, setRows] = useState([]);
  const [filter, setFilter] = useState('전체');
  const load = (f=filter) => fetch('/api/ums?status='+encodeURIComponent(f)).then(r=>r.json()).then(setRows);
  useEffect(() => { load('전체'); }, []);
  const pick = (f) => { setFilter(f); load(f); };
  const test = async () => { await fetch('/api/ums', { method:'POST', body: JSON.stringify({ service:'영수증 발급', doc:'거래 영수증' }) }); load(); };
  const time = (t) => new Date(t).toTimeString().slice(0,5);
  const exportCols = [
    {label:'시각',value:r=>time(r.sent_at)},{label:'휴대폰',value:'phone'},{label:'서비스',value:'service'},
    {label:'서류',value:'doc'},{label:'상태',value:'status'}];
  const exportCsv = () => downloadCSV('ums.csv', rows, exportCols);
  const exportXlsx = () => downloadExcel('ums.xls', rows, exportCols, 'UMS');
  const exportPdf = () => printPDF('UMS 발송 내역', rows, exportCols);
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
        <span className="sp" />
        <button className="btn sm" onClick={exportCsv}>⬇ CSV</button><button className="btn sm" onClick={exportXlsx}>⬇ Excel</button><button className="btn sm" onClick={exportPdf}>🖨 PDF</button>
        <button className="btn primary sm" onClick={test}>✉️ 테스트 발송</button>
      </div>
      <div className="card"><table className="tbl"><thead><tr><th>시각</th><th>휴대폰</th><th>서비스</th><th>서류</th><th>상태</th></tr></thead>
        <tbody>{rows.map(r=>(<tr key={r.id}><td>{time(r.sent_at)}</td><td>{r.phone}</td><td>{r.service}</td><td>{r.doc}</td>
          <td><span className={'tag '+tagClass(r.status)}>{r.status}</span></td></tr>))}
          {rows.length===0 && <tr><td colSpan="5" style={{textAlign:'center'}} className="muted">해당 상태의 발송이 없습니다</td></tr>}</tbody></table></div>
    </>
  );
}
