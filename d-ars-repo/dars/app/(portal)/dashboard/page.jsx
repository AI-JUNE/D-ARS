'use client';
import { useEffect, useState } from 'react';
import { pct, fmt, fmtDur, stepLabel } from '@/lib/ui';
import Counter from '@/lib/Counter';
import { AreaChart, GroupedBars, ProgressRow, Donut } from '@/lib/charts';
import { getJSON, asArray } from '@/lib/fetchJson';
import ErrorBanner from '@/lib/ErrorBanner';
import { readAgg, aggUrl } from '@/lib/aggregate';
import { readSessionAgg } from '@/lib/sessionsAgg';
import { readPage } from '@/lib/listUrl';
import { sumBy, fmtNum, lastDelta, activeSessions, completionRate } from '@/lib/kpi';
import { RANGE_PRESETS, statsUrl, rangeLabel, readRange } from '@/lib/statsRange';
import { useRangeParam } from '@/lib/useRangeParam';

function Kpi2({ icon, n, l, delta, deltaDir = 'up', spark, color = '#be5535', delay = 0 }) {
  return (
    <div className="card kpi2 reveal" style={{ animationDelay: `${delay}s` }}>
      <div className="top">
        <span className="ic">{icon}</span>
        <div className="n"><Counter value={n} /></div>
      </div>
      <div className="l">{l}</div>
      {delta && <div className={'delta ' + deltaDir}>{deltaDir === 'down' ? '▼' : '▲'} {delta}</div>}
      {spark && spark.length > 1 && <div className="sp"><AreaChart data={spark} color={color} height={44} mini /></div>}
    </div>
  );
}

const BAR_SERIES = [
  { key: 'multimodal', label: '멀티모달', color: '#be5535' },
  { key: 'completed', label: '완료', color: '#2e8b57' },
  { key: 'dropped', label: '이탈', color: '#c0392b' },
];

export default function Dashboard() {
  const [sessions, setSessions] = useState([]);
  const [docs, setDocs] = useState([]);
  const [stats, setStats] = useState(null);
  const [sessAgg, setSessAgg] = useState(null); // /api/sessions?agg=1 — 진행 세션 서버 총계
  const [mmAgg, setMmAgg] = useState(null);     // /api/multimodal?agg=1 — 완료율 서버 집계
  const [umsTotal, setUmsTotal] = useState(0);  // /api/ums?meta=1 — 문자발송 서버 총계
  const [err, setErr] = useState(null);  // 대시보드 데이터 로드 실패 안내
  const [tick, setTick] = useState(0);   // '다시 시도'
  // 조회 기간(7·30·90일/전체) — 기본 '전체' = 기존 동작. URL 쿼리(?range=)에 보존(2026-07-14).
  const [range, setRange] = useRangeParam();

  // 에러처리 하드닝: API 중 하나라도 실패하면 차트가 조용히 비는 대신 배너로 안내한다.
  // 서버 집계 전환: KPI는 로드된 행(최대 20건)이 아니라 서버 총계에서 파생 → 페이징·상한과 무관하게 정확.
  // 실시간 세션(5초 폴링)과 일별 통계는 갱신 주기가 달라 효과를 분리한다
  // (기간을 바꿔도 5초 폴링 타이머가 재설정되지 않는다).
  useEffect(() => {
    let stopped = false;
    const loadLive = async () => {
      const [l, a] = await Promise.all([getJSON('/api/sessions'), getJSON(aggUrl('/api/sessions'))]);
      if (stopped) return;
      if (l.error) { setErr(l.error); return; }
      setSessions(asArray(l.data));
      if (!a.error) setSessAgg(readSessionAgg(a.data));
    };
    loadLive();
    const t = setInterval(loadLive, 5000);
    return () => { stopped = true; clearInterval(t); };
  }, [tick]);

  // 기간 선택(2026-07-13 야간): /api/stats 의 기간 파라미터를 대시보드에도 노출.
  // daily 차트·멀티모달 KPI·"일별 운영 추이"가 **모두 같은 구간**을 쓰고, 라벨은 서버가 실제 적용한 구간에서 만든다.
  useEffect(() => {
    let stopped = false;
    const loadOnce = async () => {
      const [d, s, m, u] = await Promise.all([
        getJSON('/api/docs'),
        getJSON(statsUrl('/api/stats', range)),
        getJSON(aggUrl('/api/multimodal')),
        getJSON('/api/ums?limit=1&offset=0&meta=1'),
      ]);
      if (stopped) return;
      if (!d.error) setDocs(asArray(d.data));
      if (!s.error) setStats(s.data);
      if (!m.error) setMmAgg(readAgg(m.data));
      if (!u.error) setUmsTotal(readPage(u.data, { limit: 1, offset: 0 }).total);
      const e = d.error || s.error || m.error || u.error;
      if (e) setErr(e); else setErr(null);
    };
    loadOnce();
    return () => { stopped = true; };
  }, [tick, range]);

  const daily = stats?.daily || [];
  const col = (k) => daily.map(d => Number(d[k]) || 0);
  const labels = daily.map(d => String(d.day).slice(5));
  const services = docs.filter(d => d.in_use).slice(0, 4);
  const done = completionRate(mmAgg);
  const overall = services.length
    ? Math.round(services.reduce((a, d) => a + pct(d.done, d.req), 0) / services.length)
    : done;

  // KPI(서버 집계·일별 통계 파생) — 하드코딩 상수 제거.
  const mmSum = sumBy(daily, 'multimodal');
  const dMm = lastDelta(daily, 'multimodal');
  const dDone = lastDelta(daily, 'completed');

  // 라벨은 **서버가 실제 적용한 구간**에서 만든다(문구와 숫자가 어긋나지 않게).
  const srv = readRange(stats?.range);
  const period = rangeLabel(srv, daily.length);
  const days = daily.length ? `${daily.length}일` : '기간';

  return (
    <>
      {/* 모바일 무붕괴: flex-wrap + word-break(긴 기간 라벨) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
        <div className="seg" role="group" aria-label="조회 기간">
          {RANGE_PRESETS.map(r => (
            <button key={r.key} type="button" className={range === r.key ? 'on' : ''} aria-pressed={range === r.key}
              onClick={() => setRange(r.key)}>{r.label}</button>
          ))}
        </div>
        {period && <span className="muted" style={{ fontSize: 12.5, wordBreak: 'break-word' }}>{period}</span>}
        <span className="sp" />
        <a href="/report" className="btn sm">📄 운영 리포트 (PDF)</a>
      </div>

      <ErrorBanner message={err} onRetry={() => { setErr(null); setTick(t => t + 1); }} />

      <div className="grid g4">
        {/* 증감 배지는 시계열이 있는 지표에만 표시(가짜 증감률 제거) */}
        <Kpi2 icon="📡" n={fmtNum(activeSessions(sessAgg))} l="진행 중 세션" spark={col('inbound')} color="#be5535" delay={0} />
        <Kpi2 icon="🚀" n={fmtNum(mmSum)} l={`멀티모달 전환 (${days})`} delta={dMm?.text} deltaDir={dMm?.dir} spark={col('multimodal')} color="#be5535" delay={0.06} />
        <Kpi2 icon="✉️" n={fmtNum(umsTotal)} l="문자발송(UMS)" spark={col('completed')} color="#3b6ea5" delay={0.12} />
        <Kpi2 icon="✅" n={`${done}%`} l="사용 완료율" delta={dDone?.text} deltaDir={dDone?.dir} spark={col('completed')} color="#2e8b57" delay={0.18} />
      </div>

      <div className="grid g2" style={{ marginTop: 16 }}>
        <div className="card reveal" style={{ animationDelay: '.1s' }}>
          <h3>📈 일별 멀티모달 전환</h3><div className="d">{days} · 지점에 마우스를 올리면 값 표시</div>
          {daily.length > 0
            ? <AreaChart data={col('multimodal')} labels={labels} unit="건" color="#be5535" />
            : <div className="skl" style={{ height: 176 }} />}
        </div>
        <div className="card reveal" style={{ animationDelay: '.16s' }}>
          <h3>📋 서비스별 완료율</h3><div className="d">멀티모달 서비스 사용 완료</div>
          <div style={{ display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap', marginTop: 6 }}>
            <Donut value={overall} label="전체 평균" />
            <div style={{ flex: 1, minWidth: 220 }}>
              {services.length > 0
                ? services.map(d => <ProgressRow key={d.id} label={d.name} value={d.done} total={d.req} />)
                : [0, 1, 2].map(i => <div key={i} className="skl" style={{ height: 34, margin: '10px 0' }} />)}
            </div>
          </div>
        </div>
      </div>

      <div className="card reveal" style={{ marginTop: 16, animationDelay: '.12s' }}>
        <h3>📊 일별 운영 추이 <span className="tag t-info" style={{ marginLeft: 6 }}>{days}</span></h3>
        <div className="d">멀티모달 전환 · 완료 · 이탈 (건) · 막대에 마우스를 올리면 상세</div>
        {daily.length > 0
          ? <GroupedBars data={daily} series={BAR_SERIES} />
          : <div className="skl" style={{ height: 210 }} />}
        <div className="legend" style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 10, fontSize: 12 }}>
          {BAR_SERIES.map(s => (
            <span key={s.key}><i style={{ display: 'inline-block', width: 10, height: 10, background: s.color, borderRadius: 3, marginRight: 5 }} />{s.label}</span>
          ))}
        </div>
      </div>

      <div className="card reveal" style={{ marginTop: 16, animationDelay: '.16s' }}>
        <h3>📡 실시간 세션 <span className="tag t-info" style={{ marginLeft: 6 }}>LIVE</span></h3>
        <div className="d">개인정보 자동 마스킹 · 5초 갱신</div>
        <table className="tbl"><thead><tr><th>세션</th><th>고객</th><th>시나리오</th><th>단계</th><th>경과</th></tr></thead>
          <tbody>{sessions.slice(0, 6).map(s => (<tr key={s.id}><td><b>{s.id}</b></td><td>{s.phone}</td><td>{s.scenario}</td>
            <td><span className={'tag ' + (s.step >= 4 ? 't-ok' : 't-info')}>{stepLabel(s.step)}</span></td>
            <td title={fmtDur(s.elapsed)} aria-label={fmtDur(s.elapsed)}>{fmt(s.elapsed)}</td></tr>))}</tbody></table>
      </div>
    </>
  );
}
