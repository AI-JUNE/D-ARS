'use client';
import { useEffect, useState } from 'react';
import { pct } from '@/lib/ui';
import { AreaChart, GroupedBars, ProgressRow, KpiCard } from '@/lib/charts';

const BAR_SERIES = [
  { key: 'multimodal', label: '멀티모달', color: '#be5535' },
  { key: 'completed', label: '완료', color: '#2e8b57' },
  { key: 'dropped', label: '이탈', color: '#c0392b' },
];

export default function Stats() {
  const [s, setS] = useState(null);
  useEffect(() => { fetch('/api/stats').then(r => r.json()).then(setS).catch(() => {}); }, []);

  const daily = s?.daily || [];
  const col = (k) => daily.map(d => Number(d[k]) || 0);
  const labels = daily.map(d => String(d.day).slice(5));
  const services = s?.services || [];

  return (
    <>
      <div className="sectionhead"><h2>이용 통계</h2><span className="d">멀티모달·스마트ARS 이용 분석</span></div>

      <div className="grid g4">
        <KpiCard icon="📥" n="4,182" l="총 인입" delta="5.1%" spark={col('inbound')} color="#3b6ea5" delay={0} />
        <KpiCard icon="🚀" n="540" l="멀티모달 전환" delta="4.1%" spark={col('multimodal')} color="#be5535" delay={0.06} />
        <KpiCard icon="✅" n="902" l="완료" delta="6.4%" spark={col('completed')} color="#2e8b57" delay={0.12} />
        <KpiCard icon="⚠️" n="318" l="이탈" delta="1.2%" deltaDir="down" spark={col('dropped')} color="#c0392b" delay={0.18} />
      </div>

      <div className="grid g2" style={{ marginTop: 16 }}>
        <div className="card reveal" style={{ animationDelay: '.1s' }}>
          <h3>📈 일별 멀티모달 전환</h3><div className="d">최근 7일 · 호버 시 값 표시</div>
          {daily.length > 0 ? <AreaChart data={col('multimodal')} labels={labels} unit="건" color="#be5535" /> : <div className="skl" style={{ height: 176 }} />}
        </div>
        <div className="card reveal" style={{ animationDelay: '.16s' }}>
          <h3>📊 일별 전환·완료·이탈</h3><div className="d">최근 7일 · 막대 호버 시 상세</div>
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
