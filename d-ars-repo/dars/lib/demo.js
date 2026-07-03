// DATABASE_URL 미설정 시 사용하는 데모 데이터(폴백).
// Neon 연결 후에는 DB 값이 우선합니다.
export const demoScenarios = [
  { id:'SC-01', name:'반품·교환·환불', type:'인바운드', status:'운영', version:7, updated_by:'김운영', updated_at:'2026-06-28',
    nodes:[{id:1,type:'VISUAL_LAUNCH',label:'상담 시작 화면 런칭'},{id:2,type:'SHOW_CARD',label:'주문 상세 카드'},{id:3,type:'REQUEST_DOC',label:'반품 접수서 안내+문자'},{id:4,type:'CHANNEL_SWITCH',label:'상담원 전환(미해결)'},{id:5,type:'END',label:'만족도 조사'}] },
  { id:'SC-02', name:'주문/배송 조회', type:'인바운드', status:'운영', version:4, updated_by:'김운영', updated_at:'2026-06-20',
    nodes:[{id:1,type:'VISUAL_LAUNCH',label:'조회 화면 런칭'},{id:2,type:'SHOW_CARD',label:'배송 추적 카드'},{id:3,type:'RAG_ANSWER',label:'배송 FAQ'},{id:4,type:'END',label:'종료'}] },
  { id:'SC-03', name:'영수증·증빙 발급', type:'인바운드', status:'운영', version:2, updated_by:'박환불', updated_at:'2026-06-25',
    nodes:[{id:1,type:'VISUAL_LAUNCH',label:'발급 화면 런칭'},{id:2,type:'SHOW_CARD',label:'전자 영수증 카드'},{id:3,type:'REQUEST_DOC',label:'거래 영수증 UMS'},{id:4,type:'END',label:'종료'}] },
  { id:'SC-04', name:'이탈고객 재안내(OB)', type:'아웃바운드', status:'미운영', version:1, updated_by:'박환불', updated_at:'2026-06-29',
    nodes:[{id:1,type:'VISUAL_LAUNCH',label:'재안내 화면'},{id:2,type:'SHOW_MENU',label:'재예약 메뉴'},{id:3,type:'END',label:'종료'}] },
];
export const demoDocs = [
  { id:'D1', biz:'반품·교환', name:'반품 접수서', req:540, sent:512, done:430, in_use:true },
  { id:'D2', biz:'결제', name:'거래 영수증', req:420, sent:400, done:352, in_use:true },
  { id:'D3', biz:'배송', name:'배송 확인서', req:260, sent:248, done:201, in_use:true },
  { id:'D4', biz:'멤버십', name:'등급 안내문', req:180, sent:170, done:120, in_use:true },
  { id:'D5', biz:'결제', name:'세금계산서', req:96, sent:88, done:70, in_use:false },
];
export const demoDaily = [
  { day:'2026-06-27', inbound:3980, multimodal:505, completed:860, dropped:300 },
  { day:'2026-06-28', inbound:4120, multimodal:528, completed:880, dropped:312 },
  { day:'2026-06-29', inbound:4050, multimodal:516, completed:872, dropped:305 },
  { day:'2026-06-30', inbound:4210, multimodal:540, completed:905, dropped:318 },
  { day:'2026-07-01', inbound:4080, multimodal:505, completed:860, dropped:309 },
  { day:'2026-07-02', inbound:4260, multimodal:560, completed:918, dropped:320 },
  { day:'2026-07-03', inbound:4182, multimodal:540, completed:902, dropped:318 },
];
const svc=['주문상세 안내','배송추적 안내','영수증 발급','반품 접수 안내'];
const dcs=['반품 접수서','거래 영수증','배송 확인서','등급 안내문'];
const rnd=()=>'010-****-'+String(Math.floor(1000+Math.random()*9000));
export function demoUms(n=24){ const now=Date.now(); const out=[];
  for(let i=0;i<n;i++){ const t=new Date(now-i*7*60000);
    out.push({ id:1000-i, sent_at:t.toISOString(), phone:rnd(), service:svc[i%4], doc:dcs[i%4],
      status: Math.random()<0.86?'발송완료':(Math.random()<0.5?'대기':'실패') }); }
  return out; }
const journey=['런칭','본인확인','상담','안내·발송','완료'];
const nodeByStep=['VISUAL_LAUNCH','SHOW_CARD','SHOW_MENU','REQUEST_DOC','END'];
export function demoSessions(n=6){ let sid=4820; const out=[];
  for(let i=0;i<n;i++){ const step=Math.floor(Math.random()*4);
    out.push({ id:'VS-'+(sid+i), phone:rnd(), scenario:demoScenarios[i%3].name, step, node:nodeByStep[step],
      elapsed:Math.floor(Math.random()*200), status: step>=4?'완료':'진행' }); }
  return out; }
export { journey, nodeByStep };

// 멀티모달 이력(보이는 ARS 상호작용 로그) 데모 — DATABASE_URL 미설정 시 폴백.
const mmChannels = [
  ['화면 표출', 'SHOW_CARD'], ['음성 안내', 'VISUAL_LAUNCH'], ['메뉴 선택', 'SHOW_MENU'],
  ['서류 안내', 'REQUEST_DOC'], ['RAG 응답', 'RAG_ANSWER'], ['문자 발송', 'REQUEST_DOC'],
  ['채널 전환', 'CHANNEL_SWITCH'],
];
const mmResults = ['완료', '완료', '완료', '이탈', '상담원 전환'];
export function demoMultimodal(n = 40) {
  const now = Date.now();
  const out = [];
  for (let i = 0; i < n; i++) {
    const [channel, node] = mmChannels[i % mmChannels.length];
    const t = new Date(now - i * 4 * 60000 - Math.floor(Math.random() * 90000));
    out.push({
      id: 'MM-' + (9000 - i),
      ts: t.toISOString(),
      phone: rnd(),
      scenario: demoScenarios[i % demoScenarios.length].name,
      service: svc[i % svc.length],
      channel,
      node,
      result: mmResults[Math.floor(Math.random() * mmResults.length)],
      duration: 8 + Math.floor(Math.random() * 240),
    });
  }
  return out;
}
