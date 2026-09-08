# 이음 2R 연동 과제 — 어르신 선택 화면 (가이드 §6-2)

D-ARS 를 **「이음 어르신 신청」 화면 하나로 축소**한 별도 라우트를 만든다. 기존 D-ARS 제품은 그대로 두고, `/eum/senior/[token]` 경로만 추가한다.

## 요건
- 1회용 토큰 링크(5분 만료), 회원가입 없음
- 글자 18pt 이상, 버튼 한 화면 4개 이내, 명도 대비 4.5:1
- 화면 흐름: 희망 활동(4개 중 택) → 희망 시간대(4개 중 택) → 확인 → 완료
- 완료 시 `POST {EUM_API}/seniors/{id}/preferences` (토큰 검증) — 실연결 전엔 콘솔 로그 + 로컬 저장
- 페이지 제목 「이음 어르신 신청」. 로고·도입사례·요금표 **표시 금지**
- 음성(콜봇)과 화면 단계가 어긋나지 않도록 `step` 을 URL 상태로 유지

## 과제
- [x] `app/eum/senior/[token]/page.jsx` — 위 흐름 구현
      (page.jsx 서버 토큰 검증 + SeniorFlow.jsx 4단계 · `tests/eumsenior.test.mjs` 10건)
- [x] `lib/eumToken.js` — 토큰 발급·검증·만료(5분). 테스트 동반
      (`tests/eumtoken.test.mjs` 10건 — 위조·만료·형식 파손 포함)
- [x] 접근성 — 키보드 조작, aria-label, 375px 검증
      (`:focus-visible` 링·단계 전환 시 제목 포커스 이동·`aria-live` 단계 낭독,
       width:100% 요소 border-box 로 375px 가로 스크롤 제거 · `tests/eumseniorui.test.mjs` 13건,
       색 대비 4.5:1 은 `lib/eumTheme.js` 실측 계산 · `tests/eumtheme.test.mjs` 9건)
- [x] 빈 상태·만료 상태 화면("링크가 만료되었습니다. 담당자에게 다시 요청해 주세요")
      (진입 시 만료 → `page.jsx` Notice / 작성 중 만료 → `SeniorFlow` Notice, 문구는 `EUM_TOKEN_MESSAGE` 단일 출처)

## 남은 승인 사항
- **[승인 필요] 이음 API 실연결** — 현재 제출은 콘솔 로그 + 브라우저 로컬 저장까지만 한다.
  실연결 시 `SeniorFlow.submit()` 의 저장 자리를 `POST {EUM_API}/seniors/{id}/preferences` 로 교체한다.
- **[승인 필요] `EUM_TOKEN_SECRET` 설정** — 미설정 시 `AUTH_SECRET`, 그것도 없으면 데모 기본값을
  쓴다. 실운영 링크 발급 전에 반드시 전용 비밀값을 넣어야 한다.

## 검증 메모(2026-09-08)
- `node --test "tests/*.test.mjs"` 803건 전부 통과.
- `npx next build` 는 이 실행 환경에서 시간 초과로 완주하지 못했다 — 대신 ESLint(next 설정)로
  해당 라우트와 `lib/eumTheme.js` 를 검사해 경고·오류 0건을 확인했다. 실배포 빌드는 Vercel 이 판정한다.
- 375px 실제 렌더 확인은 유효 토큰 링크가 필요해 소스 불변식(테스트)으로 대신했다.
