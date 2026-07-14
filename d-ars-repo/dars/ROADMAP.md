# D-ARS 개발 로드맵 (자동 개발 백로그)

라이브: https://d-ars.vercel.app · 저장소: github.com/AI-JUNE/D-ARS (소스: `d-ars-repo/dars/`)
스택: Next.js(App Router) + Neon(Postgres) + Vercel. 운영: GOWON.

## ⚠ 배포 블로커 (2026-07-13 야간 — **원인 규명 완료**, 사람 1회 조치로 해소)

### 2026-07-14 야간(21회차): **조건 링크 복사(공유)** + **빈 결과 인라인 조건 지우기** — **여전히 push만 남음**
- 배경: 20회차까지 기간·검색어·필터·뷰·정렬이 전부 URL 에 보존되고(주소 하나 = 화면 완전 재현) 저장된 뷰·조건 지우기까지 갖췄다. 남은 두 구멍 — (1) 저장된 뷰는 **브라우저 localStorage 전용**이라 **남에게 건넬 수단이 없었다**(주소창을 직접 긁어야 했고 모바일에선 사실상 불가). (2) 조건을 좁혀 **0건**이 되는 순간 사용자의 시선은 표 한가운데(빈 자리)에 있는데 탈출구(✕ 조건 지우기)는 **툴바에만** 있어 화면을 다시 위로 훑어야 했고, `/docs`·`/ums` 는 **빈 안내 자체가 없어** 표가 그냥 비어 있었다(로딩 중인지·조건이 과한지·장애인지 구분 불가).
- 구현 (1) **🔗 링크 복사**: 순수 유틸 `lib/shareLink.js`(`shareUrl`·`normalizeQuery`·`normalizeOrigin`·`normalizePath`·`copyText` — 링크의 단위는 여전히 **쿼리 문자열 그 자체**라 새 조건 파라미터가 추가돼도 이 모듈은 안 바뀐다 · origin 이 없거나 `null`/`file:` 이면 **상대 링크로 폴백** · 조건이 없으면 파라미터 없는 순수 경로) + 공통 UI `lib/CopyLink.jsx`(클릭 시 **현재 조건이 담긴 절대 URL**을 클립보드에 복사 · 1.6초 '✓ 복사됨' + `aria-live` · `navigator.clipboard` 실패(권한 거부·비보안 컨텍스트) 시 **숨김 textarea + execCommand** 폴백, 그것도 안 되면 **prompt 로 링크를 띄워** 직접 복사 → 어떤 환경에서도 "복사 불가"로 끝나지 않는다). **`SavedViews` 가 품는 구조라 화면 파일 변경 0**(5개 목록 화면 툴바에 자동 배치).
- 구현 (2) **빈 결과 인라인 조건 지우기**: 공통 컴포넌트 `lib/EmptyRows.jsx`(`EmptyRow`(표) · `EmptyBox`(카드) · 상태별 문구 — 로딩/오류/**조건 있음**(문구 + 인라인 **✕ 조건 지우기**)/**조건 없음**(데이터 자체가 없음 → 버튼 미노출, 지울 것이 없으므로)). 5개 목록 화면(`/docs`·`/ums`·`/history`·`/sessions`·`/scenarios` 표·빌더 목록)의 0건 자리를 이 컴포넌트로 통일 → 화면마다 제각각이던 빈 안내 문구·마크업도 한 곳으로 모였다. `/scenarios` 는 `keep=['view']` — 뷰는 조회 '조건'이 아니라 표시 방식이므로 지울 때 보존한다(표에서 조건을 지웠는데 보드로 튕기지 않는다).
- 품질: 회귀 테스트가 **실제 버그 1건 검출·수정** — `normalizeQuery(' ?q=a ')` 에서 트림보다 `'?'` 검사가 먼저라 선행 공백이 있으면 `?` 가 살아남아 `??q=a` 형태의 깨진 링크가 될 수 있었다(트림을 먼저 수행하도록 수정).
- 안전성: 읽기 전용 · URL 쿼리와 클립보드만 다룬다 · 서버/DB/인증/과금 무관. 전화번호(PII)는 어느 목록에서도 서버 검색 대상이 아니라 **URL 에 실리지 않는다** → 공유 링크에 PII 가 새어 나갈 경로가 원천적으로 없다 → **저위험**.
- 검증: 클린룸 **`next build` ✓ exit 0(21/21 라우트)**, **`next lint` ✓ 경고 0**, **`node --test` 358/358 통과**(신규 `sharelink` 12종). **런타임 스모크**(`next start`): 조건이 붙은 5개 목록 주소 전부 SSR **200** · `/ums?range=7d` HTML 에 `저장된 뷰`·`＋ 현재 조건 저장`·`🔗 링크 복사`·`✕ 조건 지우기` 렌더 확인 · `/api/docs`·`/api/health` 응답 회귀 없음(빈 결과 안내는 데이터 로드 후 렌더되므로 SSR 에는 '불러오는 중…'이 나온다 — 기존 동작과 동일).
- 마운트 손상 재현(**26개** 절단 — 이번 변경과 무관한 기존 파일 포함, `app/globals.css` 말미 절단 포함) → host `Read` 원본을 **신규 경로**(`outputs\R21\`)로 복사해 클린룸 복원 후 검증(잔여 손상 0). **정본 파일은 무손상**. 15회차 이후의 진단 결론 그대로: 절단은 **말미 무결성 검사(마지막 바이트가 개행인가) + 전체 테스트 실행**으로만 확실히 잡힌다.
- 정리 권장(호스트, 커밋 무관): `outputs\R21\`(임시 복원본 26개) · `outputs\_probe.txt` · 이전 세션의 `dars\node_modules\@next\swc-linux-x64-gnu\`(약 125MB · gitignore 대상 — 두면 다음 야간 빌드가 빨라진다).
- **`.git` 은 여전히 `D-ARS\.git`(마운트 상위)** → 샌드박스에서 보이지 않아 커밋·push 불가(10회차 결론 유지). 라이브 `/api/health` 는 여전히 **구버전 응답**(`dbStatus`·`commit` 없음) = 미배포 상태 변화 없음. **사람이 `d-ars-repo\deploy.bat` 1회 실행하면 11~21회차 전 항목이 일괄 배포된다.**
- 잔여 컨펌 대상(변동 없음): **next 14.2.15 보안 패치 업그레이드**(배포 영향), `/api/sessions` INGEST_KEY 환경변수 발급, **docs 테이블 날짜 컬럼 추가**.

### 2026-07-14 야간(20회차): **조건 지우기(URL 조회 조건 초기화)** — **여전히 push만 남음**
- 배경: 17~19회차로 기간·검색어·필터·뷰·정렬이 전부 URL 에 보존되면서 **주소 하나 = 화면 완전 재현**이 됐지만, 그 반대 조작(**"전부 지우고 처음 상태로"**)이 없었다. 초기 화면으로 돌아가려면 기간 세그 '전체' → 상태 세그 '전체' → 검색창 비우기 → 정렬 헤더 두 번 눌러 해제(3단계 토글의 마지막 단계라 발견도 어렵다)… **조건 개수만큼 클릭**해야 했다.
- 구현: 순수 유틸 `lib/clearParams.js`(`countConditions`·`clearQuery`·`clearHref` — 지우는 단위는 **쿼리 문자열 그 자체**라 화면별 상태 모델을 몰라도 되고 새 파라미터가 추가돼도 이 모듈은 안 바뀐다 · `keep` 로 보존할 키 지정 가능 · 이상 입력은 조용히 0건 폴백) + 공통 UI `lib/ClearFilters.jsx`(**✕ 조건 지우기 (N)** — 적용된 조건 수를 배지로 표시, 0건이면 **비활성**(히스토리 오염 방지)). 되돌리기는 `history.pushState` + **popstate 직접 발생** → `useRangeParam`·`useUrlState`·`useSortState` 세 훅이 한 번에 초기값으로 복귀(화면별 개별 배선 0). **pushState 라서 뒤로가기 = 방금 지운 조건으로 정확히 복구**(실수로 눌러도 안전).
- 배치: 5개 목록 화면(`/docs`·`/ums`·`/history`·`/scenarios`·`/sessions`)의 **저장된 뷰 툴바 줄 오른쪽**에 자동 배치 — `SavedViews` 가 `<ClearFilters/>` 를 품는 구조라 **화면 파일 변경 0**(회귀 위험 0). 모바일은 flex-wrap 으로 다음 줄로 내려가 320px 무붕괴·무오버랩, 인쇄 시 숨김.
- 품질: 19회차에 `SavedViews` 안에 인라인이던 URL 구독 로직을 공통 훅 `lib/useQueryString.js`(useSyncExternalStore · SSR 스냅샷 '' → 하이드레이션 불일치 없음)로 분리해 두 컴포넌트가 공유(동작 동일·DRY).
- 안전성: 읽기 전용 · URL 쿼리만 조작 · 서버/DB/인증/과금 무관 · 전화번호(PII)는 애초에 URL 에 실리지 않는다 → **저위험**.
- 검증: 클린룸(신규 `npm install`) **`next build` ✓ exit 0(21/21 라우트)**, **`next lint` ✓ 경고 0**, **`node --test` 346/346 통과**(신규 `clearparams` 13종). **런타임 스모크**(`next start`): 조건이 붙은 6개 주소 전부 SSR **200**, `/docs`·`/ums`·`/history`·`/sessions` HTML 에 버튼 렌더 확인(`/scenarios` 는 툴바가 원래 클라이언트 렌더 → 기존 `저장된 뷰` 와 동일 동작, 회귀 아님) · 파라미터 없는 `/api/docs`·`/api/health` 응답 회귀 없음.
- **인프라 발견(다음 세션용)**: 샌드박스 디스크가 거의 가득(가용 ~165MB)이라 `npm install`(약 300MB)이 **디스크에 들어가지 않는다**. 회피법 두 가지 — (1) `/dev/shm`(2GB tmpfs)에 클린룸을 두면 설치는 되지만 **/dev/shm 과 백그라운드 프로세스는 bash 호출 사이에 유지되지 않는다**(호출마다 새 네임스페이스·`--die-with-parent`) → 한 호출(45초) 안에 끝나는 작업만 가능. (2) **채택**: 소스만 디스크 클린룸(~3MB)에 두고 `node_modules` 는 마운트(윈도우 설치본)로 심링크 + **리눅스 SWC 바이너리(`@next/swc-linux-x64-gnu@14.2.15`)만 마운트 `node_modules/@next/` 에 임시 설치** → `next build` 를 **웹팩 캐시(.next/cache)를 남기며 여러 호출에 걸쳐 재실행**하면 완주한다(1회차 컴파일 → 2회차 완료).
- 정리 권장(호스트, 커밋 무관): 위 임시 설치본 **`dars\node_modules\@next\swc-linux-x64-gnu\`**(약 125MB · gitignore 대상 · OneDrive 동기화 용량만 차지) — 샌드박스에서 삭제 권한이 없어 남겨 뒀다. 지워도 되고, 두면 다음 야간 세션 빌드가 빨라진다. 그 외 `dars\.verify\`, outputs 의 `R20__*` 임시 복원 파일.
- 마운트 손상 재현(**25개** 절단 — 이번 변경과 무관한 기존 파일 포함) → host `Read` 원본으로 클린룸 복원 후 검증(스텁 0, 잔여 손상 0). **정본 파일은 무손상**. 진단 보강: **`node --check` 는 절단을 놓칠 수 있다**(잘린 지점이 우연히 문법적으로 유효하면 통과) — 실제로 `app/api/scenarios/route.js`(GET·POST 전체 유실)·`lib/statsRange.js`·`lib/listSorts.js`·`lib/ui.js` 4개가 문법 검사를 통과하고도 손상 상태였고 **테스트 실행(누락 export 오류)** 으로만 드러났다. 확실한 탐지기는 **UTF-8 무결성/말미 절단 검사 + 전체 테스트 실행**이다.
- **`.git` 은 여전히 `D-ARS\.git`(마운트 상위)** → 샌드박스에서 보이지 않아 커밋·push 불가(10회차 결론 유지). 라이브 `/api/health` = `{"ok":true,"db":"connected","ts":…}` **구버전 응답**(`dbStatus`·`commit` 없음) = 미배포 상태 변화 없음. **사람이 `d-ars-repo\deploy.bat` 1회 실행하면 11~20회차 전 항목이 일괄 배포된다.**
- 잔여 컨펌 대상(변동 없음): **next 14.2.15 보안 패치 업그레이드**(배포 영향 · 이번 `npm install` 에서도 보안 경고 재확인), `/api/sessions` INGEST_KEY 환경변수 발급, **docs 테이블 날짜 컬럼 추가**.

### 2026-07-14 야간(19회차): 정렬 URL 보존 + **저장된 뷰(조회 조건 프리셋)** — **여전히 push만 남음**
- 배경: 17·18회차로 기간·검색어·필터·뷰는 URL 에 남았지만 **정렬만 컴포넌트 state** 였다 → 링크를 공유하면 상대는 같은 검색·필터·기간을 보지만 **순서는 다르게** 본다("완료율 낮은 순 1~3위 보세요"라고 보내도 상대 화면엔 기본 정렬). 새로고침하면 정렬이 풀리고 뒤로가기로 직전 정렬에 못 돌아갔다.
- 구현 (1) **정렬 상태 URL 보존(`?sort=&dir=`)**: 순수 유틸 `lib/sortUrl.js` + 훅 `lib/useSortState.js`. **스펙은 서버가 이미 쓰는 정렬 화이트리스트(`lib/listSorts.js`)를 그대로 재사용** → URL 에서 읽은 키는 서버 `parseSortParams` 화이트리스트를 반드시 통과한다(화이트리스트 밖이면 조용히 기본 정렬로 폴백 · SQL 에 미포함). `dir` 규칙(desc 만 인정, 그 외 asc)도 서버와 동일. **정렬이 없으면 파라미터 제거** → 주소는 기존과 100% 동일(하위호환). SSR 안전(첫 렌더 null → 하이드레이션 불일치 없음) · **history.replaceState**(정렬 토글이 뒤로가기 스택을 오염시키지 않음) · popstate 동기화 · `SortTh` 의 **함수형 갱신**(`onSort(s => nextSort(s,k))`) 그대로 지원 → 기존 `useState(null)` 자리를 1줄로 대체. 적용 5개 화면: `/docs`·`/ums`·`/history`·`/scenarios`·`/sessions`. → **이제 주소 하나 = 화면 완전 재현**(기간+검색+필터+뷰+정렬).
- 구현 (2) **저장된 뷰(조회 조건 프리셋)**: 순수 유틸 `lib/savedViews.js` + 공통 UI `lib/SavedViews.jsx`(5개 목록 화면). "실패 발송 · 최근 7일 · 시각 내림차순" 같은 상시 조회 조건을 매일 아침 손으로 5번 클릭해 재구성하던 반복 노동을 없앤다 — **현재 주소의 쿼리 전체를 이름 붙여 저장**하고 칩 한 번으로 복원한다. 복원은 `history.pushState` + **popstate 직접 발생** → `useRangeParam`·`useUrlState`·`useSortState` **세 훅이 모두 popstate 를 듣고 있으므로** 기간·검색어·필터·뷰·정렬이 한 번에 되살아난다(화면별 개별 배선 0). pushState 라서 **뒤로가기 = 직전 조건으로 복귀**. 현재 조건과 일치하는 칩은 강조(파라미터 **순서가 달라도 동일 조건으로 판정**). 저장은 브라우저 localStorage(화면별 키·최대 12개·이름 24자) → **DB 스키마 변경 없음 · 서버 무관**.
- 저장 대상에 **전화번호(PII)는 원천적으로 없다** — 전화번호는 어느 목록에서도 서버 검색 대상이 아니라 URL 쿼리에 실리지 않는다(기존 정책 유지). 읽기 전용·인증/과금 로직 불변 → **저위험**.
- 품질: `SavedViews` 의 현재 주소 추적을 **`useSyncExternalStore`**(SSR 스냅샷 분리)로 구현 — 의존성 없는 `useEffect`(무한 갱신 위험 · ESLint 경고)와 렌더 중 `location` 직접 읽기(비순수)를 둘 다 피했다. 모바일: 칩 `flex-wrap` → 320px 무붕괴·무오버랩, 인쇄 시 숨김.
- 검증: 클린룸(신규 `npm install`) **`next build` ✓ exit 0(21/21 라우트)**, **`next lint` ✓ 경고 0**, **`node --test` 333/333 통과**(신규 `sorturl` 10종 + `savedviews` 13종). **런타임 스모크**(`next start`): 정렬·기간·필터가 붙은 공유 링크 6종 SSR **200** · `/api/docs?sort=rate&dir=desc` = 완료율 84→80→77→73(**서버 전체 기준 정렬 정상**) · `sort=DROP;--&dir=x` **인젝션 문자열 = 기본 정렬 폴백(200)** · 파라미터 없는 `/api/docs`·`/api/ums` 기존 응답 회귀 없음.
- 마운트 손상 재현(25개 절단 — 이번 변경과 무관한 기존 파일 포함) → host `Read` 원본으로 클린룸 복원 후 검증(스텁 0, 잔여 손상 0). **정본 파일은 무손상**. 진단 보강: **이미 존재하는 파일을 host 도구로 덮어써도 샌드박스 마운트 뷰는 갱신되지 않는다**(스테일 캐시) — **새 경로로 쓴 파일만 정상적으로 보인다**. 따라서 복원은 반드시 `outputs\R__*` 같은 **신규 경로**를 거쳐야 한다(정본 되쓰기는 무의미하며 오히려 위험).
- **`.git` 은 여전히 `D-ARS\.git`(마운트 상위)** → 샌드박스에서 보이지 않아 커밋·push 불가(10회차 결론 유지). 라이브 `/api/health` = `{"ok":true,"db":"connected","ts":"2026-07-12T22:16Z"}` **구버전 응답** = 미배포 상태 변화 없음. **사람이 `d-ars-repo\deploy.bat` 1회 실행하면 11~19회차 전 항목이 일괄 배포된다.**
- 잔여 컨펌 대상(변동 없음): **next 14.2.15 보안 패치 업그레이드**(배포 영향), `/api/sessions` INGEST_KEY 환경변수 발급, **docs 테이블 날짜 컬럼 추가**.

### 2026-07-14 야간(18회차): 검색어·필터·뷰 URL 보존(항목 l) — **여전히 push만 남음**
- 구현: **검색어·필터 상태를 URL 쿼리에 보존** — 17회차에서 기간(`?range=`)만 URL 에 남겼고, 목록 화면의 **검색어·채널/상태 필터·뷰**는 여전히 컴포넌트 state 에만 있었다 → ① 새로고침하면 조건이 날아가고 ② "'실패' 발송분만 보세요"라며 링크를 공유해도 상대는 '전체'를 보고 ③ 뒤로가기로 직전 조건에 못 돌아갔다(감사·정산 협업 문제). → `lib/rangeParam` 의 설계를 **임의 키로 일반화**한 순수 유틸 `lib/urlState.js`(스펙 선언형: 자유 입력은 트림·100자 제한(서버 `q` 정책과 일치), 열거값은 **화이트리스트**만 허용(밖이면 조용히 기본값 폴백) · **기본값이면 파라미터 제거** → 조건이 없을 때 주소는 기존과 100% 동일 · **스펙 밖 파라미터(`range` 등)는 보존** → `useRangeParam` 과 같은 주소에서 공존) + 훅 `lib/useUrlState.js`(SSR 안전: 첫 렌더는 항상 기본값 → 하이드레이션 불일치 없음 · 마운트 후 URL 복원 · **history.replaceState**(글자 칠 때마다 뒤로가기 스택이 쌓이지 않음) · popstate 동기화 · `useSearchParams` 미사용).
- 적용 화면 5개: **`/docs`**(검색어) · **`/ums`**(검색어+상태) · **`/history`**(검색어+채널) · **`/scenarios`**(검색어+뷰 `?view=board|table`) · **`/sessions`**(검색어). → 기간(6개 화면)에 이어 **검색·필터도 링크 공유·새로고침·뒤로가기에 유지**된다.
- `lib/useList.js` 에 **제어(controlled) 검색어** 옵션 추가(`q`·`setQ` 를 넘기면 URL 상태가 소유권을 가짐, 안정된 함수 아이덴티티 유지). **미지정 시 기존 동작 그대로** → 기존 호출부 변경 0(완전 하위호환).
- 부수 개선(a11y): 채널·상태·뷰 세그먼트에 `role="group"`·`aria-pressed`·`type="button"` 부여(기간 세그와 동일 규격).
- 안전성: URL 값은 **화이트리스트/길이 제한**을 통과한 뒤에야 기존 API 파라미터 경로로 들어가고, 서버는 여전히 화이트리스트+$n 바인딩만 사용 → SQL 인젝션 무관. 전화번호(PII)·인증·과금 로직 불변, 읽기 전용 → 저위험.
- 검증: 클린룸(신규 `npm install`) **`next build` ✓ exit 0(21/21 라우트)**, **`next lint` 경고 0**, **`node --test` 296/297**(신규 `urlstate` 11종 전부 통과 · 실패 1건 = `tests/statsrange.test.mjs` **마운트 절단 아티팩트**(이번 변경과 무관)). 추가로 변경 5개 화면 + 신규 훅을 **esbuild 번들 검증**(임포트 해석·JSX·export 확인) 통과.
- 마운트 손상 재현(20개 파일 절단 — 이번 세션이 만들지 않은 기존 파일 포함) → host `Read` 원본으로 클린룸 복원 후 검증. **정본 파일은 무손상**(검증본을 정본 경로에 되쓰기 완료). 단 `app/globals.css` 는 마운트 뷰 말미(cmdk keyframes)가 잘려 **빌드 검증에서만 마지막 완결 규칙까지 잘라 사용**했다 — 정본 CSS 는 무손상이며 이번 변경과 무관.
- **`.git` 은 여전히 `D-ARS\.git`(마운트 상위)** → 샌드박스에서 보이지 않아 커밋·push 불가(10회차 결론 유지). **사람이 `d-ars-repo\deploy.bat` 1회 실행하면 그동안의 전 항목이 일괄 배포된다.**
- 잔여 컨펌 대상(변동 없음): **next 14.2.15 보안 패치 업그레이드**(배포 영향), `/api/sessions` INGEST_KEY 환경변수 발급, **docs 테이블 날짜 컬럼 추가**.

### 2026-07-14 야간(17회차): 기간 선택 URL 보존 + 시나리오 기간 필터 — **여전히 push만 남음**
- 구현: (1) **기간 선택 상태를 URL 쿼리(`?range=7d`)에 보존** — 기간 선택은 5개 화면(dashboard·stats·report·history·ums)에 있었지만 **컴포넌트 state 에만** 있어 ① 새로고침하면 '전체'로 되돌아가고 ② "최근 7일 이탈률 보세요"라며 링크를 공유해도 상대는 다른 구간을 보고 ③ 뒤로가기로 직전 구간에 못 돌아갔다(감사·정산 협업 문제). → 순수 유틸 `lib/rangeParam.js`(키 화이트리스트·타 파라미터 보존·**기본값('전체')이면 파라미터 제거** → 기존 주소와 100% 동일) + 훅 `lib/useRangeParam.js`(SSR 안전: 첫 렌더는 항상 기본값 → 하이드레이션 불일치 없음, 마운트 후 URL 복원 · **history.replaceState**(푸시 아님 → 뒤로가기 스택 오염 없음) · popstate 동기화 · `next/navigation`의 `useSearchParams` **미사용**(정적 프리렌더에 Suspense 경계를 강제해 렌더 구조가 바뀌는 것을 피함)). `useState(DEFAULT_RANGE)` 자리를 그대로 대체 → 6개 화면 적용. API 계약 불변(요청 파라미터는 여전히 `days=N`).
- 구현: (2) **`/scenarios` 기간 필터(수정일 `updated_at` 기준)** — 시나리오는 변경 이력 감사 대상인데 "이번 주에 손댄 시나리오만" 조회가 불가능했다. `/api/scenarios` 가 `?days=N`·`?from=&to=` 를 받고(기존 `lib/statsRange` 재사용), **목록·보드 그룹 건수(상태별 서버 총계)·내보내기가 모두 같은 구간**을 참조한다. 화면에 `RangeSeg`(수정일 기간) 추가. 태그드 템플릿 경로를 ums 와 같은 **null 통과 패턴**으로 통일(파라미터 없으면 기존 결과와 동일 — 완전 하위호환).
- **`/docs` 기간 필터는 이번 범위에서 제외**: `docs` 테이블에 **날짜 컬럼이 없다**(id·biz·name·req·sent·done·in_use). 기간 필터를 넣으려면 `created_at`/`updated_at` **스키마 추가**가 필요 → **[주간 컨펌 필요: 스키마 변경]** 으로 올리고 안전 항목으로 넘어갔다.
- 안전성: 날짜는 `strictDay` 통과값만 **$n 바인딩**(문자열 보간 없음) · URL 의 `range` 값은 프리셋 키 화이트리스트만 허용(알 수 없는 값은 조용히 기본값 폴백, SQL 에 미포함) · 기간 0건 응답이 데모 폴백으로 새지 않도록 `|| range` 조건 추가. 전화번호(PII)·인증·과금 로직 불변, 읽기 전용 → 저위험.
- 검증: 클린룸(신규 `npm install`) **`next build` ✓ exit 0(21/21 라우트)**, **`next lint` 경고 0**, **`node --test` 299/299 통과**(신규 `rangeparam` 16종). **런타임 스모크**(`next start`): 파라미터 없는 `/api/scenarios` = 기존 배열 4건 · `?days=7` = 0건(데모 수정일이 6월 → 정상, 데모 폴백 없음) · `?days=90` = 4건 · 인젝션 문자열 = 전 기간 폴백(4건) · 기간+정렬 동시(`nodes desc`) = 5→4→4→3 · 상태+기간(운영/90일 = 3건, 7일 = 0건) · 검색+기간 동시 · `/api/ums`·`/api/docs` 기존 응답 회귀 없음.
- 마운트 손상 재현(25개: 절단 24 + `docs/page.jsx` NUL 패딩) → host `Read` 원본으로 클린룸 복원 후 검증(스텁 0). **정본 파일은 무손상**.
- **`.git` 은 여전히 `D-ARS\.git`(마운트 상위)** → 샌드박스에서 보이지 않아 커밋·push 불가(10회차 결론 유지). **사람이 `d-ars-repo\deploy.bat` 1회 실행하면 그동안의 전 항목이 일괄 배포된다.**
- 잔여 컨펌 대상: **next 14.2.15 보안 패치 업그레이드**(배포 영향), `/api/sessions` INGEST_KEY 환경변수 발급, **docs 테이블 날짜 컬럼 추가(신규)**.

### 2026-07-13 야간(16회차): 목록 화면 기간 필터(/history·/ums) — **여전히 push만 남음**
- 구현: **멀티모달 이력·UMS 발송 로그에 기간 선택**(7·30·90일/전체). 기간 선택은 dashboard·stats·report 에만 있었고 **목록 화면은 항상 전 기간**이라 "지난 30일 발송분만" 같은 감사·정산 조회가 불가능했다. → `/api/multimodal`·`/api/ums` GET 이 `?days=N`·`?from=&to=` 를 받고(기존 `lib/statsRange.js` 재사용 + 신규 `rangeBounds`), **목록·총계·서버 집계(KPI·도넛·채널분포)·내보내기가 모두 같은 구간**을 참조한다. 공통 컴포넌트 `lib/RangeSeg.jsx`(세그먼트 · `RANGE_PRESETS` 단일 출처 · role="group"·aria-pressed · `.seg` flex-wrap 으로 320px 무붕괴) 신설. `/history` 는 표 헤더에 **서버가 실제 적용한 구간**(agg 응답의 `range`)을 라벨로 표시해 라벨-숫자 불일치를 막고, `/ums` 는 KPI 4장(전체·성공률·대기·실패)도 같은 기간의 서버 총계에서 파생한다.
- 안전성: 날짜는 `strictDay` 통과값만 **$n 바인딩**(문자열 보간 없음) → 인젝션 시도는 구간 미적용으로 폴백. 파라미터 미지정 = 기존 쿼리와 동일(**완전 하위호환**, 화면 기본값 '전체'). 전화번호(PII)·인증·과금 로직 불변, 읽기 전용 → 저위험. 부수 수정: **기간을 좁혀 0건인 DB 응답이 데모 폴백으로 새어 나가 "없는 이력이 있는 것처럼" 보이던 경로 차단**(`|| range` 조건 추가).
- 검증: 클린룸(신규 `npm install`) **`next build` ✓ exit 0(21/21 라우트)**, **`next lint` 경고 0**, **`node --test` 283/283 통과**(신규 `rangefilter` 11종). **런타임 스모크**(`next start`): 파라미터 없는 `/api/ums` = 기존 응답 그대로(30건) · `?days=7` = 구간 적용 · `from=2020-01-01&to=2020-01-31` = 0건(데모 폴백 없음) · 인젝션 문자열 = 전 기간 폴백(30건) · `/api/multimodal?agg=1&days=7` = `range` 응답 동봉 · 기간+정렬 동시 적용 확인(246→235→229).
- 범위 조정: 백로그의 "(i) /history·/sessions 기간 필터" 중 **/sessions 는 제외**했다 — 세션 보드는 `status='진행'` 인 **실시간 세션만** 보여 주는 화면이라 날짜 구간 필터가 의미가 없다(모두 방금 시작된 세션). 대신 감사·정산 가치가 큰 **/ums** 를 같은 구간 스펙으로 묶었다.
- 마운트 손상 재현(24개: 절단 24) → host `Read` 원본으로 클린룸 복원 후 검증(스텁 0). **정본 파일은 무손상**.
- **`.git` 은 여전히 `D-ARS\.git`(마운트 상위)** → 샌드박스에서 보이지 않아 커밋·push 불가(10회차 결론 유지). 라이브 `/api/health` = `{"ok":true,"db":"connected","ts":"2026-07-12T22:16Z"}` **구버전 응답** = 미배포 상태 변화 없음. **사람이 `d-ars-repo\deploy.bat` 1회 실행하면 그동안의 전 항목이 일괄 배포된다.**
- 잔여 컨펌 대상(변동 없음): **next 14.2.15 보안 패치 업그레이드**(배포 영향), `/api/sessions` INGEST_KEY 환경변수 발급.

### 2026-07-13 야간(15회차): 대시보드 기간 선택 + 알림 임계값 설정화 — **여전히 push만 남음**
- 구현: (1) **대시보드 기간 선택**(`/dashboard` 에 7·30·90일/전체 세그먼트) — 통계 기간은 `/stats`·`/report` 에만 있었고 대시보드는 **문구가 "최근 7일"로 고정**이라 실제 구간과 어긋났다. 이제 `statsUrl('/api/stats', range)` 로 같은 기간 파라미터를 쓰고, KPI(멀티모달 합계·증감)·영역차트·"일별 운영 추이"가 **모두 같은 구간**을 참조하며 라벨은 서버가 실제 적용한 구간(`range` 응답)에서 만든다. 5초 실시간 폴링과 통계 로드를 **별도 effect 로 분리** → 기간을 바꿔도 세션 폴링 타이머가 재설정되지 않는다. 기본값 '전체' = 기존 동작(하위호환).
- 구현: (2) **알림 센터 임계값 설정화** — 알림 규칙 기준값(서류 완료율 60%·요청 50건·UMS 실패 3건·대기 3건·장기 세션 180초·이탈률 8%)이 `lib/notify.js` 안 **하드코딩 상수**라 고객사마다 "주의" 선이 달라도 재배포 없이는 못 고쳤다(알림이 너무 시끄럽거나 너무 조용해도 방치). → 신규 순수 유틸 `lib/notifyRules.js`(스펙·기본값·정수화/범위 클램핑·URL 조립·localStorage 저장, SSR 안전)를 만들고 `/api/notifications` 가 쿼리 파라미터로 임계값을 받는다(**화이트리스트 키만 · SQL 에는 미포함 · 집계 쿼리 불변**). 화면에는 **⚙ 알림 기준 패널**(6개 항목·기본값 복원·자동 보정) 추가, **헤더 벨 배지도 같은 기준**으로 재조회(`dars:thresholds` 이벤트로 즉시 동기화)해 설정과 배지가 어긋나지 않는다. 파라미터 미지정 = 기존 상수와 동일 → **완전 하위호환**. 저장은 브라우저 로컬(**DB 스키마 변경 없음** → 저위험). 부수 개선: 레이아웃의 원시 `fetch('/api/notifications')` 를 `getJSON`(타임아웃·재시도 정책)으로 교체.
- 회귀 테스트가 **실제 버그 1건 검출·수정**: 빈 입력(`''`·`undefined`)에서 `Number('') === 0` 때문에 미입력 항목이 조용히 **최솟값**으로 바뀌던 클램핑 버그 → 빈 값은 null(기본값 유지)로 고정.
- 검증: 클린룸(신규 `npm install`) **`next build` ✓ exit 0(21/21 라우트)**, **`next lint` 경고 0**, **`node --test` 272/272 통과**(신규 `notifyrules` 14종). 추가 **런타임 스모크**(`next start`): 파라미터 없는 `/api/notifications` = 기본 임계값 응답 그대로 · `?docPct=90&sessionSec=60&umsFailBad=1` = 알림 재도출(주의 2건→10건, 긴급 1건) · 인젝션/쓰레기 문자열 = 기본값 폴백 · `/api/stats?days=7` = `range` 적용(7일), 파라미터 없으면 `range=null`.
- 마운트 손상 재현(23개: 절단 22 + `docs/page.jsx` NUL 패딩) → host `Read` 원본으로 클린룸 복원 후 검증(스텁 0). **정본 파일은 무손상**.
- **`.git` 은 여전히 `D-ARS\.git`(마운트 상위)** → 샌드박스에서 보이지 않아 커밋·push 불가(10회차 결론 유지). 라이브 `/api/health` = `{"ok":true,"db":"connected","ts":"2026-07-12T22:16Z"}` **구버전 응답** = 미배포 상태 변화 없음. **사람이 `d-ars-repo\deploy.bat` 1회 실행하면 그동안의 전 항목이 일괄 배포된다.**
- 잔여 컨펌 대상(변동 없음): **next 14.2.15 보안 패치 업그레이드**(배포 영향), `/api/sessions` INGEST_KEY 환경변수 발급.

### 2026-07-13 야간(14회차): `/api/stats` 기간 파라미터 + 시나리오 표 뷰(서버 정렬) — **여전히 push만 남음**
- 구현: (1) **`/api/stats` 기간 파라미터**(`?days=N` · `?from=&to=`) — 신규 순수 유틸 `lib/statsRange.js`. 이전에는 API가 **전 기간**을 통째로 내려주는데 화면 문구만 "최근 7일"이라 **라벨과 숫자가 어긋났다**(리포트 신뢰성 문제). 이제 `/stats`·`/report` 에 7·30·90일/전체 세그먼트를 두고, **daily·서비스 집계가 같은 구간**을 쓰며, 라벨은 **서버가 실제 적용한 구간**(`range` 응답 필드)에서 만든다. 파라미터가 없으면 `range=null` → **기존 쿼리를 한 줄도 바꾸지 않는다**(완전 하위호환). 날짜는 `strictDay`(전체 문자열이 정확히 `YYYY-MM-DD`, 2026-02-31 같은 미존재 날짜도 배제)를 통과한 값만 `$n` 바인딩 → **인젝션 시도 문자열은 구간 미적용으로 폴백**. 데모 daily 는 고정 과거 날짜라 캘린더 필터 시 0건이 되므로 `tailDays`(마지막 N일) 근사로 **라이브 데모 무붕괴**.
- 구현: (2) **시나리오 표 뷰 + 서버 전체 기준 정렬** — `/scenarios` 는 빌더·보드뿐이라 **정렬이 아예 불가능**했다(나머지 4개 목록 화면은 정렬 헤더 보유). `📋 표` 뷰를 추가하고 이미 존재하던 `SCENARIO_SORTS` 화이트리스트를 그대로 사용(ID·시나리오·유형·상태·버전·**노드수**·수정일, `SortTh` 키보드·`aria-sort`). 정렬은 서버 전체 기준이라 **'노드 많은 순' 1위가 페이지 로드량에 따라 달라지지 않고**, 내보내기도 같은 정렬로 수집한다. → **5개 목록 화면 전부 정렬 헤더 보유**.
- 검증: 클린룸(tmpfs·`npm install` 신규) **`next build` ✓ exit 0(21/21 라우트)**, **`next lint` 경고 0**, **`node --test` 258/258 통과**(신규 `statsrange` 14종). 추가로 **런타임 스모크**(`next start`): 파라미터 없는 `/api/stats` = 기존 응답 그대로 · `?days=7` = `range` 적용 · 인젝션 시도 문자열 = 전 기간 폴백 · `/api/scenarios?sort=nodes&dir=desc` = 5→4→4→3 정렬 확인.
- 마운트 손상 재현(16개: 절단 14 + `docs/page.jsx` NUL 패딩 + `globals.css` 말미 절단) → host `Read` 원본으로 클린룸 복원 후 검증. **정본 파일은 무손상**.
- **`.git` 은 여전히 `D-ARS\.git`(마운트 상위)** → 샌드박스에서 보이지 않아 커밋·push 불가(10회차 결론 유지). 라이브 `/api/health` = `{"ok":true,"db":"connected","ts":"2026-07-12T22:16Z"}` **구버전 응답**(`dbStatus`/`commit` 없음) = 미배포 상태 변화 없음. **사람이 `d-ars-repo\deploy.bat` 1회 실행하면 그동안의 전 항목이 일괄 배포된다.**
- 잔여 컨펌 대상(변동 없음): **next 14.2.15 보안 패치 업그레이드**(배포 영향), `/api/sessions` INGEST_KEY 환경변수 발급.

### 2026-07-13 야간(13회차): 시나리오 목록 서버 검색·페이징 + 정렬 스펙 통합 — **여전히 push만 남음**
- 구현: (1) **`/scenarios` 서버 검색·"더 보기" 페이징 전환**(마지막 남은 클라이언트 전량 로드 화면) — `/api/scenarios` 에 `limit/offset/q/sort·dir/status/meta` 추가(완전 하위호환·정렬 화이트리스트), 화면은 `useList`+`ListMore`(50건 누적·디바운스 300ms), **보드 그룹 건수는 서버 총계**, 내보내기는 `useExportAll`(현재 검색 조건 **전체 행**). (2) **정렬 스펙 `lib/listSorts.js` 통합** — docs·ums 라우트에 인라인으로 흩어져 있던 화이트리스트를 단일 파일로 모아 중복 제거 + 스펙 자체를 회귀 테스트. 회귀 테스트 12종 추가(`tests/scenarioslist.test.mjs`).
- 검증: 클린룸(tmpfs·`npm install` 신규) **`next build` ✓ exit 0(21/21 라우트)**, **`next lint` 경고 0**, **`node --test` 244/244 통과**.
- 마운트 손상 재현(12개: 절단 11 + `docs/page.jsx` NUL 패딩 + `globals.css` 말미 절단) → host `Read` 원본으로 클린룸 복원 후 검증. **정본 파일은 무손상**.
- **`.git` 은 여전히 `D-ARS\.git`(마운트 상위)** → 샌드박스에서 보이지 않아 커밋·push 불가(10회차 결론 유지). **사람이 `d-ars-repo\deploy.bat` 1회 실행하면 그동안의 전 항목이 일괄 배포된다.**
- 잔여 컨펌 대상(변동 없음): **next 14.2.15 보안 패치 업그레이드**(배포 영향), `/api/sessions` INGEST_KEY 환경변수 발급.

### 2026-07-13 주간(12회차): 정렬 서버 전환 **완료**(history·sessions) — **여전히 push만 남음**
- 구현: history 표에 **정렬 헤더 신규 도입**(`SortTh` · 키보드 Enter/Space · `aria-sort`) + **서버 전체 기준 정렬**(`/api/multimodal?sort=&dir=`), sessions **서버 전체 기준 정렬**(`/api/sessions?sort=&dir=`) + **SSE 삽입 정책 재설계**(정렬 중에는 신규 세션 삽입 보류 → 서버 정렬 순서 보존, 미정렬 시 기존 실시간 삽입 UX 유지). 정렬 화이트리스트를 `lib/listSorts.js` 로 분리해 **화이트리스트 자체를 단위 테스트**(키 집합·SQL 조각 안전성·파생값). 회귀 테스트 12종 추가(`tests/listsorts.test.mjs`).
- 검증: 클린룸(tmpfs·`npm install` 신규) **`next build` ✓ exit 0(21/21 라우트)**, **`next lint` 경고 0**, **`node --test` 232/232 통과**.
- 마운트 손상 재현(9개 파일: 절단 8 + `docs/page.jsx` NUL 패딩) → host `Read` 원본으로 클린룸 복원 후 검증. **정본 파일은 무손상**.
- **`.git` 은 `D-ARS\.git`(마운트 상위)에 정상 존재 → 샌드박스에서 보이지 않아 커밋·push 불가**(10회차 결론 유지). **사람이 `d-ars-repo\deploy.bat` 1회 실행하면 그동안의 전 항목이 일괄 배포된다.**
- 잔여 컨펌 대상(변동 없음): **next 14.2.15 보안 패치 업그레이드**(배포 영향), `/api/sessions` INGEST_KEY 환경변수 발급.

### 2026-07-13 주간(11회차): 정렬 서버 전체 기준 전환(docs·ums) — **여전히 push만 남음**
- `.git` 은 **`D-ARS\.git`**(마운트 상위 폴더)에 정상 존재하지만 샌드박스에서는 보이지 않는다 → 샌드박스 `git commit/push` 불가(오진 아님, 10회차 결론 유지). **사람이 `d-ars-repo\deploy.bat` 을 1회 실행하면 그동안의 전 항목이 일괄 배포된다.**
- 검증: 클린룸(tmpfs·`npm install` 신규) **`next build` ✓ exit 0(21/21 라우트, ESLint 경고 0)**, **`node --test` 220/220 통과**(신규 `sortparams` 13종 포함).
- 마운트 손상은 이번에도 재현(편집한 파일이 잘려 보임·NUL 패딩) → host `Read` 원본으로 클린룸 복원 후 검증. **정본 파일은 무손상**.
- 잔여 컨펌 대상(변동 없음): **next 14.2.15 보안 패치 업그레이드**(배포 영향), `/api/sessions` INGEST_KEY 환경변수 발급.

### 🔎 2026-07-13 야간(10회차): **".git 부재" 는 오진이었다 — 저장소는 정상, 마운트 범위 밖에 있었을 뿐**
- **핵심**: `.git` 은 **`D-ARS\.git`**(= `d-ars-repo` 의 **부모 폴더**)에 정상 존재한다. Cowork 에 연결된 폴더가 `d-ars-repo` 라서 샌드박스에서 부모의 `.git` 이 보이지 않았을 뿐이고, 그동안 8회에 걸쳐 "`.git` 부재 → git init 필요"로 기록한 것은 **오진**이다. 실제 원격도 살아 있다: `github.com/AI-JUNE/D-ARS` 의 최신 커밋은 `83e9321`(style: 품질 개선 v2+v3)이며 **그 이후의 야간 작업 전량이 미푸시** 상태다.
- **호스트에서는 git 이 정상 동작한다**(git 은 상위 폴더로 `.git` 을 탐색). 즉 `deploy.bat` 은 있는 그대로 잘 돌아간다 — 아무도 실행하지 않았을 뿐. **`git init` 이나 히스토리 재구성은 절대 하지 말 것**(불필요하고 위험).
- **샌드박스 push 불가 사유는 `.git` 부재가 아니라 자격증명 부재**: 원격 접근 자체는 되지만(`git ls-remote` 성공) 푸시엔 인증이 필요하고, 토큰은 정책상 다루지 않는다 → **사람이 1회 `deploy.bat` 실행(또는 `git push`)** 하면 그동안의 전 항목이 일괄 배포된다.
- **사람 조치(한 번이면 끝)**: `d-ars-repo\deploy.bat` 더블클릭 → npm ci·test·build 통과 시 y 입력 → push. 60~90초 후 https://d-ars.vercel.app/api/health 에 `dbStatus`/`commit` 필드가 보이면 반영 완료.
- 정리 권장(호스트, 커밋 무관): `dars\.verify\`, `dars\.sync-probe.txt`, outputs 폴더의 `R__*` 임시 파일.
- 잔여 컨펌 대상(변동 없음): **next 14.2.15 보안 패치 업그레이드**(배포 영향), `/api/sessions` INGEST_KEY 환경변수 발급.

## ⚠ 배포 블로커 (2026-07-12 야간 · 이전 기록 — 진단은 위 10회차에서 정정됨)

### 2026-07-12 야간(9회차): `/api/stats` 서비스별 집계 실측화 + `/report` 에러처리·실측 반영 — **여전히 push만 남음**
- `.git` 부재 재확인(`d-ars-repo`·`d-ars-repo\dars` 모두 — `.github`·`.gitignore` 만 존재) → 샌드박스 `git commit/push` 불가. **사람이 `deploy.bat` 1회 실행하면 그동안의 전 항목이 일괄 배포됨.**
- 검증: 클린룸(손상 파일 27개 host Read 원본 복원, 스텁 0) **`next build` ✓ exit 0(21/21 페이지·전 라우트)**, **`node --test` 184/184 통과**(신규 `services` 11종 포함).
- 손상 진단 보정: **host `Grep`의 줄 수는 공백 줄 포함 총 줄 수**이고 샌드박스 `grep -c .` 는 비어있지 않은 줄 수 → 두 값을 그대로 비교하면 정상 파일도 손상으로 오판한다(수 줄 차이는 정상). 실제 손상 판정은 **큰 폭 차이 + 파싱 오류**로 확인할 것. 이번 실제 손상: 26개 + `app/api/notifications/route.js`(NUL 패딩 → ESLint `Unexpected character` 로 드러남, `grep -P '\x00'` 로는 미탐지).
- 정리 필요(호스트): outputs 폴더의 `R__*` 임시 복원 파일, `dars/.verify/` → **사람이 삭제 권장**(커밋 무관).
- 잔여 컨펌 대상: **next 14.2.15 보안 패치 업그레이드**(배포 영향 · `npm install` 경고 재확인), `/api/sessions` INGEST_KEY 환경변수 발급.

### 2026-07-12 야간(8회차): dashboard·stats KPI 서버 집계 전환 + 사이드바 세션 카운터 총계 — **여전히 push만 남음**
- `.git` 부재 재확인(`d-ars-repo`·`d-ars-repo\dars` 모두) → 샌드박스 `git commit/push` 불가. **사람이 `deploy.bat` 1회 실행하면 그동안의 전 항목이 일괄 배포됨.**
- 검증: 클린룸(손상 파일 28개 전부 host Read 원본 복원, 스텁 0) **`next build` ✓ exit 0(21/21 페이지·전 라우트)**, **`node --test` 173/173 통과**(신규 `kpi` 10종 포함).
- 손상 진단 정밀화: **`lib/validate.js` 는 손상이 아님**(정규식에 `\x00-\x1f` 리터럴 제어문자가 들어 있어 NUL 탐지에 걸리는 **오탐**) → Read→Write 복원 시 제어문자가 소실되므로 **절대 복원 대상에 넣지 말 것**. 같은 이유로 `tests/validate.test.mjs` 11행도 원본 바이트 유지 필요. 실제 손상은 28개(신규 확인: `app/api/docs/[id]/route.js` 추가).
- 정리 필요(호스트): 이전·이번 검증 산출물 `dars/.verify/`, outputs 폴더의 `R__*` 임시 복원 파일 → **사람이 삭제 권장**(커밋 무관).
- 잔여 컨펌 대상: **next 14.2.15 보안 패치 업그레이드**(배포 영향), `/api/sessions` INGEST_KEY 환경변수 발급.

### 2026-07-12 주간(7회차): sessions 서버검색·페이징·집계 API 완료 — **여전히 push만 남음**
- `.git` 부재 재확인(`d-ars-repo`·`d-ars-repo\dars` 모두) → 샌드박스 `git commit/push` 불가. **사람이 `deploy.bat` 1회 실행하면 그동안의 전 항목이 일괄 배포됨.**
- 검증: 클린룸(손상 파일 28개 전부 host Read 원본 복원, 스텁 0) **`next build` ✓ exit 0(전 21개 라우트)**, **`node --test` 163/163 통과**(신규 `sessionslive` 20종 포함).
- 마운트 손상 진단법 정립: **host `Grep`(비어있지 않은 줄 수) vs 샌드박스 `grep -c .` 비교**로 절단 파일을 정확히 특정(파싱 성공하지만 잘린 파일까지 탐지). 이번 손상 28개 = 이전 세션과 동일 집합.
- 라이브 `/api/health` 는 샌드박스 도메인 제한으로 확인 불가 → `deploy.bat` 실행 후 확인 필요.
- 잔여 컨펌 대상: **next 14.2.15 보안 패치 업그레이드**(배포 영향), `/api/sessions` INGEST_KEY 환경변수 발급.

### 2026-07-12 주간(6회차): history 집계 API·서버검색·페이징 완료 — **여전히 push만 남음**
- `.git` 부재 재확인(`d-ars-repo`·`d-ars-repo\dars` 모두) → 샌드박스 `git commit/push` 불가. **사람이 `deploy.bat` 1회 실행하면 그동안의 전 항목이 일괄 배포됨.**
- **이번 세션은 클린룸을 손상 파일 28개 전부 host Read 원본으로 복원해 구성(스텁 0개) → `next build` ✓ exit 0(전 21개 라우트, 스텁 없이 실측)**, **`node --test` 143/143 통과**(신규 `aggregate` 12종 포함, 그동안 제외되던 `export`·`ui` 테스트 포함 전 파일 실행). 즉 정본 코드 전체가 무손상·빌드·테스트 통과 상태임이 이번에 가장 강하게 검증됨.
- 라이브 `/api/health` 는 샌드박스 도메인 제한으로 확인 불가 → `deploy.bat` 실행 후 확인 필요.
- 참고: 복원 산출물 `dars/.verify/`(gitignore 대상)는 샌드박스 권한상 삭제 불가 → **사람이 폴더째 삭제 권장**(커밋에는 영향 없음).
- 잔여 컨펌 대상: **next 14.2.15 보안 패치 업그레이드**(배포 영향), `/api/sessions` INGEST_KEY 환경변수 발급.

### 2026-07-12 주간(5회차): 포털 서버검색·"더 보기" 페이징(docs·ums) 완료 — **여전히 push만 남음**
- `.git` 부재 재확인(`d-ars-repo`·`d-ars-repo\dars` 모두) → 샌드박스 `git commit/push` 불가. **사람이 `deploy.bat` 1회 실행하면 그동안의 전 항목이 일괄 배포됨.**
- 라이브 `/api/health` 는 이번 세션에서 확인 불가(샌드박스 web_fetch 도메인 화이트리스트 제한 · curl 차단). 배포 상태는 `deploy.bat` 실행 후 확인 필요.
- 검증은 클린룸(홈 tmpfs, `npm install` 신규)에서 수행: **`next build` ✓ exit 0(전 21개 라우트 생성)**, **`node --test` 106/106 통과**(신규 `listurl` 11종 포함). 마운트 손상 파일은 host Read 원본으로 복원했고, 이번 변경과 무관한 손상 화면(dashboard·history·notifications·scenarios·sessions·stats, 일부 API)은 스텁으로 대체 — **정본 파일은 무손상**(host Read 확인). `tests/export.test.mjs`·`tests/ui.test.mjs` 2파일은 마운트 손상으로 이번 실행에서 제외(이전 세션 검증 완료).
- 참고: `npm install` 시 **next@14.2.15 보안 경고**(패치 버전 업그레이드 권고) 확인 → 의존성 업그레이드는 배포 영향이 있어 **주간 컨펌 대상**으로 올림.

### 2026-07-12 야간(4회차): 목록 API 페이지네이션·서버 사이드 검색 완료 — **여전히 push만 남음**
- 라이브 `/api/health` = `{"ok":true,"db":"connected","ts":"2026-07-11T14:16:15.814Z"}` → **구버전 응답**(`dbStatus`/`commit`/`env` 없음) = **미배포 상태 변화 없음**.
- `.git` 부재 재확인(`d-ars-repo`·`d-ars-repo\dars` 모두) → 샌드박스 `git commit/push` 불가. **사람이 `deploy.bat` 1회 실행하면 그동안의 전 항목이 일괄 배포됨.**
- 검증은 클린룸(tmpfs)에서 수행: **`next build` ✓ exit 0(전 라우트 생성 성공)**, **`node --test` 66/71 통과**(실패 5건은 전부 마운트 절단으로 소스가 잘린 `export/fetchJson/retry/ui` 테스트 — `SyntaxError`, 로직 버그 아님. 호스트 원본은 무손상이며 이전 세션에서 73/73 검증됨). 신규 `paginate` 테스트 10/10 통과.
- 클린룸 구성 시 마운트 절단 파일(portal 페이지 9종·health/scenarios 라우트·lib/auth.js 뒷부분)은 스텁/복원으로 우회 — **정본 파일은 무손상**(host Read 확인).

### 2026-07-12 야간(3회차): 자동 재시도·오프라인 감지 구현 완료 — **여전히 push만 남음**
- 라이브 `/api/health` = `{"ok":true,"db":"connected","ts":"2026-07-11T14:16:15.814Z"}` → **구버전 응답**(`dbStatus`/`commit`/`env` 없음) = **미배포 상태 변화 없음**.
- `.git` 부재 재확인(`d-ars-repo`·`d-ars-repo\dars` 모두) → 샌드박스 `git commit/push` 불가. **사람이 `deploy.bat` 1회 실행하면 그동안의 전 항목이 일괄 배포됨.**
- 마운트 손상 성격을 이번 세션에 추가 규명: **(a) 기존 파일을 덮어쓰면 마운트는 계속 옛 크기로 잘린 바이트를 반환**(호스트 원본은 무손상), **(b) 새로 만든 파일은 온전히 동기됨**. → 검증 시에는 수정본을 **새 경로에 사본으로 만들어** tmpfs에서 실행하는 우회가 유효(이번 세션 적용). `.verify/`·`.sync-probe.txt` 는 `.gitignore` 에 추가(커밋 오염 방지).

### 2026-07-11 야간(2회차): 에러처리 전 화면 확대 완료 + 클린룸 빌드 재통과 — **여전히 push만 남음**
- 라이브 `/api/health` = `{"ok":true,"db":"connected","ts":"2026-07-11T14:16:15Z"}` → **구버전 응답**(`dbStatus`/`commit`/`env` 필드 부재) = 미배포 상태 변화 없음.
- `.git` 부재 재확인(정본·상위 폴더 모두) → 샌드박스에서 `git commit/push` 불가. **`deploy.bat` 1회 실행이 유일한 배포 경로**(스크립트가 npm ci → test → build 통과 시에만 커밋·push, y/N 확인 포함).
- 마운트 손상(절단) 파일 목록도 재측정: `lib/auth.js`·`lib/ui.js`·`lib/export.js`·`app/api/{docs,scenarios,ums,sessions,health}` 라우트·`app/(portal)/{docs,ums}` + 이번 세션 편집분 6개 → **클린룸(tmpfs)에서 host Read 원본으로 복원 후 빌드 ✓ / 테스트 73/73 ✓**. 정본 파일 자체는 무손상.


### ✅ 2026-07-11 야간: **클린룸에서 `next build` 최초 통과 — 백로그 전체가 배포 가능함을 검증**
- 마운트 손상 2종을 규명: (1) **크기 절단**(예: `lib/auth.js` 145줄 → 마운트 88줄), (2) **NUL 제로패딩**(파일 크기는 맞지만 뒷부분이 0바이트: `lib/validate.js`·`app/api/notifications/route.js`·docs·ums·sessions 페이지). 그래서 샌드박스 빌드가 그동안 불가했다.
- 이번 세션은 host Read로 손상 파일 16개를 원본대로 복원해 tmpfs에 클린 프로젝트를 구성 → **`npm install` + `npm run build` ✓ Compiled successfully (전 라우트 생성 성공)**, **`node --test` 73/73 통과**(마운트 손상으로 복원 못 한 `tests/ui.test.mjs`·`tests/export.test.mjs` 25종 제외 — 이전 세션에서 89/89 검증 완료).
- **결론: 정본 코드는 빌드·테스트 모두 통과한다. 남은 것은 push 뿐이다.** 사람이 `deploy.bat` 1회 실행(또는 아래 명령)하면 그동안 완료된 전 항목이 일괄 배포된다.
- 라이브 `/api/health` 는 여전히 구버전 `{ok,db,ts}`(ts 2026-07-10T14:07:38Z) → 미배포 상태 변화 없음.

### 원인·조치 (이전 기록)
- **NEW (2026-07-11 주간)**: 정본 폴더에 **`.git` 자체가 없음**(`d-ars-repo\.git`·`d-ars-repo\dars\.git` 모두 부재 — host Read로 확인). 즉 기존 복구 명령의 `git add/commit/push`는 이 폴더에서 **"not a git repository"로 실패**한다. 실제 클론이 다른 경로에 있거나, 이 폴더가 한 번도 `git init` 되지 않은 상태. → 루트에 **`deploy.bat`(원클릭 복구·배포 스크립트)** 추가: `npm ci → npm test → npm run build` 통과 시에만 커밋·push, `.git` 부재를 감지하면 저장소 연결 방법(A: 기존 클론에서 실행 / B: init+remote+fetch+reset --soft) 안내. **push 여부는 스크립트가 y/N 로 사람에게 확인**받으므로 자동 배포 아님.
- 마운트 절단 재측정(2026-07-11 16:07 KST): 변화 없음 — `lib/auth.js` 88줄, `app/api/health/route.js` 6줄(정본 31줄), `lib/ui.js` 13줄, `lib/health.js` 20줄. host Read로는 전 파일 완전(무손상) 확인.
- **증상**: 라이브 `/api/health` 가 여전히 구버전 응답(`{ok,db,ts}`, 최신 확인 `2026-07-10T14:07Z`)만 반환 → 정본에 **완료·커밋된 다수 작업이 프로덕션에 미반영**. `dbStatus`/`commit` 필드 부재로 미배포 확정. (정본 `app/api/health/route.js` 는 이미 `buildHealth`·`dbStatus`·503·commit 신버전 확인됨.)
- **원인(인프라, 샌드박스 자체 해결 불가)**: 야간 자동 개발 환경에서 (1) `.git` 이 마운트에 없어 **`git push` 불가**, (2) OneDrive 마운트가 최근 수정 파일을 **잘린 바이트로 제공**(2026-07-11 재측정: `lib/auth.js` 88줄/정본 116줄, `app/api/health/route.js` 6줄로 문장 중간 절단, `lib/ui.js` 13줄, `lib/health.js` 20줄)해 `npm test`·`next build` 결과 신뢰 불가. tmpfs 로 복사해도 동일하게 잘려 복사됨(읽기 시점 절단). **host Read 도구로는 전 파일 정상·완전 확인됨** → 정본 파일 자체는 무손상.
- **결론**: 샌드박스에서는 빌드검증·push 모두 불가하므로, 검증 못 한 코드를 추가로 쌓지 않고 **호스트 1회 복구**를 대기하는 것이 안전. 아래 명령 한 번이면 그동안 완료된 전 항목이 일괄 배포됨.
- **2026-07-11 야간 재검증(로직 무손상 확인)**: 마운트 절단을 우회해 정본 파일 전체 내용을 host Read로 읽어 tmpfs에 재구성 후 순수 로직 테스트 실행 → **`node --test` 89종 전부 통과(89/89, 실패 0)**. 초기 3건 실패는 모두 인프라 아티팩트로 확인(테스트 소스 2개 마운트 절단 + 최소 tmpfs에 `@neondatabase/serverless` 미설치)이며 코드 버그 아님. 라이브 `/api/health` 는 여전히 구버전(`{ok,db,ts}`, ts `2026-07-10T14:07:38Z`)만 반환 → **미배포 상태 변화 없음**. 완료 백로그는 **로직상 무손상·배포만 대기**.
- **사람 조치(Windows/정본에서 1회 실행)**: `cd d-ars-repo\dars && npm ci && npm test && npm run build` 통과 확인 후 `git add -A && git commit -m "night backlog" && git push origin main` → 60~90초 후 `/api/health` 에 `dbStatus`/`commit` 필드가 보이면 반영 완료. 아래 "완료" 항목들의 개별 "정본에서 push 필요" 주석은 이 1회 push 로 일괄 해소됨.

## 디자인 원칙 (모든 작업 공통 · 최우선)
- 모바일 우선. 레이아웃 **절대 깨짐·겹침 금지**. 데스크톱/모바일 모두 품질 극대화.
- 반응형: 데스크톱 사이드바 / 모바일 드로어 + 하단 탭. 테이블은 카드 내 가로 스크롤.
- 참고 서비스 UI/UX를 D-ARS에 맞게 반영:
  - prism-pms.vercel.app/tasks — 다중 뷰(표/보드/타임라인/캘린더), 그룹화, 필터, CSV/Excel 내보내기, 진척바, 마감 경고
  - eum-app.vercel.app — 히어로 랜딩, 역할 진입 카드, 통계 카운터 애니메이션, 큰글씨 접근성, 따뜻한 카드 디자인
  - callbot-portal.vercel.app — 리치 관리자, 모바일 하단탭, 실시간 보드
  - gowon.co.kr — 코퍼레이트 톤/브랜드
- 브랜드 컬러 #be5535 유지. 각 변경 후 `next build` 통과 필수.

## 완료
- [x] 기획서·개발 명세서, 관리자 포털(단일 HTML), 풀스택(Next+Neon+API+시드)
- [x] GitHub→Vercel 자동배포, 모바일 반응형(드로어·하단탭·큰글씨), 랜딩(역할 진입·통계 카운터), 고객 보이는 ARS
- [x] 앱 라우터 견고성·품질: 브랜드형 404(not-found)·오류 바운더리(error·재시도)·로딩 상태(loading) + 루트 viewport/theme-color(#be5535) — eum-app 따뜻한 카드 톤 반영, 모바일 무붕괴
- [x] 표 검색·정렬(prism-pms 반영): 서류·UMS 화면 실시간 검색 + 컬럼 정렬(오름/내림/해제, 한글·숫자 자연 정렬) · 내보내기(CSV·Excel·PDF)는 현재 검색·정렬 결과 반영 · 모바일 무붕괴
- [x] 포털 라우트 스켈레톤 로딩(콘텐츠형 · 섹션헤더/KPI/표 골격 shimmer, 레이아웃 시프트 무붕괴 · prefers-reduced-motion 존중) + 키보드 본문 바로가기(skip-link, eum-app 접근성) + sr-only 유틸 — 야간 자동 품질 개선
- [x] 실시간 세션 보드 검색·정렬(prism-pms 반영): 세션ID·고객·시나리오·노드 실시간 검색 + 컬럼 정렬(오름/내림/해제, 한글·숫자 자연 정렬) · 내보내기(CSV·Excel·PDF) 검색·정렬 결과 반영 · SSE 실시간 갱신 유지 · 모바일 무붕괴
- [x] 브랜드 favicon(`/icon.svg`)·**PWA manifest**(홈화면 추가·standalone·theme #be5535)·SEO/소셜 메타데이터 강화(metadataBase·title 템플릿·openGraph ko_KR·twitter·robots·appleWebApp) — 레이아웃 무영향(무붕괴) 품질 개선
- [x] **대시보드 인포그래픽 개편**: 공통 애니메이션 차트 라이브러리 `lib/charts.jsx`(그라데이션 **영역차트**-라인 드로우·호버 툴팁, **그룹 막대**-바닥 그로우·툴팁·범례, **도넛**-원호 스윕·중앙 카운트업, **채워지는 진행바**-퍼센트 카운트업) · KPI 카드 아이콘/그라데이션 액센트/스파크라인/카운트업/등장 스태거 — 모바일 무붕괴·`prefers-reduced-motion` 존중 (통계·리포트로 확산 예정)
- [x] **인포그래픽 확산 — 멀티모달 이력(/history)**: 처리 결과 분포 도넛(완료·이탈·상담원 전환, 원호 스윕·중앙 카운트업) + 채널별 상호작용 진행바(건수 비중·현재 필터 반영) — `lib/charts.jsx` 재사용, 모바일 무붕괴·`prefers-reduced-motion` 존중

- [x] **커맨드 팔레트 · 빠른 이동**(prism-pms 빠른 이동 UX): 전역 단축키 `Ctrl/Cmd+K`·상단 검색 버튼(데스크톱/모바일)으로 열기 · 전 포털 화면 통합 검색(한글 라벨·경로·영문 키워드) · 키보드 완전지원(↑↓ 이동·Enter 열기·Esc 닫기·스크롤 추적) · 모바일 무붕괴·`prefers-reduced-motion` 존중·인쇄 숨김 — 야간 자동 품질 개선

- [x] **테스트 하네스 도입(상용화 품질)**: 의존성 0 · Node 내장 러너(`node:test`)로 순수 로직 회귀 테스트 19종 — 내보내기(`stampFilename` 날짜스탬프·`toCSV` 따옴표/쉼표/개행/null 이스케이프·`toExcelHTML` HTML 이스케이프+전화번호 서식), UI 헬퍼(`pct` 0분모 방지·`fmt` mm:ss·`tagClass`), RBAC(`roleAtLeast`·`minRoleFor` 하위경로·`findUser` 비밀번호 누출 방지), `jsonCached` 캐시 헤더 · `npm test`로 실행 · `package.json type:module`(전 소스 이미 ESM, 빌드 무영향) — 야간 자동 품질 개선

- [x] **쓰기 API 입력검증 일관 적용(상용 하드닝)**: `lib/validate.js`(readJson·badRequest·clampStr·clampNodes)를 세션 라우트에만 쓰이던 것에서 **scenarios·docs·ums POST** 3개 라우트에 확대 적용 — 잘못된 JSON body는 이제 500 대신 **400(`invalid json`)**, 문자열 필드는 컬럼 한도로 **길이 클램핑**(DB 오염 방지), 미제공 필드는 기존 기본값 흐름 유지(하위호환). **전화번호(개인정보) 처리 로직은 불변**(비PII 필드만 안전화). + **테스트 러너 커버리지 정상화**: `npm test` 글롭이 `.test.js`만 실행해 `.test.mjs` 46종(validate·rbac·session·health 등)이 CI에서 누락되던 문제 수정 → `tests/*.test.js tests/*.test.mjs` 로 확장, **총 65종 전부 통과**. 라우트 하드닝 계약 회귀 테스트 5종 추가 — 야간 자동 품질 개선 (※ 본 세션 샌드박스 시간제한으로 `next build`는 미완, 정본에서 빌드·커밋·push 필요)

- [x] **정렬 상태 URL 보존 + 저장된 뷰(조회 조건 프리셋)**: 5개 목록 화면의 정렬(`?sort=&dir=`)까지 URL 에 남겨 **주소 하나로 화면을 완전 재현**(기간+검색+필터+뷰+정렬)하고, 그 조건을 **이름 붙여 저장·복원**하는 프리셋 칩(localStorage·화면별 최대 12개)을 추가 — 매일 같은 조건을 손으로 재구성하던 반복 조회를 1클릭으로. 정렬 키는 서버 화이트리스트(`listSorts`) 재사용 → 인젝션 표면 없음. `next build` ✓ · `next lint` 경고 0 · `node --test` 333/333 — 야간 자동 품질 개선(19회차)

- [x] **조건 지우기(URL 조회 조건 초기화)**: 5개 목록 화면의 툴바에 **✕ 조건 지우기 (N)** 버튼 추가 — 기간·검색어·필터·뷰·정렬이 모두 URL 에 쌓이는 구조가 되면서 필요해진 반대 방향 조작(조건 개수만큼 클릭해야 초기 화면으로 돌아가던 문제)을 1클릭으로. 순수 유틸 `lib/clearParams.js` + 공통 UI `lib/ClearFilters.jsx`(0건이면 비활성) · `history.pushState`+popstate 로 세 URL 훅이 한 번에 초기화되고 **뒤로가기로 방금 지운 조건 복구** · URL 구독 로직은 공통 훅 `lib/useQueryString.js` 로 분리(SavedViews 와 공유). `next build` ✓ · `next lint` 경고 0 · `node --test` 346/346 — 야간 자동 품질 개선(20회차)

- [x] **표 정렬 로직 단일화(DRY·상용 하드닝)**: docs·sessions·ums 3개 화면에 바이트 단위로 중복되던 컬럼 정렬 비교자(한글·숫자 자연 정렬)를 `lib/ui.js` 공통 유틸 `compareVals`(숫자 수치비교/문자 `localeCompare 'ko' numeric`·null 안전)·`sortRows`(sort={key,dir}·원본 불변·안정 정렬·파생키 `val` 지원)로 추출 → 동작 100% 보존 리팩터링, 정렬 일관성·유지보수성 개선. 회귀 테스트 8종 추가(수치/자연/널안전/무정렬/오름내림·불변/파생키/안정성). ※ 본 세션 정본 폴더 마운트 캐시 지연으로 샌드박스 `npm test`·`next build` 재실행이 편집분을 반영하지 못함 → **로직은 클린 환경에서 8/8 통과 검증 완료**, 정본에서 `npm test`·`next build` 확인 및 커밋·push 필요 — 야간 자동 품질 개선

- [x] **헬스체크 실측 연결(상용 모니터링 하드닝)**: `/api/health` 라우트가 tested `lib/health.js`의 `buildHealth()`를 무시하고 인라인 응답만 반환하던 문제 수정 → 실제 **DB 프로브(`select 1`)로 연결성·지연(ms) 측정**, `dbStatus` 3단계('connected'/'demo-fallback'/'error'), **프로브 실패 시 503**(업타임 모니터가 장애 감지) + **배포 식별자**(Vercel `VERCEL_GIT_COMMIT_SHA` 단축·`env`) 노출, `Cache-Control: no-store`. 기존 필드(`ok`·`db`·`ts`) 유지로 **하위호환**, 데모 모드(무 DB)는 200/'demo-fallback' 불변. 라우트 GET 로직 회귀 시뮬 3종(데모/정상/실패) 통과 + 기존 `buildHealth` 단위 5종 커버. 개인정보·인증·과금 무관 저위험. ※ 정본 폴더 마운트 캐시 지연으로 샌드박스 `next build`가 편집분(잘려 보임)을 반영 못함 → 정본에서 `npm run build`·커밋·push 필요 — 야간 자동 품질 개선

- [x] **쓰기 API 인가 가드 확대(상용 인증 하드닝)**: 페이지 라우트만 보호하던 미들웨어와 달리 무방비였던 **관리자 CRUD write API** 6개 핸들러에 인증/역할 가드 적용 — `lib/auth.js`에 `guardWrite(req, need)`·`parseCookie` 추가(Edge/Node 겸용, `next/headers` 비의존, Cookie 헤더 직접 파싱). 적용: scenarios `POST`·`[id] PUT`(operator)·`[id] DELETE`(**admin**), docs `POST`·`[id] PUT`(operator), ums `POST`(operator). **안전장치: 미들웨어와 동일한 페일오픈** — 기본(비강제) 모드는 통과(null)라 라이브 데모 무붕괴, 운영자가 `AUTH_ENFORCE=1` 켰을 때만 미인증 **401**/역할부족 **403** 차단. sessions `POST`는 콜봇→서버 **기계 수집 엔드포인트**라 사용자 세션 쿠키 가드 부적합 → 이번 범위서 제외(별도 API-key 인증 설계 필요, 아래 다음 후보). 회귀 테스트 5종 추가(`tests/guard.test.mjs`: parseCookie·비강제통과·401·403·정상통과) 전부 통과. 전화번호(개인정보) 처리 로직 불변. ※ 정본 OneDrive 마운트 지연으로 샌드박스 `npm test`·`next build`가 편집분 미반영 → **로직은 클린 환경에서 5/5 통과 검증 완료**, 정본에서 `npm test`·`next build` 확인 및 커밋·push 필요 — 야간 자동 품질 개선

- [x] **CSV 수식 인젝션 방지(상용 보안 하드닝)**: CSV 내보내기가 `=`·`+`·`-`·`@`·tab·CR 로 시작하는 셀을 그대로 출력해, 사용자가 파일을 Excel·Sheets·LibreOffice로 열면 **수식으로 실행**될 수 있던 CSV 인젝션 취약점 수정 → `lib/export.js`에 `sanitizeCell()`(위험 문자로 시작하면 작은따옴표 접두로 텍스트 강제) 추가하고 `toCSV`에 적용. **전화번호(010-…)·한글·숫자·날짜(2026-…)는 위험 문자로 시작하지 않아 불변** → 전화번호 처리 로직 무영향(개인정보 무관). Excel(.xls) 내보내기는 이미 텍스트 서식(`mso-number-format:'\@'`)으로 수식이 실행되지 않아 전화번호 서식 보존 위해 미변경. 회귀 테스트 8종 추가(가드 트리거 6문자·전화/한글/숫자/날짜 불변·null·toCSV 통합) — 클린(tmpfs) 환경 4/4 검증 완료. ※ 정본 OneDrive 마운트 지연으로 샌드박스 `npm test`·`next build`가 편집분 미반영 → 정본에서 `npm test`·`npm run build` 확인 및 커밋·push 필요 — 야간 자동 품질 개선

- [x] **API 실패 UX·에러처리 하드닝(상용 품질)**: 포털 화면이 `fetch(...).then(r=>r.json()).then(setState)` 형태라 API 5xx·네트워크 단절·타임아웃 시 **빈 화면으로 조용히 실패**하고(사용자가 원인을 모름), 에러 HTML 응답에서는 예외가 그대로 터지던 문제 수정 → 공통 유틸 `lib/fetchJson.js`(`getJSON`/`postJSON`/`putJSON` — 절대 throw 하지 않고 `{data,error}` 반환 · **8초 타임아웃 AbortController**로 무한 대기 방지 · 상태코드별 한국어 메시지 401/403/404/429/5xx · JSON 파싱 실패 처리 · `asArray` 방어) + 공통 `lib/ErrorBanner.jsx`(role="alert" · **다시 시도** 버튼 · 모바일 무붕괴·무오버랩: flex-wrap·word-break) 도입, **서류(/docs)·UMS(/ums) 화면에 적용**(읽기·쓰기 모두). 전화번호(개인정보)·인증·과금 로직 불변 → 저위험. 회귀 테스트 9종 추가(`tests/fetchjson.test.mjs`: 상태코드 메시지·타임아웃 중단·네트워크 예외·JSON 파싱 실패·메서드/바디 전달·asArray). **클린룸 검증: `npm run build` ✓ 통과, `node --test` 73/73 통과.** ※ `.git` 부재로 push 불가 → `deploy.bat` 1회 실행 필요 — 야간 자동 품질 개선

- [x] **에러처리 하드닝 전 화면 확대(상용 품질 완성)**: 이전 세션에서 docs·ums에만 적용했던 `fetchJson`+`ErrorBanner`를 **나머지 6개 포털 화면 전체**(dashboard·stats·sessions·history·scenarios·notifications)로 확대 → 이제 모든 화면이 API 5xx·네트워크 단절·타임아웃(8초)에 대해 **한국어 배너 + 다시 시도** 를 제공하고, 조용한 빈 화면·영구 스켈레톤·무한 대기가 사라짐. 화면별 처리: **sessions** = SSE 정상 경로는 불변, SSE 끊김 후 폴백 폴링 실패 시에만 배너(재시도 시 스트림·폴링 재구성) · **dashboard** = sessions(5초 폴링)+docs+stats 3종 중 하나라도 실패하면 배너 · **scenarios** = 저장(PUT)·생성(POST) 실패를 성공처럼 알리지 않고 배너 표시(기존엔 실패해도 "저장됨" alert) · **history/notifications/stats** = 자동 갱신 실패 안내 + 빈 표 문구 분기(오류/무결과 구분). 전화번호(개인정보)·인증·과금 로직 불변 → 저위험. **클린룸 검증: `npm run build` ✓ 통과(전 라우트 생성), `node --test` 73/73 통과**(마운트 손상으로 복원 못 한 `ui.test.mjs`·`export.test.mjs` 2파일 제외 — 인프라 아티팩트). ※ `.git` 부재로 push 불가 → `deploy.bat` 1회 실행 필요 — 야간 자동 품질 개선

- [x] **오류 자동 재시도(지수 백오프) · 오프라인 감지(상용 회복탄력성)**: 에러 배너가 뜨면 사용자가 직접 '다시 시도'를 눌러야만 회복되던 문제 해결 → `lib/fetchJson.js` 에 **일시적 실패 자동 재시도** 도입(네트워크 단절·타임아웃·408·429·5xx 만 대상, 400/401/403/404 등 영구 실패는 즉시 반환). 지연은 **지수 백오프 400→800→1600ms(상한 4s) + 25% 지터**(썬더링 허드 완화), 기본 **GET 2회 재시도**. **쓰기(POST/PUT)는 기본 재시도 0 — UMS 문자 발송·세션 생성 중복 전송 방지**(안전 기본값, 필요 시 `retries` 옵션으로 명시 제어). Vercel 서버리스 콜드스타트·순간 단절은 이제 사용자 개입 없이 자동 회복. + **오프라인 감지**: `navigator.onLine === false` 면 네트워크를 두드리지 않고 즉시 안내(불필요한 8초 대기·재시도 제거), `lib/ErrorBanner.jsx` 에 `useOnline()` 훅·**`<OfflineBanner/>`** 추가하고 포털 레이아웃 본문 상단에 전역 배치 → 8개 화면 개별 수정 없이 전 포털에 적용, 온라인 복귀 시 자동 소멸. 레이아웃 무붕괴(문서 흐름 내 인라인·flex-wrap·word-break), SSR 안전(서버 렌더 시 항상 온라인 → 하이드레이션 불일치 없음). 회귀 테스트 12종 추가(`tests/retry.test.mjs`: 재시도 대상 판별·백오프 지수/상한/지터·오프라인 단락·4xx 무재시도·POST 무재시도·재시도 중 성공 회복·onRetry·retries 옵션). **검증: 클린(tmpfs)에서 `node --test` 21/21 통과**(신규 12 + 기존 fetchJson 9), **ErrorBanner.jsx esbuild 컴파일 ✓**(훅 규칙 준수 확인). ※ 마운트 손상으로 샌드박스 전체 `next build` 재현 불가(직전 세션 클린룸에서 전 라우트 빌드 ✓ 확인됨, 이번 변경은 신규 import 없음·기존 alias `@/lib/ErrorBanner` 사용) → 정본에서 `deploy.bat` 실행 시 빌드 게이트 통과 필요 — 야간 자동 품질 개선

- [x] **목록 API 페이지네이션 · 서버 사이드 검색(상용 확장성)**: 목록 API가 `limit` 고정(docs 무제한→100 / ums 100 / sessions 20 / multimodal 200)이라 데이터가 쌓이면 **오래된 행이 화면에서 사라지고**, 전체를 내려받아 클라이언트에서 거르느라 응답이 무거워지던 문제 해결 → 공통 유틸 `lib/paginate.js`(`parseListParams` limit 1..500 클램핑·offset 음수 방어·`q` 트림/100자 제한 · `likeParam` **ILIKE 와일드카드(`%`·`_`·`\`) 이스케이프** · `filterRows`/`sliceRows` 데모 폴백용 · `listResponse`) 도입하고 **docs·ums·sessions·multimodal 4개 GET 라우트에 적용**. DB 경로는 SQL `ILIKE` + `LIMIT/OFFSET` + `count(*)` 로 **서버에서 검색·페이징**(파라미터 바인딩만 사용 — SQL 인젝션 무관), 데모 폴백도 동일 의미로 동작. **완전 하위호환: 파라미터가 없으면 기존과 똑같이 배열을 기존 개수로 반환**(기존 8개 화면 코드 변경 0) — 신규 클라이언트는 `?limit=&offset=&q=&meta=1`(=`{rows,total,limit,offset,hasMore}` 객체)로 전환 가능하고, 배열 응답에도 **`X-Total-Count`·`X-Has-More`·`X-Limit`·`X-Offset` 헤더**를 실어 총 개수를 알 수 있다. **전화번호(PII)는 서버 검색 대상에서 제외**(ums·sessions·multimodal 모두 비PII 필드만 검색) → 개인정보·인증·과금 로직 불변, 저위험. 회귀 테스트 10종 추가(`tests/paginate.test.mjs`: 기본값 하위호환·limit 클램핑·offset 방어·q 트림/길이·meta 파싱·LIKE 이스케이프·검색 null 안전·슬라이스·배열+헤더 응답·meta 객체/hasMore). **검증: 클린룸 `next build` ✓ · `node --test` 66/71**(실패 5건은 마운트 절단 아티팩트) — 야간 자동 품질 개선. ※ 다음: 포털 화면을 서버 검색·"더 보기"로 전환(현재는 클라이언트 검색 유지).

- [x] **포털 서버 사이드 검색 · "더 보기" 페이징 전환 — 서류(/docs)·UMS(/ums)**: 두 화면이 전체 목록을 내려받아 클라이언트에서 거르던 방식을 폐기하고, API의 `limit/offset/q/meta` 를 실제로 사용하도록 전환 → 데이터가 쌓여도 **오래된 행이 화면에서 사라지지 않고**(더 보기로 계속 로드), 첫 응답이 가벼워진다(50건). 공통화: `lib/listUrl.js`(순수 유틸 — URL 조립·응답 정규화(meta 객체/배열 모두 수용, 하위호환)·페이지 누적 병합 시 **id 기준 중복 제거**) + `lib/useList.js`(훅 — **검색 디바운스 300ms**, 검색·필터 변경 시 offset 0 리셋, **경쟁 조건 방지**(요청 시퀀스로 늦은 응답 폐기), 실패는 throw 없이 `error` → 기존 ErrorBanner·자동 재시도 그대로 동작) + `lib/ListMore.jsx`(하단 "더 보기" + `표시/총 건수` — 모바일 무붕괴·무오버랩(flex-wrap·word-break), 인쇄 숨김). **UMS 대기/실패 KPI는 이제 로드된 행이 아니라 서버 총계(`meta=1` → `total`)로 집계** → 100건 상한에 걸려 과소 집계되던 문제 해소. 전화번호(PII)는 서버 검색 대상 아님(API 정책 유지) · 인증·과금 로직 불변 → 저위험. 정렬·내보내기는 기존대로 **로드된 행 기준**(UX 보존). 회귀 테스트 11종 추가(`tests/listurl.test.mjs`). **검증: 클린룸 `next build` ✓ exit 0(21 라우트) · `node --test` 106/106 통과.** ※ 남은 화면: sessions(SSE 구조 검토 필요)·history(KPI/도넛이 전체 집계 기반이라 서버 집계 API 선행 필요) — 다음 세션.

- [x] **멀티모달 이력(/history) 서버 집계 API · 서버 검색 · "더 보기" 페이징**: history 의 KPI(전체·완료율·이탈·평균 소요)·결과 도넛·채널 분포가 **화면에 로드된 행**만으로 계산돼 페이징 시 수치가 왜곡되던 문제를 근본 해결 → `/api/multimodal?agg=1` **서버 집계 엔드포인트** 신설(현재 조건=채널+검색어 **전체**에 대한 `{total, byResult, byChannel, avgDuration}`; DB 경로는 `group by result, channel` + `count/sum` 1회 쿼리, 데모 폴백도 동일 의미). 공통 순수 유틸 `lib/aggregate.js`(`aggregateRows`·`foldGroups`·`aggCount`·`readAgg` 방어적 정규화·`aggUrl`). 화면은 `useList`+`ListMore` 로 전환(50건씩 누적, 검색 디바운스 300ms·경쟁조건 방지·15초 자동 갱신 유지) 하고 **KPI/차트는 서버 총계**를 사용 → 페이징해도 완료율·이탈·평균이 정확. `useList` 에 `dq`(디바운스 검색어) 노출 추가 → 목록과 **동일 조건**으로 집계 요청. 검색어는 서버 검색(시나리오·서비스·노드·결과)이라 **전화번호(PII)는 검색 대상에서 제외**(기존 API 정책 유지, 클라이언트 번호 검색은 제거) · 인증·과금 로직 불변 → 저위험. 내보내기(CSV·Excel·PDF)는 기존대로 **로드된 행 기준**(docs·ums 와 동일 UX). 회귀 테스트 12종 추가(`tests/aggregate.test.mjs`). **검증: 클린룸(손상 파일 28개 전부 원본 복원, 스텁 0) `next build` ✓ exit 0(21 라우트) · `node --test` 143/143 통과.**

- [x] **실시간 세션(/sessions) 서버 검색 · "더 보기" 페이징 · 서버 집계 API — SSE 병행 설계**: 세션 보드가 스냅샷(최대 20건)만 통째로 교체하던 구조라 세션이 쌓이면 과거 행이 화면에서 사라지고, KPI(진행 세션·평균 경과·안내/발송·상담원 전환 대기)도 로드된 행으로만 계산돼 왜곡되던 문제 해결 → (1) 목록은 `useList`+`ListMore`(50건씩 누적, 서버 검색 `q`·디바운스 300ms·경쟁조건 방지), (2) **SSE 스냅샷은 목록을 교체하지 않고 병합** — 신규 순수 유틸 `lib/liveMerge.js`의 `applyLive`가 id 기준으로 **기존 행 갱신 + 새 세션만 맨 앞 삽입**(검색 중에는 조건 만족 여부 불명이라 삽입 금지·갱신만), 값이 같으면 동일 참조 반환(불필요 리렌더 방지), (3) **`/api/sessions?agg=1` 서버 집계 신설**(DB: `group by step,node` + `count/sum` 1회, 데모 폴백 동일 의미) + 순수 유틸 `lib/sessionsAgg.js` → KPI가 현재 검색 조건 **전체** 기준이라 페이징과 무관하게 정확. `useList` 에 `patch(updater)` 추가(로드된 행 외부 갱신용, 페이지 누적 상태 불변). SSE 끊김 시 4초 폴백 폴링도 동일 병합 경로. 검색 대상은 세션ID·시나리오·노드 — **전화번호(PII)는 서버 검색 대상에서 제외**(기존 API 정책 유지, 클라이언트 번호 검색 제거) · 인증·과금 로직 불변 → 저위험. 정렬·내보내기는 로드된 행 기준(docs·ums·history 와 동일 UX). 회귀 테스트 20종 추가(`tests/sessionslive.test.mjs`). **검증: 클린룸 `next build` ✓ exit 0(21 라우트) · `node --test` 163/163 통과.**

- [x] **대시보드·통계 KPI 서버 집계 전환 + 하드코딩 상수 제거(상용 데이터 정합성)**: `/dashboard`·`/stats` 의 KPI 숫자가 **하드코딩 상수**("4,182"·"540"·"902"·"318"·"1,220"·"74%")였고 증감률 배지도 고정 문자열이라 실제 데이터와 무관했다 → 신규 순수 유틸 `lib/kpi.js`(`sumBy` 일별합계·`fmtNum` 천단위·`lastDelta` **마지막 날 vs 직전 날 실측 증감률**(표본 부족·직전값 0·무변화면 배지 숨김 → 가짜 증감 제거)·`activeSessions`·`completionRate`·`dropRate`)로 전환. **stats** = 4개 KPI 전부 `/api/stats` 일별 통계 전체 합계에서 파생(기간 라벨 표시). **dashboard** = `📡 진행 중 세션`(`/api/sessions?agg=1` 서버 총계 — 기존 목록 20건 상한 제거) · `🚀 멀티모달 전환(7일)` · `✉️ 문자발송(UMS)`(`/api/ums?meta=1` 서버 총계) · `✅ 사용 완료율`(`/api/multimodal?agg=1` 서버 집계 — 로드된 행이 아닌 전체 기준). **부수 버그 수정: `lib/Counter.jsx` 카운트업이 최초 1회만 실행돼 서버 데이터 도착 후 값이 갱신되지 않던 문제**(값 변경 시 현재값→새 목표로 이어서 애니메이션, RAF 정리, `prefers-reduced-motion` 존중 유지). 전화번호(PII)·인증·과금 로직 불변, 읽기 전용 → 저위험. 회귀 테스트 10종 추가(`tests/kpi.test.mjs`). **검증: 클린룸 `next build` ✓ exit 0(21/21) · `node --test` 173/173 통과.**

- [x] **`/api/stats` 서비스별 집계 실측화(하드코딩 상수 제거) + `/report` 하드닝**: `/api/stats` 의 `services` 배열이 라우트에 **하드코딩된 상수**(주문상세 안내 540/300/120… 등)라 실제 운영 데이터와 무관한 숫자를 `/stats` 표·진행바에 그대로 노출하던 문제 해결 → 신규 순수 유틸 `lib/services.js`(`aggregateServiceRows` 데모 폴백 집계 · `foldServiceGroups` DB group-by 병합 · `readServices` 응답 정규화 · `servicesTotal`)로 전환하고, 라우트는 **`multimodal_log group by service`**(`count(*)` 발송 · `filter (where node='VISUAL_LAUNCH')` 자동런칭 · `filter (where channel='문자 발송')` 문자 · `filter (where result='이탈'/'완료')`) + **`ums_log group by service`(status='발송완료')** 를 병합해 산출. **문자발송은 UMS 실발송이 있으면 실측치 우선, 없으면 멀티모달 채널 로그로 폴백.** DB 미설정·테이블 부재 시 데모 로그로 **동일 의미의 집계 폴백**(하드코딩 상수 아님) → 라이브 데모 무붕괴. `/stats` 화면은 `readServices` 로 응답 정규화(형식 어긋나도 표 무붕괴). **`/report`**: 원시 `fetch().then(r=>r.json())` 3건을 `getJSON`+`asArray`+`ErrorBanner`(다시 시도)로 교체 → 데이터가 조용히 비어 **잘못된 리포트가 인쇄되던 위험 제거**(배너는 `noprint`), 서비스별 완료율 표를 실측 집계(발송·자동런칭·문자발송·이탈·완료·완료율)로 교체하고 기존 서류 표는 "서류별 완료율"로 분리. KPI(멀티모달·완료·완료율·이탈률)는 이미 `daily_stats` 서버 합계 기반이라 유지. 전화번호(PII)는 집계 대상 아님 · 인증·과금 로직 불변, 읽기 전용 → 저위험. 회귀 테스트 11종 추가(`tests/services.test.mjs`). **검증: 클린룸 `next build` ✓ exit 0(21/21) · `node --test` 184/184 통과.**

- [x] **내보내기 "서버 전체 기준" 전환(감사·정산 신뢰성)**: docs·ums·history·sessions 의 CSV/Excel/PDF 가 **화면에 로드된 행**(첫 50건 + "더 보기" 누른 만큼)만 담아 **사용자가 스크롤한 횟수에 따라 파일 내용이 달라지던** 문제 해결 → `lib/exportAll.js`(`fetchAllRows` — 현재 검색·필터 조건 전체를 limit/offset 순회 수집, 200건씩·최대 5000건 안전 상한, 절대 throw 하지 않고 `{rows,total,truncated,error}` 반환, 병리적 무한 페이지 방어) + `lib/useExportAll.js` 훅(중복 클릭 busy 차단, 실패는 기존 ErrorBanner 재사용, 상한 도달 시 "최대 N건까지만 내보냈습니다" 고지). 4개 화면 전부 적용, 정렬은 수집 후 적용 → 파일이 항상 **현재 조건 전체**를 담는다. 회귀 테스트 13종(`tests/exportall.test.mjs`). **검증: `next build` ✓ exit 0(21/21) · `node --test` 207/207 통과.**

- [x] **정렬 헤더 접근성 하드닝(a11y · 상용/공공 납품 기준)**: docs·ums·sessions 의 정렬 헤더가 `<th onClick>` 뿐이라 **키보드 사용자는 정렬을 실행할 수 없었고**(포커스 불가), 스크린리더가 현재 정렬 상태를 읽어주지 못했다(`aria-sort` 없음) → 공통 컴포넌트 `lib/SortTh.jsx`(tabIndex·role="columnheader"·**aria-sort**(none/ascending/descending)·**Enter/Space 로 정렬**(Space 스크롤 방지)) 도입하고 3개 화면 17개 헤더를 전환. 정렬 토글 로직도 3화면에 인라인 중복돼 있던 것을 `lib/ui.js` 의 순수 함수 `nextSort`·`sortArrow`·`ariaSort` 로 단일화(상태 전이 오름→내림→해제 100% 보존). 포커스 링은 `outline-offset:-2px` 로 셀 안쪽에 그려 **표 레이아웃을 밀지 않는다**(모바일 무붕괴·무오버랩). 회귀 테스트 10종(`tests/sortth.test.mjs` — 전이·불변성·화살표/aria 일치).

- [x] **UMS KPI 하드코딩 상수 제거(데이터 정합성 마무리)**: `/ums` 의 `오늘 발송 388`·`발송 성공률 86%` 가 실제 데이터와 무관한 **하드코딩 문자열**이었다(대시보드·통계는 이미 실측 전환 완료, UMS 만 남아 있었음) → 상태별 **서버 총계**(`?status=&limit=1&meta=1` → `total`)에서 파생하도록 교체: `전체 발송`(총계) · `발송 성공률`(발송완료/전체) · `대기` · `실패`. 전화번호(PII)·발송 로직 불변, 읽기 전용 → 저위험.

- [x] **포털 사이드바 실시간 세션 카운터 총계 전환**: `/api/sessions` 배열 길이(최대 20건 상한)로 세던 배지를 `/api/sessions?agg=1` **서버 총계**(`activeSessions`)로 교체 → 세션이 쌓여도 실제 진행 세션 수를 표시. 실패 시 조용히 유지(배지 미갱신, 배너 없음)·재시도 0(6초 폴링이 곧 재시도) → 레이아웃 무붕괴.

- [x] **정렬 "서버 전체 기준" 전환 — 서류(/docs)·UMS(/ums)**(2026-07-13 주간): 목록·내보내기는 이미 서버 전체 기준이었지만 **정렬만 "화면에 로드된 행"** 기준이라, 50건만 로드한 상태에서 '요청 많은 순'을 누르면 51번째 이후의 더 큰 값이 빠져 **1위가 틀리게 보이던** 문제 해결(감사·정산 신뢰성). → 신규 순수 유틸 `lib/sortParams.js`(`parseSortParams` **키 화이트리스트 검증** · `orderBySql` ORDER BY 조각 생성(`nulls last` + `id` 2차 정렬로 페이지 경계 중복·누락 방지) · `sortRowsBy` 데모 폴백 동일 의미 정렬 · `sortQuery` 화면→요청 파라미터 · `isSafeExpr` 방어). **SQL 인젝션 무관**: 사용자는 **키 이름만** 보낼 수 있고(`?sort=req&dir=desc`) 화이트리스트에 없으면 조용히 무시(기존 기본 정렬 유지), SQL 조각은 라우트가 선언한 서버 상수이며 값은 여전히 `$1` 바인딩. 태그드 템플릿이 컬럼명을 바인딩하지 못하는 제약은 **정렬이 지정된 경우에만** 함수 호출 형태 `sql(text, params)`(neon 0.10.4 지원)로 우회 → **정렬 미지정 경로(기존 쿼리)는 한 줄도 바뀌지 않아 회귀 위험 0**. 화면은 `sortQuery(sort)` 를 `useList`·`useExportAll` 파라미터로 넘기고 클라이언트 재정렬을 제거(정렬 변경 시 첫 페이지부터 재조회) → **목록·"더 보기"·CSV/Excel/PDF 가 모두 같은 전체 정렬 순서**를 쓴다. docs 의 완료율(파생값)은 DB `case` 식, 데모는 동일 의미 계산식으로 정렬. **전화번호는 정렬 대상이지만 서버 검색 대상은 여전히 아님**(PII 정책 유지) · 인증·과금 로직 불변, 읽기 전용 → 저위험. 회귀 테스트 13종 추가(`tests/sortparams.test.mjs`: 화이트리스트 밖 키·인젝션 시도 무시, 방향 파싱, nulls last, 동점 2차 정렬, 파생값, 원본 불변). **검증: 클린룸 `next build` ✓ exit 0(21/21 라우트·ESLint 경고 0) · `node --test` 220/220 통과.**

## 다음 스프린트 (우선순위 순 — 한 번에 1~2개씩)
-1. [x] **대시보드 기간 선택**(`/dashboard` 7·30·90일/전체 · KPI·차트 동일 구간) + [x] **알림 임계값 설정화**(⚙ 알림 기준 패널 · 헤더 벨 배지 동기화 · 스키마 변경 없음) — 2026-07-13 야간(15회차)
0. [x] **통계 기간 선택**(`/api/stats?days=|from&to`, `/stats`·`/report` 7·30·90일/전체) + [x] **시나리오 표 뷰**(서버 전체 기준 정렬·SortTh) — 2026-07-13 야간(14회차)
1. [x] 시나리오 **보드/타임라인/캘린더 뷰** + 상태 그룹화(prism 반영)
2. [x] **CSV 내보내기** 공통 유틸(시나리오·서류·세션·UMS·멀티모달 이력) + [x] **Excel(.xls) 내보내기**(의존성 없는 SpreadsheetML, 한글·전화번호 서식 보존, 5개 화면) + [x] **PDF 내보내기**(의존성 없는 브라우저 인쇄·숨김 iframe, 브랜드 리포트 서식·짝수행 음영·마스킹 표기, 5개 화면 공통 유틸 `printPDF`) + [x] **날짜 스탬프 파일명**(`stampFilename` — 일별 내보내기 덮어쓰기 방지·감사 추적, CSV·Excel 공통)
3. [x] **로그인 · RBAC**: `/login`(브랜드 로그인) · **HMAC 서명 세션 쿠키**(httpOnly·SameSite=Lax·Web Crypto, Edge/Node 겸용) · **역할별 접근 미들웨어**(viewer<operator<admin, 경로별 최소역할: /launcher=admin·/ums·/scenarios·/docs·/templates=operator) · `/api/auth/login|logout|me` · 사용자 메뉴 실연동(이름·역할·로그아웃) — 운영자 승인 반영(2026-07-07). **안전장치: 기본은 데모 통과(페일오픈), 운영자가 `AUTH_ENFORCE=1` + `AUTH_SECRET`/`AUTH_USERS` 설정 시 실제 접근 차단 활성화** → 라이브 데모 무붕괴
4. [x] **세션 실시간 동기** (SSE 스트림 `/api/sessions/stream`, 콜봇 이벤트 스키마) + **세션 write API** POST `/api/sessions`(launch/progress/complete/drop → Neon upsert, 데모 폴백) — 세션 페이지 EventSource+폴링 폴백·실시간 연결 표시. 서버리스 수명 한계로 WebSocket 대신 SSE 채택
5. [x] **알림 센터 · 연동 상태 · FAQ/도움말** 페이지 — FAQ·도움말(/help, 연동 상태 카드) · 알림 센터(/notifications: 서류 완료율·UMS 실패·장기 세션·이탈률 자동 도출, 심각도 정렬, 헤더 벨 배지, 읽음 관리)
6. [x] 대시보드 고도화: [x] 일별 운영추이 막대차트(멀티모달·완료·이탈) · [x] KPI 카운트업 애니메이션(대시보드·통계, prefers-reduced-motion 존중) · [x] PDF 리포트(/report: 일별추이·서비스완료율·세션 스냅샷, 브라우저 인쇄로 PDF 저장, 인쇄 전용 CSS)
7. [x] 화면 템플릿·런처 설정·멀티모달 이력 페이지 이식(단일 HTML 포털 → Next) — [x] 멀티모달 이력(/history: 채널 필터·검색·완료율/이탈 KPI·CSV, /api/multimodal 폴백) · [x] 화면 템플릿(/templates: 노드별 표출 카드 갤러리) · [x] 런처 설정(/launcher: 표출 트리거·SMS 초대 문구·브랜딩·폴백/타임아웃, 휴대폰 목업 라이브 미리보기)
8. [x] 전 화면 모바일 QA: 320/375/414px 오버랩·잘림 점검 — 보이는 ARS 데모(/visual) 반응형 프레임(min(390px,100%)·min(720px,80vh)) + 전역 하드닝: 긴 문자열 word-break, 사용자 메뉴 뷰포트 폭 캡, 런처 미리보기 모바일 sticky 해제(겹침 방지), 초소형(≤360px) 노드/세그 버튼 여백 축소

## 다음 후보 (야간 자동 개발 대상)
- ~~history 서버 검색·페이징 전환 + 집계 API~~ → 2026-07-12 완료(위 참조)
- ~~sessions 서버 검색·페이징 전환(SSE 병행)~~ → 2026-07-12 완료(위 참조)
- ~~dashboard/stats 서버 집계 전환~~ → 2026-07-12 야간 완료(위 참조)
- ~~포털 사이드바 세션 카운터 총계 전환~~ → 2026-07-12 야간 완료(위 참조)
- ~~/api/stats 실측화 · /report KPI 점검~~ → 2026-07-12 야간(9회차) 완료(아래 참조)
- ~~ESLint `react-hooks/exhaustive-deps` 경고 정리~~ → 2026-07-13 확인 결과 **경고 0건**(`next lint` = "No ESLint warnings or errors"). 이전 세션들의 리팩터링 과정에서 이미 해소됨.
- ~~**내보내기**를 서버 전체 기준으로 확대~~ → 2026-07-13 완료(위 참조, 4개 화면).
- ~~**정렬**을 서버 전체 기준으로 확대~~ → **docs·ums 2026-07-13 주간 완료**(위 참조). 설계 해소: `@neondatabase/serverless` 0.10.4 는 **함수 호출 형태 `sql(text, params)`** 를 지원(타입 정의·문서 확인) → 정렬 지정 시에만 이 경로를 쓰고 ORDER BY 는 **키 화이트리스트**에서만 생성(사용자 입력은 SQL 에 미포함, 값은 `$1` 바인딩 유지).
- ~~**정렬 서버 전환 잔여: sessions·history**~~ → **2026-07-13 주간(12회차) 완료**. sessions 는 `applyLive({insert})` 로 **정렬 중 삽입 보류**(검색 중 보류와 동일 경로) → 서버 정렬 순서 보존, 신규 세션은 다음 재조회에서 합류. history 는 `SortTh` 신규 도입(키보드·aria-sort) 후 처음부터 서버 정렬. 화이트리스트는 `lib/listSorts.js` 로 분리(테스트 가능). → **정렬·검색·페이징·집계·내보내기가 4개 목록 화면(docs·ums·history·sessions) 전부 서버 전체 기준으로 통일됨.**
- ~~(a) scenarios 목록 서버 검색·페이징~~ · ~~(c) docs·ums 스펙 `lib/listSorts.js` 통합~~ → **2026-07-13 야간(13회차) 완료**(위 참조). → **5개 목록 화면(docs·ums·history·sessions·scenarios) 전부 서버 기준 검색·페이징·정렬·내보내기로 통일됨.**
- ~~(b) `/api/stats` 기간 파라미터~~ · ~~(e) 시나리오 표 뷰·정렬 헤더~~ → **2026-07-13 야간(14회차) 완료**(위 참조). → **5개 목록 화면 전부 정렬 헤더 보유 · 통계/리포트는 기간 선택 가능.**
- ~~(f) `/api/stats` 기간을 대시보드에도 노출~~ · ~~(g) 알림 센터 임계값 설정화~~ → **2026-07-13 야간(15회차) 완료**(위 참조). → **통계 기간 선택이 dashboard·stats·report 3개 화면에 통일 · 알림 규칙은 운영자가 조정 가능(하드코딩 상수 제거).**
- ~~(i) 목록 화면 기간 필터~~ → **2026-07-13 야간(16회차) 완료**: `/history`·**`/ums`** 에 7·30·90일/전체 세그먼트(공통 `lib/RangeSeg.jsx`) + `/api/multimodal`·`/api/ums` 기간 파라미터. `/sessions` 는 `status='진행'` 실시간 보드라 날짜 필터가 무의미 → 의도적 제외. → **기간 선택이 dashboard·stats·report·history·ums 5개 화면에 통일.**
- ~~(j) `/scenarios` 기간 필터~~ · ~~(k) 기간 선택 상태를 URL 쿼리에 반영~~ → **2026-07-14 야간(17회차) 완료**(위 참조). `/scenarios` 는 `updated_at` 기준 기간 필터 + `?range=` URL 보존, 6개 화면(dashboard·stats·report·history·ums·scenarios)이 새로고침·링크 공유·뒤로가기에도 구간을 유지한다. **`/docs` 는 날짜 컬럼 자체가 없어 제외** → 아래 컨펌 항목으로 승격.
- ~~(l) 검색어·필터도 URL 쿼리에 보존~~ → **2026-07-14 야간(18회차) 완료**(위 참조). `lib/urlState.js`+`lib/useUrlState.js`(rangeParam 패턴 일반화)로 docs·ums·history·scenarios·sessions 5개 화면의 **검색어·채널/상태 필터·뷰**를 URL 에 보존 → 기간과 함께 링크 공유·새로고침·뒤로가기에 유지된다.
- ~~(n) 정렬 상태(`?sort=&dir=`) URL 보존~~ → **2026-07-14 야간(19회차) 완료**. ~~(o) 목록 화면 URL 조건 초기화 버튼~~ → **2026-07-14 야간(20회차) 완료**(위 참조) — 5개 목록 화면 툴바에 **✕ 조건 지우기 (N)**, 0건이면 비활성, 뒤로가기로 복구 가능.
- ~~(p) 저장된 뷰를 화면 간 공유 가능한 링크로 내보내기~~ · ~~(q) 빈 결과 안내에 "조건 지우기" 인라인 버튼~~ → **2026-07-14 야간(21회차) 완료**(위 참조). 5개 목록 화면 툴바에 **🔗 링크 복사**(현재 조건 절대 URL · 클립보드 실패 시 prompt 폴백), 0건 자리에 **상태별 안내 + 인라인 ✕ 조건 지우기**(`lib/EmptyRows.jsx` 로 통일).
- 다음 후보: (d) `/templates`·`/launcher` 설정 저장 API(현재 로컬 상태 — **신규 테이블 필요 → 스키마 추가는 주간 컨펌 권장**), (h) 알림 임계값을 서버(조직 단위) 설정으로 승격(현재 브라우저 로컬 — **신규 테이블 필요 → 주간 컨펌**), (m) `/scenarios` 표 뷰에 수정일 컬럼 기준 기본 정렬 옵션, (p) 저장된 뷰를 **화면 간 공유 가능한 링크**로 내보내기(현재는 브라우저 localStorage 전용), (q) 목록 화면 **빈 결과 안내에 "조건 지우기" 인라인 버튼** 노출(0건일 때 다음 행동을 즉시 제시).
- **docs 테이블 날짜 컬럼(`created_at`/`updated_at`) 추가 [주간 컨펌 필요: 스키마 변경]** — 현재 `docs` 는 날짜 컬럼이 없어 `/docs` 기간 필터·감사 조회가 불가능하다(17회차 확인).
- ~~포털 화면 서버 검색·"더 보기" 페이징~~ → docs·ums 2026-07-12 완료(위 참조)
- **next 14.2.15 → 패치 버전 업그레이드 [주간 컨펌 필요: 배포 영향]** — `npm install` 시 보안 경고 확인
- ~~목록 API 페이지네이션 · 서버 사이드 검색~~ → 2026-07-12 완료(위 참조)
- ~~오류 배너 후 자동 재시도(지수 백오프) · 오프라인 감지~~ → 2026-07-12 완료(위 참조)
- `/api/sessions` 머신 수집 API-key 인증(`guardIngest`)은 **구현 완료** — 운영 반영 시 `INGEST_KEY` 환경변수 설정 필요 **[주간 컨펌 필요: 운영 환경변수·키 발급]**

## 작업 규칙
- 각 작업: 구현 → `npm run build` 검증 → 커밋 → (가능 시) push → 배포 확인.
- 리스크 큰 변경(인증/삭제/과금/스키마 파괴)만 사용자 컨펌.
