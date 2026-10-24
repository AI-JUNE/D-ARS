// ============================================================================
// plans.js — D-ARS 요금제 정본 데이터(한 벌)
//
// 왜 분리하나: 같은 제품의 두 공개 화면이 요금을 각자 적고 있었다. 랜딩(`app/page.jsx`)은
//   Starter·Business·Enterprise 라는 이름으로 「월 1,000건 통화」·「월 5,000건 통화」·
//   「무제한 통화」·「24/7 전담 지원」을 적었고, 요금 페이지(`app/pricing`)는 파일럿·표준·기관
//   이라는 **다른 이름**과 다른 포함 항목을 적었다. 랜딩의 그 건수·지원 조건은 제품 어디에도
//   근거가 없는 지어낸 수치이고, 고객이 먼저 보는 화면과 계약 조건을 적는 화면이 서로 다른
//   말을 하면 그 자체가 틀린 안내다. 이름·금액·단위·포함 항목은 이제 이 파일에서만 적는다.
//
// ⚠️ [승인 필요] 금액은 안내용 초안이다. 구독 결제는 승인·검수 전까지 비활성이며, 유료 플랜의
//   CTA 는 결제가 아니라 도입 문의(메일)로 연결한다 — 약관 제5조 ④항과 같은 줄이다.
//
// 화면이 쓰는 칸:
//   name·price·unit·sub·feats — 두 화면이 그대로 그린다(랜딩은 feats 를 전부 보여준다).
//   cta·href — 'contact' 는 도입 문의 메일(수신 주소는 `lib/legalContent.LEGAL_META`).
//   highlight — 추천 표시. 한 플랜에만 둔다.
// ============================================================================

export const PLANS = [
  {
    id: 'pilot', name: '파일럿', price: '무료', unit: '체험',
    sub: '도입 전 기능 검증',
    feats: ['데모 데이터로 전체 기능 체험', '보이는 ARS 화면 미리보기', '시나리오 1종·기본 통계', '이메일 문의 지원'],
    cta: '무료로 체험', href: '/dashboard', highlight: false,
  },
  {
    id: 'standard', name: '표준', price: '290,000', unit: '원/월(부가세 별도)',
    sub: '중소 규모 콜센터·복지 상담',
    feats: ['실시간 세션 모니터링', '시나리오 빌더·필요서류 안내', 'UMS 발송·통계 리포트', '콜봇(STT·LLM·TTS·CTI) 연계', '표준 SLA·접근/감사 로그'],
    cta: '도입 문의', href: 'contact', highlight: true,
  },
  {
    id: 'org', name: '기관', price: '맞춤 견적', unit: '공공·대규모',
    sub: '지자체·공공기관·대형 사업',
    feats: ['이상징후 스코어링·자동 연계', '전용 DB·데이터 보관정책 협의', '전용 지원·맞춤 SLA', '온프레미스/전용 클라우드 옵션', '보안·개인정보 위탁 계약'],
    cta: '견적 문의', href: 'contact', highlight: false,
  },
];

// 도입 문의 메일 주소를 만드는 자도 한 벌이다 — 두 화면이 제목 규격까지 같게 쓴다.
// 플랜 이름을 주지 않으면(랜딩 맨 아래 「문의하기」처럼 플랜을 고르기 전이면) 제목에 넣지 않는다.
export function contactHref(email, planName) {
  const subject = planName ? `D-ARS ${planName} 도입 문의` : 'D-ARS 도입 문의';
  return `mailto:${email}?subject=${encodeURIComponent(subject)}`;
}
