// D-ARS 랜딩 — TOBE 블루 디자인(통합 최상급). 원본 HTML을 손실 없이 렌더.
import { PLANS, contactHref } from '@/lib/plans';
import { LEGAL_META } from '@/lib/legalContent';

export const dynamic = 'force-static';

// 루트 metadata 는 운영 포털 기준('D-ARS · 보이는 ARS 관리자')이라 공개 랜딩에 그대로 쓰면
// 제품 소개 화면이 '관리자'로 표기된다. 이 페이지에서만 제품 기준 제목·설명으로 덮어쓴다.
export const metadata = {
  title: 'D-ARS 보이는 ARS 솔루션',
  description: 'AI 음성봇과 보이는 ARS로 전화 인입부터 화면 안내까지 잇는 디지털 ARS 솔루션.',
  openGraph: {
    title: 'D-ARS 보이는 ARS 솔루션',
    description: 'AI 음성봇과 보이는 ARS로 전화 인입부터 화면 안내까지 잇는 디지털 ARS 솔루션.',
  },
  twitter: {
    title: 'D-ARS 보이는 ARS 솔루션',
    description: 'AI 음성봇과 보이는 ARS로 전화 인입부터 화면 안내까지 잇는 디지털 ARS 솔루션.',
  },
};
// ── 요금 카드: 요금 페이지와 **같은 데이터**(`lib/plans.js`)로 그린다 ──────────────
// 종전 이 자리에는 Starter·Business·Enterprise 세 장이 손으로 적혀 있었고 「월 1,000건
// 통화」·「월 5,000건 통화」·「무제한 통화」·「24/7 전담 지원」을 약속했다. 제품의 요금
// 페이지(/pricing)가 말하는 플랜은 파일럿·표준·기관이고 그 건수·지원 조건은 어디에도
// 없다 — 고객이 먼저 보는 화면이 없는 상품을 팔고 있었다. 이제 두 화면이 한 벌을 읽는다.
const CHECK = '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M5 12l5 5 9-11"/></svg>';
const planHref = (p) => (p.href === 'contact' ? contactHref(LEGAL_META.contactEmail, p.name) : p.href);
const planCard = (p) => `<div class="pcard${p.highlight ? ' hot' : ''}">${p.highlight ? '<span class="tag">추천</span>' : ''}<h3>${p.name}</h3>
      <div class="amt">${p.price}<small> ${p.unit}</small></div><p style="color:var(--body);font-size:14px">${p.sub}</p>
      <ul class="plist">${p.feats.map((f) => `<li>${CHECK}${f}</li>`).join('')}</ul>
      <a class="btn ${p.highlight ? 'btn-primary' : 'btn-outline'}" style="justify-content:center" href="${planHref(p)}">${p.cta}</a>
      <a class="plink" href="/pricing">${p.name} 요금 자세히 보기</a></div>`;

const LP = `<style>
/* ──────────────────────────────────────────────────────────────────────────
   AICC 라인 토큰 — app/globals.css 와 **같은 값**이다(기준 원본
   2. Callbot/v2/callbot-portal/public/admin.html 의 마지막 :root, index.html 랜딩).
   종전 이 블록은 랜딩만의 한 벌이었다: 경계선 #e6ebf3(콘솔은 #e2e8f0), 바탕
   #f6f8fc(#f8fafc), 보조색 #94a3b8(흰 바탕 2.56:1, WCAG AA 미달), 파란빛이 섞인
   그림자. 「홈 → 로그인 → 콘솔」로 넘어가는 동안 선과 바탕이 미세하게 두 번 갈렸다.
   글꼴 @import 는 두지 않는다 — globals.css 가 이미 같은 CDN 에서 Pretendard 를
   받아 오므로 랜딩만 제3자 스타일시트를 한 번 더 기다릴 이유가 없다.
   ────────────────────────────────────────────────────────────────────────── */
:root{
  --brand:var(--gw-blue-600); --brand-d:var(--gw-blue-700); --brand-l:#B3D4FF; --brand-xl:var(--gw-blue-50);
  --ink:var(--gw-n900); --body:var(--gw-n700); --mut:var(--gw-n600);
  --line:#DCDFE4; --line2:#EBECF0; --bg:var(--gw-n50); --card:#fff;
  /* 히어로와 푸터 네이비와 그 위의 글자색은 랜딩만 쓰는 칸이다(콘솔에는 어두운 면이 없다).
     쓰지 않는 칸은 두지 않는다 — --brand2, --navy3, --ok 는 아무 규칙도 읽지 않고 있었다. */
  --navy1:#0b1220; --navy2:#132445; --on-navy:#9fb2d4;
  --radius:16px;
  --shadow:var(--gw-shadow-raised);
  --shadow-lg:0 18px 40px -26px rgba(25,31,40,.3);
}
*{box-sizing:border-box;margin:0;padding:0}
html{scroll-behavior:smooth}
body{font-family:Pretendard,-apple-system,"Segoe UI",Roboto,sans-serif;color:var(--ink);background:var(--bg);line-height:1.6;-webkit-font-smoothing:antialiased;letter-spacing:-.015em}
.wrap{max-width:1200px;margin:0 auto;padding:0 24px}
a{color:inherit;text-decoration:none}
/* 버튼 — 기준 원본 규격(globals.css 의 .btn.primary, index.html 의 .btn.ghost).
   주된 버튼은 **단색 브랜드색**이다(종전 135° 그라데이션 + 알파 .5 그림자는 콘솔의 어느
   버튼과도 다른 모양이었다). 호버 리프트는 아래 hover:hover 블록에서만 건다. */
.btn{display:inline-flex;align-items:center;gap:8px;font-weight:700;font-size:15px;border-radius:12px;padding:12px 22px;cursor:pointer;border:0;white-space:nowrap;
  transition:background .15s ease,border-color .15s ease,color .15s ease,transform .13s ease,box-shadow .15s ease}
.btn-primary{background:var(--brand);color:#fff;box-shadow:0 6px 16px rgba(37,99,235,.24)}
.btn-primary:hover{background:var(--brand-d);box-shadow:0 8px 20px rgba(37,99,235,.32)}
.btn-ghost{background:rgba(255,255,255,.1);color:#fff;border:1px solid rgba(255,255,255,.25)}
/* 히어로와 CTA 띠의 투명 버튼은 **자기 호버를 반드시 적어 둔다.** globals.css 의
   .btn:hover{background:var(--brand-xl)} 가 선택자 특이도에서 .btn-ghost 를 이기므로,
   이 한 줄이 없으면 어두운 면 위에서 호버 시 바탕이 연한 하늘색(#eef4ff)으로 바뀌고 흰
   글자가 그 위에 남아 **글씨가 사라진다**(1.1:1). */
.btn-ghost:hover{background:rgba(255,255,255,.22);border-color:#fff;color:#fff}
.btn-outline{background:#fff;color:var(--ink);border:1px solid var(--line)}
.btn-outline:hover{background:var(--brand-xl);border-color:var(--brand-l);color:var(--brand-d)}
.eyebrow{font-size:13px;font-weight:800;letter-spacing:.12em;color:var(--brand);text-transform:uppercase}
.h2{font-size:38px;font-weight:800;letter-spacing:-.03em;line-height:1.2}
.sub{color:var(--body);font-size:17px;margin-top:12px}
section{padding:88px 0}
.center{text-align:center}
.grid{display:grid;gap:22px}

/* NAV */
header{position:sticky;top:0;z-index:50;background:rgba(255,255,255,.86);backdrop-filter:blur(12px);border-bottom:1px solid var(--line)}
nav{display:flex;align-items:center;justify-content:space-between;height:70px}
.logo{display:flex;align-items:center;gap:9px;font-weight:900;font-size:20px;letter-spacing:-.03em}
.logo svg{width:26px;height:26px}
.navmenu{display:flex;gap:30px;font-size:15px;font-weight:600;color:var(--body)}
.navmenu a:hover{color:var(--brand)}
.navright{display:flex;align-items:center;gap:16px}
.logo-sub{font-weight:600;font-size:13px;color:var(--mut);letter-spacing:0;padding-left:9px;margin-left:2px;border-left:1px solid var(--line)}
.btn-sm{font-size:14px;padding:9px 18px;border-radius:99px}
.btn-primary.btn-sm{box-shadow:0 14px 32px -22px rgba(36,87,197,.35)}
.btn:focus-visible,.navmenu a:focus-visible,.logo:focus-visible,footer a:focus-visible{outline:2px solid var(--brand);outline-offset:2px}
footer a:focus-visible{outline-color:#fff}

/* HERO — 콜봇 포털 규격: 밝은 바탕, 왼쪽 제목, 오른쪽 장면. 사진 자산은 이 저장소에 없어 전화기 화면으로 대신한다. */
.hero{background:#fff;border-bottom:1px solid var(--line);position:relative;overflow:hidden}
.hero-in{display:grid;grid-template-columns:1.05fr .95fr;gap:40px;align-items:center;padding:64px 0 60px;position:relative}
.hero h1{font-size:46px;font-weight:800;line-height:1.25;letter-spacing:-1px;word-break:keep-all}
.hero h1 .accent{color:var(--brand)}
.hero p{color:var(--body);font-size:17px;line-height:1.7;margin:22px 0 28px;max-width:540px;word-break:keep-all}
.hero .hero-note{font-size:13px;color:var(--mut);margin:18px 0 0;line-height:1.6}
.hero .hero-note a{text-decoration:underline;color:var(--brand-d)}
.hero-badge{display:inline-flex;align-items:center;font-size:13px;font-weight:700;color:var(--brand-d);background:var(--brand-xl);border:1px solid var(--brand-l);padding:6px 14px;border-radius:99px;margin-bottom:20px}
.hero-cta{display:flex;gap:12px;flex-wrap:wrap}
/* phone visual */
.viz{position:relative;height:440px;display:grid;place-items:center}
.glow{position:absolute;width:360px;height:360px;border-radius:50%;background:radial-gradient(circle,var(--brand-xl),transparent 68%)}
.phone{position:relative;width:210px;height:420px;background:linear-gradient(160deg,#1b2c4d,#0e1a30);border-radius:34px;padding:12px;box-shadow:0 18px 40px -26px rgba(25,31,40,.5),inset 0 0 0 1px rgba(120,160,255,.25)}
.screen{background:linear-gradient(180deg,#0c1730,#0a1226);border-radius:24px;height:100%;padding:18px 14px;display:flex;flex-direction:column;gap:10px;color:#dbe6fb}
.screen .st{font-size:11px;color:#9fb2d4;text-align:center}
.avatar{width:56px;height:56px;border-radius:50%;background:var(--brand);margin:8px auto 4px;display:grid;place-items:center}
.num{text-align:center;font-weight:800;font-size:15px;letter-spacing:.02em}
.wave{display:flex;align-items:center;justify-content:center;gap:3px;height:44px;margin-top:auto}
.wave i{width:3px;border-radius:3px;background:#7aa2ee;animation:wv 1.1s ease-in-out infinite}
@keyframes wv{0%,100%{height:8px}50%{height:34px}}
.chatb{background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.08);border-radius:12px;padding:9px 11px;font-size:11.5px;line-height:1.5}
.callend{width:40px;height:40px;border-radius:50%;background:#ef4444;margin:6px auto 0;display:grid;place-items:center}
.chip{position:absolute;background:#fff;border:1px solid var(--line);box-shadow:var(--shadow);border-radius:99px;padding:8px 14px;font-size:13px;font-weight:700;color:var(--ink)}
.chip.c1{top:36px;left:0}.chip.c2{bottom:56px;right:0}.chip.c3{top:150px;right:0}

/* 구역 바탕: 흰 구역과 옅은 구역을 번갈아 둔다 */
section.alt{background:#fff;border-top:1px solid var(--line);border-bottom:1px solid var(--line)}
section.band{padding:48px 0}
.techrow{display:flex;flex-wrap:wrap;gap:10px;justify-content:center}
.techrow span{background:var(--sand);border:1px solid var(--line);border-radius:99px;padding:7px 16px;font-size:14px;font-weight:700;color:var(--ink)}
.faq details{background:#fff;border:1px solid var(--line);border-radius:12px;padding:0 20px;margin-bottom:10px}
.faq summary{cursor:pointer;font-weight:700;font-size:16px;padding:18px 0;list-style:none;display:flex;justify-content:space-between;gap:12px}
.faq summary::-webkit-details-marker{display:none}
.faq summary::after{content:"+";color:var(--brand);font-size:20px;line-height:1}
.faq details[open] summary::after{content:"\\2212"}
.faq details p{color:var(--body);font-size:15px;line-height:1.7;padding:0 0 18px}
.faq summary:focus-visible{outline:2px solid var(--brand);outline-offset:2px;border-radius:6px}

/* cards */
.cards4{grid-template-columns:repeat(4,1fr)}
.cards3{grid-template-columns:repeat(3,1fr)}
/* 카드 — 콘솔 .card 규격: 라운드 16, 경계선 --line2, 그림자 --shadow,
   호버는 그림자/경계선만(들어 올리는 효과는 hover:hover 에서 건다). */
.card{background:var(--card);border:1px solid var(--line2);border-radius:var(--radius);padding:28px;box-shadow:var(--shadow);
  transition:box-shadow .22s ease,border-color .22s ease,transform .22s ease}
.card:hover{box-shadow:var(--shadow-lg);border-color:var(--brand-l)}
/* 아이콘 타일 — 콘솔 .kpi2 .ic 규격(브랜드 틴트 + 1px 내부 링). 종전 135° 그라데이션 둘은
   같은 자리를 두 벌로 그리던 것이다. */
.ic{width:52px;height:52px;border-radius:14px;display:grid;place-items:center;background:var(--brand-xl);color:var(--brand);margin-bottom:16px;box-shadow:inset 0 0 0 1px var(--brand-l)}
.ic svg{width:26px;height:26px}
.card h3{font-size:18px;font-weight:800;margin-bottom:8px}
.card p{color:var(--body);font-size:14.5px}
.card .more{color:var(--brand);font-weight:700;font-size:14px;margin-top:14px;display:inline-flex;gap:5px}

/* solution split */
.sol{display:grid;grid-template-columns:.9fr 1.1fr;gap:40px;align-items:center}
.sollist{display:flex;flex-direction:column;gap:10px}
.solitem{display:flex;gap:14px;align-items:flex-start;padding:16px;border-radius:14px;border:1px solid var(--line);background:#fff}
.solitem.on{border-color:var(--brand);box-shadow:0 10px 24px -12px rgba(37,99,235,.4)}
.solitem .k{width:40px;height:40px;border-radius:11px;background:var(--brand-xl);color:var(--brand);display:grid;place-items:center;flex:none;box-shadow:inset 0 0 0 1px var(--brand-l)}
.solvis{background:linear-gradient(160deg,#eaf1ff,#f4f8ff);border:1px solid var(--line);border-radius:18px;height:360px;display:grid;place-items:center;position:relative;overflow:hidden}

/* pricing */
.price{grid-template-columns:repeat(3,1fr);align-items:stretch}
.pcard{background:#fff;border:1px solid var(--line2);border-radius:var(--radius);padding:32px 28px;box-shadow:var(--shadow);display:flex;flex-direction:column}
.pcard.hot{border:2px solid var(--brand);box-shadow:var(--shadow-lg);position:relative;transform:scale(1.03)}
.tag{position:absolute;top:-13px;left:50%;transform:translateX(-50%);background:var(--brand);color:#fff;font-size:12px;font-weight:800;padding:5px 14px;border-radius:999px}
.pcard h3{font-size:19px;font-weight:800}
.pcard .amt{font-size:34px;font-weight:900;margin:14px 0 4px;letter-spacing:-.03em;font-variant-numeric:tabular-nums}
/* 금액 뒤 단위는 본문 보조색(--mut #64748b, 흰 바탕 4.76:1)으로 적는다 —
   종전 #94a3b8 은 2.56:1 로 AA 미달이었고, 그 자리가 바로 「무엇당 얼마인가」다. */
.pcard .amt small{font-size:15px;color:var(--mut);font-weight:700}
.pcard .plink{display:block;text-align:center;font-size:13px;font-weight:700;color:var(--brand-d);margin-top:10px;text-decoration:underline}
.plist{list-style:none;margin:18px 0;display:flex;flex-direction:column;gap:11px;flex:1}
.plist li{font-size:14.5px;color:var(--body);display:flex;gap:9px;align-items:flex-start}
.plist li svg{width:18px;height:18px;color:var(--brand);flex:none;margin-top:2px}

/* process */
.proc{display:grid;grid-template-columns:repeat(4,1fr);gap:20px}
.pstep{text-align:center;position:relative}
.pnum{width:56px;height:56px;border-radius:16px;background:var(--brand);color:#fff;font-weight:900;font-size:20px;display:grid;place-items:center;margin:0 auto 16px;box-shadow:0 6px 16px rgba(37,99,235,.24)}
.pstep h4{font-size:16px;font-weight:800;margin-bottom:6px}
.pstep p{font-size:13.5px;color:var(--body)}

/* CTA */
.cta{background:var(--brand);color:#fff;border-radius:18px;padding:52px;display:flex;align-items:center;justify-content:space-between;gap:30px;flex-wrap:wrap;box-shadow:var(--shadow-lg)}
.cta h2{font-size:30px;font-weight:800;letter-spacing:-.03em;line-height:1.3;word-break:keep-all}
.cta p{color:#e3ebfa;margin-top:10px}
.btn-white{background:#fff;color:var(--brand-d)}
.btn-white:hover{background:var(--brand-xl);color:var(--brand-d)}
/* footer */
footer{background:#0a1226;color:var(--on-navy);padding:56px 0 30px;margin-top:0}
.fgrid{display:grid;grid-template-columns:1.6fr 1fr 1fr 1fr;gap:30px}
footer h5{color:#fff;font-size:14px;font-weight:800;margin-bottom:14px}
footer a{display:block;color:var(--on-navy);font-size:14px;margin-bottom:9px}
footer a:hover{color:#fff}
/* 종전 바닥 줄 #6b7f9e 은 4.57:1 로 간신히 지났고, 같은 줄의 고지 문구와 두 가지 회색이
   섞여 있었다 — 어두운 면의 보조색 한 가지로 모은다. */
.fbottom{border-top:1px solid rgba(255,255,255,.08);margin-top:34px;padding-top:20px;font-size:13px;color:var(--on-navy);display:flex;justify-content:space-between;flex-wrap:wrap;gap:10px}
/* 푸터 바닥 줄은 어두운 면이다 — 여기서 --mut(#64748b)을 쓰면 #0a1226 위 3.9:1 로 AA 미달이
   된다. 같은 면의 링크색(--on-navy #9fb2d4, 7.3:1)으로 적는다. 색 한 벌이라도 **면에 따라
   고르는 값이 다르다**: 흰 바탕의 보조색을 어두운 바탕에 그대로 옮기지 않는다. */
.fnote{font-size:12px;color:var(--on-navy);margin-top:12px}
.badge-ai{display:inline-flex;gap:16px;font-size:12px;color:var(--on-navy);flex-wrap:wrap}
.badge-ai .flink{display:inline;margin:0;font-size:12px;color:var(--on-navy);text-decoration:underline}
.badge-ai .flink:hover{color:#fff}
@media(max-width:900px){.hero-in,.sol{grid-template-columns:1fr}.stats,.cards4,.cards3,.price,.proc,.fgrid{grid-template-columns:1fr 1fr}.hero h1{font-size:38px}.h2{font-size:30px}.viz{height:360px}}
/* 121회차 모바일 실측 QA: 900px 아래 단계가 없어 720px 미만에서 헤더 가로 넘침과 2열 카드 압착이 발생해 단계 보강(무붕괴, 무오버랩) */
@media(max-width:720px){
  .wrap{padding:0 18px}
  /* 링크 5종 가로 넘침 방지. 숨겨도 잃는 것이 없다 — 다섯 항목 모두 **이 페이지 안의 섹션**을
     가리키므로 좁은 화면에서는 그대로 내려가며 읽힌다(종전 주석은 「동일 항목은 푸터에서
     접근」이라 적었는데, 푸터의 그 줄들은 아직 목적지가 없는 글이었다. 2단계에서 푸터 링크를
     모두 실제 목적지로 배선했다). */
  .navmenu{display:none}
  .logo-sub{display:none}
  .navright{gap:8px}
  section{padding:64px 0}
  .cards4,.cards3,.price,.proc,.fgrid{grid-template-columns:1fr}
  .pcard.hot{transform:none}      /* 1열에서 scale(1.03) 은 인접 카드와 겹침 */
  .cta{padding:36px 24px;border-radius:20px}
  .cta h2{font-size:26px}
  .hero h1{font-size:34px}
  .hero-in{padding:44px 0 40px}
}
@media(max-width:480px){
  .wrap{padding:0 16px}
  .hero-in{padding:48px 0 44px}
  .hero h1{font-size:30px}
  .hero p{font-size:16px;margin:18px 0 24px}
  .h2{font-size:25px}
  .sub{font-size:15.5px}
  .btn{font-size:14px;padding:11px 18px}
  .hero-cta .btn{flex:1 1 100%;justify-content:center}
  .viz{height:320px}
  .phone{width:186px;height:344px;border-radius:30px}
  .glow{width:250px;height:250px}
  .chip{display:none}             /* 폭 부족 시 전화기 목업과 겹침 → 숨김(동일 지표는 stats 밴드 제공) */
  .card{padding:22px}
  .pcard{padding:26px 22px}
  .cta{padding:30px 20px}
  .cta h2{font-size:23px}
  .cta>div{width:100%}
  .cta>div .btn{flex:1 1 auto;justify-content:center}
  .fbottom{font-size:12px}
}

/* ── 호버 리프트는 마우스가 있는 기기에서만(globals.css 와 같은 가드) ──
   터치 기기의 :hover 는 누른 뒤 그대로 남아 「떠 있는 카드」가 지워지지 않는다. */
@media(hover:hover){
  .btn:hover{transform:translateY(-1px)}
  .card:hover{transform:translateY(-4px)}
}
.btn:active{transform:translateY(0) scale(.98);box-shadow:none}

/* ── 모션 민감 사용자: 전환, 리프트, 무한 애니메이션 전부 생략(디자인 원칙 7) ──
   랜딩에는 이 질의가 **한 번도 없었다**: 히어로의 음성 파형(.wave i)은 1.1초마다 영영
   높이가 변했고, 카드와 버튼은 호버마다 떠올랐고, 내비는 부드럽게 스크롤했다. 콘솔
   (globals.css)은 같은 효과를 모두 끄고 있었으니 한 제품이 두 가지 약속을 한 셈이다.
   파형은 애니메이션만 끄면 높이가 0이 되어 사라지므로 **정지한 막대**로 남긴다. */
@media (prefers-reduced-motion:reduce){
  html{scroll-behavior:auto}
  .btn,.card{transition:none}
  .btn:hover,.btn-primary:hover,.card:hover,.btn:active{transform:none}
  .wave i{animation:none;height:20px}
}

/* 상단 바가 고정(70px)이라, 내비의 페이지 내 이동이 섹션 제목을 바 아래로 밀어 넣지 않게. */
[id^="lp-"]{scroll-margin-top:92px}
</style>


<header><div class="wrap"><nav>
  <a class="logo" href="/" aria-label="D-ARS 보이는 ARS 홈"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none"><rect x="1" y="9" width="3" height="6" rx="1.5" fill="#0C66E4"/><rect x="6" y="5" width="3" height="14" rx="1.5" fill="#0C66E4" opacity=".7"/><rect x="11" y="2" width="3" height="20" rx="1.5" fill="#0C66E4"/><rect x="16" y="6" width="3" height="12" rx="1.5" fill="#0C66E4" opacity=".7"/><rect x="21" y="9" width="2.4" height="6" rx="1.2" fill="#0C66E4" opacity=".7"/></svg>D-ARS<span class="logo-sub">보이는 ARS</span></a>
  <div class="navmenu"><a href="#lp-solution">서비스 소개</a><a href="#lp-product">제품 구성</a><a href="#lp-cases">적용 업무</a><a href="#lp-tech">연동 기술</a><a href="#lp-pricing">요금 안내</a></div>
  <div class="navright"><a class="btn btn-outline btn-sm" href="/login">로그인</a><a class="btn btn-primary btn-sm" href="${contactHref(LEGAL_META.contactEmail, '')}">도입 문의</a></div>
</nav></div></header>

<!-- HERO -->
<div class="hero"><div class="wrap"><div class="hero-in">
  <div>
    <div class="hero-badge">콘택트센터용 보이는 ARS</div>
    <h1>전화로 길게 설명하던 안내를<br><span class="accent">고객 휴대폰 화면으로</span></h1>
    <p>통화 중인 고객에게 문자로 링크를 보내면 메뉴와 입력 화면이 휴대폰에 열립니다. 말로 불러 주던 계좌와 인증번호를 화면에서 입력하게 하고, 화면이 끊기면 음성 안내로 이어 갑니다.</p>
    <div class="hero-cta"><a class="btn btn-primary" href="/visual">체험 화면 보기</a><a class="btn btn-outline" href="#lp-solution">서비스 소개</a></div>
    <p class="hero-note">이 서비스의 일부 응대와 안내문은 인공지능이 생성합니다. 요금과 도입 조건은 <a href="/pricing">요금 안내</a>에서 확인할 수 있습니다.</p>
  </div>
  <div class="viz">
    <div class="glow"></div>
    <div class="chip c1">문자로 링크 발송</div><div class="chip c3">화면에서 선택과 입력</div><div class="chip c2">끊기면 음성 안내로 전환</div>
    <div class="phone"><div class="screen">
      <div class="st">통화 연결됨 00:12</div>
      <div class="avatar"><svg aria-hidden="true" viewBox="0 0 24 24" width="26" fill="#fff"><path d="M12 3a4 4 0 0 1 4 4v3a4 4 0 0 1-8 0V7a4 4 0 0 1 4-4z"/><path d="M6 11a6 6 0 0 0 12 0" stroke="#fff" stroke-width="1.6" fill="none"/></svg></div>
      <div class="num">고객센터 안내</div>
      <div class="chatb">원하시는 업무를 선택해 주십시오. 통화는 그대로 유지됩니다.</div>
      <div class="wave"><i style="animation-delay:0s"></i><i style="animation-delay:.1s"></i><i style="animation-delay:.2s"></i><i style="animation-delay:.15s"></i><i style="animation-delay:.05s"></i><i style="animation-delay:.25s"></i><i style="animation-delay:.12s"></i><i style="animation-delay:.3s"></i></div>
      <div class="callend"><svg aria-hidden="true" viewBox="0 0 24 24" width="18" fill="#fff"><path d="M21 15.5c-1.2 0-2.4-.2-3.5-.6-.35-.1-.75 0-1 .27l-1.5 1.5a15 15 0 0 1-6.6-6.6l1.5-1.5c.27-.27.36-.66.26-1A11 11 0 0 1 9 4.5 1 1 0 0 0 8 3.5H4.5A1 1 0 0 0 3.5 4.5 17.5 17.5 0 0 0 21 22a1 1 0 0 0 1-1v-3.5a1 1 0 0 0-1-1z"/></svg></div>
    </div></div>
  </div>
</div></div></div>

<!-- 운영 원칙 -->
<section id="lp-why" class="band"><div class="wrap">
  <div class="grid cards4">
    <div class="card"><div class="ic"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="4" y="2" width="16" height="20" rx="3"/><path d="M9 18h6"/></svg></div><h3>앱 설치 없이 이용</h3><p>고객은 문자로 받은 링크만 열면 됩니다. 가입도 앱 설치도 필요하지 않습니다.</p></div>
    <div class="card"><div class="ic"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M5 12a7 7 0 0 1 14 0v4a3 3 0 0 1-3 3h-2"/><path d="M3 12v3a2 2 0 0 0 2 2h1v-5H5a2 2 0 0 0-2 2zM21 12v3a2 2 0 0 1-2 2h-1v-5h1a2 2 0 0 1 2 2z"/></svg></div><h3>통화는 그대로 유지</h3><p>안내 화면은 통화와 별개로 열립니다. 고객은 상담원이나 음성 안내와 계속 통화합니다.</p></div>
    <div class="card"><div class="ic"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 3 4 6v6c0 4.5 3.2 7.8 8 9 4.8-1.2 8-4.5 8-9V6l-8-3z"/><path d="m9 12 2 2 4-4"/></svg></div><h3>끊겨도 음성으로 이어짐</h3><p>화면 연결이 끊기면 기존 음성 안내가 이어받아 고객이 통화를 다시 시작하지 않아도 됩니다.</p></div>
    <div class="card"><div class="ic"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 19V5M4 19h16M8 16v-5M12 16V7M16 16v-3"/></svg></div><h3>응대 내역을 남김</h3><p>선택과 입력 내역은 콘솔에서 확인하고, 감사 로그로 점검할 수 있습니다.</p></div>
  </div>
</div></section>

<!-- 흐름 -->
<section id="lp-solution" class="alt"><div class="wrap">
  <div class="center"><div class="eyebrow">서비스 흐름</div><h2 class="h2" style="margin-top:10px">전화가 걸려 온 순간부터 처리까지</h2><p class="sub">고객 한 건이 들어와 끝나는 과정을 네 단계로 나눕니다.</p></div>
  <div class="proc" style="margin-top:44px">
    <div class="pstep"><div class="pnum">1</div><h4>전화 인입</h4><p>대표번호로 걸려 온 통화를 기존 전화 시스템이 받습니다.</p></div>
    <div class="pstep"><div class="pnum">2</div><h4>링크 발송</h4><p>고객 휴대폰으로 안내 화면 링크를 문자로 보냅니다.</p></div>
    <div class="pstep"><div class="pnum">3</div><h4>화면 처리</h4><p>고객이 메뉴를 고르고 번호나 서류 정보를 화면에 입력합니다.</p></div>
    <div class="pstep"><div class="pnum">4</div><h4>종료와 기록</h4><p>처리가 끝나면 내역이 남고, 필요한 건은 상담원에게 이어집니다.</p></div>
  </div>
</div></section>

<!-- 활용 장면 -->
<section id="lp-cases"><div class="wrap">
  <div class="center"><div class="eyebrow">적용 업무</div><h2 class="h2" style="margin-top:10px">말로 하면 길어지는 업무에 씁니다</h2><p class="sub">효과는 도입 환경에서 실측해 산출하며, 특정 고객사의 실적을 나타내지 않습니다.</p></div>
  <div class="grid cards3" style="margin-top:44px">
    <div class="card"><div class="ic"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="8" r="3.5"/><path d="M5 20a7 7 0 0 1 14 0"/></svg></div><h3>본인확인과 인증</h3><p>음성으로 불러 주기 어려운 계좌와 인증번호를 화면 입력으로 바꿔 오입력과 재문의를 줄입니다.</p></div>
    <div class="card"><div class="ic"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="6" cy="6" r="2.4"/><circle cx="18" cy="6" r="2.4"/><circle cx="12" cy="18" r="2.4"/><path d="M7.5 7.5 11 15.5M16.5 7.5 13 15.5"/></svg></div><h3>복잡한 메뉴 안내</h3><p>번호를 여러 번 눌러야 하는 ARS 메뉴를 화면 버튼으로 보여 주어 안내 시간을 줄입니다.</p></div>
    <div class="card"><div class="ic"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5M9 13h7M9 17h5"/></svg></div><h3>서류와 접수</h3><p>양식 입력과 전자서명을 통화 중에 화면에서 받아 후속 전화를 줄입니다.</p></div>
  </div>
</div></section>

<!-- 기능 -->
<section id="lp-product" class="alt"><div class="wrap">
  <div class="center"><div class="eyebrow">제품 구성</div><h2 class="h2" style="margin-top:10px">고객 화면과 운영 콘솔을 함께 제공합니다</h2></div>
  <div class="grid cards3" style="margin-top:44px">
    <div class="card"><div class="ic"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="4" y="2" width="16" height="20" rx="3"/><path d="M9 18h6M8 7h8M8 11h5"/></svg></div><h3>고객 안내 화면</h3><p>휴대폰 폭에 맞춘 큰 글자와 버튼으로 메뉴 선택, 정보 입력, 확인까지 한 화면 흐름으로 안내합니다.</p></div>
    <div class="card"><div class="ic"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="6" cy="6" r="2.4"/><circle cx="18" cy="6" r="2.4"/><circle cx="6" cy="18" r="2.4"/><circle cx="18" cy="18" r="2.4"/><path d="M8.4 6h7.2M6 8.4v7.2M18 8.4v7.2M8.4 18h7.2"/></svg></div><h3>시나리오 편집</h3><p>안내 노드를 이어 업무별 메뉴 흐름을 만들고, 고객 화면 모양으로 미리 확인합니다.</p></div>
    <div class="card"><div class="ic"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 19V5M4 19h16M8 16v-5M12 16V7M16 16v-3"/></svg></div><h3>운영 콘솔</h3><p>처리 내역과 감사 로그를 표로 확인하고 내려받습니다.</p></div>
  </div>
</div></section>

<!-- 연동 기술 -->
<section id="lp-tech"><div class="wrap">
  <div class="center"><div class="eyebrow">연동 기술</div><h2 class="h2" style="margin-top:10px">기존 전화 시스템에 붙여 씁니다</h2><p class="sub">교환기와 상담 시스템을 바꾸지 않고 표준 규격으로 연결합니다.</p></div>
  <div class="techrow" style="margin-top:36px"><span>SIP</span><span>SIPREC</span><span>MRCPv2</span><span>RFC 4733 DTMF</span><span>WebSocket</span><span>CTI 연동</span><span>E.164</span></div>
  <div class="grid cards3" style="margin-top:36px">
    <div class="card"><h3>화면 동기화</h3><p>음성 안내의 진행에 맞춰 고객 화면을 바꿉니다.</p></div>
    <div class="card"><h3>음성 폴백</h3><p>화면이 끊기거나 문자 발송에 실패하면 음성 안내로 넘깁니다.</p></div>
    <div class="card"><h3>이중화 구성</h3><p>장애가 나도 기존 ARS 안내가 통화를 이어받도록 설계합니다.</p></div>
  </div>
</div></section>

<!-- 원칙과 신뢰 -->
<section id="lp-trust" class="alt"><div class="wrap">
  <div class="center"><div class="eyebrow">운영 약속</div><h2 class="h2" style="margin-top:10px">고객 정보와 응대 방식을 분명히 밝힙니다</h2></div>
  <div class="grid cards3" style="margin-top:44px">
    <div class="card"><h3>개인정보 보호</h3><p>수집 항목과 보관 기간은 개인정보처리방침에 적고, 고객 화면에서도 먼저 안내합니다.</p><a class="more" href="/legal/privacy">개인정보처리방침 보기</a></div>
    <div class="card"><h3>인공지능 응대 고지</h3><p>인공지능이 응대하거나 안내문을 만든 경우 고객에게 그 사실을 알립니다.</p></div>
    <div class="card"><h3>상담원 연결</h3><p>고객이 원하면 언제든 상담원 연결을 요청할 수 있도록 안내합니다.</p><a class="more" href="/legal/terms">이용약관 보기</a></div>
  </div>
</div></section>

<!-- PRICING -->
<section id="lp-pricing"><div class="wrap">
  <div class="center"><div class="eyebrow">요금 안내</div><h2 class="h2" style="margin-top:10px">파일럿으로 검증하고 확대합니다</h2><p class="sub">파일럿으로 먼저 확인한 뒤 표준 또는 기관 요금제로 넓혀 갑니다.</p></div>
  <div class="grid price" style="margin-top:48px">
    ${PLANS.map(planCard).join('\n    ')}
  </div>
  <p class="center" style="color:var(--mut);font-size:13px;margin-top:20px">모든 요금은 부가가치세 별도이며, 실제 계약과 과금 조건은 개별 계약에 따릅니다.<br/>구독 결제 연동은 준비 중이며, 현재는 도입 문의로 진행합니다.</p>
</div></section>

<!-- 도입 절차 -->
<section id="lp-process" class="alt"><div class="wrap">
  <div class="center"><div class="eyebrow">도입 절차</div><h2 class="h2" style="margin-top:10px">상담에서 운영까지 네 단계</h2></div>
  <div class="proc" style="margin-top:48px">
    <div class="pstep"><div class="pnum">1</div><h4>상담과 분석</h4><p>현재 ARS 메뉴와 문의 유형을 확인하고 적용 업무를 정합니다.</p></div>
    <div class="pstep"><div class="pnum">2</div><h4>설계와 구축</h4><p>업무별 안내 시나리오를 만들고 전화 시스템과 연결합니다.</p></div>
    <div class="pstep"><div class="pnum">3</div><h4>시험 운영</h4><p>일부 회선에서 먼저 운영하며 끊김과 입력 오류를 점검합니다.</p></div>
    <div class="pstep"><div class="pnum">4</div><h4>운영과 개선</h4><p>콘솔의 처리 내역을 보며 메뉴와 문구를 고쳐 갑니다.</p></div>
  </div>
</div></section>

<!-- FAQ -->
<section id="lp-faq"><div class="wrap" style="max-width:820px">
  <div class="center"><div class="eyebrow">자주 묻는 질문</div><h2 class="h2" style="margin-top:10px">도입 전에 많이 확인하시는 내용</h2></div>
  <div class="faq" style="margin-top:36px">
    <details><summary>고객이 앱을 설치해야 하나요?</summary><p>설치하지 않습니다. 문자로 받은 링크를 휴대폰 브라우저에서 열면 됩니다.</p></details>
    <details><summary>문자가 가지 않거나 화면이 끊기면 어떻게 되나요?</summary><p>음성 안내로 전환해 통화를 이어 갑니다. 고객은 처음부터 다시 걸지 않아도 됩니다.</p></details>
    <details><summary>기존 전화 시스템을 바꿔야 하나요?</summary><p>교환기와 상담 시스템을 유지한 채 SIP 같은 표준 규격으로 연결하는 것을 기본으로 합니다. 환경별 조건은 상담에서 확인합니다.</p></details>
    <details><summary>고객 정보는 어떻게 다루나요?</summary><p>수집 항목과 보관 기간을 개인정보처리방침에 적습니다. 자세한 내용은 방침 문서를 확인해 주십시오.</p></details>
    <details><summary>도입 비용은 어떻게 정해지나요?</summary><p>파일럿, 표준, 기관 세 가지 요금제가 있고 실제 조건은 개별 계약으로 정합니다. 요금 안내 구역에서 항목을 확인하실 수 있습니다.</p></details>
  </div>
</div></section>

<!-- 마무리 띠 -->
<div class="wrap" style="padding-bottom:80px"><div class="cta">
  <div><h2>우리 센터의 ARS 메뉴부터 함께 살펴보겠습니다</h2><p>현재 안내 흐름과 문의 유형을 알려 주시면 적용 범위를 정리해 답변드립니다.</p></div>
  <div><a class="btn btn-white" href="${contactHref(LEGAL_META.contactEmail, '')}">도입 문의</a></div>
</div></div>

<!-- FOOTER -->
<footer><div class="wrap">
  <div class="fgrid">
    <div><div class="logo" style="color:#fff;margin-bottom:14px"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none"><rect x="1" y="9" width="3" height="6" rx="1.5" fill="#3b82f6"/><rect x="6" y="5" width="3" height="14" rx="1.5" fill="#60a5fa"/><rect x="11" y="2" width="3" height="20" rx="1.5" fill="#3b82f6"/><rect x="16" y="6" width="3" height="12" rx="1.5" fill="#60a5fa"/><rect x="21" y="9" width="2.4" height="6" rx="1.2" fill="#3b82f6"/></svg>D-ARS</div><p style="font-size:14px;max-width:300px">전화 중에 고객 휴대폰으로 안내 화면을 보내는 보이는 ARS 서비스입니다.</p></div>
    <div><h5>서비스</h5><a href="#lp-solution">서비스 소개</a><a href="#lp-product">제품 구성</a><a href="#lp-cases">적용 업무</a><a href="#lp-process">도입 절차</a></div>
    <div><h5>이용 안내</h5><a href="#lp-pricing">요금 안내</a><a href="/visual">체험 화면</a><a href="/login">로그인</a></div>
    <div><h5>문의</h5><a href="${contactHref(LEGAL_META.contactEmail, '')}">도입 문의</a><a href="mailto:${LEGAL_META.contactEmail}">${LEGAL_META.contactEmail}</a></div>
  </div>
  <div class="fbottom"><span>${LEGAL_META.operator}${LEGAL_META.businessNumber ? ` | 사업자등록번호 ${LEGAL_META.businessNumber}` : ''} | 문의 ${LEGAL_META.contactEmail}</span><span class="badge-ai"><a href="/legal/privacy" class="flink">개인정보처리방침</a><a href="/legal/terms" class="flink">이용약관</a></span></div>
  <p class="fnote">이 서비스의 일부 응대와 안내문은 인공지능이 생성합니다. 상담원 연결이 필요하면 안내에 따라 요청해 주십시오.</p>
</div></footer>`;
export default function Home() {
  return <main suppressHydrationWarning dangerouslySetInnerHTML={{ __html: LP }} />;
}
