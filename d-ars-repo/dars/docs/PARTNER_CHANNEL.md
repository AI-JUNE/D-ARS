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
2계층이 필요해지면 테넌트 조회 경로에 `scopeOrganizations` / `scopeSql` 한 지점만 끼워 넣는다.

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
- 화면·API 배선(테넌트 조회 경로에 `partnerScopeOf` 끼워 넣기)과 정산 리포트는 후속 항목(`COMMERCIAL_READINESS.md`).
- 운영 DB 적용(`psql "$DATABASE_URL" -f db/partner.sql`)은 사람이 한다 **[승인 필요]**. `npm run db:setup` 은 이 파일을 적용하지 않는다.
- 실제 정산·청구는 계약서 확정 후.
