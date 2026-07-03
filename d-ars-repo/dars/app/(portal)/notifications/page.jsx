'use client';
import { useEffect, useMemo, useState } from 'react';

const LEVEL = {
  bad:  { tag:'t-bad',  label:'긴급',   dot:'#c0392b' },
  warn: { tag:'t-warn', label:'주의',   dot:'#c9902a' },
  info: { tag:'t-info', label:'정보',   dot:'#3b6ea5' },
  ok:   { tag:'t-ok',   label:'정상',   dot:'#2e8b57' },
};
const FILTERS = [['all','전체'],['bad','긴급'],['warn','주의'],['info','정보']];

export default function Notifications() {
  const [data, setData] = useState({ notes: [], summary: {} });
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [read, setRead] = useState({});   // id -> true (세션 내 읽음 상태)

  const load = () => {
    setLoading(true);
    fetch('/api/notifications').then(r => r.json())
      .then(d => setData(d || { notes: [], summary: {} }))
      .catch(() => {})
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); const t = setInterval(load, 30000); return () => clearInterval(t); }, []);

  const notes = data.notes || [];
  const shown = useMemo(
    () => filter === 'all' ? notes : notes.filter(n => n.level === filter),
    [notes, filter]
  );
  const unread = notes.filter(n => !read[n.id]).length;

  const markAll = () => { const m = {}; notes.forEach(n => m[n.id] = true); setRead(m); };

  return (
    <>
      <div className="sectionhead">
        <h2>알림 센터</h2>
        <span className="d">운영 지표에서 자동 도출된 알림 · 30초 갱신</span>
        <span className="sp" />
        <button className="btn sm" onClick={load}>↻ 새로고침</button>
        <button className="btn sm" onClick={markAll} disabled={!unread}>모두 읽음{unread ? ` (${unread})` : ''}</button>
      </div>

      <div className="grid g4" style={{ marginBottom: 16 }}>
        <div className="card kpi"><div className="n">{notes.length}</div><div className="l">전체 알림</div></div>
        <div className="card kpi"><div className="n" style={{ color:'#c0392b' }}>{data.summary?.bad ?? 0}</div><div className="l">긴급</div></div>
        <div className="card kpi"><div className="n" style={{ color:'#c9902a' }}>{data.summary?.warn ?? 0}</div><div className="l">주의</div></div>
        <div className="card kpi"><div className="n" style={{ color:'#3b6ea5' }}>{unread}</div><div className="l">안읽음</div></div>
      </div>

      <div className="card">
        <div className="seg" style={{ marginBottom: 4 }}>
          {FILTERS.map(([k, l]) => (
            <button key={k} className={filter === k ? 'on' : ''} onClick={() => setFilter(k)}>{l}</button>
          ))}
        </div>

        {loading && !notes.length ? (
          <div className="muted" style={{ padding: '24px 4px' }}>알림을 불러오는 중…</div>
        ) : shown.length === 0 ? (
          <div className="muted" style={{ padding: '24px 4px' }}>해당하는 알림이 없습니다.</div>
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
        .seg { display:flex; gap:6px; flex-wrap:wrap; }
        .seg button { border:1px solid var(--line); background:#fff; border-radius:8px; padding:7px 14px; font-weight:700; font-size:13px; cursor:pointer; }
        .seg button.on { background:var(--brand); color:#fff; border-color:var(--brand); }
        .noti-row { display:flex; align-items:flex-start; gap:12px; padding:14px 6px; border-bottom:1px solid var(--line); }
        .noti-row:last-child { border-bottom:0; }
        .noti-row:hover { background:var(--brand-xl); border-radius:10px; }
        .noti-ic { width:38px; height:38px; border-radius:10px; display:grid; place-items:center; font-size:18px; flex:0 0 auto; }
        .noti-body { min-width:0; flex:1; }
        .noti-top { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
        .noti-top b { font-size:14px; }
        .noti-unread { width:8px; height:8px; border-radius:50%; flex:0 0 auto; }
        .noti-cat { font-size:11.5px; }
        .noti-text { font-size:13px; margin-top:4px; line-height:1.55; }
        .noti-go { color:var(--muted); font-size:22px; align-self:center; flex:0 0 auto; }
      `}</style>
    </>
  );
}
