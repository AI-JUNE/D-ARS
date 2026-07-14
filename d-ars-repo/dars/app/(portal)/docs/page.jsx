'use client';
import { useState } from 'react';
import { pct } from '@/lib/ui';
import { sortQuery } from '@/lib/sortParams';
import { downloadCSV, downloadExcel, printPDF } from '@/lib/export';
import { postJSON, putJSON } from '@/lib/fetchJson';
import ErrorBanner from '@/lib/ErrorBanner';
import { useList } from '@/lib/useList';
import ListMore from '@/lib/ListMore';
import SortTh from '@/lib/SortTh';
import { useExportAll } from '@/lib/useExportAll';
import { truncationNote } from '@/lib/exportAll';
import { useUrlState } from '@/lib/useUrlState';
import { useSortState } from '@/lib/useSortState';
import { DOC_SORTS } from '@/lib/listSorts';
import SavedViews from '@/lib/SavedViews';
import EmptyRow from '@/lib/EmptyRows';

/* 검색어 URL 보존(2026-07-14): 검색 조건을 URL(?q=)에 남겨 새로고침·링크 공유·뒤로가기에도 유지된다. */
const URL_SPEC = { q: { qs: 'q', def: '' } };

/* 서버 사이드 검색 + "더 보기" 페이징(2026-07-12).
   기존: /api/docs 전체를 받아 클라이언트에서 검색 → 데이터가 쌓이면 100건 이후가 화면에서 사라짐.
   현재: 검색어를 서버로 보내고(디바운스 300ms) 50건씩 누적 로드.
   **정렬도 서버 전체 기준으로 전환(2026-07-13)** — 기존엔 "로드된 행"만 정렬해 50건만 본 상태에서
   '요청 많은 순'을 누르면 51번째 이후의 더 큰 값이 빠져 1위가 틀리게 보였다.
   이제 sort·dir 를 서버로 보내고(정렬 변경 시 첫 페이지부터 재조회) 목록·내보내기가 같은 순서를 쓴다. */

export default function Docs() {
  // 정렬도 URL(?sort=&dir=)에 보존한다(2026-07-14 · 19회차) → 링크 공유·새로고침·뒤로가기에 순서가 유지된다.
  const [sort, setSort] = useSortState(DOC_SORTS); // { key, dir } — 서버 정렬 파라미터로 전달
  const [saveErr, setSaveErr] = useState(null);
  const [uq, setUq] = useUrlState(URL_SPEC); // 검색어를 URL 에 보존
  const L = useList('/api/docs', { pageSize: 50, params: sortQuery(sort), q: uq.q, setQ: (v) => setUq({ q: v }) });
  const X = useExportAll('/api/docs', { q: L.dq, params: sortQuery(sort) });

  const add = async () => {
    const biz = prompt('업무(대분류)', '반품·교환'); if (biz===null) return;
    const name = prompt('서류명', '새 서류'); if (name===null) return;
    const { error } = await postJSON('/api/docs', { biz, name });
    if (error) { setSaveErr(error); return; }
    setSaveErr(null); L.reload();
  };
  const toggle = async (d) => {
    const { error } = await putJSON('/api/docs/'+d.id, { in_use: !d.in_use });
    if (error) { setSaveErr(error); return; }
    setSaveErr(null); L.reload();
  };

  const view = L.rows; // 서버가 이미 현재 정렬로 내려준다(페이지 누적 순서 = 전체 정렬 순서)

  const exportCols = [
    {label:'업무',value:'biz'},{label:'서류명',value:'name'},{label:'요청',value:'req'},
    {label:'발송',value:'sent'},{label:'완료',value:'done'},{label:'완료율%',value:d=>pct(d.done,d.req)},{label:'사용',value:d=>d.in_use?'Y':'N'}];
  // 내보내기: 현재 검색·정렬 조건의 **서버 전체 행**을 수집한다(정렬도 서버가 적용).
  const exportCsv = () => X.run((all) => downloadCSV('docs.csv', all, exportCols));
  const exportXlsx = () => X.run((all) => downloadExcel('docs.xls', all, exportCols, '서류'));
  const exportPdf = () => X.run((all) => printPDF('필요서류 현황', all, exportCols));
  return (
    <>
      <div className="sectionhead"><h2>필요서류 관리</h2><span className="d">보이는 ARS·UMS 안내·발송 서류</span>
        <span className="sp" /><button className="btn sm" disabled={X.busy} onClick={exportCsv}>⬇ CSV</button><button className="btn sm" disabled={X.busy} onClick={exportXlsx}>⬇ Excel</button><button className="btn sm" disabled={X.busy} onClick={exportPdf}>🖨 PDF</button><button className="btn primary sm" onClick={add}>+ 서류</button></div>
      <ErrorBanner message={saveErr || X.error || L.error} onRetry={L.reload} />
      {(X.busy || X.truncated) && <div className="muted noprint" style={{fontSize:12, margin:'0 0 8px', wordBreak:'break-word'}}>{X.busy ? '전체 내보내기 준비 중…' : truncationNote(X.truncated, X.maxRows)}</div>}
      <div className="toolbar">
        <input className="input" placeholder="업무·서류명 검색(서버 검색)" value={L.q} onChange={e=>L.setQ(e.target.value)} style={{flex:'1 1 200px'}} />
        <span className="muted" style={{fontSize:12}}>{L.searching || L.loading ? '검색 중…' : `${L.total.toLocaleString()}건`}</span>
      </div>
      <SavedViews screen="docs" />
      <div className="card"><table className="tbl">
        <thead><tr>
          <th>순위</th>
          <SortTh sort={sort} onSort={setSort} k="biz">업무</SortTh>
          <SortTh sort={sort} onSort={setSort} k="name">서류명</SortTh>
          <SortTh sort={sort} onSort={setSort} k="req">요청</SortTh>
          <SortTh sort={sort} onSort={setSort} k="sent">발송</SortTh>
          <SortTh sort={sort} onSort={setSort} k="done">완료</SortTh>
          <SortTh sort={sort} onSort={setSort} k="rate">완료율</SortTh>
          <th>사용</th><th>조치</th>
        </tr></thead>
        <tbody>{view.map((d,i)=>{const p=pct(d.done,d.req);return (<tr key={d.id}>
          <td>{i+1}</td><td>{d.biz}</td><td><b>{d.name}</b></td><td>{d.req}</td><td>{d.sent}</td><td><b>{d.done}</b></td>
          <td style={{minWidth:120}}><div className="bar"><i style={{width:p+'%'}}/></div><span className="muted" style={{fontSize:11}}>{p}%</span></td>
          <td><span className={'tag '+(d.in_use?'t-ok':'t-mut')}>{d.in_use?'사용':'미사용'}</span></td>
          <td><button className="btn sm" onClick={()=>toggle(d)}>{d.in_use?'미사용':'사용'}</button></td>
        </tr>);})}
        {view.length===0 && <EmptyRow colSpan={9} loading={L.loading} error={L.error} empty="등록된 서류가 없습니다" />}</tbody></table>
        <ListMore shown={view.length} total={L.total} hasMore={L.hasMore} loading={L.loadingMore} onMore={L.loadMore} />
      </div>
    </>
  );
}
