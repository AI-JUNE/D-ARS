// app/eum/senior/page.jsx — 토큰 없이 들어온 경우(`/eum/senior`)의 안내
//
// 왜 필요한가: 이 주소는 **문자로 받은 링크가 잘려 열렸을 때** 밟힌다. 어르신은 링크를 문자로
// 받고, 문자 앱은 긴 URL 을 줄바꿈으로 자른다 — 앞부분만 눌리면 토큰이 없는 이 주소가 열린다.
// 여태 그때 보이던 것은 Next 의 unmatched 경로 처리로 넘어간 **운영 포털의 404 화면**이었다:
// 14px 글자에 커다란 「404」, 그리고 「홈으로」·「대시보드」 단추 두 개. 어르신에게 404 는 아무
// 뜻이 없고, 두 단추는 신청과 무관한 제품 화면으로 데려간다(어르신 화면에 제품 화면을 노출하지
// 않는다는 요건과도 어긋난다). 무엇이 잘못됐고 무엇을 하면 되는지는 한 줄도 없었다.
//
// 여기서는 잘못된 링크와 **같은 말**을 한다(`EUM_TOKEN_MESSAGE.missing` 단일 출처) — 링크가
// 온전하지 않으니 담당자에게 다시 청하면 된다는 것. 어르신이 스스로 할 수 있는 일은 그것뿐이라
// 단추는 두지 않는다.
//
// 토큰을 다루지 않는다 — 검증할 것도, 소진할 것도 없다(판정은 `[token]/page.jsx` 한 곳뿐이다).

import { tokenMessage } from '@/lib/eumMessage';
import { Notice, EUM_NOTICE_FOOT } from './[token]/ui.jsx';

export const metadata = {
  // 루트 템플릿('%s · D-ARS')을 쓰지 않는다 — 어르신 화면에는 제품 브랜드를 노출하지 않는다.
  title: { absolute: '이음 어르신 신청' },
  description: '이음 어르신 신청 화면입니다.',
  robots: { index: false, follow: false },
  // 운영 포털 매니페스트(`app/manifest.js` — 이름·시작 주소·아이콘이 전부 포털)를 매달지 않는다.
  // 왜 레이아웃이 아니라 여기인지는 `app/eum/layout.jsx` 아래쪽 주석 참조(파일 규약이 덮는다).
  manifest: null,
};

export default function EumSeniorNoToken() {
  // 이 화면도 닫히지 않는다(정적 페이지) — 마무리 문구에 만료 안내를 붙이지 않는다.
  // 할 수 있는 말은 "링크를 끝까지 눌러 달라" 다(ui.jsx 의 EUM_NOTICE_FOOT 참조).
  return <Notice title="링크를 열 수 없습니다" body={tokenMessage('missing')} foot={EUM_NOTICE_FOOT.link} />;
}
