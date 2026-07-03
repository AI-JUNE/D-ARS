'use client';
import { useEffect, useState } from 'react';
import { NODE_TYPES, tagClass } from '@/lib/ui';

export default function Scenarios() {
  const [list, setList] = useState([]);
  const [cur, setCur] = useState(null);
  const load = async (keep) => {
    const d = await fetch('/api/scenarios').then(r=>r.json());
    setList(d);
    const sel = keep && d.find(s=>s.id===keep) ? d.find(s=>s.id===keep) : (cur && d.find(s=>s.id===cur.id)) || d[0];
    setCur(sel ? { ...sel, nodes: [...(sel.nodes||[])] } : null);
  };
  useEffect(() => { load(); }, []);
  if (!cur) return <div className="card">불러오는 중…</div>;

  const addNode = (type) => {
    const id = Math.max(0, ...cur.nodes.map(n=>n.id)) + 1;
    setCur({ ...cur, nodes: [...cur.nodes, { id, type, label: NODE_TYPES[type].name }] });
  };
  const delNode = (id) => setCur({ ...cur, nodes: cur.nodes.filter(n=>n.id!==id) });
  const move = (id, dir) => {
    const ns=[...cur.nodes]; const i=ns.findIndex(n=>n.id===id); const j=i+dir;
    if (j<0||j>=ns.length) return; [ns[i],ns[j]]=[ns[j],ns[i]]; setCur({ ...cur, nodes: ns });
  };
  const editLabel = (id) => { const n=cur.nodes.find(x=>x.id===id); const v=prompt('라벨', n.label); if(v===null)return;
    setCur({ ...cur, nodes: cur.nodes.map(x=>x.id===id?{...x,label:v}:x) }); };
  const save = async () => {
    const r = await fetch('/api/scenarios/'+cur.id, { method:'PUT', body: JSON.stringify({ nodes: cur.nodes, name: cur.name, type: cur.type, status: cur.status }) });
    await r.json(); await load(cur.id); alert('저장됨 · 버전 상향');
  };
  const create = async () => {
    const name = prompt('시나리오명', '새 시나리오'); if (name===null) return;
    const r = await fetch('/api/scenarios', { method:'POST', body: JSON.stringify({ name }) });
    const s = await r.json(); await load(s.id);
  };
  const validate = () => {
    const ok = cur.nodes.some(n=>n.type==='VISUAL_LAUNCH') && cur.nodes.some(n=>n.type==='END');
    alert(ok ? '✓ 검증 통과 · 런칭·종료 노드 정상' : '⚠ 런칭/종료 노드를 확인하세요');
  };

  return (
    <>
      <div className="sectionhead"><h2>비주얼 시나리오 관리</h2><span className="d">보이는 ARS 화면 흐름 노드 구성 · 콜봇 시나리오 연계</span>
        <span className="sp" /><button className="btn primary" onClick={create}>+ 시나리오</button></div>
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
        <div className="card"><h3 style={{fontSize:13}}>노드 팔레트</h3><div className="d">클릭하여 흐름에 추가</div>
          <div className="palette">{Object.entries(NODE_TYPES).map(([k,v])=>(
            <button key={k} onClick={()=>addNode(k)}><span style={{color:v.c}}>{v.ic}</span> {v.name}</button>))}</div>
          <div style={{marginTop:10,fontSize:11.5}} className="muted">노드는 콜봇 시나리오의 화면 액션으로 실행됩니다.</div>
        </div>
      </div>
    </>
  );
}
