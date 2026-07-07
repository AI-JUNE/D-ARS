'use client';
import { useEffect, useState } from 'react';
import { pct } from '@/lib/ui';
import Counter from '@/lib/Counter';
import { AreaChart, GroupedBars, ProgressRow, Donut } from '@/lib/charts';

function Kpi2({ icon, n, l, delta, spark, color = '#be5535', delay = 0 }) {
  return (
    <div className="card kpi2 reveal" style={{ animationDelay: `${delay}s` }}>
      <div className="top">
        <span className="ic">{icon}</span>
        <div className="n"><Counter value={n} /></div>
      </div>
      <div className="l">{l}</div>
      {delta && <div className="delta up">▲ {delta}</div>}
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
  useEffect(() => {
    const load = () => fetch('/api/sessions').then(r => r.json()).then(setSessions).catch(() => {});
    load(); const t = setInterval(load, 5000);
    fetch('/api/docs').then(r => r.json()).then(setDocs).catch(() => {});
    fetch('/api/stats').then(r => r.json()).then(setStats).catch(() => {});
    return () => clearInterval(t);
  }, []);

  const daily = stats?.daily || [];
  const col = (k) => daily.map(d => Number(d[k]) || 0);
  const labels = daily.map(d => String(d.day).slice(5));
  const services = docs.filter(d => d.in_use).slice(0, 4);
  const overall = services.length
    ? Math.round(services.reduce((a, d) => a + pct(d.done, d.req), 0) / services.length)
    : 74;

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <a href="/report" className="btn sm">📄 운영 리포트 (PDF)</a>
      </div>

      <div className="grid g4">
        <Kpi2 icon="📨" n="1,220" l="발송 건수" delta="6.2%" spark={col('inbound')} color="#be5535" delay={0} />
        <Kpi2 icon="🚀" n="540" l="런처 자동런칭" delta="4.1%" spark={col('multimodal')} color="#be5535" delay={0.06} />
        <Kpi2 icon="✉️" n="388" l="문자발송(UMS)" delta="2.4%" spark={col('completed')} color="#3b6ea5" delay={0.12} />
        <Kpi2 icon="✅" n="74%" l="사용 완료율" delta="3.0%p" spark={col('completed')} color="#2e8b57" delay={0.18} />
      </div>

      <div className="grid g2" style={{ marginTop: 16 }}>
        <div className="card reveal" style={{ animationDelay: '.1s' }}>
          <h3>📈 일별 멀티모달 전환</h3><div className="d">최근 7일 · 지점에 마우스를 올리면 값 표시</div>
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
        <h3>📊 일별 운영 추이 <span className="tag t-info" style={{ marginLeft: 6 }}>최근 7일</span></h3>
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
            <td><span className={'tag ' + (s.step >= 4 ? 't-ok' : 't-info')}>{['런칭', '본인확인', '상담', '안내·발송', '완료'][s.step]}</span></td>
            <td>{Math.floor(s.elapsed / 60)}:{String(s.elapsed % 60).padStart(2, '0')}</td></tr>))}</tbody></table>
      </div>
    </>
  );
}
