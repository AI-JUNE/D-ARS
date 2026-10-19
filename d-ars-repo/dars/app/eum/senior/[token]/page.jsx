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

import { verifyEumToken } from '@/lib/eumToken';
// 안내 문구는 비밀을 모르는 자리에서 가져온다 — 브라우저에서 도는 화면(SeniorFlow)도 같은
// 표를 가리켜야 하고, 그 화면은 `lib/eumToken` 을 import 할 수 없다(lib/eumMessage.js 참조).
// 제목도 같은 자리에서 가져온다 — 예전에는 네 파일이 각자 적었고, 만료 패널은 제목이 본문의
// 첫 문장과 글자까지 같았다(제목으로 포커스가 간 직후 같은 말을 한 번 더 듣는다).
// 「이미 접수됐다」 뒤에 붙는 힌트 두 줄도 같은 표에서 온다 — 예전에는 소진 판정 모듈
// (`lib/eumConsume`)에 있었고, 그래서 브라우저에서 도는 완료 화면이 그 문장 두 줄을 얻으려고
// 서버 쪽 판정 모듈을 import 하고 있었다(lib/eumMessage 의 그 자리 주석 참조).
import {
  EUM_CONSUME_CHANGE_HINT,
  EUM_CONSUME_UNKNOWN_HINT,
  EUM_DONE_NEXT,
  EUM_DONE_STATE,
  EUM_PANEL_ASK,
  panelTitle,
} from '@/lib/eumMessage';
import { parseDraft, parseStep, storageKey, summaryText } from '@/lib/eumSenior';
import { consumeKey, consumeStore } from '@/lib/eumConsume';
import { Notice, EUM_NOTICE_FOOT } from './ui.jsx';
import SeniorFlow from './SeniorFlow.jsx';
import PriorLocal from './PriorLocal.jsx';

// 토큰 만료 판정은 요청 시각에 따라 달라진다 → 정적 캐시 금지.
export const dynamic = 'force-dynamic';

// head 는 `app/eum/layout.jsx` 가 단일 출처다. 여기 적는 것은 **레이아웃이 말할 수 없는 것**뿐이다.
//
// 고친 결함: 이 자리에 `description`·`robots` 가 레이아웃과 **따로** 적혀 있었다. metadata 는
// 최상위 키 단위로 대체되므로(8회차가 루트↔레이아웃 방향에서 고정한 바로 그 성질), 여기 적힌
// `robots: { index:false, follow:false }` 가 레이아웃의 `googleBot` 까지 든 선언을 **통째로**
// 밀어냈다 — 빌드 산출물에서 `/eum` 에는 `<meta name="googlebot">` 이 있고 토큰이 든 주소
// (`/eum/senior`·`/eum/senior/[token]`·`/eum/[...rest]`)에는 **없었다**. 하필 그 셋이 주소 자체가
// 인증 수단인 쪽이다. 같은 사실을 네 page 가 각자 적는 동안 셋만 약해졌고, 아무 신호도 없었다.
export const metadata = {
  // 제목만 **리터럴로** 남긴다 — 브랜드 누출 대조가 각 page 의 소스에 적힌 글자를 읽어
  // 판정하므로 이 한 줄은 상수로 빼지 않는다(tests/eumseniorui.test.mjs).
  title: { absolute: '이음 어르신 신청' },
  // 운영 포털 매니페스트(`app/manifest.js` — 이름·시작 주소·아이콘이 전부 포털)를 매달지 않는다.
  // 왜 레이아웃이 아니라 여기인지는 `app/eum/layout.jsx` 아래쪽 주석 참조(파일 규약이 덮는다).
  manifest: null,
};

export default async function EumSeniorPage({ params, searchParams }) {
  const result = await verifyEumToken(params?.token);

  if (!result.ok) {
    const expired = result.reason === 'expired';
    // 마무리 문구는 사유에 따라 다르다. 예전에는 둘 다 기본값("5분이 지나면 닫힙니다")을 받았는데,
    // 만료된 사람에게 5분은 **이미 지났고** 잘못된 링크에는 열린 5분이 애초에 없었다(ui.jsx 참조).
    //
    // 만료 화면은 거기서 끝이었다 — 「담당자에게 다시 요청해 주세요」 한 줄. 그런데 신청을 이미
    // 마친 어르신이 링크가 죽은 뒤 다시 열면 그 안내는 **헛수고로 가는 길**이다(소진 기록은
    // 토큰과 함께 사라져 서버는 전에 신청했는지 답할 수 없다 — 「알려진 한계」). 그 기기에는
    // 보조 사본이 남아 있으므로, 전에 낸 내용을 아는 경우에만 한 줄 더 말한다.
    // 여기는 서버 컴포넌트라 localStorage 를 읽을 수 없어 그 한 줄만 조각으로 뗐다(PriorLocal).
    // 사유가 만료일 때만 둔다: 잘못된 링크에는 sid 가 없고(서명이 검증되지 않았다) 지어내지 않는다.
    //
    // 제목·본문은 **같은 사실을 두 번 말하지 않는다**. 예전에는 제목을 이 파일이 손으로 적고
    // (「링크가 만료되었습니다」·「링크를 열 수 없습니다」) 본문은 `tokenMessage(reason)` 를
    // 받았는데, 만료 쪽은 그 둘이 **글자까지 같았다** — 제목으로 포커스가 옮겨 간 직후
    // (ui.jsx 의 Notice) 어르신은 같은 문장을 한 번 더 듣고, 눈으로는 24px 넘는 글자 두 줄이
    // 같은 말을 한다. 지금은 제목이 **무엇이 잘못됐는가**, 본문이 **무엇을 하면 되는가**다
    // (lib/eumMessage 의 EUM_PANEL_TITLE·EUM_PANEL_ASK — 알림 한 줄에 쓰이는 tokenMessage 는
    // 제목이 없는 자리라 두 토막을 그대로 이어 쓴다).
    return (
      <Notice
        title={panelTitle(result.reason)}
        body={EUM_PANEL_ASK}
        foot={expired ? EUM_NOTICE_FOOT.expired : EUM_NOTICE_FOOT.link}
      >
        {expired ? <PriorLocal storeKey={storageKey(result.sid)} where="expiredEntry" /> : null}
      </Notice>
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
    //
    // 제목·본문은 **한 토막에서 나눠** 쓴다. 예전에는 제목이 「이미 신청하셨습니다」,
    // 본문이 「**이미 신청이 접수되었습니다**. 담당자가 곧 전화로 안내해 드립니다」로
    // 같은 사실을 두 번 말했다(제목으로 포커스가 옮겨 간 직후 같은 말을 한 번 더 듣는다).
    // 그때 남긴 이유는 「본문이 완료 화면과 **같은 문장**이어야 한다」는 13회차의 계약이
    // 먼저였기 때문인데, 그 계약을 깨지 않는 길은 이 화면군이 이미 두 번 쓴 수단이었다 —
    // 만료 패널의 `EUM_PANEL_TITLE`/`EUM_PANEL_ASK` 와 만료 임박 경고의 두 토막이다.
    // 지금 제목은 **무엇이 이미 되어 있는가**, 본문은 **다음에 무슨 일이 일어나는가**이고,
    // 둘을 이어 붙인 문장이 곧 완료 화면·409 응답의 그 문장이다(글자는 한 자도 다르지
    // 않다 · lib/eumMessage 의 EUM_DONE_STATE·EUM_DONE_NEXT).
    const summary = summaryText(record.note);
    return (
      <Notice
        title={EUM_DONE_STATE.already}
        body={EUM_DONE_NEXT}
        detail={summary}
        hint={summary ? EUM_CONSUME_CHANGE_HINT : EUM_CONSUME_UNKNOWN_HINT}
        foot={EUM_NOTICE_FOOT.done}
      >
        {/* 서버가 **접수 내용을 모를 때만** 그 기기가 아는 것을 말한다. 위 힌트는 그때
            「접수된 내용은 담당자에게 확인해 주세요」로 끝나는데, 그 기기에는 사본이 남아
            있을 수 있다 — 접수가 끝난 어르신에게 걸게 만든 그 전화가 담당자에게는 새 링크를
            보내는 일이 되고, 새 링크는 소진 키가 달라 재신청이 통한다(명단에 두 건).
            서버가 아는 경우에는 두지 않는다: 그때 위 `detail` 이 이미 **서버 기록**을 요약으로
            그리고 있으므로, 기기 사본을 한 줄 더 놓으면 같은 말이 두 번이거나 둘이 어긋날 때
            어느 쪽이 접수된 것인지 가릴 수 없게 된다(원본은 서버다). */}
        {summary ? null : <PriorLocal storeKey={storageKey(result.payload.sid)} where="usedEntry" />}
      </Notice>
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
