'use client';
import { useCallback, useEffect, useState } from 'react';
import { pct } from '@/lib/ui';
import { AreaChart, GroupedBars, ProgressRow, KpiCard } from '@/lib/charts';
import { getJSON } from '@/lib/fetchJson';
import ErrorBanner from '@/lib/ErrorBanner';
import { sumBy, fmtNum, lastDelta } from '@/lib/kpi';
import { readServices } from '@/lib/services';
import { RANGE_PRESETS, statsUrl, rangeLabel, readRange } from '@/lib/statsRange';
import { useRangeParam } from '@/lib/useRangeParam';

const BAR_SERIES = [
  { key: 'multimodal', label: '멀티모달', color: '#be5535' },
  { key: 'completed', label: '완료', color: '#2e8b57' },
  { key: 'dropped', label: '이탈', color: '#c0392b' },
];

/* 기간 선택(2026-07-13 야간): 이전에는 API가 전 기간을 통째로 내려주는데 화면 문구만 "최근 7일"이라
   **라벨과 숫자가 어긋났다**. 이제 7·30·90일/전체를 서버로 보내고(daily·서비스 집계가 같은 구간),
   라벨은 서버가 돌려준 실제 구간(range)에서 만든다. 기본값 '전체' = 기존 동작(하위호환). */

export default function Stats() {
  const [s, setS] = useState(null);
  const [range, setRange] = useRangeParam(); // URL 쿼리(?range=)에 보존 — 새로고침·공유·뒤로가기 유지(2026-07-14)
  const [err, setErr] = useState(null); // 통계 로드 실패 안내(배너 + 다시 시도)

  // 에러처리 하드닝: 실패 시 차트가 영구 스켈레톤으로 남지 않도록 원인을 안내한다.
  const load = useCallback(async () => {
    const { data, error } = await getJSON(statsUrl('/api/stats', range));
    setErr(error);
    if (!error) setS(data);
  }, [range]);
  useEffect(() => { load(); }, [load]);

  const daily = s?.daily || [];
  const col = (k) => daily.map(d => Number(d[k]) || 0);
  const labels = daily.map(d => String(d.day).slice(5));
  // 서비스별 집계는 이제 서버 실측(멀티모달·UMS group by service). 응답이 어긋나도 화면이 깨지지 않도록 정규화.
  const services = readServices(s?.services);

  // KPI는 하드코딩 상수가 아니라 **일별 통계 전체 합계**에서 파생(증감률도 마지막 날 vs 직전 날 실측).
  const K = (key) => ({ n: fmtNum(sumBy(daily, key)), d: lastDelta(daily, key) });
  const kIn = K('inbound'), kMm = K('multimodal'), kDone = K('completed'), kDrop = K('dropped');
  const srv = readRange(s?.range);                        // 서버가 실제로 적용한 구간
  const period = rangeLabel(srv, daily.length) || (daily.length ? `전체 ${daily.length}일 합계` : '');
  const days = daily.length ? `${daily.length}일` : '기간';

  return (
    <>
      <div className="sectionhead"><h2>이용 통계</h2><span className="d">멀티모달·스마트ARS 이용 분석{period ? ` · ${period}` : ''}</span>
        <span className="sp" />
        <div className="seg" role="group" aria-label="조회 기간">
          {RANGE_PRESETS.map(r => (
            <button key={r.key} className={range === r.key ? 'on' : ''} aria-pressed={range === r.key}
              onClick={() => setRange(r.key)}>{r.label}</button>
          ))}
        </div>
      </div>

      <ErrorBanner message={err} onRetry={load} />

      <div className="grid g4">
        <KpiCard icon="📥" n={kIn.n} l="총 인입" delta={kIn.d?.text} deltaDir={kIn.d?.dir} spark={col('inbound')} color="#3b6ea5" delay={0} />
        <KpiCard icon="🚀" n={kMm.n} l="멀티모달 전환" delta={kMm.d?.text} deltaDir={kMm.d?.dir} spark={col('multimodal')} color="#be5535" delay={0.06} />
        <KpiCard icon="✅" n={kDone.n} l="완료" delta={kDone.d?.text} deltaDir={kDone.d?.dir} spark={col('completed')} color="#2e8b57" delay={0.12} />
        <KpiCard icon="⚠️" n={kDrop.n} l="이탈" delta={kDrop.d?.text} deltaDir={kDrop.d?.dir} spark={col('dropped')} color="#c0392b" delay={0.18} />
      </div>

      <div className="grid g2" style={{ marginTop: 16 }}>
        <div className="card reveal" style={{ animationDelay: '.1s' }}>
          <h3>📈 일별 멀티모달 전환</h3><div className="d">{days} · 호버 시 값 표시</div>
          {daily.length > 0 ? <AreaChart data={col('multimodal')} labels={labels} unit="건" color="#be5535" /> : <div className="skl" style={{ height: 176 }} />}
        </div>
        <div className="card reveal" style={{ animationDelay: '.16s' }}>
          <h3>📊 일별 전환·완료·이탈</h3><div className="d">{days} · 막대 호버 시 상세</div>
          {daily.length > 0 ? <GroupedBars data={daily} series={BAR_SERIES} height={188} /> : <div className="skl" style={{ height: 188 }} />}
        </div>
      </div>

      <div className="card reveal" style={{ marginTop: 16, animationDelay: '.12s' }}>
        <h3>📋 서비스별 완료율</h3><div className="d">발송 대비 사용 완료</div>
        {services.length > 0
          ? services.map(r => <ProgressRow key={r.name} label={r.name} value={r.done} total={r.sent}
              color={pct(r.done, r.sent) >= 75 ? '#2e8b57' : pct(r.done, r.sent) >= 60 ? '#c9902a' : '#c0392b'} />)
          : [0, 1, 2].map(i => <div key={i} className="skl" style={{ height: 34, margin: '10px 0' }} />)}
      </div>

      <div className="card reveal" style={{ marginTop: 16, animationDelay: '.18s' }}>
        <h3>🔎 서비스별 상세</h3>
        <table className="tbl"><thead><tr><th>서비스</th><th>발송</th><th>자동런칭</th><th>문자발송</th><th>이탈</th><th>완료</th><th>완료율</th></tr></thead>
          <tbody>{services.map(r => { const p = pct(r.done, r.sent); return (<tr key={r.name}>
            <td><b>{r.name}</b></td><td>{r.sent}</td><td>{r.launch}</td><td>{r.sms}</td><td>{r.drop}</td><td><b>{r.done}</b></td>
            <td style={{ minWidth: 120 }}><div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><div className="bar2" style={{ flex: 1 }}><i style={{ width: p + '%', background: 'linear-gradient(90deg,#be5535,#be5535cc)' }} /></div><span className="muted" style={{ fontSize: 11, fontWeight: 700 }}>{p}%</span></div></td></tr>); })}</tbody></table>
      </div>
    </>
  );
}
