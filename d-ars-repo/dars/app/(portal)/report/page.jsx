'use client';
import { useEffect, useState } from 'react';
import { pct } from '@/lib/ui';

// 운영 리포트 — 브라우저 인쇄(PDF로 저장)로 출력. 읽기 전용, 스키마 변경 없음.
export default function Report() {
  const [stats, setStats] = useState(null);
  const [docs, setDocs] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [now, setNow] = useState('');

  useEffect(() => {
    fetch('/api/stats').then(r=>r.json()).then(setStats).catch(()=>{});
    fetch('/api/docs').then(r=>r.json()).then(d=>setDocs(d||[])).catch(()=>{});
    fetch('/api/sessions').then(r=>r.json()).then(s=>setSessions(s||[])).catch(()=>{});
    setNow(new Date().toLocaleString('ko-KR', { dateStyle:'long', timeStyle:'short' }));
  }, []);

  const daily = stats?.daily || [];
  const sum = (k) => daily.reduce((a,d)=>a+(Number(d[k])||0), 0);
  const totalMulti = sum('multimodal'), totalDone = sum('completed'), totalDrop = sum('dropped'), totalIn = sum('inbound');
  const doneRate = pct(totalDone, totalMulti);
  const dropRate = pct(totalDrop, totalMulti);
  const usedDocs = docs.filter(d=>d.in_use);

  return (
    <>
      <div className="sectionhead noprint">
        <h2>운영 리포트</h2>
        <span className="d">일별 운영 지표 요약 · 인쇄하여 PDF로 저장</span>
        <div className="sp" />
        <button className="btn sm primary" onClick={()=>window.print()}>🖨️ PDF 저장 / 인쇄</button>
      </div>

      <div className="report card">
        <div className="rp-head">
          <div className="rp-brand"><span className="dot" /> D-ARS · 보이는 ARS</div>
          <h1 className="rp-title">운영 리포트</h1>
          <div className="rp-meta">생성 {now || '…'} · 운영 GOWON · 최근 {daily.length}일 집계</div>
        </div>

        <div className="rp-kpis">
          <div><b>{totalMulti.toLocaleString()}</b><span>멀티모달 전환</span></div>
          <div><b>{totalDone.toLocaleString()}</b><span>완료</span></div>
          <div><b>{doneRate}%</b><span>완료율</span></div>
          <div><b>{dropRate}%</b><span>이탈률</span></div>
        </div>

        <h3 className="rp-h3">일별 운영 추이</h3>
        <table className="tbl rp-tbl">
          <thead><tr><th>일자</th><th>인입</th><th>멀티모달</th><th>완료</th><th>이탈</th><th>완료율</th></tr></thead>
          <tbody>
            {daily.map((d,i)=>(
              <tr key={i}>
                <td>{String(d.day).slice(0,10)}</td>
                <td>{d.inbound}</td><td>{d.multimodal}</td><td>{d.completed}</td><td>{d.dropped}</td>
                <td>{pct(d.completed, d.multimodal)}%</td>
              </tr>
            ))}
            {daily.length>0 && (
              <tr className="rp-total"><td>합계</td><td>{totalIn}</td><td>{totalMulti}</td><td>{totalDone}</td><td>{totalDrop}</td><td>{doneRate}%</td></tr>
            )}
          </tbody>
        </table>

        <h3 className="rp-h3">서비스별 완료율</h3>
        <table className="tbl rp-tbl">
          <thead><tr><th>서류/서비스</th><th>요청</th><th>완료</th><th>완료율</th></tr></thead>
          <tbody>
            {usedDocs.map(d=>(
              <tr key={d.id}><td>{d.name}</td><td>{d.req}</td><td>{d.done}</td><td>{pct(d.done,d.req)}%</td></tr>
            ))}
            {usedDocs.length===0 && <tr><td colSpan={4} className="muted">운영 중 서류가 없습니다.</td></tr>}
          </tbody>
        </table>

        <h3 className="rp-h3">진행 세션 스냅샷</h3>
        <table className="tbl rp-tbl">
          <thead><tr><th>세션</th><th>고객</th><th>시나리오</th><th>단계</th></tr></thead>
          <tbody>
            {sessions.slice(0,8).map(s=>(
              <tr key={s.id}><td>{s.id}</td><td>{s.phone}</td><td>{s.scenario}</td>
                <td>{['런칭','본인확인','상담','안내·발송','완료'][s.step]}</td></tr>
            ))}
            {sessions.length===0 && <tr><td colSpan={4} className="muted">진행 중 세션이 없습니다.</td></tr>}
          </tbody>
        </table>

        <div className="rp-foot">본 리포트는 D-ARS 관리자 포털에서 자동 생성되었습니다. 고객 번호는 마스킹 처리됩니다. · #be5535</div>
      </div>
    </>
  );
}
