'use client';
import { useEffect, useState } from 'react';
import { NODE_TYPES } from '@/lib/ui';
import { downloadCSV, downloadExcel, printPDF } from '@/lib/export';

export default function Scenarios() {
  const [list, setList] = useState([]);
  const [cur, setCur] = useState(null);
  const [view, setView] = useState('builder'); // builder | board
  const load = async (keep) => {
    const d = await fetch('/api/scenarios').then(r=>r.json()).catch(()=>[]);
    if (!d || !d.length) { setCur({id:'-',name:'데이터 없음',type:'-',version:0,nodes:[]}); setList([]); return; }
    setList(d);
    const sel = keep && d.find(s=>s.id===keep) ? d.find(s=>s.id===keep) : (cur && d.find(s=>s.id===cur.id)) || d[0];
    setCur(sel ? { ...sel, nodes: [...(sel.nodes||[])] } : null);
  };
  useEffect(() => { load(); }, []);
  if (!cur) return <div className="card">불러오는 중…</div>;

  const addNode = (type) => setCur({ ...cur, nodes: [...cur.nodes, { id: Math.max(0,...cur.nodes.map(n=>n.id))+1, type, label: NODE_TYPES[type].name }] });
  const delNode = (id) => setCur({ ...cur, nodes: cur.nodes.filter(n=>n.id!==id) });
  const move = (id, dir) => { const ns=[...cur.nodes]; const i=ns.findIndex(n=>n.id===id); const j=i+dir; if(j<0||j>=ns.length)return; [ns[i],ns[j]]=[ns[j],ns[i]]; setCur({...cur,nodes:ns}); };
  const editLabel = (id) => { const n=cur.nodes.find(x=>x.id===id); const v=prompt('라벨', n.label); if(v===null)return; setCur({...cur,nodes:cur.nodes.map(x=>x.id===id?{...x,label:v}:x)}); };
  const save = async () => { await fetch('/api/scenarios/'+cur.id,{method:'PUT',body:JSON.stringify({nodes:cur.nodes,name:cur.name,type:cur.type,status:cur.status})}); await load(cur.id); alert('저장됨 · 버전 상향'); };
  const create = async () => { const name=prompt('시나리오명','새 시나리오'); if(name===null)return; const s=await fetch('/api/scenarios',{method:'POST',body:JSON.stringify({name})}).then(r=>r.json()); await load(s.id); };
  const validate = () => { const ok=cur.nodes.some(n=>n.type==='VISUAL_LAUNCH')&&cur.nodes.some(n=>n.type==='END'); alert(ok?'✓ 검증 통과 · 런칭·종료 노드 정상':'⚠ 런칭/종료 노드를 확인하세요'); };
  const exportCols = [
    {label:'ID',value:'id'},{label:'시나리오',value:'name'},{label:'유형',value:'type'},
    {label:'상태',value:'status'},{label:'버전',value:'version'},{label:'노드수',value:s=>(s.nodes||[]).length},{label:'수정일',value:'updated_at'}];
  const exportCsv = () => downloadCSV('scenarios.csv', list, exportCols);
  const exportXlsx = () => downloadExcel('scenarios.xls', list, exportCols, '시나리오');

  const exportPdf = () => printPDF('시나리오 목록', list, exportCols);
  const groups = [['운영','t-ok'],['미운영','t-mut']];

  return (
    <>
      <div className="sectionhead"><h2>비주얼 시나리오 관리</h2><span className="d">화면 흐름 노드 구성 · 콜봇 시나리오 연계</span>
        <span className="sp" />
        <div className="seg"><button className={view==='builder'?'on':''} onClick={()=>setView('builder')}>🧩 빌더</button>
          <button className={view==='board'?'on':''} onClick={()=>setView('board')}>🗂️ 보드</button></div>
        <button className="btn sm" onClick={exportCsv}>⬇ CSV</button><button className="btn sm" onClick={exportXlsx}>⬇ Excel</button><button className="btn sm" onClick={exportPdf}>🖨 PDF</button>
        <button className="btn primary sm" onClick={create}>+ 시나리오</button>
      </div>

      {view==='board' ? (
        <div className="grid g2">
          {groups.map(([g,tag])=>(
            <div className="card" key={g}>
              <h3><span className={'tag '+tag}>{g}</span> <span className="muted" style={{fontSize:12,fontWeight:600}}>{list.filter(s=>s.status===g).length}건</span></h3>
              {list.filter(s=>s.status===g).map(s=>(
                <div key={s.id} className="node" style={{cursor:'pointer'}} onClick={()=>{setCur({...s,nodes:[...(s.nodes||[])]});setView('builder');}}>
                  <div className="ic" style={{background:'#be5535',fontSize:12}}>{s.type==='아웃바운드'?'OB':'IB'}</div>
                  <div className="body"><b>{s.name}</b><span>v{s.version} · {(s.nodes||[]).length}노드 · {s.updated_by||''}</span>
                    <div style={{display:'flex',gap:3,marginTop:5,flexWrap:'wrap'}}>
                      {(s.nodes||[]).map(n=>{const t=NODE_TYPES[n.type];return <span key={n.id} title={t?.name} style={{fontSize:13}}>{t?t.ic:'●'}</span>;})}
                    </div>
                  </div>
                </div>
              ))}
              {list.filter(s=>s.status===g).length===0 && <div className="d">항목 없음</div>}
            </div>
          ))}
        </div>
      ) : (
        <div className="sb">
          <div className="card scn-list"><h3 style={{fontSize:13}}>시나리오</h3>
            {list.map(s=>(<div key={s.id} className={'item'+(s.id===cur.id?' on':'')} onClick={()=>setCur({...s,nodes:[...(s.nodes||[])]})}>
              <b>{s.name}</b><span>{s.type} · v{s.version} · {s.status} · {(s.nodes||[]).length}노드</span></div>))}
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
