# D-ARS 감사로그 영속화 (AUDIT PERSISTENCE)

> 기록은 `lib/audit.js`, 열람은 `/api/admin/audit`(admin 전용), 판정은 `lib/auditReadiness.js`.
> 점검: `npm run audit:check` (읽기 전용 · DB 무접속 · **환경변수 값 미출력**).

## 1. 왜 판정이 필요한가

감사 적재 실패는 **무해화 계약에 따라 조용히 삼켜진다.** 감사 기록이 로그인 요청을 실패시키면
안 되므로 이것 자체는 옳은 동작이다. 문제는 그 조용함이다.

- `AUDIT_DB=1` 을 켜고 `DATABASE_URL` 을 안 넣으면 → 적재가 아예 일어나지 않는다.
- `DATABASE_URL` 은 있는데 `db/audit.sql` 을 적용하지 않았으면 → insert 가 매번 실패한다.
- `AUDIT_DB=true` 처럼 쓰면 → 꺼진 채로 켠 줄 안다(플래그는 정확히 `1` 만 인정한다).

세 경우 모두 감사 화면은 **"0건"** 을 보여준다. 운영자는 그것을 "아무 일도 없었다"로 읽는다.
감사 로그는 사고가 난 뒤에야 들여다보는 자산이라, 그때 비어 있으면 되돌릴 방법이 없다.

## 2. 모드 판정 (`auditReadiness`)

| 모드 | 조건 | `/api/health` `deps.audit-persist` | 판정 |
| --- | --- | --- | --- |
| `console` | `AUDIT_DB` 미설정(기본) | `not-configured` | 정상(경고: 함수 로그 보존기간에 종속) |
| `db` | `AUDIT_DB=1` + DB + 적재 성공 | `ok` / 일부 실패 시 `degraded` | 정상 |
| `db-blind` | `AUDIT_DB=1` 인데 DB 없음, 또는 적재 전부 실패 | `error` | **차단** |

`audit-persist` 에는 `required` 를 붙이지 않는다 — 감사 적재 실패로 서비스 전체를 503 으로
만들지 않는다(가용성과 감사성의 균형: 알리되 죽이지 않는다).

## 3. 적재 관측 카운터

`lib/audit.js` 가 시도/성공/실패를 센다(`auditStats()`). `/api/health` 가 이 값을 읽어
`audit-persist` 상태를 만든다.

**한계(정직하게): 서버리스 인스턴스 로컬 메모리다.** 인스턴스가 재활용되면 0으로 돌아가고,
인스턴스마다 값이 다르다. "최근 이 인스턴스에서 적재가 되고 있는가"의 신호이지 총계가 아니다.
총계가 필요하면 `audit_events` 를 직접 세는 편이 정확하다.

적재 실패는 에러 모니터(`lib/monitor.captureError`)로도 한 번 올라간다(동적 import · 무해화 ·
`MONITOR_DSN` 미설정이면 콘솔 한 줄). 오류 원문은 카운터에 담지 않는다.

## 4. 영속화 전환 절차 **[승인 필요]**

1. `psql "$DATABASE_URL" -f db/audit.sql` — 테이블 생성(멱등 · 재실행 안전).
2. 적용 확인: `psql "$DATABASE_URL" -c "select to_regclass('public.audit_events');"` → NULL 이 아니어야 한다.
3. `AUDIT_DB=1` 설정(Vercel 대시보드에서 사람이 직접 · `docs/STAGING_OPERATIONS.md` 2장).
4. `/api/health` 의 `deps` 에서 `audit-persist` 가 `ok` 인지 확인. `error` 면 1~2단계를 다시 본다.
5. `/admin/audit` 에서 `persisted:true` 와 실제 행을 확인한다.

`npm run audit:check` 는 1~2단계를 확인하지 못한다(DB 에 붙지 않는다) — 안내 SQL 만 출력한다.

## 5. 기록 내용과 개인정보

- 이벤트 어휘는 화이트리스트(`AUDIT_EVENTS` 8종)로 고정. 자유 문자열은 기록되지 않는다.
- 계정·IP 는 **마스킹 후에만** 저장된다(원문 미보유 — `docs/PRIVACY_RETENTION.md` 2장의 면제 근거).
- `detail` 은 얕은 평면 객체만(키 8개·문자열 200자 절단), 쿼리스트링은 통째로 버린다.
- 수집(ingest) 성공은 기록하지 않는다(머신 트래픽 폭주 회피) — 거부만 남긴다.

## 6. 아직 하지 않은 것

- **[승인 필요] 운영 DB 에 `db/audit.sql` 적용 및 `AUDIT_DB=1` 전환.** 자동화가 하지 않는다.
- **감사 이력 보존기간 미확정.** `audit_events` 는 개인정보를 담지 않지만 무한정 쌓인다.
  보존기간·아카이빙 주기는 계약·감사 요건에 따라 달라 임의 수치를 적지 않았다. 확정 전까지는
  용량만 주기적으로 확인한다.
- **다중 인스턴스 합산 관측 미구현.** 3장의 한계 참조.
