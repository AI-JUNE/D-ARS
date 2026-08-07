# D-ARS 스테이징/운영 분리 가이드 (P0 · 118회차)

작성 2026-08-07. 목적: 데모·스테이징·운영 환경을 **환경변수만으로** 분리 운영하는 기준 문서.
원칙: 코드는 단일 브랜치(main) — 환경별 차이는 전부 env 플래그. 기본값은 항상 안전한 쪽(데모/OFF).

## 1. 환경 3단계

| 구분 | Vercel 환경 | 용도 | DB | 플래그 기본 |
|---|---|---|---|---|
| 데모 | Preview 또는 Production(현행) | 공개 데모·영업 시연 | 없음(demo-fallback) 또는 데모 DB | 전부 OFF(현행 그대로) |
| 스테이징 | Preview(고정 브랜치 권장) | 운영 전 리허설 | **스테이징 전용 DATABASE_URL** | 운영과 동일 플래그, 실키 대신 테스트키 |
| 운영 | Production | 실서비스 | 운영 DATABASE_URL | 아래 2장 게이트 승인 후 ON |

- 판별: `/api/health` 응답의 `env`(`VERCEL_ENV`)와 `commit`(배포 SHA)으로 어떤 환경·어떤 커밋인지 확인한다.
- 스테이징과 운영은 **DB·시크릿·베이스URL을 절대 공유하지 않는다**(같은 값 재사용 금지).

## 2. 환경변수 매트릭스 (게이트 = [승인 필요])

| 변수 | 기본(미설정) | 데모 | 스테이징 | 운영 | 비고 |
|---|---|---|---|---|---|
| `DATABASE_URL` | demo-fallback(무DB) | 생략 가능 | 스테이징 DB | 운영 DB | 환경별 별도 인스턴스 |
| `AUTH_ENFORCE` | OFF(데모 통과) | 미설정 | `1` | `1` **[승인 필요]** | 실제 접근 차단 게이트 |
| `AUTH_USERS` | 데모 계정 3종 | 미설정 | 테스트 계정 JSON | 실계정 JSON **[승인 필요]** | 미설정 시 데모 계정 노출됨 |
| `AUTH_SECRET` | 데모 고정값 | 미설정 | 랜덤 발급 | 랜덤 발급(데모값 금지) | 세션 서명 |
| `RBAC_SESSION_SECRET` | RBAC 미들웨어 무동작 | 미설정 | 랜덤 발급 | 랜덤 발급 | 미설정=완전 무동작(하위호환) |
| `AUDIT_DB` | OFF(콘솔 구조화 로그만) | 미설정 | `1`(db/audit.sql 선적용) | `1` **[승인 필요: 스키마 적용 포함]** | lib/audit.js·117회차 |
| `INGEST_KEY` | 수집 API 무검사 통과 | 미설정 | 테스트키 | 실키 발급 **[승인 필요]** | AUTH_ENFORCE=1 + 키 설정 시에만 검사 |
| `DEMO_MODE` | 시뮬레이터 허용 | 미설정 | `0` 권장 | `0`(시뮬레이터 차단) | /api/dev/simulate 가드 |
| `CPAAS_PROVIDER`/`CPAAS_API_KEY`/`CPAAS_SECRET`/`CPAAS_WEBHOOK_SECRET` | 미연동 | 미설정 | 테스트 계정 | 실계정 **[승인 필요: 실발신·과금]** | CPAAS_SETUP.md 참조 |
| `SMS_GATEWAY_URL`/`CALLBOT_CALLBACK_URL` | 미발신 | 미설정 | 목/테스트 엔드포인트 | 실엔드포인트 **[승인 필요: 실발신]** | |
| `PUBLIC_BASE_URL` | d-ars.vercel.app | 기본값 | 스테이징 도메인 | 운영 도메인 | 고객 발송 링크 베이스 |

## 3. 승격 절차 (스테이징 → 운영)

1. 스테이징에 운영과 동일한 플래그 구성으로 배포 → `/api/health` 200·`env=preview`·커밋 SHA 확인.
2. 리허설 체크: 로그인(AUTH_ENFORCE=1)·역할 게이트(launcher=admin, ums/scenarios/docs/templates=operator)·수집 API 401(무키)·감사로그 적재(AUDIT_DB=1)·시뮬레이터 차단(DEMO_MODE=0).
3. 운영 env 값 주입은 **사람이 Vercel 대시보드에서 직접** 수행 [승인 필요] — 자동화가 실키·실계정을 다루지 않는다.
4. Production 배포 후 `/api/health` 200·`env=production`·`db=connected` 확인. 실패(503) 시 직전 배포로 롤백(Vercel Instant Rollback).

## 4. 금지선 (자동화가 하지 않는 것)

- 운영 DB 파괴적 변경(drop/truncate/비멱등 마이그레이션) — 코드 제안까지만. db/*.sql은 수동 적용.
- 실키·실계정·실발신·실과금 설정/실행 — 전부 [승인 필요].
- AUTH_ENFORCE·AUDIT_DB 등 게이트 플래그를 자동으로 켜는 행위.

## 5. 현행 상태 (2026-08-07)

- 라이브(d-ars.vercel.app)는 **데모 구성**(플래그 전부 OFF·데모 계정) — 위 매트릭스의 "데모" 열과 일치.
- 스테이징 전용 Preview 브랜치·DB 인스턴스 생성은 미실시 [승인 필요: 리소스 생성].
