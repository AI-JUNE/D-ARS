'use client';
// app/global-error.jsx — **루트 레이아웃 수준 오류의 최종 폴백**(Next.js App Router 규약 파일).
//
// 왜 필요한가: `app/error.jsx` 는 루트 레이아웃 "아래"의 오류만 잡는다. 루트 레이아웃 자체가
// 렌더에 실패하면 이 파일이 없을 경우 **Next 기본 영문·무스타일 오류 화면**이 그대로 노출된다
// (상용/공공 납품 기준 미달). global-error 는 그 마지막 빈 표면을 브랜드 한국어 화면으로 채운다.
//
// 규약: 이 컴포넌트는 루트 레이아웃을 "대체"하므로 html·body 요소를 스스로 렌더해야 한다.
// 주의: 루트 레이아웃이 무너진 상황이라 globals.css(CSS 변수) 로드를 보장할 수 없다
//   → **모든 색·서체를 리터럴로 내장**(브랜드 #be5535 · 배경 #fbf3ef), next/link 등 의존 0.
// 위험도: 신규 파일 1개 · 정상 경로에는 절대 렌더되지 않음(오류 시에만) → 회귀 위험 0.

import { useEffect } from 'react';

export default function GlobalError({ error, reset }) {
  // 원인 추적: 콘솔에만 남긴다(화면에 스택·메시지 미노출 — 내부 정보 유출 방지, error.jsx 와 동일 정책).
  useEffect(() => { if (typeof console !== 'undefined') console.error(error); }, [error]);
  return (
    <html lang="ko">
      <body style={{margin:0,minHeight:'100dvh',display:'grid',placeItems:'center',padding:'24px',
        boxSizing:'border-box',background:'#fbf3ef',color:'#33231d',
        fontFamily:'"Segoe UI","Malgun Gothic","맑은 고딕",system-ui,sans-serif'}}>
        <div style={{maxWidth:460,width:'100%',textAlign:'center',background:'#fff',
          border:'1px solid #ecd9d0',borderRadius:16,padding:'40px 26px',
          boxShadow:'0 10px 30px rgba(190,85,53,.08)'}}>
          <div aria-hidden="true" style={{width:64,height:64,margin:'0 auto 18px',borderRadius:'50%',
            display:'grid',placeItems:'center',fontSize:30,background:'#f7e5dd',color:'#c0392b'}}>⚠️</div>
          <h1 style={{margin:'0 0 8px',fontSize:'clamp(17px,5vw,20px)',wordBreak:'keep-all'}}>
            일시적인 오류가 발생했어요
          </h1>
          <p style={{margin:'0 0 22px',fontSize:14,color:'#8a6f64',lineHeight:1.55,wordBreak:'keep-all'}}>
            화면을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.
            문제가 계속되면 관리자에게 문의해 주세요.
          </p>
          <div style={{display:'flex',gap:10,justifyContent:'center',flexWrap:'wrap'}}>
            <button type="button" onClick={() => reset()} style={{background:'#be5535',color:'#fff',
              border:'1px solid #be5535',borderRadius:9,padding:'10px 16px',fontWeight:700,
              fontSize:14,cursor:'pointer'}}>다시 시도</button>
            {/* 루트 레이아웃 부재 상황이므로 next/link 대신 일반 앵커(전체 새로고침이 오히려 복구에 유리) */}
            <a href="/" style={{background:'#fff',color:'#33231d',border:'1px solid #ecd9d0',
              borderRadius:9,padding:'10px 16px',fontWeight:700,fontSize:14,
              textDecoration:'none',display:'inline-block'}}>홈으로</a>
          </div>
        </div>
      </body>
    </html>
  );
}
