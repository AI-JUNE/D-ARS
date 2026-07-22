'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { NODE_TYPES } from '@/lib/ui';
import { downloadCSV, downloadExcel, printPDF } from '@/lib/export';
import { getJSON, postJSON, putJSON } from '@/lib/fetchJson';
import ErrorBanner from '@/lib/ErrorBanner';
import { useList } from '@/lib/useList';
import ListMore from '@/lib/ListMore';
import { buildListUrl, readPage } from '@/lib/listUrl';
import { useExportAll } from '@/lib/useExportAll';
import { truncationNote } from '@/lib/exportAll';
import SortTh from '@/lib/SortTh';
import { sortQuery } from '@/lib/sortParams';
import RangeSeg from '@/lib/RangeSeg';
import { rangeQuery } from '@/lib/statsRange';
import { useRangeParam } from '@/lib/useRangeParam';
import { useUrlState } from '@/lib/useUrlState';
import { useSortState } from '@/lib/useSortState';
import { SCENARIO_SORTS } from '@/lib/listSorts';
import SavedViews from '@/lib/SavedViews';
import EmptyRow, { EmptyBox } from '@/lib/EmptyRows';
import { useRowSelection } from '@/lib/useRowSelection';
import { exportRunner } from '@/lib/selection';
import { SelectAllTh, SelectTd, SelectionNote } from '@/lib/RowSelect';

/* 표 뷰 + 서버 전체 기준 정렬(2026-07-13 야간 · 14회차).
   기존: 시나리오는 빌더 사이드 목록·보드 뷰뿐이라 **정렬이 불가능**했고(다른 4개 목록 화면은 정렬 헤더 보유),
         "최근 수정 순"·"노드 많은 순"으로 훑을 방법이 없었다. /api/scenarios 는 이미 sort·dir 를 지원한다
         (SCENARIO_SORTS 화이트리스트) → 표 뷰를 추가하고 그 스펙을 그대로 쓴다.
   정렬은 **서버 전체 기준**(로드된 50건이 아니라) → '노드 많은 순' 1위가 페이지 로드량에 따라 달라지지 않는다.
   내보내기도 같은 정렬을 서버에 넘겨 목록·파일 순서가 일치한다. */

/* 서버 사이드 검색 + "더 보기" 페이징(2026-07-13 야간).
   기존: /api/scenarios 전체를 **무제한**으로 받아 화면에서 다 그렸다 → 시나리오가 쌓이면 첫 로드가 무거워지고
         목록·보드가 길어져 선택이 어려워진다(다른 4개 목록 화면은 이미 서버 기준으로 전환됨).
   현재: 검색어(시나리오명·ID·유형·상태·수정자)를 서버로 보내고(디바운스 300ms) 50건씩 누적 로드.
   보드 뷰의 그룹 건수는 **로드된 행이 아니라 서버 총계**(status 별 meta=1 → total, 현재 검색어 반영)라
   페이징과 무관하게 정확하다. 내보내기(CSV·Excel·PDF)도 현재 검색 조건의 **서버 전체 행**을 수집한다.
   개인정보(전화번호)·인증·과금 로직 무관 → 저위험. */

const GROUPS = [['운영', 't-ok'], ['미운영', 't-mut']];
const VIEWS = ['builder', 'board', 'table'];

/* 검색어·뷰 URL 보존(2026-07-14): 기간(?range=)에 이어 검색어(?q=)·뷰(?view=board|table)도 URL 에 남긴다
   → "표 뷰로 이 검색 결과 보세요" 링크 공유·새로고침·뒤로가기에도 조건이 유지된다. 기본값이면 파라미터 없음. */
const URL_SPEC = { q: { qs: 'q', def: '' }, view: { qs: 'view', def: 'builder', values: VIEWS } };

/* 빈 결과의 인라인 '조건 지우기'가 보존할 파라미터(21회차) — 뷰는 조회 '조건'이 아니라 표시 방식이므로
   지우면 사용자가 보고 있던 표/보드에서 튕겨 나간다. 모듈 상수로 두어 참조 아이덴티티를 안정시킨다. */
const SCN_KEEP = ['view'];

/* 표 뷰 기본 정렬(22회차 · 백로그 (m)) — 수정일 내림차순 = '최근 수정 순'.
   모듈 상수로 두어 참조 아이덴티티를 안정시킨다(훅 의존성 안정). URL 에는 쓰지 않는다(하위호환). */
const DEFAULT_SORT = { key: 'updated_at', dir: 'desc' };

/* 표 뷰가 아닐 때 선택 훅에 넘길 빈 목록 — 모듈 상수로 두어 렌더마다 새 배열이 생기지 않게 한다(참조 안정). */
const NO_ROWS = [];

export default function Scenarios() {
  const [cur, setCur] = useState(null);
  const [uq, setUq] = useUrlState(URL_SPEC);
  const view = uq.view;                        // builder | board | table
  const setView = (v) => setUq({ view: v });
  // 정렬도 URL(?sort=&dir=)에 보존한다(19회차) → 표 뷰의 '노드 많은 순' 링크를 그대로 공유할 수 있다.
  // 기본 정렬 = **수정일 내림차순(최근 수정 순)**(22회차 · 백로그 (m)): 시나리오는 변경 이력 감사 대상이라
  // "방금 누가 무엇을 고쳤나"가 첫 화면에 보여야 한다(이전 기본은 id 순 → 최근 변경분이 맨 아래에 묻혔다).
  // 기본 정렬은 URL 에 쓰지 않으므로 주소·공유 링크는 그대로다(하위호환). API 기본 동작도 불변.
  const [sort, setSort] = useSortState(SCENARIO_SORTS, DEFAULT_SORT); // { key, dir } — 서버 정렬 파라미터로 전달
  const [saveErr, setSaveErr] = useState(null); // 저장·생성 실패(목록 오류는 L.error)
  const [counts, setCounts] = useState({ 운영: 0, 미운영: 0 });
  // 기간 필터(2026-07-14): 시나리오 **수정일(updated_at)** 기준 7·30·90일/전체.
  // "이번 주에 손댄 시나리오만" 같은 변경 이력 감사 조회를 위해 추가. URL 쿼리(?range=)에 보존.
  const [range, setRange] = useRangeParam();

  const rangeParams = rangeQuery(range); // 'all' 이면 {} → 기존 요청 URL 과 동일(하위호환)
  const listParams = { ...rangeParams, ...sortQuery(sort) };
  const L = useList('/api/scenarios', { pageSize: 50, params: listParams, q: uq.q, setQ: (v) => setUq({ q: v }) });
  const X = useExportAll('/api/scenarios', { q: L.dq, params: listParams });

  // 상태별 총계: 목록과 **같은 검색어·기간**으로 count 만 가져온다(limit=1 → 응답 최소).
  // → 보드 그룹 건수가 표·목록과 어긋나지 않는다.
  const countParams = JSON.stringify(rangeParams);
  const loadCounts = useCallback(async () => {
    const rq = JSON.parse(countParams);
    const one = async (status) => {
      const { data, error } = await getJSON(
        buildListUrl('/api/scenarios', { q: L.dq, limit: 1, offset: 0, params: { status, ...rq } })
      );
      if (error) return null;
      return readPage(data, { limit: 1, offset: 0 }).total;
    };
    const [on, off] = await Promise.all([one('운영'), one('미운영')]);
    setCounts((c) => ({ 운영: on ?? c.운영, 미운영: off ?? c.미운영 }));
  }, [L.dq, countParams]);
  useEffect(() => { loadCounts(); }, [loadCounts]);

  // 선택 유지: 로드된 행에 현재 선택이 있으면 그대로 둔다(편집 중인 노드가 날아가지 않게).
  // 선택이 없거나 목록에서 사라졌으면 첫 행을 선택한다.
  useEffect(() => {
    setCur((prev) => {
      if (prev && prev.id !== '-' && L.rows.some((s) => s.id === prev.id)) return prev;
      const first = L.rows[0];
      if (first) return { ...first, nodes: [...(first.nodes || [])] };
      if (L.loading) return prev;
      return { id: '-', name: L.error ? '불러오지 못함' : '데이터 없음', type: '-', version: 0, status: '-', nodes: [] };
    });
  }, [L.rows, L.loading, L.error]);

  const select = (s) => setCur({ ...s, nodes: [...(s.nodes || [])] });
  const reload = () => { L.reload(); loadCounts(); };

  const grouped = useMemo(() => {
    const m = { 운영: [], 미운영: [] };
    for (const s of L.rows) (m[s.status] || (m[s.status] = [])).push(s);
    return m;
  }, [L.rows]);

  // 행 선택(26회차 · 25회차에서 위험 최소화를 위해 분리해 둔 항목): 표 뷰에서 체크한 행이 있으면
  // 내보내기는 **그 행만** 담는다(선택 0건이면 기존대로 서버 전체 → 하위호환 100%).
  // 뷰(builder·board·table)를 **scope 에 포함**한 이유: 내보내기 버튼은 세 뷰 모두에서 보이는데
  // 표에서 3건을 고른 뒤 보드로 넘어가면 체크박스도 안내줄도 보이지 않는다 → 그 상태로 내보내면
  // 사용자는 자신이 무엇을 내보내는지 알 수 없다(가장 위험한 종류의 침묵). 뷰를 바꾸면 선택을 비운다.
  // 검색어·기간·정렬이 바뀔 때 비우는 것은 훅의 기본 동작이다.
  const S = useRowSelection(view === 'table' ? L.rows : NO_ROWS, { scope: JSON.stringify({ q: L.dq, view, ...listParams }) });
  const R = exportRunner(S, X);

  const exportCols = [
    {label:'ID',value:'id'},{label:'시나리오',value:'name'},{label:'유형',value:'type'},
    {label:'상태',value:'status'},{label:'버전',value:'version'},{label:'노드수',value:s=>(s.nodes||[]).length},{label:'수정일',value:'updated_at'}];
  // 내보내기: 선택 0건이면 현재 검색 조건의 **서버 전체 행**(로드된 50건이 아니라)을 수집한다.
  const exportCsv = () => R.run((rows, opts) => downloadCSV('scenarios.csv', rows, exportCols, opts));
  const exportXlsx = () => R.run((rows, opts) => downloadExcel('scenarios.xls', rows, exportCols, '시나리오', opts));
  const exportPdf = () => R.run((rows, opts) => printPDF('시나리오 목록', rows, exportCols, opts));

  if (!cur) return <div className="card">불러오는 중…</div>;

  const addNode = (type) => setCur({ ...cur, nodes: [...cur.nodes, { id: Math.max(0,...cur.nodes.map(n=>n.id))+1, type, label: NODE_TYPES[type].name }] });
  const delNode = (id) => setCur({ ...cur, nodes: cur.nodes.filter(n=>n.id!==id) });
  const move = (id, dir) => { const ns=[...cur.nodes]; const i=ns.findIndex(n=>n.id===id); const j=i+dir; if(j<0||j>=ns.length)return; [ns[i],ns[j]]=[ns[j],ns[i]]; setCur({...cur,nodes:ns}); };
  const editLabel = (id) => { const n=cur.nodes.find(x=>x.id===id); const v=prompt('라벨', n.label); if(v===null)return; setCur({...cur,nodes:cur.nodes.map(x=>x.id===id?{...x,label:v}:x)}); };
  const save = async () => {
    if (cur.id === '-') return;
    const { data, error } = await putJSON('/api/scenarios/'+cur.id, { nodes: cur.nodes, name: cur.name, type: cur.type, status: cur.status });
    if (error) { setSaveErr(error); return; }            // 실패를 성공처럼 알리지 않는다
    setSaveErr(null);
    if (data && data.id) setCur({ ...data, nodes: [...(data.nodes || cur.nodes)] }); // 상향된 버전 즉시 반영
    reload();
    alert('저장됨 · 버전 상향');
  };
  const create = async () => {
    const name = prompt('시나리오명','새 시나리오'); if (name===null) return;
    const { data, error } = await postJSON('/api/scenarios', { name });
    if (error) { setSaveErr(error); return; }
    setSaveErr(null);
    if (data && data.id) select(data);
    reload();
  };
  const validate = () => { const ok=cur.nodes.some(n=>n.type==='VISUAL_LAUNCH')&&cur.nodes.some(n=>n.type==='END'); alert(ok?'✓ 검증 통과 · 런칭·종료 노드 정상':'⚠ 런칭/종료 노드를 확인하세요'); };

  return (
    <>
      <div className="sectionhead"><h2>비주얼 시나리오 관리</h2><span className="d">화면 흐름 노드 구성 · 콜봇 시나리오 연계</span>
        <span className="sp" />
        <div className="seg" role="group" aria-label="뷰 전환"><button type="button" className={view==='builder'?'on':''} aria-pressed={view==='builder'} onClick={()=>setView('builder')}>🧩 빌더</button>
          <button type="button" className={view==='board'?'on':''} aria-pressed={view==='board'} onClick={()=>setView('board')}>🗂️ 보드</button>
          <button type="button" className={view==='table'?'on':''} aria-pressed={view==='table'} onClick={()=>setView('table')}>📋 표</button></div>
        <button className="btn sm" disabled={X.busy} onClick={exportCsv}>⬇ CSV</button>
        <button className="btn sm" disabled={X.busy} onClick={exportXlsx}>⬇ Excel</button>
        <button className="btn sm" disabled={X.busy} onClick={exportPdf}>🖨 PDF</button>
        <button className="btn primary sm" onClick={create}>+ 시나리오</button>
      </div>

      <ErrorBanner message={saveErr || X.error || L.error} onRetry={reload} />
      {(X.busy || X.truncated) && <div className="muted noprint" style={{fontSize:12, margin:'0 0 8px', wordBreak:'break-word'}}>{X.busy ? '전체 내보내기 준비 중…' : truncationNote(X.truncated, X.maxRows)}</div>}

      <div className="toolbar">
        <RangeSeg value={range} onChange={setRange} label="수정일 기간" />
        <input className="input" placeholder="시나리오명·ID·유형·상태 검색(서버 검색)" value={L.q} onChange={e=>L.setQ(e.target.value)} style={{flex:'1 1 200px'}} />
        <span className="muted" style={{fontSize:12}}>{L.searching || L.loading ? '검색 중…' : `${L.total.toLocaleString()}건`}</span>
      </div>

      <SavedViews screen="scenarios" />

      {view==='board' ? (
        <>
          <div className="grid g2">
            {GROUPS.map(([g,tag])=>(
              <div className="card" key={g}>
                <h3><span className={'tag '+tag}>{g}</span> <span className="muted" style={{fontSize:12,fontWeight:600}}>{(counts[g]||0).toLocaleString()}건</span></h3>
                {(grouped[g]||[]).map(s=>(
                  <div key={s.id} className="node" style={{cursor:'pointer'}} onClick={()=>{select(s);setView('builder');}}>
                    <div className="ic" style={{background:'#be5535',fontSize:12}}>{s.type==='아웃바운드'?'OB':'IB'}</div>
                    <div className="body"><b>{s.name}</b><span>v{s.version} · {(s.nodes||[]).length}노드 · {s.updated_by||''}</span>
                      <div style={{display:'flex',gap:3,marginTop:5,flexWrap:'wrap'}}>
                        {(s.nodes||[]).map(n=>{const t=NODE_TYPES[n.type];return <span key={n.id} title={t?.name} style={{fontSize:13}}>{t?t.ic:'●'}</span>;})}
                      </div>
                    </div>
                  </div>
                ))}
                {(grouped[g]||[]).length===0 && <div className="d">{L.loading ? '불러오는 중…' : (L.error ? '불러오지 못했습니다' : '항목 없음')}</div>}
              </div>
            ))}
          </div>
          <ListMore shown={L.rows.length} total={L.total} hasMore={L.hasMore} loading={L.loadingMore} onMore={L.loadMore} />
        </>
      ) : view==='table' ? (
        /* 표 뷰: 서버 전체 기준 정렬(SCENARIO_SORTS 화이트리스트) · 행 클릭 시 빌더로 이동.
           모바일에서는 card 안에서 가로 스크롤(디자인 원칙: 표는 카드 내 스크롤 — 무붕괴·무오버랩). */
        <div className="card">
          <SelectionNote S={S} />
          <div style={{overflowX:'auto'}}>
            <table className="tbl">
              <thead><tr>
                <SelectAllTh S={S} label="표시된 시나리오 전체 선택" />
                <SortTh sort={sort} onSort={setSort} k="id">ID</SortTh>
                <SortTh sort={sort} onSort={setSort} k="name">시나리오</SortTh>
                <SortTh sort={sort} onSort={setSort} k="type">유형</SortTh>
                <SortTh sort={sort} onSort={setSort} k="status">상태</SortTh>
                <SortTh sort={sort} onSort={setSort} k="version">버전</SortTh>
                <SortTh sort={sort} onSort={setSort} k="nodes">노드수</SortTh>
                <SortTh sort={sort} onSort={setSort} k="updated_at">수정일</SortTh>
                <th>수정자</th><th>조치</th>
              </tr></thead>
              <tbody>{L.rows.map(s=>(
                <tr key={s.id}>
                  <SelectTd S={S} row={s} label={`${s.name} 선택`} />
                  <td>{s.id}</td>
                  <td><b style={{wordBreak:'break-word'}}>{s.name}</b></td>
                  <td>{s.type}</td>
                  <td><span className={'tag '+(s.status==='운영'?'t-ok':'t-mut')}>{s.status}</span></td>
                  <td>v{s.version}</td>
                  <td>{(s.nodes||[]).length}</td>
                  <td>{String(s.updated_at||'').slice(0,10)}</td>
                  <td>{s.updated_by||''}</td>
                  <td><button className="btn sm" onClick={()=>{select(s);setView('builder');}}>열기</button></td>
                </tr>))}
                {/* keep=['view']: 표 뷰에서 조건을 지울 때 뷰(`?view=table`)까지 지우면 보드로 튕겨 나간다 → 뷰는 보존한다 */}
                {/* colSpan 9 → 10: 선택 열이 앞에 붙었다(빈 상태 안내가 표 너비를 다 채워야 붕괴가 없다) */}
                {L.rows.length===0 && <EmptyRow colSpan={10} loading={L.loading} error={L.error} keep={SCN_KEEP} empty="등록된 시나리오가 없습니다" />}
              </tbody>
            </table>
          </div>
          <ListMore shown={L.rows.length} total={L.total} hasMore={L.hasMore} loading={L.loadingMore} onMore={L.loadMore} />
        </div>
      ) : (
        <div className="sb">
          <div className="card scn-list"><h3 style={{fontSize:13}}>시나리오</h3>
            {L.rows.map(s=>(<div key={s.id} className={'item'+(s.id===cur.id?' on':'')} onClick={()=>select(s)}>
              <b>{s.name}</b><span>{s.type} · v{s.version} · {s.status} · {(s.nodes||[]).length}노드</span></div>))}
            {L.rows.length===0 && <EmptyBox loading={L.loading} error={L.error} keep={SCN_KEEP} empty="등록된 시나리오가 없습니다" style={{ padding: '12px 0' }} />}
            <ListMore shown={L.rows.length} total={L.total} hasMore={L.hasMore} loading={L.loadingMore} onMore={L.loadMore} />
          </div>
          <div className="card">
            <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:10,flexWrap:'wrap'}}>
              <h3 style={{margin:0}}>{cur.name}</h3>
              <span className="d" style={{margin:0}}>{cur.type} · v{cur.version} · {cur.updated_by||''}</span>
              <span className="sp" />
              <button className="btn sm" onClick={validate}>✓ 검증</button>
              <button className="btn primary sm" onClick={save}>💾 버전 저장</button>
            </div>
            {cur.nodes.map((n,i)=>{const t=NODE_TYPES[n.type]||{ic:'●',c:'#999',name:n.type};return (
              <div className="node" key={n.id}>
                <div className="ic" style={{background:t.c}}>{t.ic}</div>
                <div className="body"><b>{t.name}</b><span>{n.label}</span></div>
                <span className="muted" style={{fontSize:11,fontWeight:700}}>#{i+1}</span>
                <button className="btn sm" onClick={()=>editLabel(n.id)}>수정</button>
                <button className="btn sm" onClick={()=>move(n.id,-1)}>↑</button>
                <button className="btn sm" onClick={()=>move(n.id,1)}>↓</button>
                <button className="btn sm danger" onClick={()=>delNode(n.id)}>✕</button>
              </div>);})}
            {cur.nodes.length===0 && <div className="d">노드가 없습니다. 오른쪽 팔레트에서 추가하세요.</div>}
          </div>
          <div className="card"><h3 style={{fontSize:13}}>노드 팔레트</h3><div className="d">클릭하여 추가</div>
            <div className="palette">{Object.entries(NODE_TYPES).map(([k,v])=>(
              <button key={k} onClick={()=>addNode(k)}><span style={{color:v.c}}>{v.ic}</span> {v.name}</button>))}</div>
          </div>
        </div>
      )}
    </>
  );
}
