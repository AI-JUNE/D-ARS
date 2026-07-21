'use client';
import { useState, useRef, useEffect } from 'react';

// 이음 3세대 연결 · 보이는 ARS 고객 화면
// 콜봇 events node 키(합의안): SHOW_WELFARE_FORM · SHOW_TRIO_MATCH · SHOW_SAFETY_CHECK
//                              · SHOW_CARD_POINTS · TRANSFER_COORDINATOR · SHOW_DOCS
const journey = ['연결', '본인확인', '신청·상담', '매칭·안내', '완료'];
const GENS = [
  { k: 'senior', label: '어르신', scale: 1.16 },
  { k: 'youth', label: '청년', scale: 1.0 },
  { k: 'family', label: '양육가정', scale: 1.07 },
];
const MENU = [
  ['SHOW_WELFARE_FORM', '복지 신청'],
  ['SHOW_TRIO_MATCH', '3세대 매칭'],
  ['SHOW_SAFETY_CHECK', 'AI 안부·안전'],
  ['SHOW_CARD_POINTS', '상생카드·봉사'],
  ['TRANSFER_COORDINATOR', '코디네이터 연결'],
];

export default function Visual() {
  const [msgs, setMsgs] = useState([{ who: 'bot', text: '통화가 연결되면 음성과 함께 이 화면으로 안내해 드려요. 아래 메뉴로 바로 시작할 수도 있어요.' }]);
  const [step, setStep] = useState(0);
  const [listening, setListening] = useState(false);
  const [gen, setGen] = useState('senior');
  const boxRef = useRef(null);
  const scale = (GENS.find((g) => g.k === gen) || GENS[0]).scale;
  const S = (n) => Math.round(n * scale * 10) / 10;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const push = (m) => setMsgs((prev) => { const n = [...prev, m]; setTimeout(() => { if (boxRef.current) boxRef.current.scrollTop = boxRef.current.scrollHeight; }, 30); return n; });
  async function bot(text, node) { setListening(false); push({ who: 'bot', text, node }); await wait(500); }
  async function cust(text) { setListening(true); await wait(700); setListening(false); push({ who: 'cust', text }); await wait(300); }

  // 콜봇 events / 시뮬레이터가 ?node= 로 특정 화면을 미리보기할 수 있게
  useEffect(() => {
    try {
      const q = new URLSearchParams(window.location.search);
      const node = q.get('node');
      if (node && MENU.some((m) => m[0] === node)) { setStep(2); push({ who: 'bot', text: '요청하신 안내 화면이에요.', node }); }
    } catch { /* noop */ }
  }, []);

  const play = async () => {
    setMsgs([]); setStep(0);
    await bot('안녕하세요, 이음 복지상담입니다. 무엇을 도와드릴까요? 화면으로도 함께 안내해 드릴게요.');
    setStep(1); await cust('김순자입니다. 기초연금을 신청하고 싶어요');
    await bot('본인확인 되었어요. 말씀만 하시면 신청서를 대신 채워드릴게요.', 'SHOW_WELFARE_FORM');
    setStep(2); await cust('가끔 손주도 봐주고 말동무해줄 사람이 있으면 좋겠어');
    await bot('가까운 청년·아동과 3세대로 이어드릴 수 있어요.', 'SHOW_TRIO_MATCH');
    setStep(3); await bot('매칭 전에 4단계 안전검증을 거쳐 안심하셔도 돼요.', 'SHOW_SAFETY_CHECK');
    await bot('접수에 필요한 서류예요. 문자로도 보내드릴게요.', 'SHOW_DOCS');
    setStep(4);
  };
  const pick = async (node) => {
    if (node === 'SHOW_WELFARE_FORM') { setStep(2); await cust('복지 신청하고 싶어요'); await bot('말씀만 하시면 신청서를 채워드릴게요.', node); }
    if (node === 'SHOW_TRIO_MATCH') { setStep(3); await cust('3세대 매칭 신청할래요'); await bot('청년·어르신·아동 트리오로 이어드려요.', node); }
    if (node === 'SHOW_SAFETY_CHECK') { setStep(3); await cust('안전한지 걱정돼요'); await bot('4단계 안전검증으로 안심하셔도 돼요.', node); }
    if (node === 'SHOW_CARD_POINTS') { setStep(2); await cust('내 봉사시간이랑 상생카드 얼마예요?'); await bot('적립 내역이에요.', node); }
    if (node === 'TRANSFER_COORDINATOR') { setStep(3); await cust('사람이랑 얘기하고 싶어요'); await bot('지역 코디네이터로 연결해 드릴게요.', node); }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: 'radial-gradient(1200px 600px at 50% -10%, #f7ece6, #e7ddd5)', padding: '20px 12px' }}>
      <div style={{ width: 'min(390px,100%)', background: '#0d0b0a', borderRadius: 44, padding: 12, boxShadow: '0 8px 30px rgba(60,30,20,.2)' }}>
        <div style={{ background: '#f4f1ee', borderRadius: 34, overflow: 'hidden', height: 'min(760px,84vh)', minHeight: 540, display: 'flex', flexDirection: 'column' }}>
          {/* 헤더 */}
          <div style={{ background: 'linear-gradient(135deg,#be5535,#9c4025)', color: '#fff', padding: '20px 18px 13px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <b style={{ fontSize: 15.5 }}>이음 · 세대를 잇다</b>
              <span style={{ fontSize: 11, background: 'rgba(255,255,255,.18)', padding: '4px 9px', borderRadius: 999 }}>● 통화 연결됨</span>
            </div>
            <div style={{ fontSize: 12, opacity: .92, marginTop: 5 }}>광주 광산구 3세대 상생 품앗이 · 보이는 ARS</div>
          </div>
          {/* AI 고지 */}
          <div style={{ background: '#fff7f3', borderBottom: '1px solid #e6ddd7', color: '#8a5a44', fontSize: 11, padding: '7px 16px' }}>
            ℹ️ 본 상담은 생성형 AI가 함께 응대합니다 (AI 기본법 제31조 고지).</div>
          {/* 세대별 맞춤 */}
          <div style={{ display: 'flex', gap: 6, padding: '9px 14px 4px', alignItems: 'center' }}>
            <span style={{ fontSize: 10.5, color: '#8a7a72', fontWeight: 700 }}>세대별 화면</span>
            {GENS.map((g) => (
              <button key={g.k} onClick={() => setGen(g.k)} style={{
                fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 999, cursor: 'pointer', fontFamily: 'inherit',
                border: gen === g.k ? '0' : '1px solid #e0d5cd', background: gen === g.k ? '#be5535' : '#fff', color: gen === g.k ? '#fff' : '#8a7a72',
              }}>{g.label}</button>
            ))}
          </div>
          {/* 진행 단계 */}
          <div style={{ display: 'flex', padding: '6px 14px 4px' }}>
            {journey.map((j, i) => (
              <div key={i} style={{ flex: 1, textAlign: 'center', fontSize: 10, color: i <= step ? '#9c4025' : '#8a7a72', fontWeight: 600 }}>
                <div style={{ width: 16, height: 16, borderRadius: '50%', margin: '0 auto 4px', background: i <= step ? '#be5535' : '#e2d5cd' }} />{j}</div>))}
          </div>
          {/* 대화 */}
          <div ref={boxRef} style={{ flex: 1, overflowY: 'auto', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {msgs.map((m, i) => (<Bubble key={i} m={m} S={S} senior={gen === 'senior'} />))}
          </div>
          {/* 상태 */}
          <div style={{ padding: '8px 14px', minHeight: 34, fontSize: S(12), color: listening ? '#9c4025' : '#8a7a72', fontWeight: 600 }}>
            {listening ? '🎙️ 고객님 말씀을 듣고 있어요…' : '메뉴를 누르거나 통화를 시작하세요'}</div>
          {/* 메뉴 */}
          <div style={{ padding: '6px 12px 10px', display: 'flex', flexWrap: 'wrap', gap: 7 }}>
            {MENU.map(([node, label]) => (
              <button key={node} onClick={() => pick(node)} style={{ ...btnStyle, fontSize: S(12.5) }}>{label}</button>))}
            <button onClick={play} style={{ ...btnStyle, background: '#be5535', color: '#fff', flex: '1 1 100%', fontSize: S(13) }}>▶ 자동 시연</button>
          </div>
        </div>
      </div>
    </div>
  );
}

const btnStyle = { flex: '1 1 30%', border: '1px solid #e6ddd7', background: '#fff', borderRadius: 11, padding: '11px 6px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', color: '#3a2b24' };

function Bubble({ m, S, senior }) {
  const bot = m.who === 'bot';
  return (
    <div style={{
      maxWidth: '88%', alignSelf: bot ? 'flex-start' : 'flex-end', background: bot ? '#fff' : '#f7e7df', border: bot ? '1px solid #e6ddd7' : '0',
      borderRadius: 16, padding: '10px 13px', fontSize: S(13.5), lineHeight: 1.55, color: bot ? '#241a16' : '#4a2c1e',
    }}>
      <div style={{ fontSize: S(10), fontWeight: 800, marginBottom: 3, color: bot ? '#be5535' : '#a06a4e' }}>{bot ? '보이는 ARS · AI' : '고객 발화 (STT)'}</div>
      {m.text}
      {m.node && <NodeCard node={m.node} S={S} senior={senior} />}
    </div>
  );
}

function NodeCard({ node, S, senior }) {
  const box = { background: '#fff', border: '1px solid #e6ddd7', borderRadius: 12, padding: 11, marginTop: 8, fontSize: S(12.5) };
  const title = (t) => <b style={{ fontSize: S(13), color: '#9c4025' }}>{t}</b>;
  const kv = (k, v) => (<div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px dashed #eee' }}><span style={{ color: '#9c8b80' }}>{k}</span><b>{v}</b></div>);
  const chip = (t, done) => (<span style={{ fontSize: S(11), fontWeight: 700, padding: '3px 8px', borderRadius: 999, marginRight: 5, marginTop: 5, display: 'inline-block', background: done ? '#eaf5ee' : '#f4e3da', color: done ? '#2e7d46' : '#a06a4e' }}>{done ? '✓ ' : ''}{t}</span>);

  if (node === 'SHOW_WELFARE_FORM') return (
    <div style={box}>{title('🗣️ 복지 신청 (말로 신청)')}
      <div style={{ margin: '7px 0 3px' }}>{chip('기초연금')}{chip('노인맞춤돌봄')}{chip('에너지바우처')}</div>
      {kv('신청자', '김순자 어르신')}{kv('대상 확인', '자동 조회됨 · 적격')}
      <div style={{ marginTop: 7, color: '#8a5a44', fontSize: S(11.5) }}>말씀하시면 신청서가 자동으로 채워집니다. 금액·자격은 코디네이터가 확인해 드려요.</div>
    </div>);
  if (node === 'SHOW_TRIO_MATCH') return (
    <div style={box}>{title('🤝 3세대 트리오 매칭')}
      <div style={{ display: 'flex', gap: 6, margin: '8px 0' }}>
        {[['어르신', '김순자'], ['청년', '이도윤'], ['아동', '박서아']].map(([r, n]) => (
          <div key={r} style={{ flex: 1, textAlign: 'center', background: '#faf3ee', border: '1px solid #eaddd4', borderRadius: 10, padding: '8px 4px' }}>
            <div style={{ fontSize: S(10.5), color: '#a06a4e', fontWeight: 700 }}>{r}</div><b style={{ fontSize: S(12) }}>{n}</b></div>))}
      </div>
      {kv('근접', '도보 800m · 같은 동')}{kv('활동', '주 2회 · 말동무·돌봄')}
    </div>);
  if (node === 'SHOW_SAFETY_CHECK') return (
    <div style={box}>{title('🛡️ 4단계 안전검증')}
      <div style={{ marginTop: 6 }}>{chip('본인 면접', 1)}{chip('범죄경력 조회', 1)}{chip('아동학대 전력', 1)}{chip('추천인 확인')}</div>
      <div style={{ marginTop: 7, color: '#8a5a44', fontSize: S(11.5) }}>검증을 통과한 이웃만 매칭돼요. 안심하고 이용하세요.</div>
    </div>);
  if (node === 'SHOW_CARD_POINTS') return (
    <div style={box}>{title('💳 상생카드 · 봉사시간')}
      {kv('누적 봉사시간', '32시간')}{kv('상생카드 포인트', '12,400 P')}{kv('이번 달 활동', '4회')}
    </div>);
  if (node === 'TRANSFER_COORDINATOR') return (
    <div style={box}>{title('📞 코디네이터 연결')}
      <div style={{ display: 'flex', gap: 8, marginTop: 7, alignItems: 'center' }}>
        <span style={{ flex: 1, color: '#9c8b80' }}>광산구 상생지원센터 · 예상 대기 30초</span>
        <button onClick={(e) => { e.currentTarget.textContent = '연결 중…'; e.currentTarget.style.background = '#2e8b57'; }}
          style={{ border: 0, background: '#be5535', color: '#fff', fontWeight: 800, fontSize: S(12), padding: '8px 12px', borderRadius: 9, cursor: 'pointer' }}>연결</button>
      </div>
    </div>);
  if (node === 'SHOW_DOCS') return (
    <div style={box}>{title('📋 필요 서류 · 접수')}
      <div style={{ margin: '6px 0' }}>{chip('신분증')}{chip('통장 사본')}{chip('주민등록등본')}</div>
      <div style={{ display: 'flex', gap: 8, marginTop: 4, alignItems: 'center' }}>
        <span style={{ flex: 1, color: '#9c8b80' }}>서류 안내를 문자로 받기</span>
        <button onClick={(e) => { e.currentTarget.textContent = '발송완료 ✓'; e.currentTarget.style.background = '#2e8b57'; }}
          style={{ border: 0, background: '#be5535', color: '#fff', fontWeight: 800, fontSize: S(12), padding: '8px 12px', borderRadius: 9, cursor: 'pointer' }}>문자 발송</button>
      </div>
    </div>);
  return null;
}
