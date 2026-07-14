# tests · 무의존성 단위 테스트

D-ARS의 순수 유틸리티와 보안 로직을 검증하는 단위 테스트입니다.
**외부 의존성 0** — Node.js 내장 러너(`node:test`)만 사용합니다(프로젝트의 "의존성 없는" 원칙 준수).

## 실행

```bash
npm test
```

내부적으로 `node --no-warnings --test "tests/*.test.mjs"` 를 실행합니다.

## 요구 사항

- **Node.js ≥ 22 권장** (CI도 22로 고정).
  - `node --test` 의 내장 glob 확장은 Node **21+** 필요.
  - `.mjs` 테스트가 ESM 소스(`lib/*.js`)를 import 하는 데 필요한 모듈 구문 자동감지는 Node **20.19+/22+** 에서 동작.
- `--no-warnings` 는 `lib/*.js` 에 `"type"` 미지정으로 발생하는 `MODULE_TYPELESS_PACKAGE_JSON` 경고만 숨깁니다.

> 참고(사람 검토용): `package.json` 에 `"type": "module"` 을 추가하면 위 경고가 사라지고
> 구버전 Node 호환성도 좋아집니다. 저장소는 이미 100% ESM(모든 `.js`가 `import/export` 사용,
> CommonJS 파일 없음)이라 안전하지만, 전역 설정 변경이므로 `npm run build` 확인 후 사람이 반영하는 것을 권장합니다.

## 커버리지(현재 36개 케이스)

- `validate.test.mjs` — 입력검증: `clampStr`(공백·제어문자·길이·null), `clampNodes`(비배열·개수·필드 안전화), `readJson`(객체/배열/파싱실패), `badRequest`(400)
- `export.test.mjs` — 내보내기: `stampFilename`(날짜 스탬프·확장자), `toCSV`(따옴표 이스케이프·null), `toExcelHTML`(HTML 이스케이프·시트명)
- `ui.test.mjs` — 표시 유틸: `pct`(0 나누기 방지), `fmt`(mm:ss 패딩), `tagClass`(상태 매핑·기본값)
- `auth.test.mjs` — 인증 가드: open/verified/denied 모드, Bearer·x-ars-secret 헤더, 401 응답, 길이 상이 시크릿 거부
- `health.test.mjs` — 헬스체크 응답: `buildHealth`(connected 200·지연/커밋/환경, demo-fallback 하위호환, error 503, 기본값, latency=0 포함)

## 원칙

- 브라우저(window/DOM) 의존 함수(`downloadCSV`, `printPDF` 등)는 **순수 부분만** 테스트합니다.
- 개인정보·스키마·인증 규칙 로직은 **변경하지 않고** 기존 동작을 회귀 테스트로 고정합니다.
