import './globals.css';

export const metadata = {
  title: 'D-ARS · 보이는 ARS 관리자',
  description: '보이는 ARS (Visual ARS) · 콜봇 연계 풀스택',
};

export default function RootLayout({ children }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
