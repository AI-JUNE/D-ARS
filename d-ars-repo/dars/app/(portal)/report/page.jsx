'use client';
import { useCallback, useEffect, useState } from 'react';
import { pct } from '@/lib/ui';
import { GroupedBars } from '@/lib/charts';
import { getJSON, asArray } from '@/lib/fetchJson';
import ErrorBanner from '@/lib/ErrorBanner';
import { readServices } from '@/lib/services';
import { RANGE_PRESETS, statsUrl, rangeLabel, readRange } from '@/lib/statsRange';
import { useRangeParam } from '@/lib/useRangeParam';

// 운영 리포트 — 브라우저 인쇄(PDF로 저장)로 출력. 읽기 전용, 스키마 변경 없음.
// 기간 선택(2026-07-13 야간): 7·30·90일/전체를 골라 인쇄할 수 있다. 선택 컨트롤은 인쇄에서 숨기고(noprint),
// 리포트 머리말에는 **서버가 실제로 적용한 구간**을 찍는다(라벨-숫자 불일치 방지). 기본값 '전체' = 기존 동작.
const BAR_SERIES = [
  { key: 'multimodal', label: '멀티모달', color: '#be5535' },
  { key: 'completed', label: '완료', color: '#2e8b57' },
  { key: 'dropped', label: '이탈', color: '#c0392b' },
];
export default function Report() {
  const [stats, setStats] = useState(null);
  const [docs, setDocs] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [now, setNow] = useState('');
  // URL 쿼리(?range=)에 보존 → **인쇄용 리포트 링크를 그대로 공유**하면 같은 구간이 열린다(2026-07-14).
  const [range, setRange] = useRangeParam();
  const [err, setErr] = useState(null); // 리포트 로드 실패 안내(배너 + 다시 시도) — 조용한 빈 리포트 방지

  // 에러처리 하드닝: 인쇄 직전 데이터가 조용히 비어 잘못된 리포트가 출력되지 않도록 실패를 알린다.
  const load = useCallback(async () => {
    const [s, d, v] = await Promise.all([
      getJSON(statsUrl('/api/stats', range)),
      getJSON('/api/docs'),
      getJSON('/api/sessions'),
    ]);
    const e = s.error || d.error || v.error;
    setErr(e);
    if (!s.error) setStats(s.data);
    if (!d.error) setDocs(asArray(d.data));
    if (!v.error) setSessions(asArray(v.data));
  }, [range]);

  useEffect(() => {
    load();
    setNow(new Date().toLocaleString('ko-KR', { dateStyle:'long', timeStyle:'short' }));
  }, [load]);

  const daily = stats?.daily || [];
  // 서비스별 집계는 서버 실측(멀티모달·UMS group by service).
  const services = readServices(stats?.services);
  const period = rangeLabel(readRange(stats?.range), daily.length) || `전체 ${daily.length}일 집계`;
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
        <div className="seg" role="group" aria-label="조회 기간">
          {RANGE_PRESETS.map(r => (
            <button key={r.key} className={range === r.key ? 'on' : ''} aria-pressed={range === r.key}
              onClick={() => setRange(r.key)}>{r.label}</button>
          ))}
        </div>
        <button className="btn sm primary" onClick={()=>window.print()}>🖨️ PDF 저장 / 인쇄</button>
      </div>

      <div className="noprint"><ErrorBanner message={err} onRetry={load} /></div>

      <div className="report card">
        <div className="rp-head">
          <div className="rp-brand"><span className="dot" /> D-ARS · 보이는 ARS</div>
          <h1 className="rp-title">운영 리포트</h1>
          <div className="rp-meta">생성 {now || '…'} · 운영 GOWON · {period}</div>
        </div>

        <div className="rp-kpis">
          <div><b>{totalMulti.toLocaleString()}</b><span>멀티모달 전환</span></div>
          <div><b>{totalDone.toLocaleString()}</b><span>완료</span></div>
          <div><b>{doneRate}%</b><span>완료율</span></div>
          <div><b>{dropRate}%</b><span>이탈률</span></div>
        </div>

        {daily.length > 0 && (
          <div className="rp-chart">
            <GroupedBars data={daily} series={BAR_SERIES} height={200} />
            <div className="rp-legend">
              {BAR_SERIES.map(x => (<span key={x.key}><i style={{ background: x.color }} />{x.label}</span>))}
            </div>
          </div>
        )}

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
          <thead><tr><th>서비스</th><th>발송</th><th>자동런칭</th><th>문자발송</th><th>이탈</th><th>완료</th><th>완료율</th></tr></thead>
          <tbody>
            {services.map(r=>(
              <tr key={r.name}><td>{r.name}</td><td>{r.sent}</td><td>{r.launch}</td><td>{r.sms}</td><td>{r.drop}</td><td>{r.done}</td><td>{pct(r.done,r.sent)}%</td></tr>
            ))}
            {services.length===0 && <tr><td colSpan={7} className="muted">집계된 서비스 이용 내역이 없습니다.</td></tr>}
          </tbody>
        </table>

        <h3 className="rp-h3">서류별 완료율</h3>
        <table className="tbl rp-tbl">
          <thead><tr><th>서류</th><th>요청</th><th>완료</th><th>완료율</th></tr></thead>
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
