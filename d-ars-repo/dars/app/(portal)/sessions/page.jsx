'use client';
import { useEffect, useMemo, useState } from 'react';
import { NODE_TYPES, journey, fmt } from '@/lib/ui';
import { downloadCSV, downloadExcel, printPDF } from '@/lib/export';

export default function Sessions() {
  const [rows, setRows] = useState([]);
  const [live, setLive] = useState(false); // SSE 실시간 연결 여부
  const [q, setQ] = useState('');
  const [sort, setSort] = useState(null); // { key, dir }

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

  // prism-pms 반영: 실시간 검색 + 컬럼 정렬(한글·숫자 자연 정렬, 오름/내림/해제)
  const val = (s, key) => key === 'status' ? s.step : s[key];
  const view = useMemo(() => {
    const kw = q.trim().toLowerCase();
    let r = rows.filter(s => !kw || [s.id, s.phone, s.scenario, s.node].some(v => String(v ?? '').toLowerCase().includes(kw)));
    if (sort) {
      r = [...r].sort((a, b) => {
        const av = val(a, sort.key), bv = val(b, sort.key);
        const c = (typeof av === 'number' && typeof bv === 'number')
          ? av - bv : String(av ?? '').localeCompare(String(bv ?? ''), 'ko', { numeric: true });
        return sort.dir === 'desc' ? -c : c;
      });
    }
    return r;
  }, [rows, q, sort]);
  const sortBy = (key) => setSort(s => s && s.key === key ? (s.dir === 'asc' ? { key, dir: 'desc' } : null) : { key, dir: 'asc' });
  const arw = (key) => !sort || sort.key !== key ? '' : (sort.dir === 'asc' ? ' ▲' : ' ▼');

  const exportCols = [
    { label: '세션ID', value: 'id' }, { label: '고객', value: 'phone' }, { label: '시나리오', value: 'scenario' },
    { label: '단계', value: s => journey[s.step] }, { label: '경과(초)', value: 'elapsed' }, { label: '상태', value: 'status' }];
  const exportCsv = () => downloadCSV('sessions.csv', view, exportCols);
  const exportXlsx = () => downloadExcel('sessions.xls', view, exportCols, '세션');
  const exportPdf = () => printPDF('실시간 세션', view, exportCols);
  return (
    <>
      <div className="sectionhead"><h2>실시간 보이는 ARS 세션</h2>
        <span className="d" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: live ? '#2e9e5b' : '#c9a23a', boxShadow: live ? '0 0 0 3px rgba(46,158,91,.15)' : 'none', flex: '0 0 auto' }} />
          {live ? '실시간 스트림 연결됨' : '자동 갱신(4초) · 번호 마스킹'}
        </span>
        <span className="sp" /><button className="btn sm" onClick={exportCsv}>⬇ CSV</button><button className="btn sm" onClick={exportXlsx}>⬇ Excel</button><button className="btn sm" onClick={exportPdf}>🖨 PDF</button></div>
      <div className="grid g4">
        <div className="card kpi"><div className="n">{active}</div><div className="l">진행 세션</div></div>
        <div className="card kpi"><div className="n">{fmt(avg)}</div><div className="l">평균 경과</div></div>
        <div className="card kpi"><div className="n">{rows.filter(s => s.step === 3).length}</div><div className="l">안내·발송 단계</div></div>
        <div className="card kpi"><div className="n">{rows.filter(s => s.node === 'CHANNEL_SWITCH').length}</div><div className="l">상담원 전환 대기</div></div>
      </div>
      <div className="card" style={{ marginTop: 16 }}><h3>세션 보드</h3>
        <div className="toolbar">
          <input className="input" placeholder="세션ID·고객·시나리오·노드 검색" value={q} onChange={e => setQ(e.target.value)} style={{ flex: '1 1 200px' }} />
          <span className="muted" style={{ fontSize: 12 }}>{view.length}건</span>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="tbl"><thead><tr>
            <th className="sort" onClick={() => sortBy('id')}>세션ID{arw('id')}</th>
            <th className="sort" onClick={() => sortBy('phone')}>고객{arw('phone')}</th>
            <th className="sort" onClick={() => sortBy('scenario')}>시나리오{arw('scenario')}</th>
            <th>현재 노드</th>
            <th className="sort" onClick={() => sortBy('step')}>여정{arw('step')}</th>
            <th className="sort" onClick={() => sortBy('elapsed')}>경과{arw('elapsed')}</th>
            <th className="sort" onClick={() => sortBy('status')}>상태{arw('status')}</th>
          </tr></thead>
            <tbody>{view.map(s => { const nt = NODE_TYPES[s.node]; return (<tr key={s.id}>
              <td><b>{s.id}</b></td><td>{s.phone}</td><td>{s.scenario}</td>
              <td><span className="tag t-info">{nt ? nt.ic + ' ' + nt.name : s.node}</span></td>
              <td><div style={{ display: 'flex', gap: 3, alignItems: 'center' }}>{journey.map((j, i) =>
                <span key={i} style={{ width: 9, height: 9, borderRadius: '50%', background: i <= s.step ? '#be5535' : '#e2d5cd' }} />)}</div></td>
              <td>{fmt(s.elapsed)}</td><td><span className={'tag ' + (s.step >= 4 ? 't-ok' : 't-info')}>{s.step >= 4 ? '완료' : '진행'}</span></td>
            </tr>); })}
            {view.length === 0 && <tr><td colSpan="7" style={{ textAlign: 'center' }} className="muted">검색 결과가 없습니다</td></tr>}</tbody></table>
        </div>
      </div>
    </>
  );
}
