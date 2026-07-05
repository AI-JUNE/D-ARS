'use client';
import { useEffect, useState } from 'react';
import { NODE_TYPES, journey, fmt } from '@/lib/ui';
import { downloadCSV, downloadExcel } from '@/lib/export';

export default function Sessions() {
  const [rows, setRows] = useState([]);
  const [live, setLive] = useState(false); // SSE 실시간 연결 여부

  useEffect(() => {
    let es = null, poll = null, stopped = false;
    const apply = (data) => { if (Array.isArray(data)) setRows(data); };
    const startPolling = () => {
      if (poll) return;
      const load = () => fetch('/api/sessions').then(r => r.json()).then(apply).catch(() => {});
      load(); poll = setInterval(load, 4000);
    };
    const stopPolling = () => { if (poll) { clearInterval(poll); poll = null; } };

    if (typeof window !== 'undefined' && 'EventSource' in window) {
      try {
        es = new EventSource('/api/sessions/stream');
        es.addEventListener('sessions', (e) => { try { apply(JSON.parse(e.data)); } catch {} });
        es.addEventListener('ready', () => { if (!stopped) { setLive(true); stopPolling(); } });
        es.onerror = () => { setLive(false); startPolling(); }; // 재연결 대기 중에는 폴링으로 커버
      } catch { startPolling(); }
    } else { startPolling(); }

    return () => { stopped = true; if (es) es.close(); stopPolling(); };
  }, []);

  const active = rows.filter(s => s.step < 4).length;
  const avg = rows.length ? Math.round(rows.reduce((a, s) => a + s.elapsed, 0) / rows.length) : 0;
  const exportCols = [
    { label: '세션ID', value: 'id' }, { label: '고객', value: 'phone' }, { label: '시나리오', value: 'scenario' },
    { label: '단계', value: s => journey[s.step] }, { label: '경과(초)', value: 'elapsed' }, { label: '상태', value: 'status' }];
  const exportCsv = () => downloadCSV('sessions.csv', rows, exportCols);
  const exportXlsx = () => downloadExcel('sessions.xls', rows, exportCols, '세션');
  return (
    <>
      <div className="sectionhead"><h2>실시간 보이는 ARS 세션</h2>
        <span className="d" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: live ? '#2e9e5b' : '#c9a23a', boxShadow: live ? '0 0 0 3px rgba(46,158,91,.15)' : 'none', flex: '0 0 auto' }} />
          {live ? '실시간 스트림 연결됨' : '자동 갱신(4초) · 번호 마스킹'}
        </span>
        <span className="sp" /><button className="btn sm" onClick={exportCsv}>⬇ CSV</button><button className="btn sm" onClick={exportXlsx}>⬇ Excel</button></div>
      <div className="grid g4">
        <div className="card kpi"><div className="n">{active}</div><div className="l">진행 세션</div></div>
        <div className="card kpi"><div className="n">{fmt(avg)}</div><div className="l">평균 경과</div></div>
        <div className="card kpi"><div className="n">{rows.filter(s => s.step === 3).length}</div><div className="l">안내·발송 단계</div></div>
        <div className="card kpi"><div className="n">{rows.filter(s => s.node === 'CHANNEL_SWITCH').length}</div><div className="l">상담원 전환 대기</div></div>
      </div>
      <div className="card" style={{ marginTop: 16 }}><h3>세션 보드</h3>
        <div style={{ overflowX: 'auto' }}>
          <table className="tbl"><thead><tr><th>세션ID</th><th>고객</th><th>시나리오</th><th>현재 노드</th><th>여정</th><th>경과</th><th>상태</th></tr></thead>
            <tbody>{rows.map(s => { const nt = NODE_TYPES[s.node]; return (<tr key={s.id}>
              <td><b>{s.id}</b></td><td>{s.phone}</td><td>{s.scenario}</td>
              <td><span className="tag t-info">{nt ? nt.ic + ' ' + nt.name : s.node}</span></td>
              <td><div style={{ display: 'flex', gap: 3, alignItems: 'center' }}>{journey.map((j, i) =>
                <span key={i} style={{ width: 9, height: 9, borderRadius: '50%', background: i <= s.step ? '#be5535' : '#e2d5cd' }} />)}</div></td>
              <td>{fmt(s.elapsed)}</td><td><span className={'tag ' + (s.step >= 4 ? 't-ok' : 't-info')}>{s.step >= 4 ? '완료' : '진행'}</span></td>
            </tr>); })}</tbody></table>
        </div>
      </div>
    </>
  );
}
