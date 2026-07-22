# D-ARS 개인정보 보관·파기 정책

> 상태: 초안(운영 반영 전). 실제 파기 실행은 운영자 승인이 필요하다. **[사람 승인 필요]**

## 1. 수집·보관하는 개인정보

D-ARS가 저장하는 개인식별정보(PII)는 **전화번호**가 유일하다.

| 테이블 | 컬럼 | 성격 | 기준 시각 |
| --- | --- | --- | --- |
| `visual_sessions` | `phone` | 보이는 ARS 상담 세션 발신번호 | `started_at` |
| `ums_log` | `phone` | UMS(문서 발송) 대상 번호 | `sent_at` |

그 외 테이블(`scenarios`, `docs`, `daily_stats`)은 개인정보를 담지 않는다(집계·설정 데이터).

## 2. 보관기간

- 기본 보관기간: **180일**(`RETENTION_DAYS` 환경변수로 조정, 하한 30일).
- 보관기간이 지난 데이터는 **행을 삭제하지 않고 전화번호만 익명화(NULL)** 한다.
  - 목적: 통계·이력(집계)은 보존하면서 식별정보만 제거한다.

## 3. 파기(익명화) 절차

1. **미리보기(DRY-RUN, 기본):**
   `node scripts/retention-purge.mjs`
   → 경과분 중 전화번호가 남은 행 수만 조회·출력. 데이터 변경 없음.
2. **실제 익명화(운영자 승인 필요):**
   `RETENTION_ENABLE=1 node scripts/retention-purge.mjs --commit`
   → `--commit` + `RETENTION_ENABLE=1` + `DATABASE_URL` 이 모두 충족될 때만 수행.
   세 조건 중 하나라도 빠지면 조회만 하고 안전하게 종료한다.

파기 SQL은 항상 `where <기준시각> < :cutoff and phone is not null` 조건을 포함한다(전량 삭제 방지 안전장치). 참조 SQL은 `db/retention.sql` 참고.

## 4. 표시·내보내기 시 마스킹

화면 표시나 CSV/엑셀 내보내기에서 전화번호 노출을 줄이려면 `lib/retention.js`의 `maskPhone()`을 사용한다(가운데 자리 마스킹, 예: `010-****-5678`). 현재는 유틸만 추가된 상태이며, 실제 표시/내보내기 경로 연결은 후속 작업이다.

## 5. 구성요소

- `lib/retention.js` — 순수 헬퍼(마스킹·보관기간·경계시각·파기 SQL 빌더). DB/런타임 비의존, 단위테스트 있음(`tests/retention.test.mjs`).
- `scripts/retention-purge.mjs` — 파기 실행기(DRY-RUN 기본).
- `db/retention.sql` — 참조 SQL·감사 테이블(선택) 정의.

## 6. 미결/후속 (사람 확인)

- 실제 파기 스케줄(예: 일 1회 DRY-RUN 리포트, 월 1회 승인 후 commit) 운영 정책 확정.
- `maskPhone()`을 세션/UMS 목록·내보내기 경로에 연결(별도 작업 항목).
- 필요 시 `retention_audit` 테이블로 파기 이력 감사로그화(`db/retention.sql` 주석 참고).
- 법·계약상 보관기간(통신/전자상거래 관련) 검토 후 `RETENTION_DAYS` 확정.
