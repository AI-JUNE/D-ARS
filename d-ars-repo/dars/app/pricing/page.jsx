import Link from 'next/link';
import { LEGAL_META } from '@/lib/legalContent';
import { PLANS, contactHref } from '@/lib/plans';

// 루트 템플릿 '%s · D-ARS' 가 접미를 붙이므로 세그먼트 제목만 지정(중복 '· D-ARS · D-ARS' 방지).
export const metadata = { title: '요금제', description: 'D-ARS(보이는 ARS) 요금제 — 파일럿 · 표준 · 기관' };

const TR='#2563eb', TRD='#1d4ed8', INK='#0f172a', MUT='#64748b';
const PAGE='#f8fafc', CARD='#ffffff', LINE='#e2e8f0', BADGE='#eef4ff';

// 요금제 데이터는 `lib/plans.js` 한 곳에서만 적는다 — 랜딩이 같은 값을 그린다([승인 필요] 금액 초안).

const wrap = { maxWidth:1120, margin:'0 auto', padding:'0 20px' };

function CTA({ plan }) {
  const style = {
    display:'inline-block', width:'100%', textAlign:'center', boxSizing:'border-box',
    fontWeight:800, fontSize:14, borderRadius:12, padding:'12px 16px', textDecoration:'none',
    color: plan.highlight ? '#fff' : TRD,
    background: plan.highlight ? TR : BADGE,
  };
  if (plan.href === 'contact') {
    return <a href={contactHref(LEGAL_META.contactEmail, plan.name)} style={style}>{plan.cta} →</a>;
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
          {/* 「[승인 필요]」는 사내 표기다 — 사실(결제 비활성·문의로 진행)은 그대로 알리고 표기는
              코드에만 둔다(⚠️ [승인 필요] 구독 결제 활성화는 승인·검수 사항 · 약관 제5조 ④항). */}
          <div style={{ display:'inline-block', marginTop:14, background:BADGE, color:TRD, border:'1px solid '+LINE, borderRadius:100, padding:'6px 14px', fontSize:12.5 }}>
            구독 결제 연동은 준비 중입니다 · 현재는 도입 문의로 진행합니다
          </div>
        </div>

        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(260px,1fr))', gap:16, margin:'32px 0 12px', alignItems:'stretch' }}>
          {PLANS.map((p) => (
            // 카드 규격은 AICC 라인 기준 원본(admin.html `.card`)과 같다 — 라운드 16 · 1px 경계선 ·
            // 그림자 `--shadow`. 추천 카드만 브랜드색 2px 로 강조한다. 종전 그림자는
            // rgba(189,90,64,.16) — 테라코타(이음 라인) 잔재여서 블루 카드 아래 갈색 번짐이 남아 있었다.
            <div key={p.id} style={{
              display:'flex', flexDirection:'column',
              background: CARD,
              border: (p.highlight ? '2px solid ' + TR : '1px solid ' + LINE),
              borderRadius:16, padding:'24px 22px',
              boxShadow: p.highlight
                ? '0 20px 46px rgba(15,23,42,.13), 0 6px 18px rgba(15,23,42,.07)'
                : '0 1px 2px rgba(15,23,42,.05), 0 4px 16px rgba(15,23,42,.06)',
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
                  <li key={i} style={{ display:'flex', gap:8, alignItems:'flex-start', fontSize:13.5, color:'#475569', lineHeight:1.5, marginBottom:9 }}>
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
