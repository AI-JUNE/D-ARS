'use client';
import { useCallback, useEffect, useState } from 'react';
import { NODE_TYPES, journey, stepLabel, fmt, fmtDur } from '@/lib/ui';
import { downloadCSV, downloadExcel, printPDF } from '@/lib/export';
import { getJSON, asArray } from '@/lib/fetchJson';
import ErrorBanner from '@/lib/ErrorBanner';
import { useList } from '@/lib/useList';
import ListMore from '@/lib/ListMore';
import SortTh from '@/lib/SortTh';
import { sortQuery } from '@/lib/sortParams';
import { aggUrl } from '@/lib/aggregate';
import { readSessionAgg, emptySessionAgg, stepCount, nodeCount } from '@/lib/sessionsAgg';
import { applyLive } from '@/lib/liveMerge';
import { useExportAll } from '@/lib/useExportAll';
import { truncationNote } from '@/lib/exportAll';
import { useUrlState } from '@/lib/useUrlState';
import { useSortState } from '@/lib/useSortState';
import { SESSION_SORTS } from '@/lib/listSorts';
import SavedViews from '@/lib/SavedViews';
import EmptyRow from '@/lib/EmptyRows';
import { useRowSelection } from '@/lib/useRowSelection';
import { exportRunner } from '@/lib/selection';
import { SelectAllTh, SelectTd, SelectionNote } from '@/lib/RowSelect';

/* 검색어 URL 보존(2026-07-14): 세션 보드의 검색 조건(?q=)을 URL 에 남긴다 → 새로고침·링크 공유·뒤로가기 유지.
   (기간 필터는 없다 — status='진행' 실시간 보드라 날짜 구간이 의미가 없다. 16회차 결론 유지) */
const URL_SPEC = { q: { qs: 'q', def: '' } };

/* 실시간 세션 보드 — SSE 실시간 스트림 + 서버 검색·"더 보기" 페이징 병행(2026-07-12).

   설계:
   - 목록: /api/sessions?limit&offset&q&meta=1 (50건씩 누적) → 세션이 쌓여도 과거 행이 사라지지 않는다.
   - 실시간: SSE(/api/sessions/stream)가 주는 최신 스냅샷(최대 20건)은 목록을 **교체하지 않고**
     `applyLive` 로 병합 — 이미 로드된 행은 id 기준 갱신, 새 세션만 맨 앞 삽입.
     검색 중에는 스냅샷이 검색 조건을 만족하는지 알 수 없으므로 **삽입하지 않고 갱신만** 한다.
   - SSE 끊김 시: 4초 폴백 폴링(스냅샷 20건)도 동일하게 병합. 실패는 ErrorBanner + 다시 시도.
   - KPI: 로드된 행이 아니라 /api/sessions?agg=1 **서버 총계**(현재 검색 조건 전체) 기반.
   전화번호(PII)는 서버 검색 대상이 아니다(API 정책 유지).

   정렬 서버 전체 기준 전환(2026-07-13):
   - 정렬(sort·dir)을 서버로 보내 **전체 세션 기준**으로 정렬한 페이지를 받는다(로드된 50건만 정렬해 1위가
     틀리게 보이던 문제 해소). 목록·"더 보기"·내보내기가 모두 같은 순서를 쓴다.
   - **SSE 삽입 정책 재설계**: 실시간 스냅샷의 새 세션을 맨 앞에 삽입하면 서버 정렬 순서가 깨진다
     → **정렬 중에는 삽입 보류(갱신만)**. 새 세션은 다음 재조회(정렬 변경·다시 시도·더 보기)에서 자연히 합류한다.
     정렬 미지정(기본 최신순)일 때는 기존처럼 맨 앞 삽입 = 실시간 UX 보존. */

const AGG_MS = 5000;
const POLL_MS = 4000;

export default function Sessions() {
  const [live, setLive] = useState(false);  // SSE 실시간 연결 여부
  // 정렬도 URL(?sort=&dir=)에 보존(19회차). SSE 삽입 보류 정책(정렬 중에는 갱신만)은 그대로 — sort 의 출처만 바뀐다.
  const [sort, setSort] = useSortState(SESSION_SORTS);   // { key, dir }
  const [liveErr, setLiveErr] = useState(null); // 폴백 폴링 실패 안내(SSE 정상 시에는 표시 안 함)
  const [tick, setTick] = useState(0);      // '다시 시도' → 스트림·폴링 재구성
  const [agg, setAgg] = useState(emptySessionAgg());
  const [aggErr, setAggErr] = useState(null);

  const [uq, setUq] = useUrlState(URL_SPEC);
  const L = useList('/api/sessions', { pageSize: 50, params: sortQuery(sort), q: uq.q, setQ: (v) => setUq({ q: v }) });
  const rows = L.rows; // 서버가 이미 현재 정렬로 내려준다
  const { patch, dq } = L;
  // 내보내기: 현재 검색·정렬 조건의 **서버 전체 세션**을 수집(2026-07-13) — 로드된 행 수에 따라 파일이 달라지지 않는다.
  const X = useExportAll('/api/sessions', { q: dq, params: sortQuery(sort) });

  // 실시간 스냅샷 병합: 검색 중(조건 만족 여부 불명)이거나 정렬 중(삽입 시 서버 정렬 순서가 깨짐)이면
  // 새 세션 삽입 금지 → 기존 행 갱신만.
  const sorted = !!(sort && sort.key);
  const merge = useCallback((snap) => {
    patch((prev) => applyLive(prev, snap, { insert: !dq && !sorted }));
  }, [patch, dq, sorted]);

  // KPI 서버 집계(목록과 같은 검색 조건).
  const loadAgg = useCallback(async () => {
    const { data, error } = await getJSON(aggUrl('/api/sessions', { q: dq }));
    setAggErr(error);
    if (!error) setAgg(readSessionAgg(data));
  }, [dq]);

  useEffect(() => {
    loadAgg();
    const t = setInterval(loadAgg, AGG_MS);
    return () => clearInterval(t);
  }, [loadAgg, tick]);

  // SSE 정상 경로는 기존 동작 유지. 끊기면 폴링으로 커버하고, 폴링도 실패하면 배너로 원인을 알린다.
  useEffect(() => {
    let es = null, poll = null, stopped = false;
    const startPolling = () => {
      if (poll) return;
      const load = async () => {
        const { data, error } = await getJSON('/api/sessions?limit=20');
        if (stopped) return;
        setLiveErr(error);
        if (!error) merge(asArray(data));
      };
      load(); poll = setInterval(load, POLL_MS);
    };
    const stopPolling = () => { if (poll) { clearInterval(poll); poll = null; } };

    if (typeof window !== 'undefined' && 'EventSource' in window) {
      try {
        es = new EventSource('/api/sessions/stream');
        es.addEventListener('sessions', (e) => { try { merge(JSON.parse(e.data)); setLiveErr(null); } catch {} });
        es.addEventListener('ready', () => { if (!stopped) { setLive(true); setLiveErr(null); stopPolling(); } });
        es.onerror = () => { setLive(false); startPolling(); }; // 재연결 대기 중에는 폴링으로 커버
      } catch { startPolling(); }
    } else { startPolling(); }

    return () => { stopped = true; if (es) es.close(); stopPolling(); };
  }, [tick, merge]);

  const retry = () => { setLiveErr(null); setAggErr(null); L.reload(); setTick(t => t + 1); };

  // KPI — 서버 총계 기준(페이징 무관)
  const total = agg.total;                       // 진행 세션(현재 조건 전체)
  const avg = agg.avgElapsed;
  const guide = stepCount(agg, 3);               // 안내·발송 단계
  const swap = nodeCount(agg, 'CHANNEL_SWITCH'); // 상담원 전환 대기

  const view = rows; // 정렬은 서버가 전체 기준으로 적용한다(클라이언트 재정렬 없음)

  // 행 선택(26회차 · 백로그 (v2) — /scenarios 에 이어 실시간 세션 보드로 확대):
  // 체크한 행이 있으면 내보내기는 **그 행만** 담는다(선택 0건이면 기존대로 서버 전체 → 하위호환 100%).
  // 이 화면은 SSE 실시간 보드라 다른 목록과 다르게 행이 계속 변한다 — useRowSelection 이 이를 안전하게 흡수한다:
  //   · 실시간 '갱신'(경과·노드 변화)은 id 집합이 그대로라 선택을 유지한다.
  //   · 새 세션이 맨 앞에 '삽입'되면 그 행만 미선택으로 합류하고 기존 선택은 보존된다(전체 선택은 정직하게 부분표시로).
  //   · 선택한 세션이 종료돼 보드에서 사라지면 그 선택은 자동 정리되고 count 는 화면 실재 수만 센다(유령 선택 방지).
  // scope=검색어+정렬: 조건이 바뀌면 선택을 비운다(무엇을 내보내는지 사용자가 항상 알 수 있게).
  const S = useRowSelection(view, { scope: JSON.stringify({ q: dq, ...sortQuery(sort) }) });
  const R = exportRunner(S, X);

  const exportCols = [
    { label: '세션ID', value: 'id' }, { label: '고객', value: 'phone' }, { label: '시나리오', value: 'scenario' },
    { label: '단계', value: s => stepLabel(s.step) }, { label: '경과(초)', value: 'elapsed' }, { label: '상태', value: 'status' }];
  // 선택 0건: 서버 전체 수집(기존). 선택 N건: 이미 로드된 선택 행만 즉시 내보낸다(서버 요청 0회) + 문서·파일명에 선택 표기.
  const exportCsv = () => R.run((rows, opts) => downloadCSV('sessions.csv', rows, exportCols, opts));
  const exportXlsx = () => R.run((rows, opts) => downloadExcel('sessions.xls', rows, exportCols, '세션', opts));
  const exportPdf = () => R.run((rows, opts) => printPDF('실시간 세션', rows, exportCols, opts));

  return (
    <>
      <div className="sectionhead"><h2>실시간 보이는 ARS 세션</h2>
        <span className="d" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: live ? '#2e9e5b' : '#c9a23a', boxShadow: live ? '0 0 0 3px rgba(46,158,91,.15)' : 'none', flex: '0 0 auto' }} />
          {live ? '실시간 스트림 연결됨' : '자동 갱신(4초) · 번호 마스킹'}
        </span>
        <span className="sp" /><button className="btn sm" disabled={X.busy} onClick={exportCsv}>⬇ CSV</button><button className="btn sm" disabled={X.busy} onClick={exportXlsx}>⬇ Excel</button><button className="btn sm" disabled={X.busy} onClick={exportPdf}>🖨 PDF</button></div>
      <ErrorBanner message={L.error || liveErr || aggErr || X.error} onRetry={retry} />
      {(X.busy || X.truncated) && <div className="muted noprint" style={{ fontSize: 12, margin: '0 0 8px', wordBreak: 'break-word' }}>{X.busy ? '전체 내보내기 준비 중…' : truncationNote(X.truncated, X.maxRows)}</div>}
      <div className="grid g4">
        <div className="card kpi"><div className="n">{total}</div><div className="l">진행 세션</div></div>
        <div className="card kpi"><div className="n" title={fmtDur(avg)} aria-label={'평균 경과 ' + fmtDur(avg)}>{fmt(avg)}</div><div className="l">평균 경과</div></div>
        <div className="card kpi"><div className="n">{guide}</div><div className="l">안내·발송 단계</div></div>
        <div className="card kpi"><div className="n">{swap}</div><div className="l">상담원 전환 대기</div></div>
      </div>
      <div className="card" style={{ marginTop: 16 }}><h3>세션 보드</h3>
        <div className="toolbar">
          <input className="input" placeholder="세션ID·시나리오·노드 검색" value={L.q} onChange={e => L.setQ(e.target.value)} style={{ flex: '1 1 200px' }} />
          <span className="muted" style={{ fontSize: 12 }}>{total.toLocaleString()}건</span>
        </div>
        <SavedViews screen="sessions" />
        <SelectionNote S={S} />
        <div style={{ overflowX: 'auto' }}>
          <table className="tbl"><thead><tr>
            <SelectAllTh S={S} label="표시된 세션 전체 선택" />
            <SortTh sort={sort} onSort={setSort} k="id">세션ID</SortTh>
            <SortTh sort={sort} onSort={setSort} k="phone">고객</SortTh>
            <SortTh sort={sort} onSort={setSort} k="scenario">시나리오</SortTh>
            <th>현재 노드</th>
            <SortTh sort={sort} onSort={setSort} k="step">여정</SortTh>
            <SortTh sort={sort} onSort={setSort} k="elapsed">경과</SortTh>
            <SortTh sort={sort} onSort={setSort} k="status">상태</SortTh>
          </tr></thead>
            <tbody>{view.map(s => { const nt = NODE_TYPES[s.node]; return (<tr key={s.id}>
              <SelectTd S={S} row={s} label={`세션 ${s.id} 선택`} />
              <td><b>{s.id}</b></td><td>{s.phone}</td><td>{s.scenario}</td>
              <td><span className="tag t-info">{nt ? nt.ic + ' ' + nt.name : s.node}</span></td>
              <td><div style={{ display: 'flex', gap: 3, alignItems: 'center' }}>{journey.map((j, i) =>
                <span key={i} style={{ width: 9, height: 9, borderRadius: '50%', background: i <= s.step ? '#be5535' : '#e2d5cd' }} />)}</div></td>
              <td title={fmtDur(s.elapsed)} aria-label={'경과 ' + fmtDur(s.elapsed)}>{fmt(s.elapsed)}</td><td><span className={'tag ' + (s.step >= 4 ? 't-ok' : 't-info')}>{s.step >= 4 ? '완료' : '진행'}</span></td>
            </tr>); })}
            {view.length === 0 && (
              <EmptyRow colSpan={8} loading={L.loading} error={L.error || liveErr} empty="진행 중인 세션이 없습니다" />
            )}</tbody></table>
        </div>
        <ListMore shown={view.length} total={Math.max(total, view.length)} hasMore={L.hasMore} loading={L.loadingMore} onMore={L.loadMore} />
      </div>
    </>
  );
}
