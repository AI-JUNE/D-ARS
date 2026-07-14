'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { getJSON } from '@/lib/fetchJson';
import ErrorBanner from '@/lib/ErrorBanner';
import {
  THRESHOLD_SPEC, DEFAULT_THRESHOLDS, clampThreshold, normalizeThresholds,
  isDefaults, notifyUrl, loadThresholds, saveThresholds,
} from '@/lib/notifyRules';

const LEVEL = {
  bad:  { tag:'t-bad',  label:'긴급',   dot:'#c0392b' },
  warn: { tag:'t-warn', label:'주의',   dot:'#c9902a' },
  info: { tag:'t-info', label:'정보',   dot:'#3b6ea5' },
  ok:   { tag:'t-ok',   label:'정상',   dot:'#2e8b57' },
};
const FILTERS = [['all','전체'],['bad','긴급'],['warn','주의'],['info','정보']];

/* 임계값 설정화(2026-07-13 야간): 알림 규칙의 기준값이 코드 상수라 고객사마다 "주의"로 볼 선이 달라도
   손댈 수 없었다(알림이 너무 시끄럽거나 너무 조용해도 그대로). → ⚙ 알림 기준 패널에서 조정하고
   브라우저에 저장(운영자별 · **DB 스키마 변경 없음**), 서버가 같은 기준으로 재도출한다.
   기본값은 기존 상수와 동일 → 아무것도 바꾸지 않으면 동작이 완전히 같다(하위호환). */

export default function Notifications() {
  const [data, setData] = useState({ notes: [], summary: {} });
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [read, setRead] = useState({});   // id -> true (세션 내 읽음 상태)
  const [err, setErr] = useState(null);   // 로드 실패 안내(배너 + 다시 시도)

  // 임계값: SSR 에서는 항상 기본값 → 하이드레이션 불일치 없음. 마운트 후 localStorage 값으로 교체.
  const [thr, setThr] = useState(DEFAULT_THRESHOLDS);
  const [draft, setDraft] = useState(DEFAULT_THRESHOLDS); // 패널 입력 중인 값(적용 전)
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const t = loadThresholds();
    setThr(t); setDraft(t); setReady(true);
  }, []);

  // 에러처리 하드닝: 30초 자동 갱신이 실패해도 조용히 넘어가지 않고 배너로 알린다.
  const load = useCallback(async () => {
    setLoading(true);
    const { data: d, error } = await getJSON(notifyUrl('/api/notifications', thr));
    setErr(error);
    if (!error) setData(d && typeof d === 'object' ? { notes: Array.isArray(d.notes) ? d.notes : [], summary: d.summary || {} } : { notes: [], summary: {} });
    setLoading(false);
  }, [thr]);
  useEffect(() => {
    if (!ready) return undefined; // 저장된 기준을 읽기 전에 기본값으로 한 번 더 조회하지 않도록
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [load, ready]);

  // notes 를 useMemo 로 고정 → 매 렌더 새 배열이 생겨 아래 useMemo 가 무의미해지던 문제 제거(ESLint deps 경고 해소).
  const notes = useMemo(() => (Array.isArray(data.notes) ? data.notes : []), [data.notes]);
  const shown = useMemo(
    () => filter === 'all' ? notes : notes.filter(n => n.level === filter),
    [notes, filter]
  );
  const unread = notes.filter(n => !read[n.id]).length;
  const custom = ready && !isDefaults(thr);

  const markAll = () => { const m = {}; notes.forEach(n => m[n.id] = true); setRead(m); };

  // 적용: 저장 시 클램핑된 값이 되돌아온다(입력이 범위를 벗어나도 화면·서버가 같은 값을 쓴다).
  const apply = () => { const n = saveThresholds(draft); setThr(n); setDraft(n); setOpen(false); };
  const reset = () => { const n = saveThresholds(DEFAULT_THRESHOLDS); setThr(n); setDraft(n); };
  const onField = (key, v) => setDraft(d => ({ ...normalizeThresholds(d), [key]: v === '' ? '' : Number(v) }));
  const onBlurField = (key) => setDraft(d => {
    const c = clampThreshold(key, d[key]);
    return { ...d, [key]: c == null ? DEFAULT_THRESHOLDS[key] : c };
  });

  return (
    <>
      <div className="sectionhead">
        <h2>알림 센터</h2>
        <span className="d">운영 지표에서 자동 도출된 알림 · 30초 갱신</span>
        {custom && <span className="tag t-info">사용자 기준 적용 중</span>}
        <span className="sp" />
        <button className="btn sm" aria-expanded={open} onClick={() => setOpen(v => !v)}>⚙ 알림 기준</button>
        <button className="btn sm" onClick={load}>↻ 새로고침</button>
        <button className="btn sm" onClick={markAll} disabled={!unread}>모두 읽음{unread ? ` (${unread})` : ''}</button>
      </div>

      <ErrorBanner message={err} onRetry={load} />

      {open && (
        <div className="card thr-card">
          <h3>⚙ 알림 기준</h3>
          <div className="d">이 브라우저에만 저장됩니다(운영자별 설정). 값은 허용 범위로 자동 보정됩니다.</div>
          <div className="thr-grid">
            {THRESHOLD_SPEC.map(s => (
              <label key={s.key} className="thr-f">
                <span className="thr-l">{s.label} <span className="muted">({s.unit})</span></span>
                <input type="number" inputMode="numeric" className="thr-i"
                  min={s.min} max={s.max} step={1}
                  value={draft[s.key] === '' ? '' : draft[s.key]}
                  onChange={e => onField(s.key, e.target.value)}
                  onBlur={() => onBlurField(s.key)} />
                <span className="muted thr-h">{s.help} · 기본 {s.def}{s.unit} · {s.min}~{s.max}</span>
              </label>
            ))}
          </div>
          <div className="thr-act">
            <button className="btn sm primary" onClick={apply}>적용</button>
            <button className="btn sm" onClick={reset} disabled={!custom}>기본값 복원</button>
          </div>
        </div>
      )}

      <div className="grid g4" style={{ margin: '16px 0' }}>
        <div className="card kpi"><div className="n">{notes.length}</div><div className="l">전체 알림</div></div>
        <div className="card kpi"><div className="n" style={{ color:'#c0392b' }}>{data.summary?.bad ?? 0}</div><div className="l">긴급</div></div>
        <div className="card kpi"><div className="n" style={{ color:'#c9902a' }}>{data.summary?.warn ?? 0}</div><div className="l">주의</div></div>
        <div className="card kpi"><div className="n" style={{ color:'#3b6ea5' }}>{unread}</div><div className="l">안읽음</div></div>
      </div>

      <div className="card">
        <div className="seg2" style={{ marginBottom: 4 }}>
          {FILTERS.map(([k, l]) => (
            <button key={k} className={filter === k ? 'on' : ''} onClick={() => setFilter(k)}>{l}</button>
          ))}
        </div>

        {loading && !notes.length ? (
          <div className="muted" style={{ padding: '24px 4px' }}>알림을 불러오는 중…</div>
        ) : shown.length === 0 ? (
          <div className="muted" style={{ padding: '24px 4px' }}>{err ? '알림을 불러오지 못했습니다.' : '해당하는 알림이 없습니다.'}</div>
        ) : (
          <div style={{ marginTop: 6 }}>
            {shown.map(n => {
              const L = LEVEL[n.level] || LEVEL.info;
              const isRead = !!read[n.id];
              return (
                <a key={n.id} href={n.href || '#'}
                   onClick={() => setRead(r => ({ ...r, [n.id]: true }))}
                   className="noti-row" style={{ opacity: isRead ? 0.62 : 1 }}>
                  <span className="noti-ic" style={{ background: L.dot + '1f' }}>{n.icon}</span>
                  <div className="noti-body">
                    <div className="noti-top">
                      {!isRead && <span className="noti-unread" style={{ background: L.dot }} />}
                      <b>{n.title}</b>
                      <span className={'tag ' + L.tag}>{L.label}</span>
                      <span className="muted noti-cat">{n.cat}</span>
                    </div>
                    <div className="muted noti-text">{n.body}</div>
                  </div>
                  <span className="noti-go" aria-hidden>›</span>
                </a>
              );
            })}
          </div>
        )}
      </div>

      <style jsx>{`
        .seg2 { display:flex; gap:6px; flex-wrap:wrap; }
        .seg2 button { border:1px solid var(--line); background:#fff; border-radius:8px; padding:7px 14px; font-weight:700; font-size:13px; cursor:pointer; }
        .seg2 button.on { background:var(--brand); color:#fff; border-color:var(--brand); }
        .thr-card { margin-bottom: 4px; }
        /* 모바일 무붕괴·무오버랩: 최소폭 자동 줄바꿈 그리드 + 입력 폭 100% */
        .thr-grid { display:grid; grid-template-columns:repeat(auto-fit, minmax(min(100%, 210px), 1fr)); gap:12px; margin-top:12px; }
        .thr-f { display:flex; flex-direction:column; gap:5px; min-width:0; }
        .thr-l { font-size:12.5px; font-weight:700; word-break:break-word; }
        .thr-i { width:100%; box-sizing:border-box; border:1px solid var(--line); border-radius:8px; padding:8px 10px; font-size:13px; font-weight:700; }
        .thr-i:focus { outline:2px solid var(--brand); outline-offset:-2px; }
        .thr-h { font-size:11px; line-height:1.5; word-break:break-word; }
        .thr-act { display:flex; gap:8px; flex-wrap:wrap; margin-top:14px; }
      `}</style>
    </>
  );
}
