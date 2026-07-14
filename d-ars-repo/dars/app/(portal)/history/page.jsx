'use client';
import { useCallback, useEffect, useState } from 'react';
import { NODE_TYPES, fmt, pct } from '@/lib/ui';
import { downloadCSV, downloadExcel, printPDF } from '@/lib/export';
import { Donut, ProgressRow } from '@/lib/charts';
import { getJSON } from '@/lib/fetchJson';
import ErrorBanner from '@/lib/ErrorBanner';
import { useList } from '@/lib/useList';
import ListMore from '@/lib/ListMore';
import SortTh from '@/lib/SortTh';
import { sortQuery } from '@/lib/sortParams';
import { aggUrl, readAgg, aggCount, emptyAgg } from '@/lib/aggregate';
import { useExportAll } from '@/lib/useExportAll';
import { truncationNote } from '@/lib/exportAll';
import RangeSeg from '@/lib/RangeSeg';
import { rangeQuery, rangeLabel, readRange } from '@/lib/statsRange';
import { useRangeParam } from '@/lib/useRangeParam';
import { useUrlState } from '@/lib/useUrlState';
import { useSortState } from '@/lib/useSortState';
import { MM_SORTS } from '@/lib/listSorts';
import SavedViews from '@/lib/SavedViews';
import EmptyRow from '@/lib/EmptyRows';

/* 멀티모달 이력 — 보이는 ARS 상호작용 로그(화면·음성·문자·RAG·전환)를
   한 화면에서 조회·필터·내보내기. 읽기 전용 · 모바일 우선 · 브랜드 #be5535.

   서버 검색·"더 보기" 페이징 전환(2026-07-12):
   - 목록은 /api/multimodal?limit&offset&q&channel&meta=1 (50건씩 누적 로드)
   - KPI·결과 도넛·채널 분포는 **로드된 행이 아니라** /api/multimodal?agg=1 서버 총계 기반
     → 페이징해도 수치가 왜곡되지 않는다. 검색어(디바운스)·채널 필터는 목록과 동일 조건.

   정렬 헤더 도입 + 서버 전체 기준 정렬(2026-07-13):
   - 이 표에는 정렬 기능 자체가 없었다 → `SortTh`(키보드·aria-sort) 도입.
   - 정렬은 처음부터 **서버 전체 기준**(?sort=&dir=) — 로드된 50건만 정렬해 1위가 틀리는 문제를 애초에 만들지 않는다.
   - 목록·내보내기가 같은 정렬 조건을 쓰고, 정렬 변경 시 첫 페이지부터 재조회한다. */

const CH = ['전체', '화면 표출', '음성 안내', '메뉴 선택', '서류 안내', 'RAG 응답', '문자 발송', '채널 전환'];
const RESULT_TAG = { '완료': 't-ok', '이탈': 't-bad', '상담원 전환': 't-warn' };
const REFRESH_MS = 15000;

/* 검색어·채널 필터 URL 보존(2026-07-14): 기간(?range=)에 이어 검색어(?q=)·채널(?channel=)도 URL 에 남긴다
   → "'채널 전환' 이력만" 링크를 공유하면 상대도 같은 조건을 본다. 기본값이면 파라미터가 붙지 않는다(하위호환). */
const URL_SPEC = { q: { qs: 'q', def: '' }, channel: { qs: 'channel', def: '전체', values: CH } };

export default function History() {
  const [uq, setUq] = useUrlState(URL_SPEC);
  const ch = uq.channel;
  const setCh = (v) => setUq({ channel: v });
  // 기간은 URL 쿼리(?range=)에 보존 → 새로고침·링크 공유·뒤로가기에도 구간이 유지된다(2026-07-14).
  const [range, setRange] = useRangeParam(); // 7·30·90일/전체 — 목록·집계·내보내기 동일 구간
  // 정렬도 URL(?sort=&dir=)에 보존한다(19회차) → 주소 하나로 기간·검색·채널·정렬이 함께 재현된다.
  const [sort, setSort] = useSortState(MM_SORTS); // { key, dir } — 서버 정렬 파라미터로 전달
  const [agg, setAgg] = useState(emptyAgg());
  const [srvRange, setSrvRange] = useState(null); // 서버가 실제 적용한 구간(라벨-숫자 불일치 방지)
  const [aggErr, setAggErr] = useState(null);

  const rangeParams = rangeQuery(range); // 'all' 이면 {} → 기존 요청 URL 과 동일(하위호환)
  const listParams = { channel: ch, ...rangeParams, ...sortQuery(sort) };
  const L = useList('/api/multimodal', { pageSize: 50, params: listParams, refreshMs: REFRESH_MS, q: uq.q, setQ: (v) => setUq({ q: v }) });
  const rows = L.rows; // 서버가 이미 현재 정렬로 내려준다(페이지 누적 순서 = 전체 정렬 순서)
  const X = useExportAll('/api/multimodal', { q: L.dq, params: listParams });

  // 집계는 목록과 **같은 조건**(채널 + 디바운스된 검색어 + 기간)으로 요청한다.
  const aggParams = JSON.stringify({ channel: ch, ...rangeParams });
  const loadAgg = useCallback(async () => {
    const { data, error } = await getJSON(aggUrl('/api/multimodal', { q: L.dq, params: JSON.parse(aggParams) }));
    setAggErr(error);
    if (!error) { setAgg(readAgg(data)); setSrvRange(readRange(data?.range)); }
  }, [aggParams, L.dq]);

  useEffect(() => {
    loadAgg();
    const t = setInterval(loadAgg, REFRESH_MS);
    return () => clearInterval(t);
  }, [loadAgg]);

  const retry = () => { L.reload(); loadAgg(); };

  const total = agg.total;
  const done = aggCount(agg, '완료');
  const drop = aggCount(agg, '이탈');
  const swap = aggCount(agg, '상담원 전환');
  const avg = agg.avgDuration;
  const chDist = agg.byChannel;

  const exportCols = [
    { label: 'ID', value: 'id' },
    { label: '시각', value: 'ts' },
    { label: '고객', value: 'phone' },
    { label: '시나리오', value: 'scenario' },
    { label: '서비스', value: 'service' },
    { label: '채널', value: 'channel' },
    { label: '결과', value: 'result' },
    { label: '소요(초)', value: 'duration' },
  ];
  // 내보내기: 현재 채널 필터·검색 조건의 **서버 전체 행**을 수집해 담는다(2026-07-13).
  const exportCsv = () => X.run((all) => downloadCSV('multimodal-history.csv', all, exportCols));
  const exportXlsx = () => X.run((all) => downloadExcel('multimodal-history.xls', all, exportCols, '멀티모달이력'));
  const exportPdf = () => X.run((all) => printPDF('멀티모달 이력', all, exportCols));

  return (
    <>
      <div className="sectionhead">
        <h2>멀티모달 이력</h2>
        <span className="d">보이는 ARS 상호작용 로그 · 15초 자동 갱신 · 번호 마스킹</span>
        <span className="sp" />
        <button className="btn sm" disabled={X.busy} onClick={exportCsv}>⬇ CSV</button><button className="btn sm" disabled={X.busy} onClick={exportXlsx}>⬇ Excel</button><button className="btn sm" disabled={X.busy} onClick={exportPdf}>🖨 PDF</button>
      </div>

      <ErrorBanner message={L.error || aggErr || X.error} onRetry={retry} />
      {(X.busy || X.truncated) && <div className="muted noprint" style={{ fontSize: 12, margin: '0 0 8px', wordBreak: 'break-word' }}>{X.busy ? '전체 내보내기 준비 중…' : truncationNote(X.truncated, X.maxRows)}</div>}

      <div className="grid g4">
        <div className="card kpi"><div className="n">{total}</div><div className="l">전체 상호작용</div></div>
        <div className="card kpi"><div className="n">{pct(done, total)}%</div><div className="l">완료율 · {done}건</div></div>
        <div className="card kpi"><div className="n">{drop}</div><div className="l">이탈</div></div>
        <div className="card kpi"><div className="n">{fmt(avg)}</div><div className="l">평균 소요</div></div>
      </div>

      <div className="grid g2" style={{ marginTop: 16 }}>
        <div className="card reveal" style={{ animationDelay: '.1s' }}>
          <h3>🎯 처리 결과 분포</h3><div className="d">완료 · 이탈 · 상담원 전환 비율 (현재 조건 전체)</div>
          <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', justifyContent: 'center', padding: '10px 0 2px' }}>
            <Donut value={pct(done, total)} color="#2e8b57" label={`완료 ${done}건`} />
            <Donut value={pct(drop, total)} color="#c0392b" label={`이탈 ${drop}건`} />
            <Donut value={pct(swap, total)} color="#c9902a" label={`상담원 전환 ${swap}건`} />
          </div>
        </div>
        <div className="card reveal" style={{ animationDelay: '.16s' }}>
          <h3>📡 채널별 상호작용</h3><div className="d">건수 비중 · 상위 채널 (현재 조건 전체)</div>
          {chDist.length > 0
            ? chDist.map(c => <ProgressRow key={c.name} label={c.name} value={c.count} total={total} suffix="건" color="#be5535" />)
            : <div className="muted" style={{ padding: '18px 0', textAlign: 'center' }}>조건에 맞는 이력이 없습니다.</div>}
        </div>
      </div>

      <div className="toolbar" style={{ marginTop: 16 }}>
        <RangeSeg value={range} onChange={setRange} label="조회 기간" />
        <div className="seg" role="group" aria-label="채널 필터">
          {CH.map(c => (
            <button key={c} type="button" className={ch === c ? 'on' : ''} aria-pressed={ch === c} onClick={() => setCh(c)}>{c}</button>
          ))}
        </div>
        <span className="sp" />
        <input
          className="input"
          placeholder="시나리오·서비스·결과 검색"
          value={L.q}
          onChange={e => L.setQ(e.target.value)}
          style={{ maxWidth: 220 }}
        />
      </div>

      <SavedViews screen="history" />

      <div className="card" style={{ marginTop: 4 }}>
        <h3>상호작용 로그 <span className="muted" style={{ fontWeight: 600, fontSize: 12.5, wordBreak: 'break-word' }}>· {total}건{srvRange ? ` · ${rangeLabel(srvRange)}` : ''}</span>
          {swap > 0 && <span className="tag t-warn" style={{ marginLeft: 6 }}>상담원 전환 {swap}</span>}
        </h3>
        <table className="tbl">
          <thead><tr>
            <SortTh sort={sort} onSort={setSort} k="id">ID</SortTh>
            <SortTh sort={sort} onSort={setSort} k="ts">시각</SortTh>
            <SortTh sort={sort} onSort={setSort} k="phone">고객</SortTh>
            <SortTh sort={sort} onSort={setSort} k="scenario">시나리오</SortTh>
            <SortTh sort={sort} onSort={setSort} k="channel">채널</SortTh>
            <SortTh sort={sort} onSort={setSort} k="result">결과</SortTh>
            <SortTh sort={sort} onSort={setSort} k="duration">소요</SortTh>
          </tr></thead>
          <tbody>
            {rows.map(r => {
              const nt = NODE_TYPES[r.node];
              const d = new Date(r.ts);
              const hh = String(d.getHours()).padStart(2, '0');
              const mm = String(d.getMinutes()).padStart(2, '0');
              return (
                <tr key={r.id}>
                  <td><b>{r.id}</b></td>
                  <td className="muted">{hh}:{mm}</td>
                  <td>{r.phone}</td>
                  <td>{r.scenario}</td>
                  <td><span className="tag t-info">{nt ? nt.ic + ' ' : ''}{r.channel}</span></td>
                  <td><span className={'tag ' + (RESULT_TAG[r.result] || 't-mut')}>{r.result}</span></td>
                  <td>{fmt(r.duration || 0)}</td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <EmptyRow colSpan={7} loading={L.loading} error={L.error} empty="이력이 없습니다" filtered="조건에 맞는 이력이 없습니다" />
            )}
          </tbody>
        </table>
        <ListMore shown={rows.length} total={total} hasMore={L.hasMore} loading={L.loadingMore} onMore={L.loadMore} />
      </div>
    </>
  );
}
