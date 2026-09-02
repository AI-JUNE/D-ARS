// tests/routecontract.test.mjs — app/api 전 라우트가 지켜야 할 **소스 레벨 규약** 가드 (무의존성: node:test)
//
// 왜 소스를 읽어서 검사하나: 라우트 모듈은 '@/...' 별칭·next/server 를 쓰기 때문에 node:test 에서
// 그대로 import 할 수 없다. 규약 위반은 런타임이 아니라 **작성 시점**에 잡아야 의미가 있으므로
// 파일 내용을 정규식으로 검사한다(기존 tests/sourcelint·health 의 export 가드와 같은 방식).
//
// 검사 항목
//  1) HTTP 메서드·라우트 세그먼트 설정 외 export 금지 — Vercel 빌드 실패 예방(전 라우트로 확대).
//  2) 에러 응답 손수 조립 금지 — `{ ok: false, ... }` 리터럴은 lib/apiError 헬퍼로만.
//  3) 에러 응답을 내는 라우트는 lib/apiError(또는 이를 위임하는 lib/validate)를 import.
//  4) 요청 본문 파싱은 try/catch 또는 readJson 경유 — 깨진 JSON 이 500 으로 새지 않도록.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const API_DIR = fileURLToPath(new URL('../app/api', import.meta.url));

function routeFiles(dir = API_DIR, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) routeFiles(full, out);
    else if (entry === 'route.js' || entry === 'route.ts') out.push(full);
  }
  return out;
}

const ROUTES = routeFiles().map((f) => ({
  // 표시용 상대 경로(assert 메시지에 어느 파일인지 바로 보이게)
  name: path.relative(API_DIR, f).split(path.sep).join('/'),
  src: readFileSync(f, 'utf8'),
}));

test('라우트 파일이 발견된다(가드가 빈 배열로 통과하는 사고 방지)', () => {
  assert.ok(ROUTES.length >= 15, `라우트 수가 비정상적으로 적음: ${ROUTES.length}`);
});

// ── 1) export 화이트리스트 ────────────────────────────────────────────────
// route.js 에서 HTTP 메서드·설정 외의 것을 export 하면 Next.js 빌드가 실패한다.
const ALLOWED_EXPORTS = new Set([
  'GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS',
  'dynamic', 'revalidate', 'runtime', 'preferredRegion', 'dynamicParams', 'fetchCache', 'maxDuration',
]);

test('전 라우트: HTTP 메서드·설정 외 export 금지', () => {
  for (const { name, src } of ROUTES) {
    const names = [...src.matchAll(/^export\s+(?:async\s+)?(?:function|const|let|var|class)\s+(\w+)/gm)].map((m) => m[1]);
    for (const n of names) assert.ok(ALLOWED_EXPORTS.has(n), `${name}: 허용되지 않은 export ${n}`);
    assert.equal(/^export\s*\{/m.test(src), false, `${name}: export { } 구문 금지`);
    assert.equal(/^export\s+default/m.test(src), false, `${name}: default export 금지`);
  }
});

// ── 2) 에러 봉투 손수 조립 금지 ───────────────────────────────────────────
test('전 라우트: { ok: false } 리터럴 직접 작성 금지(lib/apiError 경유)', () => {
  for (const { name, src } of ROUTES) {
    // 주석 줄은 제외 — 설명문에 예시로 적는 것까지 막을 필요는 없다.
    const code = src.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
    assert.equal(/ok\s*:\s*false/.test(code), false, `${name}: 에러 응답은 lib/apiError 헬퍼로 생성할 것`);
  }
});

// ── 3) 에러 상태코드를 쓰면 헬퍼를 import 했는지 ─────────────────────────
test('전 라우트: 4xx/5xx 응답을 내면 apiError(또는 validate)를 import', () => {
  for (const { name, src } of ROUTES) {
    const code = src.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
    const hasStatusLiteral = /status\s*:\s*[45]\d\d/.test(code);
    if (!hasStatusLiteral) continue;
    assert.ok(
      /from\s+'@\/lib\/(apiError|validate)'/.test(code),
      `${name}: 에러 상태코드를 직접 쓰는 대신 lib/apiError 헬퍼를 사용할 것`,
    );
  }
});

// ── 4) 본문 파싱 무해화 ───────────────────────────────────────────────────
// `await req.json()` 은 깨진 본문에서 throw 한다 → 500. try/catch 로 감싸거나 readJson 을 쓴다.
test('전 라우트: req.json() 은 try/catch 또는 readJson 경유', () => {
  for (const { name, src } of ROUTES) {
    const code = src.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
    for (const line of code.split('\n')) {
      if (!/req\.json\(\)/.test(line)) continue;
      const guarded = /try\s*\{/.test(line) || /\.catch\(/.test(line);
      assert.ok(guarded, `${name}: 보호되지 않은 req.json() — readJson 또는 try/catch 사용: ${line.trim()}`);
    }
    // readJson 을 쓰는 라우트는 실패(null) 처리를 반드시 한다.
    if (/readJson\(/.test(code)) {
      assert.ok(/if\s*\(!\w+\)\s*return\s+\w*[bB]adRequest/.test(code), `${name}: readJson 실패(null) 시 400 처리 누락`);
    }
  }
});

// ── 5) 레이트리밋 응답 규약 ───────────────────────────────────────────────
// 429 를 내는 라우트는 Retry-After 를 붙여야 한다 → rateLimited() 헬퍼가 이를 보장한다.
test('레이트리밋 라우트: rateLimited() 헬퍼로 429 응답(Retry-After 보장)', () => {
  for (const { name, src } of ROUTES) {
    if (!/createRateLimiter\(/.test(src)) continue;
    assert.ok(/rateLimited\(/.test(src), `${name}: 429 응답은 apiError.rateLimited() 사용`);
  }
});
