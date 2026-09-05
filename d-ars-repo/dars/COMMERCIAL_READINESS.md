# 상용 출시 잔여 과제 (COMMERCIAL READINESS)

작성 2026-09-01. **이 문서는 자동 개발의 최우선 백로그다.** 위에서부터 소진한다.

## 원칙
- `[ ]` 미완, `[x]` 완료. 완료 시 근거(파일·테스트)를 한 줄로 남긴다.
- **build now, activate on approval**: 코드는 끝까지 만들되 실인증·실결제·실개인정보·실발신 **활성화는 사람 승인**. 스위치는 환경변수로 분리하고 기본 OFF.
- 임의 성과·KPI 수치를 화면·문서에 넣지 않는다. 실측 전에는 기능 서술로 쓴다.
- 모든 변경은 테스트·빌드 검증 통과 후 커밋한다.

## 공통 상용 필수 (전 제품)
- [x] **에러 모니터링** — 전역 에러 캡처 + 알림 훅. DSN은 환경변수, 미설정 시 무해하게 no-op
  - 근거: `lib/monitor.js`(PII 마스킹·지문 스로틀·`MONITOR_DSN` 미설정 시 콘솔 한 줄만 · throw 없음) + `tests/monitor.test.mjs` 14케이스, 배선 `app/api/health/route.js`·`app/error.jsx`. 실제 DSN 주입은 **[승인 필요]**
- [x] **구조화 로깅** — 요청 ID·소요시간·에러코드. PII 미기록
  - 근거: `lib/log.js`(고정 스키마 `ts·level·requestId·method·path·status·durationMs·code·msg·env` · 쿼리스트링 통째 폐기 · `scrubText` 재사용으로 마스킹 규칙 단일화 · throw 없음) + `tests/log.test.mjs` 22케이스, 배선 `app/api/health/route.js`(`X-Request-Id` 응답 반환). 외부 전송 없음(콘솔 전용)
- [x] **/health 확장** — 의존성(DB·외부API) 상태와 버전·커밋 해시 노출(민감정보 제외)
  - 근거: `lib/health.js`(`version`·`deps[]` 화이트리스트 정규화 — name·status·latencyMs·required 만 통과, URL·키는 넘겨도 응답에 안 실림 · 필수 아닌 의존성 오류는 `degraded=true`로만 200 유지) + `tests/health.test.mjs` 23케이스(export 금지 가드 포함). 외부 API 실프로브는 미실시(설정 유무만 노출) — 실프로브 활성화는 **[승인 필요]**
- [x] **표준 에러 응답** 전 API 통일 + 입력검증
  - 근거: `lib/apiError.js`(단일 봉투 `{ok:false,error,...}` · `fail`에 headers 인자 추가 — 넘겨도 `no-store`는 덮이지 않음 · `rateLimited()`가 Retry-After를 정수초·최소 1로 정규화 · `invalidJson()`)로 **app/api 20개 라우트 전부** 전환, 손수 조립한 `ok:false` 리터럴 0건. `lib/validate.badRequest`는 apiError에 위임(본문 형태 불변, no-store만 추가). 입력검증: `docs/[id]`·`scenarios/[id]` PUT이 보호되지 않은 `await req.json()`(깨진 본문 → 500)을 `readJson`+`badRequest`로 교체하고 값 클램핑(POST와 동일 규칙, 미지정 필드는 null → coalesce로 기존값 유지). 가드: `tests/routecontract.test.mjs` 6케이스(전 라우트 export 화이트리스트·`ok:false` 금지·4xx/5xx 시 헬퍼 import·`req.json()` 무보호 금지·429 시 `rateLimited()` 강제) + `tests/apierror.test.mjs` 12·`tests/validate.test.mjs` 17케이스
- [x] **rate limit** 공개 API 적용
  - 근거: `lib/apiLimits.js` 정책표(`LIMIT_POLICY` 9종)로 한도를 단일화하고 `consume(policy, key)` 한 줄로 배선 — **공개 라우트 13개 전부 적용**(login·cpaas/events·cpaas/voice·dev/simulate·sessions·visual/action·visual/state·docs·scenarios·ums·multimodal·stats·notifications). 기존에 라우트마다 흩어져 있던 `createRateLimiter` 3곳은 **값 변경 없이** 정책표로 이관하고, 라우트 내 자체 리미터 생성은 가드로 금지. **키 설계**: 서명토큰이 유효하면 세션 단위(`sessionId`), 검증 실패만 IP 단위(`tokenFail`) — CGNAT 공유 IP 환경에서 한 명의 과다요청이 같은 통신사 이용자를 함께 막는 무고한 차단을 피한다. 한도는 클라이언트 폴링 주기에서 역산한 여유값(실측 KPI 아님). 비상구 `RATE_LIMIT_DISABLED=1`(정확히 '1'일 때만 해제, 기본은 적용). 검증: `tests/apilimits.test.mjs` 16케이스(키 격리·정책 강도 역전 방지·비상구 오타 내성 포함) + `tests/routecontract.test.mjs`에 공개 API 누락 가드 3케이스 추가
  - 한계: 인메모리·인스턴스 로컬 → 서버리스 인스턴스가 늘면 실효 한도도 함께 늘어난다. 멀티노드 정합(Redis 등 공유 스토어)은 **[승인 필요]**
- [x] **접근·감사 로그** — 관리 기능 접근 이력
  - 근거: 기존에는 **거부·인증 이벤트만** 남아 "누가 관리 기능을 썼는가"가 비어 있었다. `lib/auth.guardWrite` 통과 경로에 성공 기록을 추가 — 관리 API(`/api/admin/*`)는 `ADMIN_ACCESS`, 그 외 보호 API 는 `WRITE_OK`(`lib/audit.accessEventFor` 순수 분류 · 접두어 오인 `/api/administration` 방지). `detail`에 `path·method·need·enforced` 만 담고 **쿼리스트링은 폐기**(PII 유입 방어), 계정·IP 는 기존 마스킹 계약 그대로. 비강제(데모) 모드에서도 `identityOf`로 신원만 확인해 이력을 남기되 **차단 판정은 하지 않는다**(라이브 무붕괴). 화면 `/admin/audit`에 두 이벤트 라벨·필터 추가.
  - 검증: `tests/auditaccess.test.mjs` 10케이스(통과/401/403 판정 불변 · 위조 서명은 계정 미기록 · `req` 이상 객체에도 무throw · 쿼리스트링 미기록) + `tests/audit.test.mjs` +4케이스(`accessEventFor`)
  - 한계: 기본은 **콘솔 기록**(Vercel 함수 로그 보존기간에 종속) — DB 영속화는 `AUDIT_DB=1` **[승인 필요]**. 수집(ingest) 성공은 머신 트래픽 폭주를 피하려 기록하지 않는다(거부만 기록). `guardWrite`를 거치지 않는 단순 조회 라우트는 이력 대상이 아니다.
- [x] **백업·복구 절차** RUNBOOK.md 문서화 + 복구 리허설 기록
  - 근거: `RUNBOOK.md`(데이터 자산표·백업 수단·사고 유형 A/B/C 분기 복구 절차·리허설 6단계·롤백·금지선). 문서가 썩는 것을 막기 위해 **복구 확인 대상 표 목록을 코드로 단일화** — `lib/backupCheck.js`의 `COVERED_TABLES` 와 `db/*.sql` 실선언을 `tests/backupcheck.test.mjs` 가 **양방향** 대조(새 표 추가 시 누락·삭제 후 유령 항목 모두 실패) → 표가 늘거나 줄면 런북 갱신이 강제된다. 리허설 기록은 `docs/restore-rehearsal.json` 에 누적하고 `rehearsalStatus()` 가 `none|incomplete|stale|ok` 로 판정(부분 수행을 근거로 삼지 않음 · 유효기간 90일은 분기 점검 관례 기준값이지 실측 지표 아님). 행수 대조 `compareRowCounts()` 는 **감소를 무조건 실패**로 본다. 점검 CLI `npm run backup:check`(읽기 전용 · DB 무접속). 검증: `tests/backupcheck.test.mjs` 21케이스
  - 한계: **복구 리허설 자체는 미실시**(상태 `none`) — 실제 Neon 복구·`DATABASE_URL` 교체는 자동화가 하지 않는다 **[승인 필요]**. RPO/RTO 목표값은 요금제·계약 종속이라 임의 수치를 적지 않고 미확정으로 남겼다. 논리 백업(pg_dump) 주기·보관처도 미결 **[승인 필요]**
- [ ] **약관·개인정보 처리방침 확정본 반영** (현재 초안, 문안은 사람이 확정)
- [x] **테스트** 핵심 로직 커버리지 확보, CI에서 실행
  - 근거: CI `.github/workflows/ci.yml` — push·PR 마다 Node **20·22 두 버전**에서 `npm ci` → `npm test`(`scripts/run-tests.mjs`) → `npm run coverage:check` → `npm run backup:check` 를 돌린다(읽기 전용 · 시크릿·DB·배포 없음). 지금까지 테스트 게이트는 사람이 `deploy.bat` 을 돌릴 때만 걸렸고, 로컬에서 건너뛰면 깨진 채 push 될 수 있었다.
  - 커버리지 게이트: `lib/coverage.js` + `scripts/coverage-check.mjs`. 파일명 규칙(`lib/foo.js` ↔ `tests/foo.test.mjs`) 대조가 아니라 **테스트 소스가 그 모듈을 실제로 참조하는지**로 판정한다 — 이름만 맞춘 빈 테스트로는 통과하지 못한다. 예외 목록(`COVERAGE_EXEMPT`)은 **현재 비어 있고**, 유령(파일이 사라진 예외)·낡음(테스트가 생겼는데 남은 예외) 양쪽을 자동으로 실패시켜 목록이 썩지 않는다. 현재 **로직 모듈 48/48 참조됨**. 훅 7·컴포넌트 12 는 렌더 환경이 필요해 게이트 대상에서 빼되 **수를 숨기지 않고 함께 출력**한다.
  - 함께 메운 공백: 유일하게 어떤 테스트도 부르지 않던 로직 모듈 `lib/legalContent.js`(약관·방침 정본)에 `tests/legal.test.mjs` 12케이스 추가 — 조항 누락·제목 중복·초안 상태가 조용히 사라지는 것·법정 필수 항목(수집·목적·보유·권리·책임자) 누락·임의 KPI 수치 혼입(§13-3)·화면이 정본 대신 자체 문안을 품는 것을 막는다.
  - 발견: 워크플로 파일이 `d-ars-repo/dars/.github/workflows/ci.yml` 에 있었다 — GitHub Actions 는 **저장소 루트의 `.github/workflows/` 만** 읽으므로 이 파일은 한 번도 실행된 적이 없다(26회차에 "CI 에 테스트를 넣었다"고 남은 기록은 실제로는 dormant). 옛 파일은 삭제하지 않고 상단에 미실행 사유를 명시했고, 실제 CI 는 루트로 옮겼다. 두 상태 모두 테스트가 감시한다.
  - 검증: `tests/coverage.test.mjs` 22케이스(분류·참조 추출·유령/낡은 예외·`.jsx`가 `.js`로 잘리던 정규식 회귀·실제 저장소 통합 검사 포함). 전체 `node --test "tests/*.test.mjs"` **723/723 통과**.
  - 한계(정직하게): 이 게이트는 **줄 단위 커버리지가 아니라 모듈 도달 여부**다. 퍼센트로 인용하면 안 된다. CI 에서 `next build` 는 돌리지 않는다(빌드 환경변수 주입이 필요) — 빌드 검증은 Vercel 배포가 담당.

## D-ARS 전용 (준비도 ~63%)
- [ ] AUTH_ENFORCE 실인증 전환 준비 — 운영 계정·역할 매핑 문서화 **[승인 후 ON]**
- [ ] 스테이징·운영 환경 분리 (env 매트릭스·승격 절차)
- [ ] 개인정보 보관·파기 정책 코드화 (보존기간 만료 자동 파기)
- [ ] 감사로그 영속화 준비 (현재 콘솔) **[AUDIT_DB=1은 승인]**
- [ ] 세션 토큰 보안 요건 점검 — 만료·1회용·엔트로피
- [ ] 장애 폴백 — 엔진 오류 시 기존 IVR 전환 경로 검증

## 파트너 채널 (제이투모로우원 — 운영 대행 + 수익 배분)

계약·서비스 주체는 고원, 파트너는 영업·운영을 담당하고 수익을 배분한다.
**향후 리셀러(파트너 명의 계약)로 전환될 수 있으므로, 지금은 2계층으로 확장 가능한 형태로만 열어둔다.**

- [ ] **파트너(채널) 개념 도입** — 조직/계약에 `partner_id`(nullable) 추가. 없으면 직접 계약. 스키마만 준비하고 화면 노출은 최소
- [ ] **매출 귀속 근거** — 어떤 고객사가 어느 파트너를 통해 유입됐는지 기록(유입 경로·계약일·담당자). 정산 분쟁을 예방하는 핵심
- [ ] **파트너 역할 권한** — 파트너 담당자는 자기가 유치한 고객사만 조회. 기존 RBAC에 `partner_admin` 역할 추가(활성화는 승인)
- [ ] **정산 리포트** — 파트너별 계약·이용 실적·수수료 산출 근거를 조회·내보내기. 수수료율은 설정값으로 분리(하드코딩 금지)
- [ ] **2계층 확장 여지 확보** — 테넌트 조회 경로에 파트너 필터가 나중에 끼어들 수 있도록 쿼리 계층 정리. 지금 화이트라벨은 구현하지 않음

> 원칙: 파트너 관련 기능도 **코드는 만들되 활성화는 승인**. 실제 정산·청구는 계약서 확정 후.

