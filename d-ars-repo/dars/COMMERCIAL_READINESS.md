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
- [x] AUTH_ENFORCE 실인증 전환 준비 — 운영 계정·역할 매핑 문서화 **[승인 후 ON]**
  - 근거: `docs/AUTH_ROLLOUT.md`(역할 정의·경로별 최소 역할 표·계정 발급 6단계·한계) + 판정 로직 `lib/authReadiness.js` + 점검 CLI `npm run auth:check`(읽기 전용 · 환경변수를 읽기만 하고 비밀값을 출력하지 않는다 · blocker 있으면 종료코드 1). 핵심은 **"스위치를 켰다"와 "실인증이 된다"가 다른 상태**라는 점이다 — `AUTH_USERS` 미설정 상태로 `AUTH_ENFORCE=1` 을 켜면 저장소에 공개된 데모 계정 3종이 그대로 운영 계정이 되고, `AUTH_SECRET` 미설정이면 코드에 박힌 데모 키로 서명해 토큰 위조가 가능하다. 이 차이를 사람 눈이 아니라 기계가 판정하게 했다(blocker 11종·warning 5종, 모르는 코드는 보수적으로 blocker).
  - 문서 썩음 방지: 경로-역할 매핑의 단일 출처를 `lib/auth.routeRoleMatrix()`(복사본 반환)로 내보내고, 문서 표와 **양방향 대조**(누락·유령·역할 불일치) — 코드에 보호 경로가 추가되면 문서를 고치기 전까지 테스트가 실패한다(backupCheck 와 같은 방식).
  - 검증: `tests/authreadiness.test.mjs` 23케이스(비밀값·계정 아이디 미유출 · 이상 입력 무throw · `RATE_LIMIT_DISABLED` 오타 내성 · CLI 읽기 전용 가드 · 실제 문서 대조 통합 검사 포함)
  - 현재 판정: 라이브 구성은 **차단 사유 2건**(AUTH_SECRET·AUTH_USERS 미설정) — 실계정·실키 주입과 `AUTH_ENFORCE=1` 전환은 **[승인 필요]**. 자동화는 켜지 않는다. 한계: `AUTH_USERS` 는 평문 비밀번호를 환경변수에 두는 방식이라 소수 운영 계정 규모에서만 감당된다(해시 저장·SSO 미구현).
- [x] 스테이징·운영 환경 분리 (env 매트릭스·승격 절차)
  - 근거: 문서(`docs/STAGING_OPERATIONS.md`)는 이미 있었지만 **코드를 따라오지 못했다** — 작성(2026-08-07)
    이후 추가된 설정 변수 6종(`EUM_TOKEN_SECRET`·`MONITOR_DSN`·`RATE_LIMIT_DISABLED`·`RETENTION_DAYS`·
    `RETENTION_ENABLE`·`DARS_AICC_*`)이 매트릭스에 한 줄도 없었다. 문서만 보고 운영을 구성하면 그
    변수들은 기본값(데모/OFF)으로 조용히 배포된다. 그래서 등록부를 코드로 옮겼다: `lib/envMatrix.js`
    `ENV_VARS`(28종 · scope=runtime/platform/tooling · secret·gate 표시 · 프로필별 기대값) 를 단일 출처로
    두고 **양방향 대조 3종** — (1) 소스가 실제로 읽는 `process.env.X`/`env.X` ↔ 등록부(누락·유령 모두 실패),
    (2) 등록부 ↔ 문서 표(이름·🔒·[승인 필요] 표기까지), (3) 프로필별 구성 판정.
  - 안전 요건: 이 경로는 **환경변수 값을 어디에도 담지 않는다** — 판정 결과·CLI 출력 모두 이름과
    상태(설정됨/미설정/불일치)만 다룬다. 테스트가 모든 변수에 표식값을 넣고 결과에 새는지 확인한다.
    같은 비밀값을 두 변수에 재사용하면(스테이징·운영 공유 사고) 차단하되 **값이 아니라 변수 이름 짝**만 보고한다.
  - 판정 강도: 운영 프로필의 어긋남은 차단, 스테이징·데모는 경고(구성 실험을 막지 않는다).
    비가역·과금 계열(`RETENTION_ENABLE`·`DARS_AICC_LIVE`·`DARS_AICC_APPROVAL_REF`·`RATE_LIMIT_DISABLED`)은
    **어느 프로필에서도 '켜라'고 적지 않는다**(테스트가 강제).
  - 점검 CLI `npm run env:check [-- --profile=production]`(읽기 전용·DB 무접속) + CI 단계 추가.
    현재 라이브는 데모 기준 차단 0건, 운영 기준 차단 10건(실계정·실키·실 DB 미주입) — 정상이며 주입은 **[승인 필요]**.
  - 검증: `tests/envmatrix.test.mjs` 20케이스(값 유출 2케이스·이상 입력 무throw·실제 저장소 통합 대조 3케이스 포함)
  - 한계: 등록부 대조는 정적 문자열 기준이라 동적 접근(`env[name]`)은 잡히지 않는다. 값이 **있는지**만 보고
    올바른지는 판정하지 않는다. 프로필 자동 판별은 `VERCEL_ENV` 하나에 의존한다.
- [x] 개인정보 보관·파기 정책 코드화 (보존기간 만료 자동 파기)
  - 근거: 파기 유틸(`lib/retention.js`)·실행기(`scripts/retention-purge.mjs`)·참조 SQL 은 있었지만
    **파기 대상 목록 `PII_TABLES` 가 사람이 손으로 적는 목록**이었다. 스키마에 개인정보 컬럼이 하나
    늘어도 파기 스크립트는 아무 오류 없이 "대상 0건"을 보고하고 그 컬럼만 영원히 남는다. 개인정보
    파기 의무는 "몰랐다"가 면책이 되지 않으므로, `lib/retentionScan.js` 가 `db/*.sql` 을 직접 파싱해
    개인정보 후보 컬럼을 전부 찾아내고 **파기 대상이거나 사유 있는 면제**가 아니면 실패시킨다
    (backupCheck 와 같은 양방향 대조 · 유령 면제·무사유 면제·깨진 파기 대상도 함께 판정).
  - 발견·수정한 잠복 버그: `lib/backupCheck.stripSqlComments` 가 `/--.*$/` 였다. JS 에서 `.` 는 `\r` 을
    매칭하지 않고 `m` 없는 `$` 는 문자열 끝에서만 맞아, **CRLF 파일(`db/schema.sql`)에서는 주석이 하나도
    제거되지 않았다**(오류 없이 조용히 no-op). 그 탓에 주석 뒤 컬럼(`scenarios.status`·`visual_sessions.node` 등)이
    파싱에서 통째로 사라졌다. `[^\n]` 으로 고치고 CRLF 회귀 테스트를 붙였다.
  - 정책 변경 1건: `visual_sessions.call_id` 를 파기 대상에 추가했다. 교환기 발급 통화 식별자로 통신사
    원장과 대조하면 재식별될 수 있어 전화번호와 같은 기준으로 익명화한다(행 삭제 아님 · 집계 보존).
  - 문서 `docs/PRIVACY_RETENTION.md` 를 정본으로 갱신하고 코드와 양방향 대조(사유 문구 존재까지 확인).
  - 점검 CLI `npm run retention:check`(읽기 전용 · DB 무접속 · 파기 실행 경로 없음을 테스트가 감시) + CI 단계 추가.
  - 검증: `tests/retentionscan.test.mjs` 22케이스(파서 6·탐지 4·대조 6·통합 6)
  - 한계: 탐지는 **컬럼명 기준**이라 이름이 전혀 다른 자유 입력 필드(예: `note`)에 담긴 개인정보는 잡히지 않는다.
    자동 스케줄 파기·파기 이력 영속화는 미구성 **[승인 필요]**(비가역 동작을 무인 실행하지 않는다).
    법정 의무 보존기간과의 조정은 계약 종속이라 임의 수치를 적지 않고 미확정으로 남겼다.
- [x] 감사로그 영속화 준비 (현재 콘솔) **[AUDIT_DB=1은 승인]**
  - 근거: 기록(`lib/audit.js`)·열람(`/api/admin/audit`)·스키마(`db/audit.sql`) 경로는 이미 있었다.
    빠진 것은 **"켰다"와 "실제로 남는다"가 다른 상태를 아무도 모른다**는 점이었다. 적재 실패는
    무해화 계약상 조용히 삼켜지므로(감사 기록이 로그인을 실패시키면 안 되니 옳은 동작이다),
    `db/audit.sql` 미적용·`DATABASE_URL` 누락·`AUDIT_DB=true` 오타 세 경우 모두 감사 화면이
    **"0건"** 을 보여주고 운영자는 그것을 "아무 일도 없었다"로 읽는다. 사고 조사 시점에 비어 있으면
    되돌릴 방법이 없다.
  - 넣은 것: (1) `lib/audit.js` 에 시도·성공·실패 카운터(`auditStats()` · 복사본 반환 · 오류 원문 미보유)와
    실패 시 에러 모니터 승격(동적 import · 무해화), DB 미설정 상태의 적재 시도도 **실패로 센다**.
    (2) `lib/auditReadiness.js` — 모드 판정 `console`/`db`/**`db-blind`**(켰는데 안 남는 상태 → 차단),
    플래그 오타 탐지(정확히 `'1'` 만 ON), health 상태 어휘로의 환산.
    (3) `/api/health` `deps` 에 `audit-persist` 노출 — `required` 는 붙이지 않는다(감사 적재 실패로
    서비스 전체를 503 으로 만들지 않는다). route.js export 는 `GET`·`dynamic` 뿐임을 테스트가 고정.
    (4) 점검 CLI `npm run audit:check`(읽기 전용·DB 무접속·값 미출력) + CI 단계. (5) `docs/AUDIT_PERSISTENCE.md`.
  - 검증: `tests/auditreadiness.test.mjs` 19케이스(무해화·값 유출·이상 입력 무throw·route export 계약 포함)
  - 한계: 카운터는 **서버리스 인스턴스 로컬 메모리**라 재활용 시 0으로 돌아가고 인스턴스마다 다르다
    ("최근 이 인스턴스에서 적재되는가"의 신호이지 총계가 아니다). CLI 는 DB 에 붙지 않으므로 테이블
    실제 적용 여부는 확인하지 못하고 안내 SQL 만 출력한다. 감사 이력 **보존기간은 미확정**(계약·감사
    요건 종속이라 임의 수치를 적지 않았다). 운영 DB 적용과 `AUDIT_DB=1` 전환은 **[승인 필요]**.
- [x] 세션 토큰 보안 요건 점검 — 만료·1회용·엔트로피
  - 근거: 발급 토큰 3종(`auth-session`·`rbac-session`·`eum-link`)은 모두 **무상태 HMAC 베어러**라
    서명 비밀이 유일한 방어선인데, 지금까지 확인한 것은 "비밀값을 설정했다"까지였다. `lib/tokenAudit.js`
    가 세 축을 판정한다 — **만료**(`exp` 존재·상한 초과·쿠키 maxAge 와 토큰 exp 가 같은 상수인지),
    **1회용**(요건 대비 구현 여부), **엔트로피**(`ok`/`weak`/`demo`/`missing` 4등급 · 32자·문자 8종
    기준선은 관례에 따른 운영 기준값이며 실측 지표 아님).
  - 안전 요건: 판정 어디에도 **비밀값·길이·일부 문자를 담지 않는다**(등급과 불리언만). 테스트가
    표식값을 넣고 결과·CLI 출력에 새는지 확인한다. CLI 는 토큰을 발급하지도 않는다.
  - 드러낸 사실(고치지 않고 **정직하게 표시**): ① `eum-link` 는 요건상 1회용이지만 실제로는 5분 안에
    재사용 가능한 베어러다 — 진짜 1회용은 사용 이력 저장소(DB)가 필요해 **[승인 필요]** 로 남기고,
    `TOKEN_NOT_ONE_TIME` 경고로 매번 드러나게 했다. ② `EUM_TOKEN_SECRET` 미설정 시 `AUTH_SECRET` 을
    빌려 쓰는 폴백은 한쪽 유출이 세션·링크 위조로 동시에 번지므로 `TOKEN_SECRET_DERIVED` 경고 대상이다.
    ③ URL 전달 토큰의 접근로그·리퍼러 노출을 `TOKEN_IN_URL` 로 상시 표시한다.
  - 문서 `docs/TOKEN_SECURITY.md` 와 명세를 양방향 대조하고, 선언 수명이 **실제 구현 상수**
    (`EUM_TOKEN_TTL_MS`·`SESSION_HOURS`·`DEFAULT_TTL_SEC`)와 같은지도 테스트가 확인한다.
  - 점검 CLI `npm run token:check [-- --profile=production]` + CI 단계. 현재 라이브는 데모 기준 차단 0건,
    운영 기준으로는 데모 서명키 사용 2건이 차단 — 실비밀값 주입은 **[승인 필요]**.
  - 검증: `tests/tokenaudit.test.mjs` 25케이스(값 유출 3·경계값·이상 입력 무throw·실제 구현 대조 5 포함)
  - 한계: **정적 판정**이다 — 실제로 발급된 토큰을 검사하지 않고 명세·환경 구성만 본다. 서명 키
    **무중단 회전 절차는 없다**(키를 바꾸면 기존 세션이 모두 끊긴다 — 두 키 허용 구조 미구현).
- [x] 장애 폴백 — 엔진 오류 시 기존 IVR 전환 경로 검증
  - 근거: 콜봇 대면 라우트 2종이 **장애를 성공으로 위장**하고 있었다 — `/api/cpaas/voice` 는 SMS 발송 실패
    (`sms.ok=false`)에도 `ok:true`, `/api/visual/action` 은 콜백 3회 재시도 소진(`failed:true`)에도 `ok:true`.
    콜봇은 성공·장애를 구분할 수 없어 "화면을 보세요" 안내 뒤 고객이 빈 화면 앞에 남는 사고가 가능했다.
    `lib/ivrFallback.js` 를 단일 출처로 두고 응답에 `fallback:{mode:'visual'|'ivr', reason, message}` 를
    **항상** 싣는다 — SMS 실패 `SMS_FAILED`(200), 릴레이 실패 `RELAY_FAILED`(200), 핸들러 예외 `ENGINE_ERROR`(503 ·
    오류 원문은 로그만). 콜봇 측 판정은 참조 구현 `callbotShouldUseIvr` 로 고정: **2xx + ok + mode:'visual' 만 화면**,
    응답 없음·비2xx·필드 누락은 전부 음성 IVR(보수 기본값). 고객 화면 `/visual` 은 상태 폴링이 연속 4회(≈10초)
    실패하면 `aria-live="assertive"` 로 "전화 음성 안내로 계속" 을 안내하고 성공 1회로 복구(이전엔 조용히 멈춤).
    문서 `docs/IVR_FALLBACK.md` 는 코드·문구·기준값과 테스트로 양방향 대조. 신규 환경변수 0.
  - 검증: `tests/ivrfallback.test.mjs` 10케이스(판정·PII/오류원문 미유출·콜봇 참조 구현 10경우·폴링 리듀서·
    라우트/화면/문서 소스 가드) · 전체 `node --test "tests/*.test.mjs"` 899/899 통과 · coverage 게이트 58/58.
  - 한계: D-ARS 쪽 절반이다 — **콜봇 시나리오가 실제로 `fallback` 을 읽고 분기하는지는 실회선 통화 리허설**로
    확인해야 하며 **[승인 필요]**(실발신). 플랫폼 수준 장애(응답 자체 없음)는 콜봇 타임아웃 규칙이 유일한 방어선.

## 파트너 채널 (제이투모로우원 — 운영 대행 + 수익 배분)

계약·서비스 주체는 고원, 파트너는 영업·운영을 담당하고 수익을 배분한다.
**향후 리셀러(파트너 명의 계약)로 전환될 수 있으므로, 지금은 2계층으로 확장 가능한 형태로만 열어둔다.**

- [ ] **파트너(채널) 개념 도입** — 조직/계약에 `partner_id`(nullable) 추가. 없으면 직접 계약. 스키마만 준비하고 화면 노출은 최소
- [ ] **매출 귀속 근거** — 어떤 고객사가 어느 파트너를 통해 유입됐는지 기록(유입 경로·계약일·담당자). 정산 분쟁을 예방하는 핵심
- [ ] **파트너 역할 권한** — 파트너 담당자는 자기가 유치한 고객사만 조회. 기존 RBAC에 `partner_admin` 역할 추가(활성화는 승인)
- [ ] **정산 리포트** — 파트너별 계약·이용 실적·수수료 산출 근거를 조회·내보내기. 수수료율은 설정값으로 분리(하드코딩 금지)
- [ ] **2계층 확장 여지 확보** — 테넌트 조회 경로에 파트너 필터가 나중에 끼어들 수 있도록 쿼리 계층 정리. 지금 화이트라벨은 구현하지 않음

> 원칙: 파트너 관련 기능도 **코드는 만들되 활성화는 승인**. 실제 정산·청구는 계약서 확정 후.

