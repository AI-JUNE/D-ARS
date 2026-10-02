// app/eum/senior/[token]/page.jsx — 「이음 어르신 신청」 진입 화면(서버 컴포넌트)
//
// 이음 2R 연동(EUM_INTEGRATION.md · 가이드 §6-2): 담당자가 보낸 **1회용 링크(5분)** 로 들어오면
// 회원가입 없이 곧바로 신청 화면이 열린다. 토큰 서명 검증은 비밀키가 필요하므로 반드시 서버에서
// 하고, 실패하면 사유에 맞는 안내 화면만 보여 준다(빈 화면·무반응 금지).
//
// 기존 D-ARS 제품 화면과 완전히 분리된 라우트다. 로고·도입사례·요금표를 표시하지 않는다.
//
// 이미 접수된 링크로 다시 들어오면 **여기서 바로** 알려 준다. 예전에는 소진 판정이 제출
// 시점에만 있어, 이미 신청을 마친 어르신이 같은 링크를 다시 열면 멀쩡한 첫 화면이 나왔다.
// 활동을 고르고 시간을 고르고 확인까지 마친 **뒤에야** 409 가 돌아온다 — 세 화면을 헛걸음한
// 것이고, 그 사이 어르신은 신청을 바꾸고 있다고 믿는다(바뀌지 않는다). 첫 화면에서 말해 주면
// 헛걸음도 오해도 생기지 않는다.
//
// 화면에는 절대 만료시각(exp)이 아니라 **남은 기간(remainingMs)** 만 넘긴다. 절대 시각을 주면
// 화면이 그것을 어르신 **기기 시계**와 비교하게 되고, 기기 시계가 몇 분만 앞서도 서버가 유효하다고
// 판정한 링크가 첫 렌더에서 만료로 덮인다(재발급해도 같은 결과 — lib/eumCountdown.js 참조).

import { verifyEumToken, tokenMessage } from '@/lib/eumToken';
import { parseDraft, parseStep, summaryText } from '@/lib/eumSenior';
import {
  consumeKey,
  consumeStore,
  consumeMessage,
  EUM_CONSUME_CHANGE_HINT,
  EUM_CONSUME_UNKNOWN_HINT,
} from '@/lib/eumConsume';
import { Notice } from './ui.jsx';
import SeniorFlow from './SeniorFlow.jsx';

// 토큰 만료 판정은 요청 시각에 따라 달라진다 → 정적 캐시 금지.
export const dynamic = 'force-dynamic';

export const metadata = {
  // 루트 템플릿('%s · D-ARS')을 쓰지 않는다 — 어르신 화면에는 제품 브랜드를 노출하지 않는다.
  title: { absolute: '이음 어르신 신청' },
  description: '이음 어르신 신청 화면입니다.',
  robots: { index: false, follow: false },
  // 운영 포털 매니페스트(`app/manifest.js` — 이름·시작 주소·아이콘이 전부 포털)를 매달지 않는다.
  // 왜 레이아웃이 아니라 여기인지는 `app/eum/layout.jsx` 아래쪽 주석 참조(파일 규약이 덮는다).
  manifest: null,
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

  // 소진 기록은 인메모리·인스턴스 로컬이다(EUM_INTEGRATION.md 「알려진 한계」). 기록을 못 찾으면
  // 이 안내를 건너뛸 뿐, 판정 자체가 사라지지는 않는다 — 제출은 여전히 라우트가 409 로 막는다.
  // 즉 이 화면은 **빠른 안내**이지 보안 경계가 아니다.
  const linkKey = consumeKey(params?.token);
  const record = linkKey ? consumeStore().recordOf(linkKey) : { used: false, note: null };
  if (record.used) {
    // 완료 화면(SeniorFlow)과 **같은 말**을 한다. 예전에는 여기서 "이미 접수됐다" 까지만 말하고
    // 끝나, 마음을 바꾼 어르신에게는 막다른 길이었다 — 화면에 단추가 없으니 담당자에게 새 링크를
    // 청하고, 새 링크는 소진 키가 달라 재신청이 통한다. 중복 접수를 막으려고 만든 화면이 중복을
    // 만들던 셈이다. 무엇이 접수됐는지 아는지에 따라 할 말이 다르다(요약은 지어내지 않는다).
    const summary = summaryText(record.note);
    return (
      <Notice
        title="이미 신청하셨습니다"
        body={consumeMessage('used')}
        detail={summary}
        hint={summary ? EUM_CONSUME_CHANGE_HINT : EUM_CONSUME_UNKNOWN_HINT}
        foot="이제 이 화면을 닫으셔도 됩니다."
      />
    );
  }

  // 고른 것도 주소에서 되살린다 — 탭이 되살아나며 다시 불러와져도 처음부터 고르지 않게.
  // 주소는 누구나 고칠 수 있으므로 parseDraft 가 화이트리스트로 거르고(규격 밖은 빈 값),
  // 화면의 clampStep 이 남은 선택만큼으로 단계를 되돌린다. 완료 상태는 주소에 없다.
  return (
    <SeniorFlow
      sid={result.payload.sid}
      token={params.token}
      initialStep={parseStep(searchParams?.step)}
      initialDraft={parseDraft(searchParams)}
      remainingMs={result.remainingMs}
    />
  );
}
