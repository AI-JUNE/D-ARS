// app/visual/layout.jsx — 라우트 메타데이터 전용 셸.
// /visual 페이지는 클라이언트 컴포넌트('use client')라 metadata 를 직접 내보낼 수 없어,
// 서버 레이아웃에서 문서 제목을 부여한다(WCAG 2.4.2 Page Titled · 루트 템플릿 '%s · D-ARS' 적용).
export const metadata = {
  title: '보이는 ARS 데모',
  description: 'D-ARS(보이는 ARS) 공개 데모 — 세대별 고객 화면 흐름을 브라우저에서 체험합니다.',
};

export default function VisualLayout({ children }) {
  return children;
}
