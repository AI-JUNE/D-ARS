# D-ARS · 보이는 ARS (Visual ARS)

콜봇 시스템에 연계되는 **보이는 ARS** 풀스택 애플리케이션입니다.
스택: **Next.js(App Router) + Neon(Postgres) + Vercel** — 콜봇 포털과 동일 구성.

## 구성
- `app/(portal)/*` — 관리자 포털(대시보드·실시간 세션·시나리오·필요서류·UMS·통계)
- `app/visual` — 고객용 보이는 ARS 화면(통화 중 스마트폰 웹)
- `app/api/*` — REST API (scenarios / docs / sessions / ums / stats / health)
- `db/schema.sql`, `db/seed.sql` — Neon Postgres 스키마·시드
- `lib/db.js` — Neon serverless 클라이언트 (DATABASE_URL 없으면 데모 폴백)

> DATABASE_URL 미설정 시에도 데모 데이터로 완전 동작합니다(로컬 개발·미리보기 가능).

## 로컬 실행
```bash
npm install
npm run dev            # http://localhost:3000 → /dashboard
```

## Neon DB 연결
```bash
export DATABASE_URL="postgresql://...neon.tech/neondb?sslmode=require"
npm run db:setup       # schema.sql + seed.sql 적용
```

## GitHub → Vercel 자동배포
1. 이 폴더를 GitHub 리포지토리로 push
   ```bash
   git init && git add . && git commit -m "feat: D-ARS 보이는 ARS 초기 구축"
   git branch -M main
   git remote add origin https://github.com/<계정>/d-ars.git
   git push -u origin main
   ```
2. Vercel > **Add New Project** > 해당 GitHub 리포 Import (Framework: Next.js 자동 인식)
3. Vercel > **Storage** > **Neon** 생성/연결 → `DATABASE_URL` 자동 주입
4. 최초 배포 후 한 번 `npm run db:setup`(로컬) 또는 Neon SQL 콘솔에서 `db/schema.sql`·`db/seed.sql` 실행
5. 이후 `main` 브랜치 push마다 Vercel이 **자동 배포**합니다. (`.github/workflows/ci.yml`은 빌드 검증)

## API 요약
| 메서드 | 경로 | 설명 |
|---|---|---|
| GET/POST | `/api/scenarios` | 시나리오 목록/생성 |
| GET/PUT/DELETE | `/api/scenarios/[id]` | 조회/저장(버전↑)/삭제 |
| GET/POST | `/api/docs` `/api/docs/[id]` | 필요서류 |
| GET | `/api/sessions` | 실시간 세션 |
| GET/POST | `/api/ums` | UMS 발송 로그/발송 |
| GET | `/api/stats` | 이용 통계 |
| GET | `/api/health` | 상태·DB 연결 확인 |
