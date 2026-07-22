import './globals.css';

const DESC = '보이는 ARS(Visual ARS) · 콜봇 연계 운영 포털 — 시나리오·실시간 세션·멀티모달 이력·UMS·리포트를 한 곳에서 관리합니다.';

export const metadata = {
  metadataBase: new URL('https://d-ars.vercel.app'),
  applicationName: 'D-ARS',
  title: { default: 'D-ARS · 보이는 ARS 관리자', template: '%s · D-ARS' },
  description: DESC,
  keywords: ['보이는 ARS', 'Visual ARS', '콜봇', 'ARS', '옴니채널', '상담', 'GOWON', 'D-ARS'],
  authors: [{ name: 'GOWON' }],
  creator: 'GOWON',
  publisher: 'GOWON',
  formatDetection: { telephone: false },
  icons: {
    icon: [{ url: '/icon.svg', type: 'image/svg+xml' }],
    shortcut: '/favicon.svg',
    apple: '/icon.svg',
  },
  appleWebApp: { capable: true, title: 'D-ARS', statusBarStyle: 'default' },
  openGraph: {
    type: 'website', locale: 'ko_KR', siteName: 'D-ARS',
    url: 'https://d-ars.vercel.app',
    title: 'D-ARS · 보이는 ARS 관리자', description: DESC,
  },
  twitter: { card: 'summary', title: 'D-ARS · 보이는 ARS 관리자', description: DESC },
  // 내부 운영 포털: 검색 색인 차단(robots.js 의 전면 disallow 와 일관 · 개인정보/운영정보 노출 방지).
  // meta robots 태그도 noindex/nofollow 로 명시해 robots.txt 를 무시하는 크롤러까지 차단.
  robots: {
    index: false,
    follow: false,
    googleBot: { index: false, follow: false },
  },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#be5535',
};

export default function RootLayout({ children }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
