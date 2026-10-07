// app/eum/loading.jsx — 이음 화면 전용 대기 화면
//
// 고친 결함: 이 라우트에 loading 파일이 없어, 서버가 토큰을 검증하는 사이 어르신이 보던 것은
// **운영 포털의 대기 화면**(app/loading.jsx)이었다 — 13px 글자와 돌아가는 원. 요건은 18pt
// (24px) 이상이고, 어르신 화면의 모든 글자가 그 선을 지키는데 **가장 먼저 보이는 화면**만
// 예외였다. 모바일 회선에서는 이 화면이 몇 초씩 보인다(진입 화면은 force-dynamic 이라
// 매번 서버를 거친다).
//
// 움직이는 원을 쓰지 않는 이유: 어지럼·저시력에 불리하고, 무엇보다 **무슨 일이 일어나는지**
// 글자로 말하는 편이 낫다. 낭독도 되어야 하므로 role="status" 를 둔다.
//
// 문구는 손으로 적지 않는다 — 어르신 화면 문구의 단일 출처(lib/eumMessage)에 둔다.
// 이 화면은 **문서가 처음 열릴 때만** 보이므로(신청 화면은 Next 라우팅이 아니라 pushState 로
// 단계를 옮긴다) 오류 화면처럼 포커스를 옮기지 않는다 — 새 문서는 브라우저가 알아서 문서
// 앞에서 시작한다. 서버 컴포넌트라 ref 를 넘길 수도 없다(ui.jsx 의 Notice 와 같은 이유).

import { EUM_BOUNDARY_MESSAGE as M } from '@/lib/eumMessage';
import { S, EumStyles, EUM_SCOPE } from './senior/[token]/ui.jsx';

export default function EumLoading() {
  return (
    <main style={S.page} className={EUM_SCOPE}>
      <EumStyles />
      <div style={S.wrap}>
        <p style={S.kicker}>이음 어르신 신청</p>
        <h1 style={S.h1}>{M.loadingTitle}</h1>
        <p style={S.body} role="status">{M.loadingBody}</p>
      </div>
    </main>
  );
}
