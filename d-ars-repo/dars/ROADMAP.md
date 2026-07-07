# D-ARS 개발 로드맵 (자동 개발 백로그)

라이브: https://d-ars.vercel.app · 저장소: github.com/AI-JUNE/D-ARS (소스: `d-ars-repo/dars/`)
스택: Next.js(App Router) + Neon(Postgres) + Vercel. 운영: GOWON.

## 디자인 원칙 (모든 작업 공통 · 최우선)
- 모바일 우선. 레이아웃 **절대 깨짐·겹침 금지**. 데스크톱/모바일 모두 품질 극대화.
- 반응형: 데스크톱 사이드바 / 모바일 드로어 + 하단 탭. 테이블은 카드 내 가로 스크롤.
- 참고 서비스 UI/UX를 D-ARS에 맞게 반영:
  - prism-pms.vercel.app/tasks — 다중 뷰(표/보드/타임라인/캘린더), 그룹화, 필터, CSV/Excel 내보내기, 진척바, 마감 경고
  - eum-app.vercel.app — 히어로 랜딩, 역할 진입 카드, 통계 카운터 애니메이션, 큰글씨 접근성, 따뜻한 카드 디자인
  - callbot-portal.vercel.app — 리치 관리자, 모바일 하단탭, 실시간 보드
  - gowon.co.kr — 코퍼레이트 톤/브랜드
- 브랜드 컬러 #be5535 유지. 각 변경 후 `next build` 통과 필수.

## 완료
- [x] 기획서·개발 명세서, 관리자 포털(단일 HTML), 풀스택(Next+Neon+API+시드)
- [x] GitHub→Vercel 자동배포, 모바일 반응형(드로어·하단탭·큰글씨), 랜딩(역할 진입·통계 카운터), 고객 보이는 ARS
- [x] 앱 라우터 견고성·품질: 브랜드형 404(not-found)·오류 바운더리(error·재시도)·로딩 상태(loading) + 루트 viewport/theme-color(#be5535) — eum-app 따뜻한 카드 톤 반영, 모바일 무붕괴
- [x] 표 검색·정렬(prism-pms 반영): 서류·UMS 화면 실시간 검색 + 컬럼 정렬(오름/내림/해제, 한글·숫자 자연 정렬) · 내보내기(CSV·Excel·PDF)는 현재 검색·정렬 결과 반영 · 모바일 무붕괴
- [x] 포털 라우트 스켈레톤 로딩(콘텐츠형 · 섹션헤더/KPI/표 골격 shimmer, 레이아웃 시프트 무붕괴 · prefers-reduced-motion 존중) + 키보드 본문 바로가기(skip-link, eum-app 접근성) + sr-only 유틸 — 야간 자동 품질 개선
- [x] 실시간 세션 보드 검색·정렬(prism-pms 반영): 세션ID·고객·시나리오·노드 실시간 검색 + 컬럼 정렬(오름/내림/해제, 한글·숫자 자연 정렬) · 내보내기(CSV·Excel·PDF) 검색·정렬 결과 반영 · SSE 실시간 갱신 유지 · 모바일 무붕괴
- [x] 브랜드 favicon(`/icon.svg`)·**PWA manifest**(홈화면 추가·standalone·theme #be5535)·SEO/소셜 메타데이터 강화(metadataBase·title 템플릿·openGraph ko_KR·twitter·robots·appleWebApp) — 레이아웃 무영향(무붕괴) 품질 개선
- [x] **대시보드 인포그래픽 개편**: 공통 애니메이션 차트 라이브러리 `lib/charts.jsx`(그라데이션 **영역차트**-라인 드로우·호버 툴팁, **그룹 막대**-바닥 그로우·툴팁·범례, **도넛**-원호 스윕·중앙 카운트업, **채워지는 진행바**-퍼센트 카운트업) · KPI 카드 아이콘/그라데이션 액센트/스파크라인/카운트업/등장 스태거 — 모바일 무붕괴·`prefers-reduced-motion` 존중 (통계·리포트로 확산 예정)

## 다음 스프린트 (우선순위 순 — 한 번에 1~2개씩)
1. [x] 시나리오 **보드/타임라인/캘린더 뷰** + 상태 그룹화(prism 반영)
2. [x] **CSV 내보내기** 공통 유틸(시나리오·서류·세션·UMS·멀티모달 이력) + [x] **Excel(.xls) 내보내기**(의존성 없는 SpreadsheetML, 한글·전화번호 서식 보존, 5개 화면) + [x] **PDF 내보내기**(의존성 없는 브라우저 인쇄·숨김 iframe, 브랜드 리포트 서식·짝수행 음영·마스킹 표기, 5개 화면 공통 유틸 `printPDF`) + [x] **날짜 스탬프 파일명**(`stampFilename` — 일별 내보내기 덮어쓰기 방지·감사 추적, CSV·Excel 공통)
3. [x] **로그인 · RBAC**: `/login`(브랜드 로그인) · **HMAC 서명 세션 쿠키**(httpOnly·SameSite=Lax·Web Crypto, Edge/Node 겸용) · **역할별 접근 미들웨어**(viewer<operator<admin, 경로별 최소역할: /launcher=admin·/ums·/scenarios·/docs·/templates=operator) · `/api/auth/login|logout|me` · 사용자 메뉴 실연동(이름·역할·로그아웃) — 운영자 승인 반영(2026-07-07). **안전장치: 기본은 데모 통과(페일오픈), 운영자가 `AUTH_ENFORCE=1` + `AUTH_SECRET`/`AUTH_USERS` 설정 시 실제 접근 차단 활성화** → 라이브 데모 무붕괴
4. [x] **세션 실시간 동기** (SSE 스트림 `/api/sessions/stream`, 콜봇 이벤트 스키마) + **세션 write API** POST `/api/sessions`(launch/progress/complete/drop → Neon upsert, 데모 폴백) — 세션 페이지 EventSource+폴링 폴백·실시간 연결 표시. 서버리스 수명 한계로 WebSocket 대신 SSE 채택
5. [x] **알림 센터 · 연동 상태 · FAQ/도움말** 페이지 — FAQ·도움말(/help, 연동 상태 카드) · 알림 센터(/notifications: 서류 완료율·UMS 실패·장기 세션·이탈률 자동 도출, 심각도 정렬, 헤더 벨 배지, 읽음 관리)
6. [x] 대시보드 고도화: [x] 일별 운영추이 막대차트(멀티모달·완료·이탈) · [x] KPI 카운트업 애니메이션(대시보드·통계, prefers-reduced-motion 존중) · [x] PDF 리포트(/report: 일별추이·서비스완료율·세션 스냅샷, 브라우저 인쇄로 PDF 저장, 인쇄 전용 CSS)
7. [x] 화면 템플릿·런처 설정·멀티모달 이력 페이지 이식(단일 HTML 포털 → Next) — [x] 멀티모달 이력(/history: 채널 필터·검색·완료율/이탈 KPI·CSV, /api/multimodal 폴백) · [x] 화면 템플릿(/templates: 노드별 표출 카드 갤러리) · [x] 런처 설정(/launcher: 표출 트리거·SMS 초대 문구·브랜딩·폴백/타임아웃, 휴대폰 목업 라이브 미리보기)
8. [x] 전 화면 모바일 QA: 320/375/414px 오버랩·잘림 점검 — 보이는 ARS 데모(/visual) 반응형 프레임(min(390px,100%)·min(720px,80vh)) + 전역 하드닝: 긴 문자열 word-break, 사용자 메뉴 뷰포트 폭 캡, 런처 미리보기 모바일 sticky 해제(겹침 방지), 초소형(≤360px) 노드/세그 버튼 여백 축소

## 작업 규칙
- 각 작업: 구현 → `npm run build` 검증 → 커밋 → (가능 시) push → 배포 확인.
- 리스크 큰 변경(인증/삭제/과금/스키마 파괴)만 사용자 컨펌.
