// app/eum/senior/[token]/page.jsx — 「이음 어르신 신청」 진입 화면(서버 컴포넌트)
//
// 이음 2R 연동(EUM_INTEGRATION.md · 가이드 §6-2): 담당자가 보낸 **1회용 링크(5분)** 로 들어오면
// 회원가입 없이 곧바로 신청 화면이 열린다. 토큰 서명 검증은 비밀키가 필요하므로 반드시 서버에서
// 하고, 실패하면 사유에 맞는 안내 화면만 보여 준다(빈 화면·무반응 금지).
//
// 기존 D-ARS 제품 화면과 완전히 분리된 라우트다. 로고·도입사례·요금표를 표시하지 않는다.

import { verifyEumToken, tokenMessage } from '@/lib/eumToken';
import { parseStep } from '@/lib/eumSenior';
import { Notice } from './ui.jsx';
import SeniorFlow from './SeniorFlow.jsx';

// 토큰 만료 판정은 요청 시각에 따라 달라진다 → 정적 캐시 금지.
export const dynamic = 'force-dynamic';

export const metadata = {
  // 루트 템플릿('%s · D-ARS')을 쓰지 않는다 — 어르신 화면에는 제품 브랜드를 노출하지 않는다.
  title: { absolute: '이음 어르신 신청' },
  description: '이음 어르신 신청 화면입니다.',
  robots: { index: false, follow: false },
};

export default async function EumSeniorPage({ params, searchParams }) {
  const result = await verifyEumToken(params?.token);

  if (!result.ok) {
    const expired = result.reason === 'expired';
    return (
      <Notice
        title={expired ? '링크가 만료되었습니다' : '링크를 열 수 없습니다'}
        body={tokenMessage(result.reason)}
      />
    );
  }

  return (
    <SeniorFlow
      sid={result.payload.sid}
      initialStep={parseStep(searchParams?.step)}
      expiresAt={result.payload.exp}
    />
  );
}
