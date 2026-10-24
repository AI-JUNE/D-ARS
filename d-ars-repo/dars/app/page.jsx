// D-ARS 랜딩 — TOBE 블루 디자인(통합 최상급). 원본 HTML을 손실 없이 렌더.
import { PLANS, contactHref } from '@/lib/plans';
import { LEGAL_META } from '@/lib/legalContent';

export const dynamic = 'force-static';

// 루트 metadata 는 운영 포털 기준('D-ARS · 보이는 ARS 관리자')이라 공개 랜딩에 그대로 쓰면
// 제품 소개 화면이 '관리자'로 표기된다. 이 페이지에서만 제품 기준 제목·설명으로 덮어쓴다.
export const metadata = {
  title: 'D-ARS · 보이는 ARS 솔루션',
  description: 'AI 음성봇과 보이는 ARS로 전화 인입부터 화면 안내까지 잇는 디지털 ARS 솔루션.',
  openGraph: {
    title: 'D-ARS · 보이는 ARS 솔루션',
    description: 'AI 음성봇과 보이는 ARS로 전화 인입부터 화면 안내까지 잇는 디지털 ARS 솔루션.',
  },
  twitter: {
    title: 'D-ARS · 보이는 ARS 솔루션',
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
      <a class="btn ${p.highlight ? 'btn-primary' : 'btn-outline'}" style="justify-content:center" href="${planHref(p)}">${p.cta} →</a>
      <a class="plink" href="/pricing">${p.name} 요금 자세히 보기</a></div>`;

const LP = `<style>
/* ──────────────────────────────────────────────────────────────────────────
   AICC 라인 토큰 — app/globals.css 와 **같은 값**이다(기준 원본
   2. Callbot/v2/callbot-portal/public/admin.html 의 마지막 :root · index.html 랜딩).
   종전 이 블록은 랜딩만의 한 벌이었다: 경계선 #e6ebf3(콘솔은 #e2e8f0) · 바탕
   #f6f8fc(#f8fafc) · 보조색 #94a3b8(흰 바탕 2.56:1 — WCAG AA 미달) · 파란빛이 섞인
   그림자. 「홈 → 로그인 → 콘솔」로 넘어가는 동안 선과 바탕이 미세하게 두 번 갈렸다.
   글꼴 @import 는 두지 않는다 — globals.css 가 이미 같은 CDN 에서 Pretendard 를
   받아 오므로 랜딩만 제3자 스타일시트를 한 번 더 기다릴 이유가 없다.
   ────────────────────────────────────────────────────────────────────────── */
:root{
  --brand:#2563eb; --brand-d:#1d4ed8; --brand-l:#bfdbfe; --brand-xl:#eef4ff;
  --ink:#0f172a; --body:#475569; --mut:#64748b;
  --line:#e2e8f0; --line2:#eef2f7; --bg:#f8fafc; --card:#fff;
  /* 히어로·푸터 네이비와 그 위의 글자색은 랜딩만 쓰는 칸이다(콘솔에는 어두운 면이 없다).
     쓰지 않는 칸은 두지 않는다 — --brand2·--navy3·--ok 는 아무 규칙도 읽지 않고 있었다. */
  --navy1:#0b1220; --navy2:#132445; --on-navy:#9fb2d4;
  --radius:16px;
  --shadow:0 1px 2px rgba(15,23,42,.05),0 4px 16px rgba(15,23,42,.06);
  --shadow-lg:0 20px 46px rgba(15,23,42,.13),0 6px 18px rgba(15,23,42,.07);
}
*{box-sizing:border-box;margin:0;padding:0}
html{scroll-behavior:smooth}
body{font-family:Pretendard,-apple-system,"Segoe UI",Roboto,sans-serif;color:var(--ink);background:var(--bg);line-height:1.6;-webkit-font-smoothing:antialiased;letter-spacing:-.015em}
.wrap{max-width:1200px;margin:0 auto;padding:0 24px}
a{color:inherit;text-decoration:none}
/* 버튼 — 기준 원본 규격(globals.css 의 .btn.primary · index.html 의 .btn.ghost).
   주된 버튼은 **단색 브랜드색**이다(종전 135° 그라데이션 + 알파 .5 그림자는 콘솔의 어느
   버튼과도 다른 모양이었다). 호버 리프트는 아래 hover:hover 블록에서만 건다. */
.btn{display:inline-flex;align-items:center;gap:8px;font-weight:700;font-size:15px;border-radius:12px;padding:12px 22px;cursor:pointer;border:0;white-space:nowrap;
  transition:background .15s ease,border-color .15s ease,color .15s ease,transform .13s ease,box-shadow .15s ease}
.btn-primary{background:var(--brand);color:#fff;box-shadow:0 6px 16px rgba(37,99,235,.24)}
.btn-primary:hover{background:var(--brand-d);box-shadow:0 8px 20px rgba(37,99,235,.32)}
.btn-ghost{background:rgba(255,255,255,.1);color:#fff;border:1px solid rgba(255,255,255,.25)}
/* 히어로·CTA 띠의 투명 버튼은 **자기 호버를 반드시 적어 둔다.** globals.css 의
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
.login{font-weight:700;font-size:15px;color:var(--body)}

/* HERO */
.hero{background:radial-gradient(1100px 500px at 78% -8%,#1b3e7e 0%,transparent 60%),linear-gradient(160deg,var(--navy1),var(--navy2) 60%,#0f1e3d);color:#fff;position:relative;overflow:hidden}
.hero::before{content:"";position:absolute;inset:0;background-image:radial-gradient(circle at 1px 1px,rgba(255,255,255,.06) 1px,transparent 0);background-size:26px 26px;opacity:.6}
.hero-in{display:grid;grid-template-columns:1.05fr .95fr;gap:40px;align-items:center;padding:70px 0 64px;position:relative}
.hero h1{font-size:52px;font-weight:900;line-height:1.14;letter-spacing:-.04em}
.hero h1 .accent{background:linear-gradient(120deg,#60a5fa,#a5b4fc);-webkit-background-clip:text;background-clip:text;color:transparent}
.hero p{color:#c3d0e6;font-size:18px;margin:22px 0 30px;max-width:520px}
.hero-badge{display:inline-flex;align-items:center;gap:8px;font-size:13px;font-weight:700;color:#bcd0f5;background:rgba(96,165,250,.12);border:1px solid rgba(96,165,250,.3);padding:7px 14px;border-radius:999px;margin-bottom:22px}
.hero-cta{display:flex;gap:12px;flex-wrap:wrap}
/* phone visual */
.viz{position:relative;height:440px;display:grid;place-items:center}
.glow{position:absolute;width:340px;height:340px;border-radius:50%;background:radial-gradient(circle,rgba(59,130,246,.45),transparent 65%);filter:blur(10px)}
.ring{position:absolute;border:1px solid rgba(120,170,255,.25);border-radius:50%}
.ring.r1{width:300px;height:300px}.ring.r2{width:400px;height:400px;border-style:dashed;opacity:.5}
.phone{position:relative;width:210px;height:420px;background:linear-gradient(160deg,#1b2c4d,#0e1a30);border-radius:34px;padding:12px;box-shadow:0 30px 60px -20px rgba(0,0,0,.6),inset 0 0 0 1px rgba(120,160,255,.25)}
.screen{background:linear-gradient(180deg,#0c1730,#0a1226);border-radius:24px;height:100%;padding:18px 14px;display:flex;flex-direction:column;gap:10px;color:#dbe6fb}
.screen .st{font-size:11px;color:#8fa8d6;text-align:center}
.avatar{width:56px;height:56px;border-radius:50%;background:linear-gradient(135deg,#3b82f6,#60a5fa);margin:8px auto 4px;display:grid;place-items:center;box-shadow:0 0 24px rgba(59,130,246,.6)}
.num{text-align:center;font-weight:800;font-size:15px;letter-spacing:.02em}
.wave{display:flex;align-items:center;justify-content:center;gap:3px;height:44px;margin-top:auto}
.wave i{width:3px;border-radius:3px;background:linear-gradient(#60a5fa,#3b82f6);animation:wv 1.1s ease-in-out infinite}
@keyframes wv{0%,100%{height:8px}50%{height:34px}}
.chatb{background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.08);border-radius:12px;padding:9px 11px;font-size:11.5px;line-height:1.5}
.callend{width:40px;height:40px;border-radius:50%;background:#ef4444;margin:6px auto 0;display:grid;place-items:center;box-shadow:0 8px 18px -4px rgba(239,68,68,.6)}
.chip{position:absolute;background:rgba(255,255,255,.08);border:1px solid rgba(150,190,255,.3);backdrop-filter:blur(6px);border-radius:14px;padding:10px;color:#cfe0ff}
.chip.c1{top:24px;left:8px}.chip.c2{bottom:60px;right:0}.chip.c3{top:120px;right:16px}

/* logos */
.logos{background:#0a1226;padding:26px 0}
.logos .row{display:flex;align-items:center;justify-content:space-between;gap:28px;flex-wrap:wrap;opacity:.85}
.logos span{color:var(--on-navy);font-weight:800;font-size:19px;letter-spacing:.02em}

/* stats band */
.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:24px;background:var(--card);border:1px solid var(--line2);border-radius:var(--radius);box-shadow:var(--shadow);padding:34px;margin-top:-46px;position:relative;z-index:5}
.stat{text-align:center}
.stat b{display:block;font-size:34px;font-weight:900;color:var(--brand);letter-spacing:-.03em}
.stat span{color:var(--body);font-size:14px;font-weight:600}

/* cards */
.cards4{grid-template-columns:repeat(4,1fr)}
.cards3{grid-template-columns:repeat(3,1fr)}
/* 카드 — 콘솔 .card 규격: 라운드 16 · 경계선 --line2 · 그림자 --shadow,
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
/* 금액 뒤 단위는 본문 보조색(--mut #64748b · 흰 바탕 4.76:1)으로 적는다 —
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
.cta{background:radial-gradient(800px 300px at 20% 0%,#1b3e7e,transparent),linear-gradient(135deg,var(--navy2),var(--navy1));color:#fff;border-radius:18px;padding:56px;display:flex;align-items:center;justify-content:space-between;gap:30px;flex-wrap:wrap;box-shadow:var(--shadow-lg)}
.cta h2{font-size:32px;font-weight:900;letter-spacing:-.03em}
.cta p{color:#c3d0e6;margin-top:10px}

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
   된다. 같은 면의 링크색(--on-navy #9fb2d4 · 7.3:1)으로 적는다. 색 한 벌이라도 **면에 따라
   고르는 값이 다르다**: 흰 바탕의 보조색을 어두운 바탕에 그대로 옮기지 않는다. */
.badge-ai{display:inline-flex;gap:6px;font-size:12px;color:var(--on-navy);flex-wrap:wrap}
.badge-ai .flink{display:inline;margin:0;font-size:12px;color:var(--on-navy);text-decoration:underline}
.badge-ai .flink:hover{color:#fff}
@media(max-width:900px){.hero-in,.sol{grid-template-columns:1fr}.stats,.cards4,.cards3,.price,.proc,.fgrid{grid-template-columns:1fr 1fr}.hero h1{font-size:38px}.h2{font-size:30px}.viz{height:360px}}
/* 121회차 모바일 실측 QA: 900px 아래 단계가 없어 720px 미만에서 헤더 가로 넘침·2열 카드 압착이 발생 → 단계 보강(무붕괴·무오버랩) */
@media(max-width:720px){
  .wrap{padding:0 18px}
  /* 링크 5종 가로 넘침 방지. 숨겨도 잃는 것이 없다 — 다섯 항목 모두 **이 페이지 안의 섹션**을
     가리키므로 좁은 화면에서는 그대로 내려가며 읽힌다(종전 주석은 「동일 항목은 푸터에서
     접근」이라 적었는데, 푸터의 그 줄들은 아직 목적지가 없는 글이다). */
  .navmenu{display:none}
  section{padding:64px 0}
  .cards4,.cards3,.price,.proc,.fgrid{grid-template-columns:1fr}
  .pcard.hot{transform:none}      /* 1열에서 scale(1.03) 은 인접 카드와 겹침 */
  .logos .row{justify-content:center;gap:16px 22px}
  .logos span{font-size:16px}
  .stats{padding:24px 18px;margin-top:-36px}
  .stat b{font-size:28px}
  .cta{padding:36px 24px;border-radius:20px}
  .cta h2{font-size:26px}
  .solvis{height:300px}
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
  .ring.r1{width:240px;height:240px}.ring.r2{width:300px;height:300px}
  .chip{display:none}             /* 폭 부족 시 전화기 목업과 겹침 → 숨김(동일 지표는 stats 밴드 제공) */
  .stats{grid-template-columns:1fr 1fr;padding:20px 14px;gap:16px}
  .stat b{font-size:26px}
  .stat span{font-size:13px}
  .card{padding:22px}
  .pcard{padding:26px 22px}
  .solvis{height:260px}
  .solvis svg{width:100%;height:auto}
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

/* ── 모션 민감 사용자 — 전환·리프트·무한 애니메이션 전부 생략(디자인 원칙 7) ──
   랜딩에는 이 질의가 **한 번도 없었다**: 히어로의 음성 파형(.wave i)은 1.1초마다 영영
   높이가 변했고, 카드·버튼은 호버마다 떠올랐고, 내비는 부드럽게 스크롤했다. 콘솔
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
  <div class="logo"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none"><rect x="1" y="9" width="3" height="6" rx="1.5" fill="#2563eb"/><rect x="6" y="5" width="3" height="14" rx="1.5" fill="#3b82f6"/><rect x="11" y="2" width="3" height="20" rx="1.5" fill="#2563eb"/><rect x="16" y="6" width="3" height="12" rx="1.5" fill="#60a5fa"/><rect x="21" y="9" width="2.4" height="6" rx="1.2" fill="#3b82f6"/></svg>D-ARS</div>
  <div class="navmenu"><a href="#lp-solution">서비스 소개</a><a href="#lp-product">주요 기능</a><a href="#lp-cases">도입 효과</a><a href="#lp-tech">기술 표준</a><a href="#lp-pricing">요금안내</a></div>
  <div class="navright"><a class="login" href="/login">로그인</a><a class="btn btn-primary" href="/pricing">무료 체험하기</a></div>
</nav></div></header>

<!-- HERO -->
<div class="hero"><div class="wrap"><div class="hero-in">
  <div>
    <div class="hero-badge">◆ AI 기반 차세대 디지털 ARS 솔루션</div>
    <h1>더 스마트한 고객 경험,<br><span class="accent">D-ARS</span>로 완성하세요</h1>
    <p>AI 음성봇이 전화를 받고 이해하고 해결합니다. 24시간 쉬지 않는 스마트한 응대와 실시간 화면 안내로 고객 응대 프로세스를 혁신합니다.</p>
    <div class="hero-cta"><a class="btn btn-primary" href="/pricing">무료 체험 알아보기 →</a><a class="btn btn-ghost" href="#lp-solution">솔루션 알아보기</a></div>
  </div>
  <div class="viz">
    <div class="glow"></div><div class="ring r1"></div><div class="ring r2"></div>
    <div class="chip c1">📞 전화 자동응대</div><div class="chip c3">⚡ 스트리밍 응답</div><div class="chip c2">🛡 야간·주말 무인 응대</div>
    <div class="phone"><div class="screen">
      <div class="st">● 통화 연결됨 · 00:12</div>
      <div class="avatar"><svg aria-hidden="true" viewBox="0 0 24 24" width="26" fill="#fff"><path d="M12 3a4 4 0 0 1 4 4v3a4 4 0 0 1-8 0V7a4 4 0 0 1 4-4z"/><path d="M6 11a6 6 0 0 0 12 0" stroke="#fff" stroke-width="1.6" fill="none"/></svg></div>
      <div class="num">AI 상담 · 데모 회선</div>
      <div class="chatb">안녕하세요, 무엇을 도와드릴까요? 화면으로도 함께 안내해 드릴게요.</div>
      <div class="wave"><i style="animation-delay:0s"></i><i style="animation-delay:.1s"></i><i style="animation-delay:.2s"></i><i style="animation-delay:.15s"></i><i style="animation-delay:.05s"></i><i style="animation-delay:.25s"></i><i style="animation-delay:.12s"></i><i style="animation-delay:.3s"></i></div>
      <div class="callend"><svg aria-hidden="true" viewBox="0 0 24 24" width="18" fill="#fff"><path d="M21 15.5c-1.2 0-2.4-.2-3.5-.6-.35-.1-.75 0-1 .27l-1.5 1.5a15 15 0 0 1-6.6-6.6l1.5-1.5c.27-.27.36-.66.26-1A11 11 0 0 1 9 4.5 1 1 0 0 0 8 3.5H4.5A1 1 0 0 0 3.5 4.5 17.5 17.5 0 0 0 21 22a1 1 0 0 0 1-1v-3.5a1 1 0 0 0-1-1z"/></svg></div>
    </div></div>
  </div>
</div></div></div>

<div class="wrap" style="margin-top:8px">
  <div style="display:flex;align-items:center;gap:8px;justify-content:center;background:var(--brand-xl);border:1px solid rgba(37,99,235,.18);color:var(--brand-d);border-radius:100px;padding:9px 16px;font-size:13px;font-weight:700;max-width:640px;margin:0 auto">
    <span aria-hidden="true">🤖</span><span>본 서비스는 인공지능(AI)이 응대합니다. AI가 생성한 안내가 포함될 수 있습니다.</span>
  </div>
</div>

<div class="logos"><div class="wrap"><div class="row">
  <span>SIP · SIPREC</span><span>MRCPv2</span><span>RFC 4733 DTMF</span><span>WebSocket</span><span>CTI 연동</span><span>E.164</span>
</div></div></div>

<div class="wrap">
  <div class="stats">
    <div class="stat"><b>무중단 설계</b><span>이중화 · 장애 시 기존 IVR 폴백</span></div>
    <div class="stat"><b>상담 시간 절감</b><span>정형 문의 AI 1차 응대</span></div>
    <div class="stat"><b>운영 비용 절감</b><span>야간·주말 무인 운영</span></div>
    <div class="stat"><b>응대 품질 관리</b><span>녹취·QA·감사로그</span></div>
  </div>
  <p class="sub" style="text-align:center;font-size:13px;margin-top:14px">※ 위 항목은 제품 기능·설계 기준의 설명이며, 특정 고객사의 운영 실적을 나타내지 않습니다. 실제 효과는 도입 환경에서 실측해 산출합니다.</p>
</div>

<!-- WHY -->
<section id="lp-why"><div class="wrap">
  <div class="center"><div class="eyebrow">Why D-ARS?</div><h2 class="h2" style="margin-top:10px">비즈니스 성장을 이끄는 차별화된 가치</h2><p class="sub">D-ARS는 최적의 AI 음성 기술로 고객 경험을 혁신하고, 운영 효율을 높여 비즈니스 성과를 극대화합니다.</p></div>
  <div class="grid cards4" style="margin-top:44px">
    <div class="card"><div class="ic"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 3a4 4 0 0 1 4 4v3a4 4 0 0 1-8 0V7a4 4 0 0 1 4-4z"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg></div><h3>AI 기반 자연어 이해</h3><p>정확한 음성 인식과 자연어 처리로 고객 의도를 파악하고 최적의 답변을 제공합니다.</p></div>
    <div class="card"><div class="ic"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg></div><h3>상담 시간 외 무인 응대</h3><p>상담원 근무 시간과 무관하게 전화를 받아 1차 응대하고, 장애 시 기존 IVR로 넘기는 이중화 설계.</p></div>
    <div class="card"><div class="ic"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 17l5-5 4 3 6-7"/><path d="M17 6h4v4"/></svg></div><h3>운영 효율 극대화</h3><p>자동화된 상담으로 인건비와 운영 비용을 줄이고 업무 효율을 크게 높입니다.</p></div>
    <div class="card"><div class="ic"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 5h16v10H4z"/><path d="M8 20h8M12 15v5"/><path d="M7 10l2 2 3-4 3 3"/></svg></div><h3>데이터 기반 인사이트</h3><p>통화 데이터를 분석해 인사이트를 도출, 비즈니스 의사결정을 지원합니다.</p></div>
  </div>
</div></section>

<!-- SOLUTION -->
<section id="lp-solution" style="background:#fff;border-top:1px solid var(--line);border-bottom:1px solid var(--line)"><div class="wrap">
  <div class="sol">
    <div>
      <div class="eyebrow">Solution</div><h2 class="h2" style="margin-top:10px">하나의 플랫폼,<br>완결형 AI 콜 솔루션</h2>
      <p class="sub">전화 인입부터 화면 안내, 데이터 분석까지 — D-ARS 한 곳에서 이어집니다.</p>
      <div class="sollist" style="margin-top:24px">
        <div class="solitem on"><div class="k"><svg aria-hidden="true" viewBox="0 0 24 24" width="20" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 3a4 4 0 0 1 4 4v3a4 4 0 0 1-8 0V7a4 4 0 0 1 4-4zM5 11a7 7 0 0 0 14 0"/></svg></div><div><h3 style="font-size:16px;font-weight:800">AI 음성봇</h3><p style="color:var(--body);font-size:14px">자연어 처리 기반으로 고객 문의를 이해하고 정확히 답변하는 지능형 음성 상담.</p></div></div>
        <div class="solitem"><div class="k"><svg aria-hidden="true" viewBox="0 0 24 24" width="20" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="4" y="2" width="16" height="20" rx="3"/><path d="M9 18h6"/></svg></div><div><h3 style="font-size:16px;font-weight:800">보이는 ARS</h3><p style="color:var(--body);font-size:14px">통화 중 고객 스마트폰에 화면을 띄워 음성 안내를 시각화하고 바로 처리.</p></div></div>
        <div class="solitem"><div class="k"><svg aria-hidden="true" viewBox="0 0 24 24" width="20" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 19V5M4 19h16M8 16v-4M12 16V8M16 16v-6"/></svg></div><div><h3 style="font-size:16px;font-weight:800">통화 분석 · 리포트</h3><p style="color:var(--body);font-size:14px">통화 데이터를 분석해 상담 품질과 성과를 리포트로 제공합니다.</p></div></div>
        <div class="solitem"><div class="k"><svg aria-hidden="true" viewBox="0 0 24 24" width="20" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="6" cy="6" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="12" cy="18" r="2.5"/><path d="M7.5 7.5 11 15M16.5 7.5 13 15"/></svg></div><div><h3 style="font-size:16px;font-weight:800">스마트 라우팅</h3><p style="color:var(--body);font-size:14px">문의 유형을 판별해 적합한 담당·상담사에게 자동으로 연결합니다.</p></div></div>
      </div>
    </div>
    <div class="solvis">
      <svg aria-hidden="true"width="300" height="280" viewBox="0 0 300 280" fill="none">
        <rect x="40" y="40" width="220" height="150" rx="14" fill="#fff" stroke="#dbe8ff"/>
        <rect x="58" y="60" width="90" height="10" rx="5" fill="#3b82f6"/><rect x="58" y="80" width="150" height="7" rx="3.5" fill="#e6ebf3"/><rect x="58" y="94" width="120" height="7" rx="3.5" fill="#e6ebf3"/>
        <rect x="58" y="120" width="80" height="46" rx="8" fill="#eef4ff"/><rect x="146" y="120" width="96" height="46" rx="8" fill="#eef4ff"/>
        <circle cx="98" cy="143" r="13" fill="#3b82f6" opacity=".2"/><path d="M92 143l4 4 8-8" stroke="#2563eb" stroke-width="2.4" fill="none"/>
        <rect x="150" y="210" width="120" height="44" rx="12" fill="#132445"/><path d="M170 232h10M186 224v16M198 226v14M210 228v12" stroke="#60a5fa" stroke-width="2.6" stroke-linecap="round"/>
        <circle cx="250" cy="70" r="20" fill="#2563eb"/><path d="M243 70l5 5 9-10" stroke="#fff" stroke-width="2.6" fill="none"/>
      </svg>
    </div>
  </div>
</div></section>

<!-- PRODUCT -->
<section id="lp-product"><div class="wrap">
  <div class="center"><div class="eyebrow">Product</div><h2 class="h2" style="margin-top:10px">기능별로 나눈 제품 라인업</h2></div>
  <div class="grid cards3" style="margin-top:44px">
    <div class="card"><div class="ic">AI</div><h3>D-ARS AI</h3><p>고도화된 AI 기술로 자연스러운 대화와 정확한 응답을 제공하는 음성봇 솔루션.</p><span class="more">자세히 보기 →</span></div>
    <div class="card"><div class="ic"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 19V5M4 19h16M8 16v-5M12 16V7M16 16v-3"/></svg></div><h3>D-ARS Analytics</h3><p>통화 데이터를 분석해 고객 인사이트와 운영 효율을 제공하는 분석 솔루션.</p><span class="more">자세히 보기 →</span></div>
    <div class="card"><div class="ic"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="6" cy="6" r="2.4"/><circle cx="18" cy="6" r="2.4"/><circle cx="6" cy="18" r="2.4"/><circle cx="18" cy="18" r="2.4"/><path d="M8.4 6h7.2M6 8.4v7.2M18 8.4v7.2M8.4 18h7.2"/></svg></div><h3>D-ARS Connect</h3><p>다양한 시스템과 유연하게 연동해 자유롭게 확장하는 통합 플랫폼.</p><span class="more">자세히 보기 →</span></div>
  </div>
</div></section>

<!-- TECHNOLOGY -->
<section id="lp-tech" style="background:#fff;border-top:1px solid var(--line);border-bottom:1px solid var(--line)"><div class="wrap">
  <div class="center"><div class="eyebrow">Technology</div><h2 class="h2" style="margin-top:10px">핵심 기술</h2><p class="sub">D-ARS의 핵심 기술로 더 정확하고 자연스러운 대화를 구현합니다.</p></div>
  <div class="grid cards4" style="margin-top:44px">
    <div class="card center"><div class="ic" style="margin:0 auto 16px"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 4v16M8 8v8M4 11v2M16 8v8M20 11v2"/></svg></div><h3>음성 인식 (ASR)</h3><p>고객 음성을 정확한 텍스트로 변환합니다.</p></div>
    <div class="card center"><div class="ic" style="margin:0 auto 16px"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M6 6l2 2M16 16l2 2M18 6l-2 2M8 16l-2 2"/></svg></div><h3>자연어 처리 (NLP)</h3><p>고객 의도와 맥락을 정확히 이해합니다.</p></div>
    <div class="card center"><div class="ic" style="margin:0 auto 16px"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M11 5 6 9H3v6h3l5 4V5zM16 9a4 4 0 0 1 0 6M19 7a7 7 0 0 1 0 10"/></svg></div><h3>음성 합성 (TTS)</h3><p>자연스럽고 명료한 음성으로 응답합니다.</p></div>
    <!-- 종전 이 자리는 「머신 러닝 (ML) · 지속적인 학습으로 성능을 향상합니다」였다. 상담 자료로
         모델을 학습시킨다는 뜻으로 읽히는데 그 일은 하지 않으며 약관·방침 어디에도 근거가 없다
         (AI 학습 표현 금지 규칙). 대신 보이는 ARS 가 실제로 하는 일을 적는다 — 안내 노드를 고객
         화면에 맞춰 띄우고, 화면이 끊기면 음성 안내로 넘기는 폴백(lib/ivrFallback). -->
    <div class="card center"><div class="ic" style="margin:0 auto 16px"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="4" y="2" width="16" height="20" rx="3"/><path d="M9 18h6M8 7h8M8 11h5"/></svg></div><h3>화면 동기화</h3><p>음성 안내에 맞춰 화면을 띄우고, 끊기면 음성으로 이어 갑니다.</p></div>
  </div>
</div></section>

<!-- USE CASES -->
<section id="lp-cases"><div class="wrap">
  <div class="center"><div class="eyebrow">Use Cases</div><h2 class="h2" style="margin-top:10px">적용 시나리오</h2><p class="sub">보이는 ARS가 효과를 내는 대표 업무 유형입니다. 실제 효과는 고객사 환경에서 실측해 산출합니다.</p></div>
  <div class="grid cards3" style="margin-top:44px">
    <!-- 카드 제목 색: 종전 #1a4fa0·#111·#1a4fa0 세 장이 두 가지 색으로 갈려 있었다(같은 위계인데
         가운데 한 장만 검정). 콘솔과 같은 --ink 한 색으로 모은다 — 브랜드색은 강조 어구에만 쓴다. -->
    <div class="card"><div style="font-weight:900;font-size:18px;color:var(--ink)">본인확인 · 인증</div><p style="margin:12px 0 16px">음성으로 불러주기 어려운 <b style="color:var(--brand)">계좌·인증번호</b>를 화면 입력으로 전환해 오입력과 재문의를 줄입니다.</p></div>
    <div class="card"><div style="font-weight:900;font-size:18px;color:var(--ink)">복잡한 메뉴 안내</div><p style="margin:12px 0 16px">선택지가 많은 ARS 트리를 <b style="color:var(--brand)">화면 버튼</b>으로 제시해 안내 시간을 단축합니다.</p></div>
    <div class="card"><div style="font-weight:900;font-size:18px;color:var(--ink)">서류 · 접수</div><p style="margin:12px 0 16px">상담 중 <b style="color:var(--brand)">폼 입력·전자서명</b>을 화면에서 처리해 후속 콜을 없앱니다.</p></div>
  </div>
  <p class="sub" style="margin-top:18px;text-align:center;font-size:13px">※ 본 페이지의 수치·화면은 데모 기준이며, 특정 고객사의 실적을 나타내지 않습니다.</p>
</div></section>

<!-- PRICING -->
<section id="lp-pricing" style="background:#fff;border-top:1px solid var(--line);border-bottom:1px solid var(--line)"><div class="wrap">
  <div class="center"><div class="eyebrow">Pricing</div><h2 class="h2" style="margin-top:10px">요금 안내</h2><p class="sub">파일럿으로 먼저 검증하고, 표준·기관 요금제로 확장하세요.</p></div>
  <div class="grid price" style="margin-top:48px">
    ${PLANS.map(planCard).join('\n    ')}
  </div>
  <p class="center" style="color:var(--mut);font-size:13px;margin-top:20px">* 모든 요금은 부가가치세 별도이며, 실제 계약·과금 조건은 개별 계약에 따릅니다.<br/>구독 결제 연동은 준비 중이며, 현재는 도입 문의로 진행합니다.</p>
</div></section>

<!-- PROCESS -->
<section id="lp-process"><div class="wrap">
  <div class="center"><div class="eyebrow">Process</div><h2 class="h2" style="margin-top:10px">도입 프로세스</h2><p class="sub">체계적인 프로세스로 성공적인 도입을 지원합니다.</p></div>
  <div class="proc" style="margin-top:48px">
    <div class="pstep"><div class="pnum">01</div><h4>상담 및 분석</h4><p>고객 요구사항 분석 및 맞춤 솔루션 제안</p></div>
    <div class="pstep"><div class="pnum">02</div><h4>설계 및 구축</h4><p>맞춤 시나리오 설계 및 시스템 구축</p></div>
    <div class="pstep"><div class="pnum">03</div><h4>테스트 및 검증</h4><p>철저한 테스트로 안정성·성능 검증</p></div>
    <div class="pstep"><div class="pnum">04</div><h4>운영 및 최적화</h4><p>지속적인 모니터링과 성능 최적화 지원</p></div>
  </div>
</div></section>

<!-- CTA -->
<div class="wrap" style="padding-bottom:80px"><div class="cta">
  <div><h2>D-ARS로 고객 경험을 혁신해보세요</h2><p>지금 바로 문의하시고 맞춤형 솔루션을 확인해보세요.</p></div>
  <div style="display:flex;gap:12px;flex-wrap:wrap"><a class="btn btn-primary" href="${contactHref(LEGAL_META.contactEmail, '')}">문의하기</a><a class="btn btn-ghost" href="/visual">데모 체험하기</a></div>
</div></div>

<!-- FOOTER -->
<footer><div class="wrap">
  <div class="fgrid">
    <div><div class="logo" style="color:#fff;margin-bottom:14px"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none"><rect x="1" y="9" width="3" height="6" rx="1.5" fill="#3b82f6"/><rect x="6" y="5" width="3" height="14" rx="1.5" fill="#60a5fa"/><rect x="11" y="2" width="3" height="20" rx="1.5" fill="#3b82f6"/><rect x="16" y="6" width="3" height="12" rx="1.5" fill="#60a5fa"/><rect x="21" y="9" width="2.4" height="6" rx="1.2" fill="#3b82f6"/></svg>D-ARS</div><p style="font-size:14px;max-width:280px">AI와 음성기술로 고객과 기업을 연결하는 스마트한 커뮤니케이션 솔루션.</p></div>
    <div><h5>솔루션</h5><a>AI 음성봇</a><a>보이는 ARS</a><a>통화 분석</a><a>스마트 라우팅</a></div>
    <div><h5>회사</h5><a>회사 소개</a><a>뉴스룸</a><a>파트너</a><a>채용</a></div>
    <div><h5>지원</h5><a>고객센터</a><a>도입 문의</a><a>FAQ</a><a>자료실</a></div>
  </div>
  <div class="fbottom"><span>© 2026 D-ARS. All rights reserved.</span><span class="badge-ai"><a href="/legal/privacy" class="flink">개인정보처리방침</a> · <a href="/legal/terms" class="flink">이용약관</a> · 본 서비스는 생성형 AI가 함께 응대합니다 (AI기본법 제31조)</span></div>
</div></footer>`;
export default function Home() {
  return <main suppressHydrationWarning dangerouslySetInnerHTML={{ __html: LP }} />;
}
