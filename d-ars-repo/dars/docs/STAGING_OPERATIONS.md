# D-ARS 스테이징/운영 분리 가이드

작성 2026-08-07 · 갱신 2026-09-09. 목적: 데모·스테이징·운영 환경을 **환경변수만으로** 분리 운영하는 기준 문서.
원칙: 코드는 단일 브랜치(main) — 환경별 차이는 전부 env 플래그. 기본값은 항상 안전한 쪽(데모/OFF).

> **아래 2장 표의 단일 출처는 `lib/envMatrix.js` 의 `ENV_VARS` 다.**
> `tests/envmatrix.test.mjs` 가 (1) 코드가 실제로 읽는 `process.env.*` 와 등록부, (2) 등록부와 이 문서 표를
> 양방향 대조한다. 변수가 늘거나 줄면 이 문서를 고치기 전까지 테스트가 실패한다.
> 점검: `npm run env:check` (읽기 전용 · **환경변수 값은 출력하지 않는다**).
>
> 이 장치를 넣은 이유: 2026-08-07 작성 이후 코드에 추가된 설정 변수 여러 개(`EUM_TOKEN_SECRET`,
> `MONITOR_DSN`, `RATE_LIMIT_DISABLED`, `RETENTION_*`, `DARS_AICC_*`)가 이 표에 한 줄도 없었다.
> 문서만 보고 운영 환경을 구성하면 그 변수들은 **기본값(데모/OFF)** 으로 조용히 배포된다.

## 1. 환경 3단계

| 구분 | Vercel 환경 | 용도 | DB | 플래그 기본 |
|---|---|---|---|---|
| 데모 | Preview 또는 Production(현행) | 공개 데모·영업 시연 | 없음(demo-fallback) 또는 데모 DB | 전부 OFF(현행 그대로) |
| 스테이징 | Preview(고정 브랜치 권장) | 운영 전 리허설 | **스테이징 전용 DATABASE_URL** | 운영과 동일 플래그, 실키 대신 테스트키 |
| 운영 | Production | 실서비스 | 운영 DATABASE_URL | 아래 2장 게이트 승인 후 ON |

- 판별: `/api/health` 응답의 `env`(`VERCEL_ENV`)와 `commit`(배포 SHA)으로 어떤 환경·어떤 커밋인지 확인한다.
- 스테이징과 운영은 **DB·시크릿·베이스URL을 절대 공유하지 않는다**(같은 값 재사용 금지).
  같은 비밀값을 두 변수에 재사용하면 `env:check` 가 차단 사유로 보고한다(값은 출력하지 않고 변수 이름만).
- 현행 라이브는 Production 이지만 구성은 데모다. 그래서 판정 프로필은 자동 추정만 믿지 않고
  `npm run env:check -- --profile=production` 처럼 명시할 수 있다.

## 2. 환경변수 매트릭스

기대값 표기: `미설정`(설정하면 안 됨) · `필수`(값이 있어야 함) · `자유`(검사 안 함) · 그 외는 정확한 값.
🔒 = 비밀값(로그·CLI·에러 리포트에 내용을 싣지 않는다). **[승인 필요]** = 실인증·실발신·실과금·실개인정보 게이트.

### 2-1. 런타임 (배포된 앱이 읽는다 — 환경 분리의 대상)

| 변수 | 기본(미설정 시 동작) | 데모 | 스테이징 | 운영 | 비고 |
|---|---|---|---|---|---|
| `DATABASE_URL`🔒 | 무DB 데모 폴백 | 미설정 | 필수 | 필수 | 환경별 별도 인스턴스. 스테이징과 운영이 같은 값을 쓰면 안 된다 |
| `AUTH_ENFORCE` | OFF(데모 통과) | 미설정 | 1 | 1 | 실제 접근 차단 게이트 **[승인 필요]** |
| `AUTH_USERS`🔒 | 저장소에 공개된 데모 계정 3종 | 미설정 | 필수 | 필수 | 미설정 상태로 AUTH_ENFORCE 를 켜면 데모 계정이 운영 계정이 된다 **[승인 필요]** |
| `AUTH_SECRET`🔒 | 코드에 박힌 데모 고정값(토큰 위조 가능) | 미설정 | 필수 | 필수 | 세션 서명 키. 환경마다 다른 랜덤값 |
| `RBAC_SESSION_SECRET`🔒 | RBAC 미들웨어 무동작(하위호환) | 미설정 | 필수 | 필수 | AUTH_SECRET 과 같은 값을 재사용하지 않는다 |
| `EUM_TOKEN_SECRET`🔒 | AUTH_SECRET → 없으면 데모 기본값 | 미설정 | 필수 | 필수 | 이음 어르신 신청 1회용 링크 서명(lib/eumToken.js). 실링크 발급 전 전용 값 필수 |
| `AUDIT_DB` | OFF(콘솔 구조화 로그만) | 미설정 | 1 | 1 | db/audit.sql 선적용 필요 **[승인 필요]** |
| `INGEST_KEY`🔒 | 수집 API 무검사 통과 | 미설정 | 필수 | 필수 | AUTH_ENFORCE=1 + 키 설정 시에만 검사 **[승인 필요]** |
| `DEMO_MODE` | 시뮬레이터 허용 | 미설정 | 0 | 0 | /api/dev/simulate 가드 |
| `RATE_LIMIT_DISABLED` | rate limit 적용(기본) | 미설정 | 미설정 | 미설정 | 비상구. 운영에서 켜 두면 공개 API 한도가 사라진다 |
| `RETENTION_DAYS` | 180일(하한 30일) | 미설정 | 자유 | 자유 | 개인정보 보관기간(docs/PRIVACY_RETENTION.md) |
| `RETENTION_ENABLE` | OFF(파기 미수행) | 미설정 | 미설정 | 미설정 | 비가역 파기 스위치. 운영자가 실행 시점에만 켠다 **[승인 필요]** |
| `MONITOR_DSN`🔒 | no-op(콘솔 한 줄만) | 미설정 | 자유 | 자유 | 에러 리포트 외부 전송. 실 DSN 주입은 **[승인 필요]** |
| `CPAAS_PROVIDER` | 미연동 | 미설정 | 자유 | 자유 | docs/CPAAS_SETUP.md · 실발신·과금 **[승인 필요]** |
| `CPAAS_API_KEY`🔒 | 미연동 | 미설정 | 자유 | 자유 | 실발신·과금 **[승인 필요]** |
| `CPAAS_SECRET`🔒 | 미연동 | 미설정 | 자유 | 자유 | 실발신·과금 **[승인 필요]** |
| `CPAAS_WEBHOOK_SECRET`🔒 | 웹훅 서명 미검증 | 미설정 | 자유 | 자유 | CPaaS 콜백 서명 검증 키 **[승인 필요]** |
| `SMS_GATEWAY_URL` | 미발신 | 미설정 | 자유 | 자유 | 실발신 **[승인 필요]** |
| `CALLBOT_CALLBACK_URL` | 미발신 | 미설정 | 자유 | 자유 | 콜봇 콜백 엔드포인트 **[승인 필요]** |
| `PUBLIC_BASE_URL` | d-ars.vercel.app | 미설정 | 필수 | 필수 | 고객에게 나가는 링크의 베이스. 환경마다 달라야 한다 |
| `DARS_AICC_LIVE` | dry_run(실푸시 없음) | 미설정 | 미설정 | 미설정 | AICC 실푸시. DARS_AICC_APPROVAL_REF 와 함께여야만 켜진다 **[승인 필요]** |
| `DARS_AICC_APPROVAL_REF` | 없음 → 실푸시 거부 | 미설정 | 미설정 | 미설정 | 실푸시 승인 근거 문서/티켓 식별자 **[승인 필요]** |
| `DARS_AICC_TIMEOUT_MS` | 전송 계층 기본값 | 미설정 | 자유 | 자유 | 정수만 인정, 이상값은 무시 |

### 2-2. 플랫폼 주입 (사람이 설정하지 않는다)

| 변수 | 기본(미설정 시 동작) | 데모 | 스테이징 | 운영 | 비고 |
|---|---|---|---|---|---|
| `NODE_ENV` | development | 자유 | 자유 | 자유 | Next.js/플랫폼이 설정 |
| `VERCEL_ENV` | 없음(로컬) | 자유 | 자유 | 자유 | 환경 판별의 근거(/api/health 의 env) |
| `VERCEL_GIT_COMMIT_SHA` | 없음(로컬) | 자유 | 자유 | 자유 | 배포 커밋 식별(/api/health 의 commit) |

### 2-3. 도구 전용 (로컬/CI 스크립트만 읽는다 — 배포와 무관)

| 변수 | 기본(미설정 시 동작) | 데모 | 스테이징 | 운영 | 비고 |
|---|---|---|---|---|---|
| `AICC_CORE` | 개발 PC 형제 폴더 경로 | 자유 | 자유 | 자유 | scripts/aicc-conformance.mjs 전용(배포와 무관) |
| `AICC_TIMEOUT_MS` | 3000 | 자유 | 자유 | 자유 | scripts/aicc-conformance.mjs 전용 |

## 3. 승격 절차 (스테이징 → 운영)

1. `npm run env:check -- --profile=staging` 으로 스테이징 구성을 확인한다(값 미출력).
2. 스테이징에 운영과 동일한 플래그 구성으로 배포 → `/api/health` 200·`env=preview`·커밋 SHA 확인.
3. 리허설 체크: 로그인(AUTH_ENFORCE=1)·역할 게이트(launcher=admin, ums/scenarios/docs/templates=operator)·수집 API 401(무키)·감사로그 적재(AUDIT_DB=1)·시뮬레이터 차단(DEMO_MODE=0).
4. 운영 env 값 주입은 **사람이 Vercel 대시보드에서 직접** 수행 [승인 필요] — 자동화가 실키·실계정을 다루지 않는다.
5. Production 배포 후 `/api/health` 200·`env=production`·`db=connected` 확인, `npm run env:check -- --profile=production` 으로 잔여 차단 사유 0건 확인.
6. 실패(503) 시 직전 배포로 롤백(Vercel Instant Rollback).

## 4. 금지선 (자동화가 하지 않는 것)

- 운영 DB 파괴적 변경(drop/truncate/비멱등 마이그레이션) — 코드 제안까지만. `db/*.sql` 은 수동 적용.
- 실키·실계정·실발신·실과금 설정/실행 — 전부 [승인 필요].
- `AUTH_ENFORCE`·`AUDIT_DB`·`RETENTION_ENABLE`·`DARS_AICC_LIVE` 등 게이트 플래그를 자동으로 켜는 행위.
- 환경변수 **값**을 로그·리포트·커밋에 남기는 행위.

## 5. 현행 상태 (2026-09-09)

- 라이브(d-ars.vercel.app)는 **데모 구성**(플래그 전부 OFF·데모 계정) — 위 매트릭스의 "데모" 열과 일치.
  `npm run env:check` 결과 데모 기준 차단 사유 0건.
- 운영 프로필 기준으로는 차단 사유가 남아 있다(실계정·실키·실 DB 미주입). 이는 정상이며,
  주입은 사람의 승인 사항이다. [승인 필요]
- 스테이징 전용 Preview 브랜치·DB 인스턴스 생성은 미실시 [승인 필요: 리소스 생성].

## 6. 한계 (정직하게)

- 등록부 대조는 **정적 문자열**(`process.env.X` / `env.X`) 기준이다. 동적 접근(`env[name]`)은
  이름을 알 수 없어 잡히지 않는다.
- `env:check` 는 값이 **있는지**만 본다. 값이 올바른지(예: 운영 DB 를 가리키는지)는 판정하지 않는다.
- 프로필 자동 판별은 `VERCEL_ENV` 하나에 의존한다. 다른 호스팅으로 옮기면 `profileOf()` 를 고쳐야 한다.
