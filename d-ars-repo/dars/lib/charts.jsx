'use client';
import { useEffect, useState, useId } from 'react';
import Counter from '@/lib/Counter';

// 마운트 후(또는 reduced-motion이면 즉시) 애니메이션 트리거
function usePlay() {
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined') { setOn(true); return; }
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) { setOn(true); return; }
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setOn(true)));
    return () => cancelAnimationFrame(id);
  }, []);
  return on;
}

/* ── 그라데이션 영역 차트 (라인 드로우 + 영역 페이드 + 포인트 + 툴팁) ── */
export function AreaChart({ data = [], labels = [], color = '#be5535', height = 176, unit = '', mini = false }) {
  const on = usePlay();
  const [idx, setIdx] = useState(-1);
  const uid = useId().replace(/:/g, '');
  const n = data.length;
  if (!n) return null;
  const W = 560, H = height, padX = mini ? 2 : 12, padT = mini ? 4 : 16, padB = mini ? 4 : (labels.length ? 26 : 14);
  const max = Math.max(...data), min = Math.min(...data), range = (max - min) || 1;
  const X = (i) => padX + (n <= 1 ? (W - padX * 2) / 2 : (i / (n - 1)) * (W - padX * 2));
  const Y = (v) => padT + (1 - (v - min) / range) * (H - padT - padB);
  const pts = data.map((v, i) => `${X(i).toFixed(1)},${Y(v).toFixed(1)}`);
  const linePath = 'M' + pts.join(' L');
  const areaPath = `M${X(0).toFixed(1)},${(H - padB).toFixed(1)} L` + pts.join(' L') + ` L${X(n - 1).toFixed(1)},${(H - padB).toFixed(1)} Z`;
  let len = 0;
  for (let i = 1; i < n; i++) len += Math.hypot(X(i) - X(i - 1), Y(data[i]) - Y(data[i - 1]));
  const grid = mini ? [] : [0.25, 0.5, 0.75, 1].map(f => padT + f * (H - padT - padB));

  const onMove = (e) => {
    if (mini) return;
    const r = e.currentTarget.getBoundingClientRect();
    const f = (e.clientX - r.left) / r.width;
    setIdx(Math.max(0, Math.min(n - 1, Math.round(f * (n - 1)))));
  };

  return (
    <div className="ac-wrap" style={{ position: 'relative' }} onMouseMove={onMove} onMouseLeave={() => setIdx(-1)}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={mini ? height : 'auto'} preserveAspectRatio="none" style={{ display: 'block', overflow: 'visible' }} role="img" aria-label="추이 그래프">
        <defs>
          <linearGradient id={`fill${uid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.32" />
            <stop offset="100%" stopColor={color} stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {grid.map((gy, i) => <line key={i} x1={padX} y1={gy} x2={W - padX} y2={gy} stroke="#eadfd8" strokeWidth="1" strokeDasharray="3 4" />)}
        <path d={areaPath} fill={`url(#fill${uid})`} style={{ opacity: on ? 1 : 0, transition: 'opacity .9s ease .35s' }} />
        <path d={linePath} fill="none" stroke={color} strokeWidth={mini ? 2 : 2.6} strokeLinecap="round" strokeLinejoin="round"
          style={{ strokeDasharray: len, strokeDashoffset: on ? 0 : len, transition: 'stroke-dashoffset 1.15s cubic-bezier(.4,.1,.2,1)' }} />
        {!mini && data.map((v, i) => (
          <circle key={i} cx={X(i)} cy={Y(v)} r={idx === i ? 5 : 3} fill="#fff" stroke={color} strokeWidth="2"
            style={{ opacity: on ? 1 : 0, transition: `opacity .3s ease ${0.6 + i * 0.05}s, r .15s` }} />
        ))}
        {!mini && idx >= 0 && <line x1={X(idx)} y1={padT} x2={X(idx)} y2={H - padB} stroke={color} strokeWidth="1" strokeDasharray="3 3" opacity="0.5" />}
        {!mini && labels.length > 0 && labels.map((lb, i) => (
          <text key={i} x={X(i)} y={H - 8} textAnchor="middle" fontSize="9.5" fill="#9a8b82">{lb}</text>
        ))}
      </svg>
      {!mini && idx >= 0 && (
        <div className="ac-tip" style={{ left: `${(X(idx) / W) * 100}%`, top: `${(Y(data[idx]) / H) * 100}%` }}>
          <b>{Number(data[idx]).toLocaleString('ko-KR')}{unit}</b>
          {labels[idx] && <span>{labels[idx]}</span>}
        </div>
      )}
    </div>
  );
}

/* ── 그룹 막대 (바닥에서 자라나는 애니메이션 + 툴팁 + 값 라벨) ── */
export function GroupedBars({ data = [], series = [], height = 210, labelKey = 'day' }) {
  const on = usePlay();
  const [hi, setHi] = useState(-1);
  const n = data.length;
  if (!n || !series.length) return null;
  const W = 560, H = height, padX = 16, padB = 30, padT = 14;
  const max = Math.max(1, ...data.flatMap(d => series.map(s => Number(d[s.key]) || 0)));
  const gw = (W - padX * 2) / n;
  const bw = Math.min(15, (gw * 0.62) / series.length);
  const gap = 3;
  const groupW = series.length * bw + (series.length - 1) * gap;
  const baseY = H - padB;
  const grid = [0.25, 0.5, 0.75, 1].map(f => padT + f * (baseY - padT));

  return (
    <div style={{ position: 'relative' }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="auto" style={{ display: 'block', overflow: 'visible' }} role="img" aria-label="일별 막대 그래프">
        {grid.map((gy, i) => <line key={i} x1={padX} y1={gy} x2={W - padX} y2={gy} stroke="#eadfd8" strokeWidth="1" strokeDasharray="3 4" />)}
        <line x1={padX} y1={baseY} x2={W - padX} y2={baseY} stroke="#e0d2c9" strokeWidth="1.2" />
        {data.map((d, i) => {
          const cx = padX + gw * i + gw / 2;
          const x0 = cx - groupW / 2;
          return (
            <g key={i} onMouseEnter={() => setHi(i)} onMouseLeave={() => setHi(-1)}>
              <rect x={padX + gw * i} y={padT} width={gw} height={baseY - padT} fill={hi === i ? 'rgba(190,85,53,.06)' : 'transparent'} />
              {series.map((s, j) => {
                const v = Number(d[s.key]) || 0;
                const h = (v / max) * (baseY - padT);
                const x = x0 + j * (bw + gap);
                return (
                  <rect key={s.key} x={x} y={baseY - h} width={bw} height={Math.max(0, h)} rx="3" fill={s.color}
                    style={{ transform: on ? 'scaleY(1)' : 'scaleY(0)', transformBox: 'fill-box', transformOrigin: 'bottom', transition: `transform .75s cubic-bezier(.2,.85,.25,1) ${0.05 * i + 0.06 * j}s` }} />
                );
              })}
              <text x={cx} y={H - 10} textAnchor="middle" fontSize="9.5" fill="#9a8b82">{String(d[labelKey]).slice(5)}</text>
            </g>
          );
        })}
      </svg>
      {hi >= 0 && (
        <div className="ac-tip gb-tip" style={{ left: `${((padX + gw * hi + gw / 2) / W) * 100}%`, top: 6 }}>
          <b style={{ fontSize: 11 }}>{String(data[hi][labelKey]).slice(5)}</b>
          {series.map(s => (
            <span key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <i style={{ width: 8, height: 8, borderRadius: 2, background: s.color, display: 'inline-block' }} />
              {s.label} <b style={{ marginLeft: 'auto' }}>{Number(data[hi][s.key] || 0).toLocaleString('ko-KR')}</b>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── 채워지는 진행바 (퍼센트 카운트업) ── */
export function ProgressRow({ label, value, total, color = '#be5535', suffix = '' }) {
  const on = usePlay();
  const p = total ? Math.round((value / total) * 100) : 0;
  return (
    <div style={{ margin: '12px 0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 5 }}>
        <b>{label}</b>
        <span className="muted">{value}/{total}{suffix} · <b style={{ color: '#9c4025' }}><Counter value={`${p}%`} /></b></span>
      </div>
      <div className="bar2">
        <i style={{ width: on ? `${p}%` : '0%', background: `linear-gradient(90deg,${color},${color}cc)`, transition: 'width 1s cubic-bezier(.25,.8,.3,1)' }} />
      </div>
    </div>
  );
}

/* ── 도넛 (원호 스윕 + 중앙 퍼센트 카운트업) ── */
export function Donut({ value = 0, size = 96, stroke = 11, color = '#be5535', label = '' }) {
  const on = usePlay();
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(100, value));
  return (
    <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
      <div style={{ position: 'relative', width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#efe4dd" strokeWidth={stroke} />
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
            style={{ strokeDasharray: c, strokeDashoffset: on ? c * (1 - p / 100) : c, transition: 'stroke-dashoffset 1.1s cubic-bezier(.3,.8,.3,1)' }} />
        </svg>
        <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', fontWeight: 800, color: '#9c4025', fontSize: size * 0.22 }}>
          <Counter value={`${p}%`} />
        </div>
      </div>
      {label && <div className="muted" style={{ fontSize: 12, fontWeight: 600, textAlign: 'center' }}>{label}</div>}
    </div>
  );
}
