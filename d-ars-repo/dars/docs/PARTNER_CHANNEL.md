# 파트너 채널 (제이투모로우원 — 운영 대행 + 수익 배분)

작성 2026-09-14. 정본: 스키마 `db/partner.sql` · 규칙 `lib/partner.js` · 테스트 `tests/partner.test.mjs`.

## 구조

| 표 | 역할 | 비고 |
|---|---|---|
| `partners` | 파트너(채널) | `name` 은 법인명 |
| `organizations` | 고객사(계약 주체). `partner_id` **NULL 이면 직접 계약** | `acquired_via` 는 `partner_id` 와 정합(check 제약) |
| `partner_attributions` | 매출 귀속 근거 — **추가 전용 이력** | 정정은 새 행. 최신 행이 유효(`currentAttribution`) |

계약·서비스 주체는 고원이다. 파트너는 영업·운영을 대행하고 수익을 배분받는다. 향후 리셀러(파트너 명의 계약)로
바뀔 수 있어 `organizations` 는 파트너 하나에만 매달리는 단순 구조로 두고, 화이트라벨·2계층 권한은 구현하지 않았다.
2계층이 필요해지면 **쿼리 계층(`lib/tenantQuery.js`) 한 곳**만 고치면 된다 — 아래 "조회 경로" 참고.

## 규칙(코드와 스키마가 같은 말을 한다)

- `partner_id` 있음 ⇔ 채널 `partner`, 없음 ⇔ `direct`. 어긋난 행은 `lib/partner.js` 가 `CHANNEL_MISMATCH` 로 거부하고
  스키마 `check` 제약이 한 번 더 막는다.
- 채널은 입력값이 아니라 **`partner_id` 에서 유도**한다(`attributionOf`). 입력의 채널은 대조용이다.
- 담당자는 운영자 **표시명**(`attributed_by`)만 남긴다. 계정 원문·전화·이메일은 저장하지 않으며, 자유 서술란
  `reason` 에 전화번호·이메일이 들어오면 `REASON_HAS_CONTACT` 로 거부한다.
- 파트너 범위 판정에 실패한 값(빈 문자열·형식 불량)은 **빈 결과**를 돌려준다 — 판정 실패를 전체 공개로 넘기지 않는다.
- 수수료율은 스키마·코드 어디에도 두지 않는다(정산 항목에서 설정값으로 분리 · 하드코딩 금지).

## 상태

- `partner_admin` 역할(`lib/auth.js`): 열람 등급은 viewer, 데이터 범위는 `partnerScopeOf(user)` → `scopeOrganizations` 로
  자기 파트너 고객사만. `PARTNER_ROLE_ENABLE=1` 이 아니면 로그인·권한 판정 모두 거부(기본 OFF **[승인 필요]**).
  계정 형식은 `docs/AUTH_ROLLOUT.md` 2·4장.
- 정산 리포트: `GET /api/admin/settlement`(admin) — 귀속 **이력** 기준 · 수수료율은 `PARTNER_COMMISSION_RATES` 설정값 · 근거 동반 · CSV(`docs/PARTNER_SETTLEMENT.md`).
  이용 실적 원천(과금 원장)은 아직 없어 청구액은 `amount_missing` 으로 남는다.
- 조회 경로는 아래 "조회 경로" 장으로 정리 완료. 파트너용 **화면**과 정산 화면은 후속 항목(`COMMERCIAL_READINESS.md`).
- 운영 DB 적용(`psql "$DATABASE_URL" -f db/partner.sql`)은 사람이 한다 **[승인 필요]**. `npm run db:setup` 은 이 파일을 적용하지 않는다.
- 실제 정산·청구는 계약서 확정 후.

## 조회 경로 — 테넌트 쿼리 계층 (`lib/tenantQuery.js`)

테넌트 표(`partners` · `organizations` · `partner_attributions`)를 SQL 로 읽는 곳은 **이 모듈 하나뿐이다.**
다른 소스에서 직접 조회하면 `tests/tenantquery.test.mjs` 의 우회 스캔이 실패한다(사유를 적은 예외 목록만 허용하고,
유령·낡은 예외도 함께 실패시킨다).

설계의 핵심은 "필터를 끼울 수 있게" 가 아니라 **"범위를 말하지 않으면 질의가 만들어지지 않게"** 다.

| 불변식 | 내용 |
|---|---|
| 범위 명시 강제 | `scope` 는 필수 인자. 빠뜨리면 전체가 아니라 **빈 결과**(`where false` + `SCOPE_REQUIRED`) |
| 화이트리스트 | 표·컬럼·정렬키는 등록부(`TENANT_TABLES`)에서만. 모르는 표는 이름조차 질의에 넣지 않는다 |
| 값 바인딩 | 모든 값은 `$1..` 파라미터. 값을 문자열로 결합하는 경로가 없다 |
| fail-closed | 형식 불량·판정 실패 범위(`''`)는 전부 빈 결과. 판정 실패를 전체 공개로 넘기지 않는다 |
| 쓰기 없음 | select 전용 — insert/update/delete 를 만들지 않는다(테스트가 감시) |

`scope` 값은 `lib/auth.viewerScope(req)` 가 준다(= `partnerScopeOf` 규약).

- `null` — 고원 직원. 전체.
- 파트너 id — 그 파트너 범위. `organizations` 는 `partner_id` 직접, `partners` 는 자기 행, `partner_attributions` 는
  고객사를 거친 하위 질의(고객사 소속이 바뀌면 이력 열람도 따라 바뀐다).
- `''` — 판정 실패(역할 미상 · 스위치 OFF · id 없음/형식 불량). 빈 결과.

비강제(데모) 모드에서 신원이 없으면 `null`(전체)이다 — 그 모드는 인증 자체가 없어 범위 제한이 성립하지 않는다
(`guardWrite` 가 통과시키는 것과 같은 계약). 강제 모드에서 신원이 없으면 빈 결과로 닫는다.

등록부는 `db/partner.sql` 실선언과 **양방향 대조**한다 — 표·컬럼이 늘거나 줄면 테스트가 실패해 등록부 갱신을 강제한다.

**한계(정직하게)**: 지금 이 계층을 쓰는 라우트는 정산 리포트 하나뿐이다(테넌트 표를 읽는 유일한 라우트).
`visual_sessions` 등 운영 데이터는 아직 고객사와 연결돼 있지 않아 범위 대상이 아니다 — 연결되는 시점에
등록부에 한 줄을 더하는 것이 남은 일이다. 화이트라벨·파트너 명의 계약(리셀러)은 여전히 미구현이다.
