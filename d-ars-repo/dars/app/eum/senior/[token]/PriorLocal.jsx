"use client";

// app/eum/senior/[token]/PriorLocal.jsx — 「이 기기에서 전에 신청하신 내용」 한 줄
//
// 왜 별도 조각인가: 이 사실은 **어르신 단말의 localStorage** 에만 있다. 그래서 이 안내는
// 브라우저에서만 지을 수 있는데, 그것이 필요한 화면 중 하나(진입 시 만료 안내)는 **서버
// 컴포넌트**다. 안내 패널(ui.jsx 의 Notice) 전체를 클라이언트로 돌리면 만료·잘린 링크까지
// 네 화면이 전부 자바스크립트에 매달리므로, **이 한 줄만** 조각으로 뗀다.
//
// 쓰는 자리는 셋이고 전부 같은 사실을 말한다(문장 끝만 상황에 따라 다르다 —
// lib/eumSenior.EUM_PRIOR_TAIL):
//   · 확인 화면(3단계)      — 누르기 직전. 중복이 실제로 만들어지는 순간이다.
//   · 작성 중 만료(SeniorFlow) · 진입 시 만료(page.jsx)
//     — 이 링크로는 더 할 일이 없는 화면. 전에 낸 것을 알려 주면 새 링크를 청하는 헛수고가 준다.
//
// 지키는 선(lib/eumSenior 의 「보조 사본을 읽는다」와 같다)
//   - **모르면 아무것도 그리지 않는다.** 저장소 값은 누구나 고칠 수 있으므로 화이트리스트
//     (parsePriorLocal)를 거치고, 활동·시간대 둘 다 규격 안일 때만 말한다.
//   - **단정하지 않는다.** 「이 기기에서」까지만 말한다 — 서버 기록이 아니다.
//   - **막지 않는다.** 단추를 두지 않고, 제출을 가로막지도 않는다.
//
// 받는 것은 sid 가 아니라 **저장소 키**다. 이 조각은 "어디를 읽을지" 만 알면 되고, sid 가
// 무엇인지 알 필요가 없다(키 조립은 lib/eumSenior.storageKey 한 곳).

import { useEffect, useState } from 'react';
import { parsePriorLocal, priorLocalNotice } from '@/lib/eumSenior';
import { S } from './ui.jsx';

export default function PriorLocal({ storeKey = '', where = '' }) {
  const [prior, setPrior] = useState(null);

  // 저장소는 **효과 안에서만** 읽는다. 서버 렌더에는 localStorage 가 없으므로 렌더 중에 읽으면
  // 서버가 그린 것과 브라우저가 그린 것이 달라져 하이드레이션이 어긋난다.
  // 시크릿 모드·저장소 차단에서도 던지지 않는다 — 안내 한 줄이 없을 뿐이다.
  useEffect(() => {
    try {
      if (storeKey) setPrior(parsePriorLocal(window.localStorage.getItem(storeKey)));
    } catch {
      /* 저장소 접근 불가 — 안내만 생략한다 */
    }
  }, [storeKey]);

  const message = priorLocalNotice(prior, where);
  if (!message) return null;
  return <p style={S.warn} role="status">{message}</p>;
}
