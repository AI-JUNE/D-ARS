'use client';
import { useCallback, useEffect, useState } from 'react';
import { tagClass, pct } from '@/lib/ui';
import { sortQuery } from '@/lib/sortParams';
import { fmtNum } from '@/lib/kpi';
import { downloadCSV, downloadExcel, printPDF } from '@/lib/export';
import { getJSON, postJSON } from '@/lib/fetchJson';
import ErrorBanner from '@/lib/ErrorBanner';
import { useList } from '@/lib/useList';
import ListMore from '@/lib/ListMore';
import SortTh from '@/lib/SortTh';
import { buildListUrl, readPage } from '@/lib/listUrl';
import { useExportAll } from '@/lib/useExportAll';
import { truncationNote } from '@/lib/exportAll';
import RangeSeg from '@/lib/RangeSeg';
import { rangeQuery } from '@/lib/statsRange';
import { useRangeParam } from '@/lib/useRangeParam';
import { useUrlState } from '@/lib/useUrlState';
import { useSortState } from '@/lib/useSortState';
import { UMS_SORTS } from '@/lib/listSorts';
import SavedViews from '@/lib/SavedViews';
import EmptyRow from '@/lib/EmptyRows';
import { useRowSelection } from '@/lib/useRowSelection';
import { exportRunner } from '@/lib/selection';
import { SelectAllTh, SelectTd, SelectionNote } from '@/lib/RowSelect';

/* 검색어·상태 필터 URL 보존(2026-07-14): 기간(?range=)에 이어 검색어(?q=)·상태(?status=)도 URL 에 남긴다
   → "'실패' 발송만" 링크를 공유하면 상대도 같은 화면을 본다. 기본값(전체·빈 검색어)이면 파라미터가 붙지 않는다. */
const STATUSES = ['전체', '발송완료', '대기', '실패'];
const URL_SPEC = { q: { qs: 'q', def: '' }, status: { qs: 'status', def: '전체', values: STATUSES } };

/* 서버 사이드 검색 + "더 보기" 페이징(2026-07-12).
   - 검색어(서비스·서류)는 서버로 전달(디바운스 300ms) — 전화번호는 PII라 서버 검색 대상이 아니다(API 정책 준수).
   - 상태 필터도 서버 파라미터(status)로 전달, 50건씩 누적 로드.
   - 대기/실패 KPI는 로드된 행이 아니라 **서버 총계(meta=1 → total)** 로 집계 → 페이지 로드량과 무관하게 정확.
   - **정렬도 서버 전체 기준(2026-07-13)**: sort·dir 를 서버로 전달 → 로드된 50건만 정렬해 순위가 틀리던 문제 해소.
     (전화번호는 정렬은 되지만 서버 **검색** 대상은 아니다 — PII 정책 유지) */

export default function Ums() {
  // 검색어·상태 필터도 URL 쿼리에 보존한다(2026-07-14).
  const [uq, setUq] = useUrlState(URL_SPEC);
  const filter = uq.status;
  const setFilter = (v) => setUq({ status: v });
  // 기간은 URL 쿼리(?range=)에 보존 → 새로고침·링크 공유·뒤로가기에도 구간이 유지된다(2026-07-14).
  const [range, setRange] = useRangeParam(); // 7·30·90일/전체 — 목록·KPI·내보내기 동일 구간
  // 정렬도 URL(?sort=&dir=)에 보존한다(19회차) → 기간·검색어·상태에 이어 **순서까지** 링크로 재현된다.
  const [sort, setSort] = useSortState(UMS_SORTS);
  const [sendErr, setSendErr] = useState(null);
  const [counts, setCounts] = useState({ 전체: 0, 발송완료: 0, 대기: 0, 실패: 0 });
  const rangeParams = rangeQuery(range); // 'all' 이면 {} → 기존 요청 URL 과 동일(하위호환)
  const listParams = { status: filter, ...rangeParams, ...sortQuery(sort) };
  const L = useList('/api/ums', { pageSize: 50, params: listParams, q: uq.q, setQ: (v) => setUq({ q: v }) });
  // 내보내기는 현재 검색어·상태 필터·정렬 **전체**(서버 기준)를 수집한다(2026-07-13).
  const X = useExportAll('/api/ums', { q: L.dq, params: listParams });

  // 상태별 총계(전체·발송완료·대기·실패): 목록과 별개로 count 만 가져온다(limit=1 → 응답 최소).
  // KPI 4장이 모두 이 **서버 총계**에서 파생된다(2026-07-13) — 기존 '오늘 발송 388'·'발송 성공률 86%' 는
  // 실제 데이터와 무관한 하드코딩 상수였다.
  // KPI 총계도 목록과 **같은 기간**을 쓴다(기간을 바꾸면 4개 KPI가 함께 움직인다 — 표와 숫자가 어긋나지 않게).
  const countParams = JSON.stringify(rangeParams);
  const loadCounts = useCallback(async () => {
    const rq = JSON.parse(countParams);
    const one = async (status) => {
      const { data, error } = await getJSON(buildListUrl('/api/ums', { limit: 1, offset: 0, params: { status, ...rq } }));
      if (error) return null;
      return readPage(data, { limit: 1, offset: 0 }).total;
    };
    const [t, s, w, f] = await Promise.all([one('전체'), one('발송완료'), one('대기'), one('실패')]);
    setCounts((c) => ({
      전체: t ?? c.전체, 발송완료: s ?? c.발송완료, 대기: w ?? c.대기, 실패: f ?? c.실패,
    }));
  }, [countParams]);
  useEffect(() => { loadCounts(); }, [loadCounts]);

  const test = async () => {
    const { error } = await postJSON('/api/ums', { service:'영수증 발급', doc:'거래 영수증' });
    if (error) { setSendErr(error); return; }
    setSendErr(null); L.reload(); loadCounts();
  };
  const retry = () => { L.reload(); loadCounts(); };
  const time = (t) => new Date(t).toTimeString().slice(0,5);

  const view = L.rows; // 서버가 이미 현재 정렬로 내려준다

  // 행 선택(25회차): 체크한 행이 있으면 내보내기는 **그 행만** 담는다(선택 0건이면 기존대로 서버 전체).
  // 조회 조건이 바뀌면 선택은 자동 해제된다(무엇을 내보내는지 항상 화면과 일치).
  const S = useRowSelection(view, { scope: JSON.stringify({ q: L.dq, ...listParams }) });
  const R = exportRunner(S, X);

  const exportCols = [
    {label:'시각',value:r=>time(r.sent_at)},{label:'휴대폰',value:'phone'},{label:'서비스',value:'service'},
    {label:'서류',value:'doc'},{label:'상태',value:'status'}];
  const exportCsv = () => R.run((rows, opts) => downloadCSV('ums.csv', rows, exportCols, opts));
  const exportXlsx = () => R.run((rows, opts) => downloadExcel('ums.xls', rows, exportCols, 'UMS', opts));
  const exportPdf = () => R.run((rows, opts) => printPDF('UMS 발송 내역', rows, exportCols, opts));
  return (
    <>
      <div className="sectionhead"><h2>UMS 문자발송</h2><span className="d">보이는 ARS 서류·영수증 링크 발송 로그</span></div>
      <ErrorBanner message={sendErr || X.error || L.error} onRetry={retry} />
      {(X.busy || X.truncated) && <div className="muted noprint" style={{fontSize:12, margin:'0 0 8px', wordBreak:'break-word'}}>{X.busy ? '전체 내보내기 준비 중…' : truncationNote(X.truncated, X.maxRows)}</div>}
      <div className="grid g4">
        <div className="card kpi"><div className="n">{fmtNum(counts.전체)}</div><div className="l">전체 발송</div></div>
        <div className="card kpi"><div className="n">{pct(counts.발송완료, counts.전체)}%</div><div className="l">발송 성공률</div></div>
        <div className="card kpi"><div className="n">{fmtNum(counts.대기)}</div><div className="l">대기</div></div>
        <div className="card kpi"><div className="n">{fmtNum(counts.실패)}</div><div className="l">실패</div></div>
      </div>
      <div className="toolbar" style={{marginTop:16}}>
        <RangeSeg value={range} onChange={setRange} label="조회 기간" />
        <div className="seg" role="group" aria-label="발송 상태">{STATUSES.map(f=>(
          <button key={f} type="button" className={filter===f?'on':''} aria-pressed={filter===f} onClick={()=>setFilter(f)}>{f}</button>))}</div>
        <input className="input" placeholder="서비스·서류 검색(서버 검색)" value={L.q} onChange={e=>L.setQ(e.target.value)} style={{flex:'1 1 160px'}} />
        <span className="sp" />
        <button className="btn sm" disabled={X.busy} onClick={exportCsv}>⬇ CSV</button><button className="btn sm" disabled={X.busy} onClick={exportXlsx}>⬇ Excel</button><button className="btn sm" disabled={X.busy} onClick={exportPdf}>🖨 PDF</button>
        <button className="btn primary sm" onClick={test}>✉️ 테스트 발송</button>
      </div>
      <SavedViews screen="ums" />
      <SelectionNote S={S} />
      <div className="card"><table className="tbl"><thead><tr>
        <SelectAllTh S={S} label="표시된 발송 전체 선택" />
        <SortTh sort={sort} onSort={setSort} k="sent_at">시각</SortTh>
        <SortTh sort={sort} onSort={setSort} k="phone">휴대폰</SortTh>
        <SortTh sort={sort} onSort={setSort} k="service">서비스</SortTh>
        <SortTh sort={sort} onSort={setSort} k="doc">서류</SortTh>
        <SortTh sort={sort} onSort={setSort} k="status">상태</SortTh>
      </tr></thead>
        <tbody>{view.map(r=>(<tr key={r.id}><SelectTd S={S} row={r} label={`${r.doc} 발송 선택`} /><td>{time(r.sent_at)}</td><td>{r.phone}</td><td>{r.service}</td><td>{r.doc}</td>
          <td><span className={'tag '+tagClass(r.status)}>{r.status}</span></td></tr>))}
          {view.length===0 && <EmptyRow colSpan={6} loading={L.loading} error={L.error} empty="발송 이력이 없습니다" filtered="조건에 맞는 발송이 없습니다" />}</tbody></table>
        <ListMore shown={view.length} total={L.total} hasMore={L.hasMore} loading={L.loadingMore} onMore={L.loadMore} />
      </div>
    </>
  );
}
