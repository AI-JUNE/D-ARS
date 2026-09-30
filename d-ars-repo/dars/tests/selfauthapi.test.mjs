// tests/selfauthapi.test.mjs — 포털 세션 대신 **자체 인증**으로 지키는 API 목록의 양방향 대조
//
// 고친 결함: 이 목록은 `middleware.js` 의 matcher 정규식 안에만
// `(?!auth|health|cpaas|visual|dev)` 로 적혀 있었고 아무도 대조하지 않았다. 그래서
// 「이음 어르신 신청」 제출(`/api/eum/senior/preferences`)이 목록에서 **빠져 있었다**.
// `AUTH_ENFORCE` 가 꺼져 있는 동안 미들웨어는 통째로 통과하므로 테스트도 화면도 멀쩡했고,
// 스위치를 켜는 순간 어르신의 제출만 전부 401 로 떨어진다(포털 로그인 쿠키가 없다).
// 화면은 401 을 「링크가 올바르지 않습니다. 담당자에게 다시 요청해 주세요」로 안내하므로
// 담당자는 링크를 다시 보내고, 결과는 매번 같다 — 링크는 멀쩡한데 신청이 영영 되지 않고
// 양쪽 모두 원인을 알 길이 없다.
//
// 그래서 세 방향을 고정한다.
//   (1) 등록부 ↔ matcher 리터럴 (누락·유령 모두 실패)
//   (2) matcher 의 **실제 판정** — 면제돼야 할 경로·조여야 할 경로를 정규식으로 확인
//   (3) 로그인 없이 쓰는 화면이 부르는 API 는 반드시 면제 목록에 있다(이 결함의 재현 조건)

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, relative, sep } from 'node:path';
import { SELF_AUTH_API, selfAuthApiPrefixes, isSelfAuthApi } from '../lib/auth.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(resolve(root, rel), 'utf8');
const middleware = read('middleware.js');

// matcher 에서 `/api/((?!a|b|c).*)` 의 면제 접두어를 뽑는다.
function matcherPrefixes(src) {
  const m = /'\/api\/\(\(\?!([^)]*)\)\.\*\)'/.exec(src);
  return m ? m[1].split('|') : null;
}

// matcher 리터럴을 그대로 정규식으로 옮긴다(Next 는 이 안의 `(?!…)` 를 정규식으로 읽는다).
function matcherRegex(src) {
  const m = /'(\/api\/\(\(\?![^)]*\)\.\*\))'/.exec(src);
  assert.ok(m, 'middleware.js 의 API matcher 를 찾지 못했다');
  return new RegExp(`^${m[1]}$`);
}

test('등록부에는 접두어와 **사유**가 함께 적혀 있다(왜 면제인지 없으면 다음 사람이 늘린다)', () => {
  assert.ok(SELF_AUTH_API.length >= 6, `면제 목록이 비정상적으로 짧다: ${SELF_AUTH_API.length}`);
  for (const e of SELF_AUTH_API) {
    assert.equal(typeof e.prefix, 'string');
    assert.ok(e.prefix && !e.prefix.startsWith('/'), `접두어는 /api/ 뒤의 조각이다: ${e.prefix}`);
    assert.ok(typeof e.why === 'string' && e.why.length >= 10, `사유 없는 면제: ${e.prefix}`);
  }
  // 중복은 조용히 무해하지만, 목록이 두 사람 손을 거쳤다는 신호다.
  const seen = selfAuthApiPrefixes();
  assert.equal(new Set(seen).size, seen.length, '중복된 접두어');
});

test('등록부 ↔ middleware matcher 양방향 대조(누락·유령 모두 실패)', () => {
  const inMatcher = matcherPrefixes(middleware);
  assert.ok(inMatcher, 'matcher 형태가 바뀌었다 — 대조가 무의미해지기 전에 이 테스트를 고쳐라');
  assert.deepEqual(
    [...inMatcher].sort(),
    [...selfAuthApiPrefixes()].sort(),
    'lib/auth.SELF_AUTH_API 와 middleware.js 의 면제 목록이 어긋난다',
  );
});

test('이음 어르신 신청 제출은 포털 세션 검사에서 면제된다(AUTH_ENFORCE 를 켜도 신청이 된다)', () => {
  const re = matcherRegex(middleware);
  assert.equal(re.test('/api/eum/senior/preferences'), false, '켜는 순간 어르신 제출이 401 로 죽는다');
  assert.equal(isSelfAuthApi('/api/eum/senior/preferences'), true);
});

test('면제는 좁게 — 아직 없는 발급 API 는 실인증 뒤에 남는다', () => {
  const re = matcherRegex(middleware);
  // 링크 발급은 그 자체가 인증 수단을 찍어 내는 일이라 실인증 전환과 함께 열어야 한다
  // (EUM_INTEGRATION.md 「발급 화면·API」 [승인 필요]). `/api/eum` 을 통째로 면제하면
  // 그 라우트가 생기는 날 아무 게이트 없이 열린다.
  for (const gated of ['/api/eum/link', '/api/eum/links', '/api/eum', '/api/admin/audit', '/api/ums/send']) {
    assert.equal(re.test(gated), true, `세션 검사 대상이어야 한다: ${gated}`);
    assert.equal(isSelfAuthApi(gated), false, `등록부 판정도 같아야 한다: ${gated}`);
  }
});

test('matcher 와 isSelfAuthApi 가 같은 판정을 한다(두 구현이 갈라지지 않게)', () => {
  const re = matcherRegex(middleware);
  const paths = [
    '/api/auth/login', '/api/health', '/api/cpaas/events', '/api/visual/state', '/api/dev/simulate',
    '/api/eum/senior/preferences', '/api/eum/link', '/api/admin/settlement', '/api/sessions',
    '/api/docs/1', '/api/stats', '/api/notifications', '/api/multimodal',
  ];
  for (const p of paths) {
    assert.equal(!re.test(p), isSelfAuthApi(p), `판정 불일치: ${p}`);
  }
});

test('isSelfAuthApi: /api/ 밖·이상 입력은 면제가 아니다(닫히는 쪽이 기본)', () => {
  for (const bad of ['/admin', '/eum/senior/abc', 'api/health', '', null, undefined, 42, {}]) {
    assert.equal(isSelfAuthApi(bad), false, `면제로 새면 안 되는 입력: ${String(bad)}`);
  }
});

test('등록부 ↔ docs/AUTH_ROLLOUT.md 대조(문서가 썩지 않게)', () => {
  const doc = read('docs/AUTH_ROLLOUT.md');
  for (const e of SELF_AUTH_API) {
    assert.ok(doc.includes(`/api/${e.prefix}`), `문서에 없는 면제: /api/${e.prefix}`);
  }
  // 문서에만 남은 유령 면제도 잡는다(표 행의 접두어를 긁어 등록부와 맞춘다).
  const section = doc.slice(doc.indexOf('## 3-1.'), doc.indexOf('## 4.'));
  const listed = [...section.matchAll(/\|\s*`\/api\/([A-Za-z0-9/_-]*)`\s*\|/g)].map((m) => m[1]);
  assert.deepEqual([...listed].sort(), [...selfAuthApiPrefixes()].sort(), '문서 표와 등록부가 어긋난다');
});

test('등록된 접두어마다 실제 라우트가 있다(유령 면제 금지)', () => {
  for (const p of selfAuthApiPrefixes()) {
    const dir = resolve(root, 'app/api', p.replace(/\/$/, ''));
    assert.ok(statSync(dir).isDirectory(), `등록됐지만 라우트가 없다: /api/${p}`);
  }
});

// ── 이 결함의 재현 조건 ───────────────────────────────────────────────────
// 로그인 없이 쓰는 화면(어르신 신청·고객 화면·로그인 화면)이 부르는 API 가 면제 목록에
// 없으면, 실인증을 켠 날 그 화면만 조용히 죽는다. 화면 소스에서 부르는 경로를 긁어 확인한다.
function walk(dir, out = []) {
  for (const f of readdirSync(dir)) {
    const p = resolve(dir, f);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith('.jsx') || p.endsWith('.js')) out.push(p);
  }
  return out;
}

test('로그인 없이 쓰는 화면이 부르는 API 는 전부 면제 목록에 있다', () => {
  const anonymous = ['app/eum', 'app/visual', 'app/login'];
  const found = [];
  for (const base of anonymous) {
    for (const f of walk(resolve(root, base))) {
      const src = readFileSync(f, 'utf8');
      for (const m of src.matchAll(/['"`](\/api\/[A-Za-z0-9/_-]+)['"`]/g)) {
        found.push({ file: relative(root, f).split(sep).join('/'), path: m[1] });
      }
    }
  }
  assert.ok(found.length >= 3, `화면이 부르는 API 수집 이상(${found.length}건) — 경로 확인`);
  const gated = found.filter((h) => !isSelfAuthApi(h.path));
  assert.deepEqual(
    gated, [],
    `실인증을 켜면 401 로 죽는다: ${gated.map((h) => `${h.path}(${h.file})`).join(' · ')}`,
  );
});

// 면제는 "인증 없음"이 아니라 "다른 인증"이다. 라우트가 스스로 판정하지 않으면 그대로 공개가 된다.
test('면제된 라우트는 자기 인증 수단을 실제로 검사한다', () => {
  const expected = [
    ['app/api/eum/senior/preferences/route.js', /verifyEumToken/],
    ['app/api/eum/senior/preferences/route.js', /consumeStore\(\)\.claim\(/],
    ['app/api/visual/state/route.js', /verify|token/i],
  ];
  for (const [rel, re] of expected) {
    assert.match(read(rel), re, `${rel}: 면제됐는데 자기 판정이 없다`);
  }
});
