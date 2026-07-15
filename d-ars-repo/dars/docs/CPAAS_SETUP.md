# D-ARS CPaaS / 콜봇 실연동 가이드

D-ARS는 **provider 무관** 연계 계층을 제공합니다. 키가 없으면 `mock`으로 동작해 **키 없이 E2E 테스트**가 가능하고, 키를 꽂으면 실연동됩니다.

## 흐름
인입콜(콜봇/CPaaS) → `POST /api/cpaas/voice` → 세션 생성 + 서명링크 → **고객에게 SMS 발송** → 고객이 `/visual?s=<token>` 열기 → 콜봇 이벤트 `POST /api/cpaas/events` → SSE(`/api/sessions/stream`)로 화면 실시간 갱신 → 고객 화면 액션 `POST /api/visual/action` → 콜봇 콜백.

## 지금 바로 테스트 (키 불필요)
```
GET https://d-ars.vercel.app/api/dev/simulate?phone=01012345678
```
→ 인입콜→세션→SMS(링크)→이벤트→액션 전 흐름 결과가 JSON으로 반환됩니다. (mock: SMS/콜백은 서버 로그 출력)

## 실연동 환경변수 (Vercel > Settings > Environment Variables)
| 변수 | 설명 |
|---|---|
| `CPAAS_PROVIDER` | `mock`(기본) 또는 `http` |
| `CPAAS_SECRET` | 고객 링크 서명 시크릿(랜덤 32자 이상) |
| `CPAAS_WEBHOOK_SECRET` | 인입 웹훅 헤더 `x-webhook-secret` 검증(설정 시 필수) |
| `SMS_GATEWAY_URL` | http provider의 SMS 발송 엔드포인트(솔라피/알리고/사내 게이트웨이) |
| `CALLBOT_CALLBACK_URL` | 화면 액션을 콜봇/CTI로 되돌릴 콜백 URL |
| `CPAAS_API_KEY` | 위 아웃바운드 호출 Bearer 토큰(선택) |
| `PUBLIC_BASE_URL` | 고객에게 보낼 링크 베이스(기본 d-ars.vercel.app) |

## 콜봇/통신사 연결 절차
1. 콜봇/CPaaS의 **인입콜 웹훅**을 `https://d-ars.vercel.app/api/cpaas/voice` 로 지정, 헤더 `x-webhook-secret` 설정.
2. 콜봇의 **STT/시나리오 이벤트**를 `POST /api/cpaas/events` 로 전송(sessionId·node·step).
3. D-ARS의 **화면 액션**을 받을 콜봇 콜백 URL을 `CALLBOT_CALLBACK_URL` 에 등록.
4. SMS는 `SMS_GATEWAY_URL`(국내: 솔라피/알리고). **발신번호 사전등록 필수(수일~2주)**.
5. Twilio 테스트콜: 번호 Voice 웹훅(POST)에 위 URL 지정.

## 운영 모드
- `DEMO_MODE=0` 이면 `/api/dev/simulate` 비활성(운영 보호).
