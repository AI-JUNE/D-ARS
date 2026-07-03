'use client';
import { useEffect, useState } from 'react';

const FAQ = [
  ['보이는 ARS(Visual ARS)란 무엇인가요?',
   '전화 상담 중 고객 휴대폰에 메뉴·정보 카드·서류 안내 화면을 함께 띄워, 음성만으로 설명하기 어려운 내용을 눈으로 보며 처리하도록 돕는 서비스입니다. 콜봇 시나리오와 연계되어 통화 흐름에 맞춰 화면이 전환됩니다.'],
  ['시나리오는 어떻게 구성하나요?',
   '[시나리오 관리]에서 노드(런칭·메뉴 표출·정보 카드·필요서류 안내·RAG 응답·채널 전환·종료)를 순서대로 배치해 화면 흐름을 만듭니다. 저장 시 버전이 자동 상향되며, 검증 버튼으로 런칭·종료 노드 유무를 확인할 수 있습니다.'],
  ['필요서류 안내·발송은 어떻게 동작하나요?',
   '[필요서류 관리]에서 업무별 서류를 등록하고 사용 여부를 지정하면, 보이는 ARS 흐름과 UMS 문자발송에서 해당 서류 링크가 고객에게 안내·발송됩니다. 완료율은 요청 대비 완료 건으로 자동 계산됩니다.'],
  ['실시간 세션 화면의 숫자는 실제 데이터인가요?',
   '[실시간 세션]은 4초마다 자동 갱신되며 고객 번호는 마스킹 처리됩니다. 진행 세션 수·평균 경과·단계별 현황을 실시간으로 확인할 수 있습니다.'],
  ['데이터를 엑셀로 내보낼 수 있나요?',
   '세션·필요서류·이용 통계·UMS 발송 화면 상단의 ⬇ CSV 버튼으로 현재 목록을 내려받을 수 있습니다. UTF-8 BOM이 포함되어 Excel에서 한글이 깨지지 않습니다.'],
  ['모바일에서도 사용할 수 있나요?',
   '네. 모바일에서는 좌측 상단 ☰ 메뉴(드로어)와 하단 탭으로 이동하며, 표는 카드 안에서 가로 스크롤됩니다. 상단 "큰글씨" 버튼으로 글자 크기를 키워 접근성을 높일 수 있습니다.'],
];

const LINKS = [
  ['보이는 ARS 데모', '/visual', '📱'],
  ['서비스 홈', '/', '🏢'],
  ['대시보드', '/dashboard', '📊'],
];

export default function Help() {
  const [health, setHealth] = useState(null);
  useEffect(() => {
    fetch('/api/health').then(r=>r.json()).then(setHealth).catch(()=>setHealth({ ok:false }));
  }, []);
  return (
    <>
      <div className="sectionhead"><h2>도움말 · FAQ</h2>
        <span className="d">보이는 ARS 관리자 포털 사용 안내 · 자주 묻는 질문</span></div>

      <div className="grid g4" style={{marginBottom:16}}>
        <div className="card kpi">
          <div className="n" style={{fontSize:22}}>{health ? (health.ok!==false ? '정상' : '점검') : '…'}</div>
          <div className="l">시스템 상태</div>
        </div>
        <div className="card kpi"><div className="n" style={{fontSize:22}}>연동</div><div className="l">콜봇 연계 정상</div></div>
        <div className="card kpi"><div className="n" style={{fontSize:22}}>UMS</div><div className="l">문자발송 정상</div></div>
        <div className="card kpi"><div className="n" style={{fontSize:22}}>Neon</div><div className="l">DB 연결</div></div>
      </div>

      <div className="card">
        <h3>자주 묻는 질문</h3>
        <div style={{marginTop:8}}>
          {FAQ.map(([q, a], i) => (
            <details key={i} style={{borderBottom:'1px solid #efe4dd', padding:'10px 2px'}}>
              <summary style={{cursor:'pointer', fontWeight:700, fontSize:14.5, listStyle:'none'}}>
                <span style={{color:'#be5535', marginRight:8}}>Q</span>{q}
              </summary>
              <div className="muted" style={{marginTop:8, lineHeight:1.6, fontSize:13.5, paddingLeft:22}}>{a}</div>
            </details>
          ))}
        </div>
      </div>

      <div className="card" style={{marginTop:16}}>
        <h3>바로가기</h3>
        <div className="palette" style={{marginTop:8}}>
          {LINKS.map(([label, href, e]) => (
            <a key={href} href={href}><span>{e}</span> {label}</a>
          ))}
        </div>
        <div className="muted" style={{marginTop:12, fontSize:12.5}}>
          운영 문의: 관리자(GOWON) · 시스템 문제 발생 시 <b>/api/health</b> 상태를 먼저 확인하세요.
        </div>
      </div>
    </>
  );
}
