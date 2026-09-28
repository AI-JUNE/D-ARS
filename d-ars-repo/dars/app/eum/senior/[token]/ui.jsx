// app/eum/senior/[token]/ui.jsx — 어르신 화면 공통 표현(스타일 토큰 · 포커스 링 · 안내 패널)
//
// 왜 별도 파일인가: 만료/오류 안내는 **서버 컴포넌트(page)** 와 **클라이언트 흐름(SeniorFlow)**
// 양쪽에서 같은 모양으로 나와야 한다(토큰이 진입 시 만료된 경우 / 작성 도중 만료된 경우).
// 훅 없는 순수 표현 컴포넌트라 양쪽에서 그대로 쓸 수 있다.
//
// 디자인 요건(가이드 §6-2): 글자 18pt(=24px) 이상 · 명도 대비 4.5:1 이상 · 375px 폭 기준 1열.
// 로고·도입사례·요금표는 표시하지 않는다.
//   색과 최소 글자 크기는 lib/eumTheme.js 가 단일 출처이며, 대비 4.5:1 은 테스트가 실제 값으로
//   계산해 검증한다(tests/eumtheme.test.mjs) — 색을 손보면 테스트가 먼저 깨진다.

import { EUM_COLORS as C, EUM_MIN_FONT_PX, EUM_MIN_SUB_FONT_PX } from '@/lib/eumTheme';

// 375px 폭에서 가로 스크롤이 생기지 않게 하는 공통 규칙.
// width:100% 인 요소에 padding·border 가 더해지면 부모를 넘겨 화면이 옆으로 밀린다 → border-box 고정.
const BOX = { boxSizing: 'border-box', maxWidth: '100%' };

export const S = {
  page: {
    minHeight: '100vh',
    background: C.bg,
    color: C.text,
    fontSize: EUM_MIN_FONT_PX, // 18pt
    lineHeight: 1.6,
    fontFamily: 'system-ui, -apple-system, "Malgun Gothic", sans-serif',
    padding: '24px 16px 48px',
    ...BOX,
  },
  wrap: { maxWidth: 480, margin: '0 auto', ...BOX },
  kicker: { fontSize: EUM_MIN_SUB_FONT_PX, color: C.sub, margin: '0 0 4px' },
  h1: { fontSize: 32, lineHeight: 1.35, margin: '0 0 20px', fontWeight: 700, outline: 'none' },
  body: { fontSize: EUM_MIN_FONT_PX, margin: '0 0 20px' },
  note: { fontSize: EUM_MIN_SUB_FONT_PX, color: C.sub, margin: '0 0 20px' },
  list: { display: 'grid', gap: 16, margin: '0 0 24px' },
  choice: {
    display: 'block',
    width: '100%',
    minHeight: 72,
    padding: '18px 20px',
    fontSize: 26,
    fontWeight: 600,
    lineHeight: 1.4,
    textAlign: 'left',
    color: C.text,
    background: C.bg,
    border: `3px solid ${C.brand}`,
    borderRadius: 12,
    cursor: 'pointer',
    overflowWrap: 'break-word',
    ...BOX,
  },
  primary: {
    display: 'block',
    width: '100%',
    minHeight: 72,
    padding: '18px 20px',
    fontSize: 26,
    fontWeight: 700,
    color: C.onBrand,
    background: C.brand,
    border: `3px solid ${C.brand}`,
    borderRadius: 12,
    cursor: 'pointer',
    ...BOX,
  },
  back: {
    display: 'inline-block',
    marginTop: 8,
    fontSize: 22,
    color: C.brand,
    textDecorationLine: 'underline',
  },
  summary: {
    fontSize: 26,
    fontWeight: 600,
    padding: '18px 20px',
    border: `3px solid ${C.sub}`,
    borderRadius: 12,
    margin: '0 0 24px',
    overflowWrap: 'break-word',
    ...BOX,
  },
  alert: {
    fontSize: 22,
    color: C.onAlert,
    background: C.alertBg,
    padding: '14px 18px',
    borderRadius: 12,
    margin: '0 0 20px',
    ...BOX,
  },
  warn: {
    fontSize: 22,
    color: C.text,
    background: C.warnBg,
    border: `2px solid ${C.warnEdge}`,
    padding: '12px 16px',
    borderRadius: 12,
    margin: '0 0 20px',
    ...BOX,
  },
};

// 키보드 포커스 표시. 인라인 style 로는 :focus-visible 을 표현할 수 없어 이 화면에만 붙는
// 최소 CSS 를 둔다. 링을 요소 **바깥**(offset)에 그려 파란 버튼 위가 아니라 흰 배경 위에 놓이게
// 한다 — 그래야 대비 4.5:1(포커스색 대 배경)이 성립한다.
// 어르신 사용자는 마우스 조작이 어려운 경우가 많아 링 두께를 4px 로 크게 잡았다.
export function FocusStyles() {
  return (
    <style>{`
      .eum-focus:focus-visible {
        outline: 4px solid ${C.focus};
        outline-offset: 3px;
        border-radius: 12px;
      }
      @media (prefers-reduced-motion: no-preference) {
        .eum-focus { transition: none; }
      }
    `}</style>
  );
}

// 만료·오류 안내 패널. 되돌릴 방법이 없는 상태이므로 **버튼을 두지 않고** 다음 행동만 알려 준다
// (담당자에게 다시 요청 — 어르신이 스스로 재발급할 수단이 없기 때문).
//
//  - detail: 이미 접수된 링크로 들어왔을 때 **무엇이 접수됐는지** 한 줄로 보여 준다. 모르면
//    넘기지 않는다 — 빈 칸을 그리는 대신 아예 그리지 않는다(지어내지 않는다).
//  - hint: 다음에 무엇을 하면 되는지 한 줄(예: 바꾸려면 담당자에게). detail 과 마찬가지로
//    모르면 넘기지 않는다. 이 문장이 없으면 되돌릴 단추가 없는 화면이 **막다른 길**이 된다 —
//    어르신은 담당자에게 새 링크를 청하고, 그 링크로 낸 신청이 중복 접수가 된다.
//  - foot: 마무리 안내. 기본은 만료 안내지만, 상황에 따라 맞는 문장이 다르다
//    (이미 신청이 끝난 사람에게 "5분이 지나면 닫힙니다" 는 할 말이 아니다).
export const EUM_NOTICE_FOOT = '이 화면은 안전을 위해 5분이 지나면 닫힙니다.';

export function Notice({ title, body, detail = '', hint = '', foot = EUM_NOTICE_FOOT }) {
  return (
    <main style={S.page}>
      <div style={S.wrap}>
        <p style={S.kicker}>이음 어르신 신청</p>
        <h1 style={S.h1}>{title}</h1>
        <p style={S.body} role="status">{body}</p>
        {detail ? <p style={S.summary}>{detail}</p> : null}
        {hint ? <p style={S.body}>{hint}</p> : null}
        {foot ? <p style={S.note}>{foot}</p> : null}
      </div>
    </main>
  );
}
