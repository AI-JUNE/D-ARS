import Link from 'next/link';
import { LEGAL_META } from '@/lib/legalContent';

// 루트 템플릿 '%s · D-ARS' 가 접미를 붙이므로 세그먼트 제목만 지정(중복 '· D-ARS · D-ARS' 방지).
export const metadata = { title: '요금제', description: 'D-ARS(보이는 ARS) 요금제 — 파일럿 · 표준 · 기관' };

const TR='#bd5a40', TRD='#9c4025', INK='#3a2b24', MUT='#9c8b80';
const PAGE='#f6ece2', CARD='#ffffff', LINE='#ece0d5', BADGE='#f4e3da';

// ⚠️ [승인 필요] 아래 금액은 안내용 초안이다. 실제 구독 결제는 승인·검수 전까지
//   비활성이며, 현재 CTA 는 결제가 아닌 "도입 문의" 로 연결한다.
const PLANS = [
  {
    id:'pilot', name:'파일럿', price:'무료', unit:'체험',
    sub:'도입 전 기능 검증',
    feats:['데모 데이터로 전체 기능 체험','보이는 ARS 화면 미리보기','시나리오 1종·기본 통계','이메일 문의 지원'],
    cta:'무료로 체험', href:'/dashboard', highlight:false,
  },
  {
    id:'standard', name:'표준', price:'290,000', unit:'월(부가세 별도)',
    sub:'중소 규모 콜센터·복지 상담',
    feats:['실시간 세션 모니터링','시나리오 빌더·필요서류 안내','UMS 발송·통계 리포트','콜봇(STT·LLM·TTS·CTI) 연계','표준 SLA·접근/감사 로그'],
    cta:'도입 문의', href:'contact', highlight:true,
  },
  {
    id:'org', name:'기관', price:'맞춤 견적', unit:'공공·대규모',
    sub:'지자체·공공기관·대형 사업',
    feats:['이상징후 스코어링·자동 연계','전용 DB·데이터 보관정책 협의','전용 지원·맞춤 SLA','온프레미스/전용 클라우드 옵션','보안·개인정보 위탁 계약'],
    cta:'견적 문의', href:'contact', highlight:false,
  },
];

const wrap = { maxWidth:1120, margin:'0 auto', padding:'0 20px' };

function CTA({ plan }) {
  const style = {
    display:'inline-block', width:'100%', textAlign:'center', boxSizing:'border-box',
    fontWeight:800, fontSize:14, borderRadius:12, padding:'12px 16px', textDecoration:'none',
    color: plan.highlight ? '#fff' : TRD,
    background: plan.highlight ? TR : BADGE,
  };
  if (plan.href === 'contact') {
    return <a href={'mailto:' + LEGAL_META.contactEmail + '?subject=D-ARS%20' + encodeURIComponent(plan.name) + '%20도입%20문의'} style={style}>{plan.cta} →</a>;
  }
  return <Link href={plan.href} style={style}>{plan.cta} →</Link>;
}

export default function PricingPage() {
  return (
    <main style={{ minHeight:'100vh', background:PAGE, color:INK }}>
      <div style={{ ...wrap, padding:'clamp(28px,5vw,56px) 20px' }}>
        <Link href="/" style={{ color:TR, fontWeight:700, fontSize:13.5, textDecoration:'none' }}>← D-ARS 홈</Link>
        <div style={{ textAlign:'center', marginTop:14 }}>
          <div style={{ color:TR, fontWeight:800, fontSize:13, letterSpacing:1 }}>PRICING</div>
          <h1 style={{ fontSize:'clamp(24px,5.5vw,36px)', margin:'8px 0 6px', color:INK }}>규모에 맞는 요금제</h1>
          <p style={{ color:MUT, fontSize:'clamp(14px,3.5vw,16px)', maxWidth:600, margin:'0 auto', lineHeight:1.6 }}>
            파일럿으로 먼저 검증하고, 표준·기관 요금제로 확장하세요. 공공·대규모 도입은 맞춤 견적으로 안내합니다.
          </p>
          <div style={{ display:'inline-block', marginTop:14, background:BADGE, color:'#8a3a22', border:'1px solid '+LINE, borderRadius:999, padding:'6px 14px', fontSize:12.5 }}>
            ⚠️ 구독 결제 연동은 준비 중입니다 · 현재는 도입 문의로 진행 <b>[승인 필요]</b>
          </div>
        </div>

        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(260px,1fr))', gap:16, margin:'32px 0 12px', alignItems:'stretch' }}>
          {PLANS.map((p) => (
            <div key={p.id} style={{
              display:'flex', flexDirection:'column',
              background: p.highlight ? '#fff' : CARD,
              border: '2px solid ' + (p.highlight ? TR : LINE),
              borderRadius:20, padding:'24px 22px',
              boxShadow: p.highlight ? '0 18px 40px rgba(189,90,64,.16)' : 'none',
            }}>
              {p.highlight && <div style={{ alignSelf:'flex-start', background:TR, color:'#fff', fontSize:11.5, fontWeight:800, borderRadius:999, padding:'4px 10px', marginBottom:8 }}>추천</div>}
              <div style={{ fontSize:18, fontWeight:800, color:INK }}>{p.name}</div>
              <div style={{ fontSize:13, color:MUT, margin:'2px 0 12px' }}>{p.sub}</div>
              <div style={{ display:'flex', alignItems:'baseline', gap:6 }}>
                <span style={{ fontSize:'clamp(24px,6vw,30px)', fontWeight:800, color:TRD }}>{p.price}</span>
                <span style={{ fontSize:13, color:MUT, fontWeight:600 }}>{p.unit}</span>
              </div>
              <ul style={{ listStyle:'none', padding:0, margin:'16px 0 20px', flex:1 }}>
                {p.feats.map((f, i) => (
                  <li key={i} style={{ display:'flex', gap:8, alignItems:'flex-start', fontSize:13.5, color:'#5a4a40', lineHeight:1.5, marginBottom:9 }}>
                    <span style={{ color:TR, fontWeight:800, flex:'0 0 auto' }}>✓</span>{f}
                  </li>
                ))}
              </ul>
              <CTA plan={p} />
            </div>
          ))}
        </div>

        <p style={{ textAlign:'center', color:MUT, fontSize:12.5, lineHeight:1.7, marginTop:16 }}>
          모든 요금은 부가가치세 별도이며, 실제 계약·과금 조건은 개별 계약에 따릅니다.<br/>
          문의: {LEGAL_META.contactEmail}
        </p>

        <footer style={{ color:MUT, fontSize:12.5, textAlign:'center', padding:'20px 0 8px', lineHeight:1.8 }}>
          <Link href="/legal/terms" style={{ color:TR, textDecoration:'none' }}>이용약관</Link>
          {'  ·  '}
          <Link href="/legal/privacy" style={{ color:TR, textDecoration:'none' }}>개인정보처리방침</Link>
        </footer>
      </div>
    </main>
  );
}
