'use client';
import { useEffect, useMemo, useState } from 'react';
import { NODE_TYPES, fmt, pct } from '@/lib/ui';
import { downloadCSV, downloadExcel } from '@/lib/export';

/* 멀티모달 이력 — 보이는 ARS 상호작용 로그(화면·음성·문자·RAG·전환)를
   한 화면에서 조회·필터·내보내기. 읽기 전용 · 모바일 우선 · 브랜드 #be5535. */

const CH = ['전체', '화면 표출', '음성 안내', '메뉴 선택', '서류 안내', 'RAG 응답', '문자 발송', '채널 전환'];
const RESULT_TAG = { '완료': 't-ok', '이탈': 't-bad', '상담원 전환': 't-warn' };

export default function History() {
  const [rows, setRows] = useState([]);
  const [ch, setCh] = useState('전체');
  const [q, setQ] = useState('');

  useEffect(() => {
    const load = () => fetch('/api/multimodal').then(r => r.json()).then(d => setRows(d || [])).catch(() => {});
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, []);

  const filtered = useMemo(() => {
    const kw = q.trim();
    return rows.filter(r =>
      (ch === '전체' || r.channel === ch) &&
      (!kw || [r.id, r.phone, r.scenario, r.service].some(v => String(v || '').includes(kw)))
    );
  }, [rows, ch, q]);

  const done = filtered.filter(r => r.result === '완료').length;
  const drop = filtered.filter(r => r.result === '이탈').length;
  const swap = filtered.filter(r => r.result === '상담원 전환').length;
  const avg = filtered.length ? Math.round(filtered.reduce((a, r) => a + (r.duration || 0), 0) / filtered.length) : 0;

  const exportCols = [
    { label: 'ID', value: 'id' },
    { label: '시각', value: 'ts' },
    { label: '고객', value: 'phone' },
    { label: '시나리오', value: 'scenario' },
    { label: '서비스', value: 'service' },
    { label: '채널', value: 'channel' },
    { label: '결과', value: 'result' },
    { label: '소요(초)', value: 'duration' },
  ];
  const exportCsv = () => downloadCSV('multimodal-history.csv', filtered, exportCols);
  const exportXlsx = () => downloadExcel('multimodal-history.xls', filtered, exportCols, '멀티모달이력');

  return (
    <>
      <div className="sectionhead">
        <h2>멀티모달 이력</h2>
        <span className="d">보이는 ARS 상호작용 로그 · 15초 자동 갱신 · 번호 마스킹</span>
        <span className="sp" />
        <button className="btn sm" onClick={exportCsv}>⬇ CSV</button><button className="btn sm" onClick={exportXlsx}>⬇ Excel</button>
      </div>

      <div className="grid g4">
        <div className="card kpi"><div className="n">{filtered.length}</div><div className="l">전체 상호작용</div></div>
        <div className="card kpi"><div className="n">{pct(done, filtered.length)}%</div><div className="l">완료율 · {done}건</div></div>
        <div className="card kpi"><div className="n">{drop}</div><div className="l">이탈</div></div>
        <div className="card kpi"><div className="n">{fmt(avg)}</div><div className="l">평균 소요</div></div>
      </div>

      <div className="toolbar" style={{ marginTop: 16 }}>
        <div className="seg">
          {CH.map(c => (
            <button key={c} className={ch === c ? 'on' : ''} onClick={() => setCh(c)}>{c}</button>
          ))}
        </div>
        <span className="sp" />
        <input
          className="input"
          placeholder="세션·번호·시나리오 검색"
          value={q}
          onChange={e => setQ(e.target.value)}
          style={{ maxWidth: 220 }}
        />
      </div>

      <div className="card" style={{ marginTop: 4 }}>
        <h3>상호작용 로그 <span className="muted" style={{ fontWeight: 600, fontSize: 12.5 }}>· {filtered.length}건</span>
          {swap > 0 && <span className="tag t-warn" style={{ marginLeft: 6 }}>상담원 전환 {swap}</span>}
        </h3>
        <table className="tbl">
          <thead><tr><th>ID</th><th>시각</th><th>고객</th><th>시나리오</th><th>채널</th><th>결과</th><th>소요</th></tr></thead>
          <tbody>
            {filtered.map(r => {
              const nt = NODE_TYPES[r.node];
              const d = new Date(r.ts);
              const hh = String(d.getHours()).padStart(2, '0');
              const mm = String(d.getMinutes()).padStart(2, '0');
              return (
                <tr key={r.id}>
                  <td><b>{r.id}</b></td>
                  <td className="muted">{hh}:{mm}</td>
                  <td>{r.phone}</td>
                  <td>{r.scenario}</td>
                  <td><span className="tag t-info">{nt ? nt.ic + ' ' : ''}{r.channel}</span></td>
                  <td><span className={'tag ' + (RESULT_TAG[r.result] || 't-mut')}>{r.result}</span></td>
                  <td>{fmt(r.duration || 0)}</td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr><td colSpan={7} className="muted" style={{ textAlign: 'center', padding: 24 }}>조건에 맞는 이력이 없습니다.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
