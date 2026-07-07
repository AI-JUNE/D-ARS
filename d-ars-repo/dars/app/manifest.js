export default function manifest() {
  return {
    name: 'D-ARS · 보이는 ARS 관리자',
    short_name: 'D-ARS',
    description: '보이는 ARS(Visual ARS) · 콜봇 연계 운영 포털',
    start_url: '/dashboard',
    display: 'standalone',
    orientation: 'portrait',
    lang: 'ko',
    background_color: '#fbf3ef',
    theme_color: '#be5535',
    icons: [
      { src: '/icon.svg', type: 'image/svg+xml', sizes: 'any', purpose: 'any' },
      { src: '/icon.svg', type: 'image/svg+xml', sizes: 'any', purpose: 'maskable' },
    ],
  };
}
