'use client';

// app/eum/error.jsx — 이음 화면 전용 오류 경계
//
// 고친 결함: 이 라우트에는 오류 경계가 없어, 「이음 어르신 신청」 화면에서 무엇이 터지면
// 가장 가까운 경계가 **운영 포털의 오류 화면**(app/error.jsx)이었다. 그 화면이 어르신에게
// 보여 주던 것은
//   · 14px·17~20px 글자 — 요건은 **18pt(24px) 이상**이다.
//   · "관리자에게 문의해 주세요" — 어르신에게 '관리자'는 누구인지 알 수 없는 사람이다.
//     이 흐름에서 연락할 상대는 링크를 보낸 **담당자**다.
//   · 「대시보드」 단추 — **운영 포털로 나가는 문**이다. 어르신 화면에 제품 화면을 노출하지
//     않는다는 요건(로고·도입사례·요금표 표시 금지)과 정면으로 어긋나고, 무엇보다 한 번
//     누르면 신청 흐름 **밖으로** 나간다. 링크는 문자 안에 있고 수명은 5분이라, 돌아오는 길을
//     스스로 찾지 못하면 그대로 신청을 놓친다.
// 즉 화면 열 가지를 어르신에 맞춰 만들어 두고, **깨졌을 때 보이는 화면 하나**를 포털에 맡겨
// 두고 있었다. 오류는 드물지만 드문 것이 어르신에게만 유독 험한 화면일 이유는 없다.
//
// 여기서는 되돌릴 길을 **하나만** 준다 — 다시 시도(reset). 일시적인 오류라면 이 단추 하나로
// 신청을 이어 갈 수 있고, 링크를 새로 받을 필요도 없다. 실패가 이어지는 경우에 할 수 있는 일은
// 담당자에게 말하는 것뿐이므로 그것을 문장으로 알린다(어르신이 스스로 재발급할 수단은 없다).

import { useEffect } from 'react';
// 순수 포맷터만 가져온다(전송 로직 미사용) — 브라우저에서 외부 통신은 일어나지 않는다.
// 메시지는 buildEvent 안에서 마스킹되고 스택은 애초에 봉투에 담기지 않는다(lib/monitor 계약).
import { buildEvent, monitorLine } from '@/lib/monitor';
import { S, EumStyles, EUM_SCOPE } from './senior/[token]/ui.jsx';

// 특수 파일(error.jsx)에는 기본 export 외에 아무것도 내보내지 않는다 — route.js 규칙과 같은 취지다.
// 문구는 테스트가 소스에서 읽어 회귀를 잡는다.
const EUM_ERROR_TITLE = '화면을 불러오지 못했습니다';
const EUM_ERROR_BODY = '잠시 뒤 아래 단추를 눌러 주세요.';
const EUM_ERROR_HINT = '같은 일이 되풀이되면 담당자에게 말씀해 주세요.';
const EUM_ERROR_RETRY = '다시 시도';

export default function EumError({ error, reset }) {
  // 원인 추적: 화면에는 기술 문구를 한 줄도 내지 않고 콘솔에만 남긴다(서버 로그와 같은 봉투).
  useEffect(() => {
    if (typeof console === 'undefined') return;
    console.error(monitorLine(buildEvent({ err: error, level: 'fatal', source: 'eum-senior' })));
  }, [error]);

  return (
    <main style={S.page} className={EUM_SCOPE}>
      <EumStyles />
      <div style={S.wrap}>
        <p style={S.kicker}>이음 어르신 신청</p>
        <h1 style={S.h1}>{EUM_ERROR_TITLE}</h1>
        <p style={S.body} role="status">{EUM_ERROR_BODY}</p>
        <div style={S.list}>
          <button
            type="button"
            className="eum-focus"
            style={S.primary}
            onClick={() => {
              try {
                reset();
              } catch {
                /* reset 불가 — 아래 안내대로 담당자에게 문의하는 길이 남아 있다 */
              }
            }}
          >
            {EUM_ERROR_RETRY}
          </button>
        </div>
        <p style={S.body}>{EUM_ERROR_HINT}</p>
      </div>
    </main>
  );
}
