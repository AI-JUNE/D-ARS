# D-ARS 개인정보 보관·파기 정책

> 상태: 파기 대상·면제 판단은 **코드가 단일 출처**이며 이 문서와 양방향 대조된다
> (`lib/retention.js` `PII_TABLES` · `lib/retentionScan.js` `PII_EXEMPT` ↔ `tests/retentionscan.test.mjs`).
> 코드에 대상이 늘거나 줄면 이 문서를 고치기 전까지 테스트가 실패한다.
> 실제 파기 실행은 운영자 승인이 필요하다. **[사람 승인 필요]**

## 0. 원칙

1. **행을 지우지 않는다.** 보관기간이 지나면 식별 컬럼만 `NULL` 로 익명화한다.
   집계·통계는 남고 개인을 가리키는 값만 사라진다.
2. **기본은 미수행.** 파기는 비가역이므로 `RETENTION_ENABLE=1` + `--commit` 을 운영자가
   명시적으로 줄 때만 실행된다. 스케줄러가 인자 없이 호출해도 조회만 한다.
3. **누락을 사람 눈에 맡기지 않는다.** 스키마에 개인정보로 보이는 컬럼이 새로 생기면
   파기 대상이거나 **사유가 적힌 면제**여야 한다. 둘 다 아니면 `npm run retention:check` 가 실패한다.
   (이전에는 `PII_TABLES` 가 손으로 적는 목록이라, 컬럼이 하나 늘어도 파기 스크립트가 아무 오류
   없이 "대상 0건"을 보고하고 그 컬럼만 영원히 남았다. 개인정보 파기 의무는 "몰랐다"가 면책이
   되지 않으므로 `db/*.sql` 을 코드가 직접 읽어 대조한다.)

## 1. 파기 대상 (`lib/retention.js` `PII_TABLES`)

| 표.컬럼 | 기준 시각 | 성격 |
| --- | --- | --- |
| `visual_sessions.phone` | `started_at` | 보이는 ARS 상담 세션 발신번호 |
| `visual_sessions.call_id` | `started_at` | 교환기 발급 통화 식별자. 통신사 원장과 대조하면 재식별될 수 있어 전화번호와 같은 기준으로 파기한다(장애 추적 목적 보존은 보관기간 안에서만 유효) |
| `ums_log.phone` | `sent_at` | UMS(문서 발송) 대상 번호 |

## 2. 면제 판단 (`lib/retentionScan.js` `PII_EXEMPT`)

컬럼명 탐지에 걸렸지만 파기하지 않기로 **판단한** 항목이다. 사유 없는 면제는 둘 수 없다(테스트가 막는다).

| 표.컬럼 | 사유 |
| --- | --- |
| `audit_events.actor` | 적재 시점에 이미 마스킹된 값만 저장(`lib/audit.js`) — 원문 미보유 |
| `audit_events.ip` | 적재 시점에 이미 마스킹된 값만 저장(`lib/audit.js`) — 원문 미보유 |
| `docs.name` | 서류 종류 이름(예: 가족관계증명서) — 사람 이름 아님 |
| `scenarios.name` | 시나리오 이름 — 사람 이름 아님 |
| `scenarios.updated_by` | 운영자 표시명. 고객 개인정보가 아니며 변경 이력 추적에 필요(퇴사자 처리는 `docs/AUTH_ROLLOUT.md` 계정 회수 절차) |

그 외 표(`daily_stats` 등)는 개인정보를 담지 않는다(집계·설정 데이터).

## 3. 보관기간

| 항목 | 값 | 근거 |
| --- | --- | --- |
| 기본 보관기간 | 180일 | `DEFAULT_RETENTION_DAYS`. 상담 이력 확인·분쟁 대응에 필요한 기간으로 잡은 **운영 기준값**이며 실측 지표가 아니다 |
| 최소 하한 | 30일 | `MIN_RETENTION_DAYS`. `RETENTION_DAYS` 에 0·음수·과소값을 넣어 최근 데이터가 지워지는 오설정 사고를 막는다(하한 미만이면 기본값으로 되돌린다) |
| 조정 | `RETENTION_DAYS` | 정수만 인정. 파싱 실패 시 기본값 |

## 4. 운영 절차

```
npm run retention:check                                        # 정책 정합성 점검(DB 무접속·읽기 전용)
node scripts/retention-purge.mjs                               # DRY-RUN — 파기 대상 건수만 출력
RETENTION_ENABLE=1 node scripts/retention-purge.mjs --commit   # 실제 익명화 [승인 필요]
```

1. `retention:check` 로 미판단 컬럼이 없는지 확인한다(있으면 파기 자체를 하지 않는다).
2. DRY-RUN 으로 대상 건수를 본다. 예상보다 크면 `RETENTION_DAYS` 오설정을 먼저 의심한다.
3. 백업 시점을 확인한다(`RUNBOOK.md`). 익명화는 되돌릴 수 없다.
4. 운영자 승인 후 `--commit` 으로 실행하고 실행 시각·건수를 남긴다.

파기 SQL 은 항상 `where <기준시각> < :cutoff and <컬럼> is not null` 조건을 포함한다(전량 변경 방지
안전장치이며 테스트가 `delete` 문 혼입도 막는다). 참조 SQL 은 `db/retention.sql`.

## 5. 표시·내보내기 시 마스킹

화면·CSV 내보내기에서 전화번호 노출을 줄이려면 `lib/retention.js` 의 `maskPhone()` 을 쓴다
(가운데 자리 마스킹, 예: `010-****-5678`). 현재는 유틸만 있으며 표시/내보내기 경로 연결은 후속 작업이다.

## 6. 구성요소

- `lib/retention.js` — 마스킹·보관기간·경계시각·파기 SQL 빌더(순수 함수, DB 비의존).
- `lib/retentionScan.js` — `db/*.sql` 파싱 → 개인정보 후보 컬럼 발견 → 미보호/유령 판정.
- `scripts/retention-check.mjs` — 정책 정합성 점검 CLI(읽기 전용·DB 무접속).
- `scripts/retention-purge.mjs` — 파기 실행기(DRY-RUN 기본).
- `db/retention.sql` — 참조 SQL·감사 테이블(선택) 정의.
- 테스트 — `tests/retention.test.mjs`, `tests/retentionscan.test.mjs`.

## 7. 아직 하지 않은 것 (정직하게)

- **[승인 필요] 자동 스케줄 파기 미구성.** 지금은 사람이 실행한다. 주기 실행(Vercel Cron 등)은
  비가역 동작을 무인 실행하는 것이라 승인 전에는 붙이지 않는다.
- **[승인 필요] 파기 이력 영속화 미구성.** `db/retention.sql` 에 `retention_audit` 표를 주석으로
  준비만 해 뒀다. 현재 실행 기록은 콘솔 출력뿐이다.
- **탐지는 컬럼명 기준이다.** 값의 내용을 보지 않으므로, 개인정보를 담았는데 이름이 전혀 다른
  컬럼(예: `note` 에 자유 입력으로 남는 개인정보)은 자동으로 잡히지 않는다. 자유 입력 필드를
  새로 만들 때는 1~2장에 직접 추가해야 한다.
- **법정 의무 보존기간과의 조정 미확정.** 적용 여부가 계약·서비스 범위에 따라 달라 임의로 적지
  않았다. 법무 검토 결과가 나오면 1·3장과 `RETENTION_DAYS` 를 함께 갱신한다.
- `maskPhone()` 을 세션/UMS 목록·내보내기 경로에 연결(별도 작업 항목).
