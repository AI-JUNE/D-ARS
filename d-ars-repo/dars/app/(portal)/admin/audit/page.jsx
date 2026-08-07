'use client';
// /admin/audit — 접근/감사 로그 열람 화면 (P0-7 · 관리자 전용)
//
// 데이터 정책: 기록 시점에 마스킹된 값만 저장·표시(원문 PII 없음 — lib/audit.js 계약).
//   영속화(AUDIT_DB=1)가 꺼진 기본 상태에서는 persisted:false → "콘솔 로그 모드" 안내만.
// 페이징: id 내림차순 커서(before) "더 보기" — PMS /admin/security 와 동일 UX.
// 접근: 미들웨어(/admin=admin 최소역할) + API guardWrite(req,'admin') 이중 게이트.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { getJSON } from '@/lib/fetchJson';
import ErrorBanner from '@/lib/ErrorBanner';
import { AUDIT_EVENTS } from '@/lib/audit';

// 이벤트별 표시(라벨·톤) — 화이트리스트와 1:1, 미지정 이벤트는 중립 태그로 표시(방어)
const EVENT_META = {
  AUTH_LOGIN:             { label: '로그인',        tag: 't-ok' },
  AUTH_LOGIN_FAIL:        { label: '로그인 실패',   tag: 't-warn' },
  AUTH_LOGIN_RATELIMITED: { label: '로그인 차단',   tag: 't-bad' },
  AUTH_LOGOUT:            { label: '로그아웃',      tag: 't-info' },
  WRITE_DENIED:           { label: '쓰기 거부',     tag: 't-bad' },
  INGEST_DENIED:          { label: '수집 거부',     tag: 't-bad' },
};

function fmtTs(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return String(ts);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

// detail 요약: path·reason·need 우선 노출, 나머지는 k=v 나열(값은 이미 200자 절단됨)
function fmtDetail(detail) {
  if (!detail || typeof detail !== 'object') return '';
  const order = ['path', 'reason', 'need'];
  const keys = [...order.filter((k) => detail[k] != null), ...Object.keys(detail).filter((k) => !order.includes(k))];
  return keys.map((k) => `${k}=${detail[k]}`).join(' · ');
}

export default function AdminAudit() {
  const [events, setEvents] = useState([]);
  const [persisted, setPersisted] = useState(true);
  const [nextBefore, setNextBefore] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [more, setMore] = useState(false);
  const [err, setErr] = useState(null);

  const url = useCallback((before) => {
    const sp = new URLSearchParams();
    if (filter !== 'all') sp.set('event', filter);
    if (before) sp.set('before', String(before));
    const qs = sp.toString();
    return '/api/admin/audit' + (qs ? `?${qs}` : '');
  }, [filter]);

  // 첫 페이지(필터 변경 시 리셋 재조회)
  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await getJSON(url(null), { retries: 1 });
    setErr(error);
    if (!error && data && data.ok !== false) {
      setEvents(Array.isArray(data.events) ? data.events : []);
      setPersisted(data.persisted !== false);
      setNextBefore(data.nextBefore ?? null);
      setHasMore(!!data.hasMore);
    }
    setLoading(false);
  }, [url]);
  useEffect(() => { load(); }, [load]);

  // 커서 "더 보기" — 기존 목록 뒤에 이어붙인다(중복 id 방어 포함)
  const loadMore = useCallback(async () => {
    if (!nextBefore || more) return;
    setMore(true);
    const { data, error } = await getJSON(url(nextBefore), { retries: 1 });
    if (!error && data && data.ok !== false) {
      const add = Array.isArray(data.events) ? data.events : [];
      setEvents((prev) => {
        const seen = new Set(prev.map((e) => e.id));
        return [...prev, ...add.filter((e) => !seen.has(e.id))];
      });
      setNextBefore(data.nextBefore ?? null);
      setHasMore(!!data.hasMore);
    } else {
      setErr(error || '추가 조회에 실패했습니다.');
    }
    setMore(false);
  }, [url, nextBefore, more]);

  const filters = useMemo(() => [
    ['all', '전체'],
    ...AUDIT_EVENTS.map((ev) => [ev, EVENT_META[ev]?.label || ev]),
  ], []);

  return (
    <>
      <ErrorBanner message={err} onRetry={load} />

      <div className="card" style={{ marginBottom: 14 }}>
        <h3>🛡️ 접근/감사 로그</h3>
        <p className="d">
          인증·가드 거부 이벤트 열람(관리자 전용). 계정·IP는 <b>기록 시점에 마스킹된 값만</b> 저장·표시됩니다 — 원문 개인정보는 어디에도 없습니다.
        </p>
        <div className="seg" role="group" aria-label="이벤트 필터">
          {filters.map(([key, label]) => (
            <button key={key} type="button" className={filter === key ? 'on' : ''}
              aria-pressed={filter === key} onClick={() => setFilter(key)}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {!persisted && !loading && (
        <div className="card" style={{ marginBottom: 14 }}>
          <h3>ℹ️ 콘솔 로그 모드</h3>
          <p className="d" style={{ margin: 0 }}>
            감사 이벤트 DB 영속화(<code>AUDIT_DB=1</code>)가 꺼져 있어 여기 표시할 데이터가 없습니다.
            현재도 이벤트는 서버 함수 로그에 <code>[AUDIT]</code> JSON 한 줄로 남고 있습니다(Vercel 로그에서 확인).
            영속화 켜기(운영 DB에 <code>db/audit.sql</code> 적용 + 환경변수)는 <b>[승인 필요]</b> — docs/STAGING_OPERATIONS.md 참조.
          </p>
        </div>
      )}

      <div className="card">
        <h3>이벤트 목록 {loading ? '' : `(${events.length}건${hasMore ? '+' : ''})`}</h3>
        <div className="tblwrap">
          <table className="tbl" aria-label="접근/감사 이벤트 목록">
            <thead>
              <tr>
                <th scope="col">시각</th><th scope="col">이벤트</th><th scope="col">계정(마스킹)</th>
                <th scope="col">역할</th><th scope="col">IP(마스킹)</th><th scope="col">상세</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="muted">불러오는 중…</td></tr>
              ) : events.length === 0 ? (
                <tr><td colSpan={6} className="muted">{persisted ? '기록된 이벤트가 없습니다.' : '영속화 OFF — 표시할 데이터가 없습니다.'}</td></tr>
              ) : events.map((e) => {
                const m = EVENT_META[e.event] || { label: e.event || '—', tag: 't-mut' };
                return (
                  <tr key={e.id}>
                    <td style={{ whiteSpace: 'nowrap' }}>{fmtTs(e.ts)}</td>
                    <td><span className={`tag ${m.tag}`}>{m.label}</span></td>
                    <td>{e.actor || '—'}</td>
                    <td>{e.role || '—'}</td>
                    <td>{e.ip || '—'}</td>
                    <td className="muted" style={{ fontSize: 12 }}>{fmtDetail(e.detail) || '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {hasMore && (
          <div style={{ marginTop: 12, textAlign: 'center' }}>
            <button type="button" className="btn" onClick={loadMore} disabled={more}>
              {more ? '불러오는 중…' : '더 보기'}
            </button>
          </div>
        )}
      </div>
    </>
  );
}
