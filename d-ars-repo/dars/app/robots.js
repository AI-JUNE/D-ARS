// app/robots.js — 내부 운영 포털: 검색엔진 색인 차단(개인정보/운영정보 노출 방지)
// D-ARS는 콜봇 연계 관리자 포털이므로 공개 색인이 불필요하며, 크롤러 전면 차단이 안전합니다.
export default function robots() {
  return {
    rules: [{ userAgent: '*', disallow: '/' }],
    sitemap: undefined,
  };
}
