// app/eum/senior/[token]/ui.jsx — 어르신 화면 공통 표현(스타일 토큰 · 안내 패널)
//
// 왜 별도 파일인가: 만료/오류 안내는 **서버 컴포넌트(page)** 와 **클라이언트 흐름(SeniorFlow)**
// 양쪽에서 같은 모양으로 나와야 한다(토큰이 진입 시 만료된 경우 / 작성 도중 만료된 경우).
// 훅 없는 순수 표현 컴포넌트라 양쪽에서 그대로 쓸 수 있다.
//
// 디자인 요건(가이드 §6-2): 글자 18pt(=24px) 이상 · 명도 대비 4.5:1 이상 · 375px 폭 기준 1열.
// 로고·도입사례·요금표는 표시하지 않는다.
//   대비 검증(흰 배경 #ffffff 기준): 본문 #14171a ≒ 16.6:1 · 보조 #3a4048 ≒ 9.6:1 ·
//   주버튼 배경 #0f4c81 + 흰 글자 ≒ 8.6:1 · 경고 배경 #8a2b13 + 흰 글자 ≒ 8.0:1.

export const S = {
  page: {
    minHeight: '100vh',
    background: '#ffffff',
    color: '#14171a',
    fontSize: 24, // 18pt
    lineHeight: 1.6,
    fontFamily: 'system-ui, -apple-system, "Malgun Gothic", sans-serif',
    padding: '24px 16px 48px',
  },
  wrap: { maxWidth: 480, margin: '0 auto' },
  kicker: { fontSize: 20, color: '#3a4048', margin: '0 0 4px' },
  h1: { fontSize: 32, lineHeight: 1.35, margin: '0 0 20px', fontWeight: 700 },
  body: { fontSize: 24, margin: '0 0 20px' },
  note: { fontSize: 20, color: '#3a4048', margin: '0 0 20px' },
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
    color: '#14171a',
    background: '#ffffff',
    border: '3px solid #0f4c81',
    borderRadius: 12,
    cursor: 'pointer',
  },
  primary: {
    display: 'block',
    width: '100%',
    minHeight: 72,
    padding: '18px 20px',
    fontSize: 26,
    fontWeight: 700,
    color: '#ffffff',
    background: '#0f4c81',
    border: '3px solid #0f4c81',
    borderRadius: 12,
    cursor: 'pointer',
  },
  back: {
    display: 'inline-block',
    marginTop: 8,
    fontSize: 22,
    color: '#0f4c81',
    textDecorationLine: 'underline',
  },
  summary: {
    fontSize: 26,
    fontWeight: 600,
    padding: '18px 20px',
    border: '3px solid #3a4048',
    borderRadius: 12,
    margin: '0 0 24px',
  },
  alert: {
    fontSize: 22,
    color: '#ffffff',
    background: '#8a2b13',
    padding: '14px 18px',
    borderRadius: 12,
    margin: '0 0 20px',
  },
  warn: {
    fontSize: 22,
    color: '#14171a',
    background: '#ffe9c7',
    border: '2px solid #8a5b00',
    padding: '12px 16px',
    borderRadius: 12,
    margin: '0 0 20px',
  },
};

// 만료·오류 안내 패널. 되돌릴 방법이 없는 상태이므로 **버튼을 두지 않고** 다음 행동만 알려 준다
// (담당자에게 다시 요청 — 어르신이 스스로 재발급할 수단이 없기 때문).
export function Notice({ title, body }) {
  return (
    <main style={S.page}>
      <div style={S.wrap}>
        <p style={S.kicker}>이음 어르신 신청</p>
        <h1 style={S.h1}>{title}</h1>
        <p style={S.body} role="status">{body}</p>
        <p style={S.note}>이 화면은 안전을 위해 5분이 지나면 닫힙니다.</p>
      </div>
    </main>
  );
}
