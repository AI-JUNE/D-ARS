// tests/eumlink.test.mjs — 「이음 어르신 신청」 1회용 링크 **발급** 경로
//
// 왜 이 테스트가 생겼나: `issueEumToken` 을 부르는 애플리케이션 코드가 **한 줄도 없었다**.
// 문서와 화면은 줄곧 "담당자가 보낸 링크" 라고 적었지만 그 링크를 만들 수단이 없었고,
// 그래서 검증 메모에 "유효 토큰 링크가 없어 실기기 확인을 대신하지 못했다" 가 세 번 연속으로
// 남았다. 발급이 생겼으므로 지켜야 할 선을 여기에 고정한다 —
//   ① 링크는 실제 라우트에 닿는다(발급해도 404 면 아무 의미가 없다)
//   ② 수명·주소·sid 규격 밖은 **거부**하고 조용히 깎지 않는다
//   ③ 토큰은 의도한 한 줄 말고 어디에도 새지 않는다(링크 한 줄이 곧 인증 수단이다)
//   ④ 시험용 링크와 실물 링크를 **구분해 말한다**(데모 비밀값으로 서명된 링크는 위조 가능하다)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  EUM_LINK_DEFAULT_BASE,
  EUM_LINK_MASK,
  EUM_LINK_MAX_TTL_MS,
  EUM_LINK_PATH,
  EUM_LINK_REASON,
  buildLink,
  issueEumLink,
  linkAdvisories,
  linkReason,
  maskLink,
  normalizeBase,
  resolveTtlMs,
} from '../lib/eumLink.js';
import { EUM_TOKEN_TTL_MS, verifyEumToken } from '../lib/eumToken.js';
import { consumeKey } from '../lib/eumConsume.js';
import { TOKEN_SPECS } from '../lib/tokenAudit.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const T0 = Date.UTC(2026, 8, 28, 9, 0, 0);
const codes = (list) => list.map((a) => a.code);

// ── 주소 정규화 ────────────────────────────────────────────────────────────
test('주소: https 는 받고 뒤 슬래시·쿼리·해시는 버린다', () => {
  assert.equal(normalizeBase('https://d-ars.vercel.app/'), 'https://d-ars.vercel.app');
  assert.equal(normalizeBase('https://d-ars.vercel.app///'), 'https://d-ars.vercel.app');
  // 링크 뒤에 붙은 흔적이 토큰 옆에 따라다니지 않게 한다.
  assert.equal(normalizeBase('https://d-ars.vercel.app/?utm=sms#x'), 'https://d-ars.vercel.app');
  assert.equal(normalizeBase('  https://d-ars.vercel.app  '), 'https://d-ars.vercel.app');
});

test('주소: 경로 접두어는 살린다(리버스 프록시 뒤 배포)', () => {
  assert.equal(normalizeBase('https://example.com/dars/'), 'https://example.com/dars');
});

test('주소: 평문 http 는 로컬 시험 주소에서만 허용한다(토큰이 URL 에 실려 나간다)', () => {
  assert.equal(normalizeBase('http://localhost:3000'), 'http://localhost:3000');
  assert.equal(normalizeBase('http://127.0.0.1:3000'), 'http://127.0.0.1:3000');
  assert.equal(normalizeBase('http://app.localhost'), 'http://app.localhost');
  // 실제 호스트를 평문으로 내보내면 경로 중간에서 토큰이 그대로 읽힌다 = 남이 대신 신청한다.
  assert.equal(normalizeBase('http://d-ars.vercel.app'), null);
  assert.equal(normalizeBase('http://evil.example.com'), null);
});

test('주소: 자격정보가 박힌 주소·다른 스킴은 받지 않는다', () => {
  assert.equal(normalizeBase('https://u:p@example.com'), null);
  assert.equal(normalizeBase('javascript:alert(1)'), null);
  assert.equal(normalizeBase('file:///etc/passwd'), null);
  assert.equal(normalizeBase('ftp://example.com'), null);
});

test('주소: 빈 값·이상 입력은 null 이고 throw 하지 않는다', () => {
  for (const v of ['', '   ', null, undefined, 42, {}, [], 'example.com']) {
    assert.equal(normalizeBase(v), null, `${JSON.stringify(v)} 를 주소로 받으면 안 된다`);
  }
});

// ── 수명 ───────────────────────────────────────────────────────────────────
test('수명: 값이 없으면 요건값(5분)이고 그 사실을 표시한다', () => {
  const r = resolveTtlMs(undefined);
  assert.deepEqual(r, { ok: true, ttlMs: EUM_TOKEN_TTL_MS, defaulted: true });
  assert.equal(resolveTtlMs('').ttlMs, EUM_TOKEN_TTL_MS);
  assert.equal(EUM_TOKEN_TTL_MS, 5 * 60 * 1000, '요건(가이드 §6-2)은 5분이다');
});

test('수명: 분 단위 정수만 받고 이상값은 거부한다', () => {
  assert.deepEqual(resolveTtlMs(3), { ok: true, ttlMs: 180000, defaulted: false });
  assert.deepEqual(resolveTtlMs('5'), { ok: true, ttlMs: 300000, defaulted: false });
  for (const v of [0, -1, 1.5, 'abc', NaN, Infinity]) {
    assert.equal(resolveTtlMs(v).ok, false, `${v} 를 수명으로 받으면 안 된다`);
    assert.equal(resolveTtlMs(v).reason, 'ttl_invalid');
  }
});

test('수명: 상한 초과는 **거부**한다 — 조용히 깎으면 담당자가 통한 줄로 믿는다', () => {
  const maxMin = EUM_LINK_MAX_TTL_MS / 60000;
  assert.equal(resolveTtlMs(maxMin).ok, true);
  assert.equal(resolveTtlMs(maxMin + 1).ok, false);
  assert.equal(resolveTtlMs(maxMin + 1).reason, 'ttl_too_long');
});

test('[통합] 수명 상한은 토큰 명세(lib/tokenAudit)와 같은 값을 쓴다', () => {
  const spec = TOKEN_SPECS.find((s) => s.name === 'eum-link');
  assert.equal(EUM_LINK_MAX_TTL_MS, spec.maxTtlMs, '같은 숫자를 두 곳에 적으면 한쪽만 늘어난다');
});

// ── 링크 모양 ──────────────────────────────────────────────────────────────
test('[통합] 링크 경로가 실제 라우트 디렉터리와 일치한다(발급해도 404 면 무의미)', () => {
  assert.equal(EUM_LINK_PATH, '/eum/senior');
  const dir = path.join(root, 'app', ...EUM_LINK_PATH.split('/').filter(Boolean), '[token]');
  assert.ok(fs.existsSync(path.join(dir, 'page.jsx')), `${EUM_LINK_PATH}/[token]/page.jsx 가 없다`);
});

test('링크: 주소와 토큰을 한 조각씩만 이어 붙인다(이중 슬래시 금지)', () => {
  assert.equal(buildLink('https://e.com/', 'aaa.bbb'), 'https://e.com/eum/senior/aaa.bbb');
  assert.equal(buildLink('https://e.com/dars', 'aaa.bbb'), 'https://e.com/dars/eum/senior/aaa.bbb');
});

test('링크: 주소나 토큰이 규격 밖이면 빈 문자열(출력하지 않는다)', () => {
  assert.equal(buildLink('http://evil.example.com', 'aaa.bbb'), '');
  assert.equal(buildLink('https://e.com', ''), '');
  assert.equal(buildLink('https://e.com', null), '');
});

test('가리기: 토큰을 한 조각도 남기지 않는다(부분 노출도 하지 않는다)', () => {
  const link = 'https://e.com/eum/senior/BODY123456.SIG9876543210abcdef';
  const masked = maskLink(link);
  assert.equal(masked, `https://e.com${EUM_LINK_PATH}/${EUM_LINK_MASK}`);
  assert.equal(masked.includes('BODY'), false);
  assert.equal(masked.includes('SIG'), false);
  // 링크가 아닌 것을 가리려 하면 빈 문자열 — 지어내지 않는다.
  assert.equal(maskLink('https://e.com/other'), '');
  assert.equal(maskLink(null), '');
});

// ── 발급(왕복) ─────────────────────────────────────────────────────────────
test('발급: 만들어진 링크의 토큰이 실제로 검증을 통과한다', async () => {
  const r = await issueEumLink({ sid: 's-1001', now: T0 });
  assert.equal(r.ok, true);
  assert.equal(r.sid, 's-1001');
  assert.equal(r.base, EUM_LINK_DEFAULT_BASE);
  assert.equal(r.expiresAt, T0 + EUM_TOKEN_TTL_MS);

  const token = r.link.slice(r.link.indexOf(`${EUM_LINK_PATH}/`) + EUM_LINK_PATH.length + 1);
  const v = await verifyEumToken(decodeURIComponent(token), T0 + 1000);
  assert.equal(v.ok, true, '발급한 링크가 첫 화면에서 거부되면 아무 소용이 없다');
  assert.equal(v.payload.sid, 's-1001');
  assert.equal(v.remainingMs, EUM_TOKEN_TTL_MS - 1000);
});

test('발급: 만들어진 링크에 1회용 판정이 실제로 걸린다(소진 키를 만들 수 있다)', async () => {
  const r = await issueEumLink({ sid: 's-1001', now: T0 });
  const token = decodeURIComponent(r.link.split(`${EUM_LINK_PATH}/`)[1]);
  assert.notEqual(consumeKey(token), '', '소진 키를 못 만들면 링크가 1회용이 아니다');
});

test('발급: 결과에 토큰을 따로 담지 않는다(인증 수단의 사본을 늘리지 않는다)', async () => {
  const r = await issueEumLink({ sid: 's-1001', now: T0 });
  assert.equal(Object.prototype.hasOwnProperty.call(r, 'token'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(r, 'secret'), false);
});

test('발급: 규격 밖 입력은 어디서 막혔는지 그대로 말한다', async () => {
  assert.equal((await issueEumLink({ sid: '홍길동' })).reason, 'sid_invalid');
  assert.equal((await issueEumLink({ sid: '' })).reason, 'sid_invalid');
  assert.equal((await issueEumLink({})).reason, 'sid_invalid');
  assert.equal((await issueEumLink({ sid: 's-1', base: 'http://evil.example.com' })).reason, 'base_invalid');
  assert.equal((await issueEumLink({ sid: 's-1', minutes: 999 })).reason, 'ttl_too_long');
  assert.equal((await issueEumLink({ sid: 's-1', minutes: 0 })).reason, 'ttl_invalid');
  assert.equal((await issueEumLink({ sid: 's-1', now: NaN })).reason, 'now_invalid');
});

test('발급: 모든 거부 사유에 사람이 읽는 문장이 있다', () => {
  for (const code of ['sid_invalid', 'base_invalid', 'ttl_invalid', 'ttl_too_long', 'now_invalid', 'issue_failed']) {
    assert.equal(typeof EUM_LINK_REASON[code], 'string');
    assert.ok(EUM_LINK_REASON[code].length > 10, `${code} 안내가 너무 짧다`);
  }
  // 모르는 사유도 조용히 '' 가 되지 않는다.
  assert.equal(linkReason('무슨코드'), EUM_LINK_REASON.issue_failed);
});

// ── 함께 말해야 하는 것 ────────────────────────────────────────────────────
test('알림: 링크가 인증 수단이라는 것과 수명의 시작점을 **항상** 말한다', () => {
  const a = linkAdvisories({ base: EUM_LINK_DEFAULT_BASE, ttlMs: EUM_TOKEN_TTL_MS, secretSource: 'EUM_TOKEN_SECRET' });
  assert.ok(codes(a).includes('LINK_IS_CREDENTIAL'));
  const soon = a.find((x) => x.code === 'SHORT_LIFE');
  assert.match(soon.msg, /발급 시각부터/, '수명이 언제부터인지가 이 도구에서 가장 흔한 오해다');
  assert.match(soon.msg, /5분/);
});

test('알림: 데모 비밀값으로 서명된 링크는 **시험용**이라고 분명히 말한다', () => {
  const a = linkAdvisories({ base: EUM_LINK_DEFAULT_BASE, ttlMs: EUM_TOKEN_TTL_MS, secretSource: 'demo-default' });
  const demo = a.find((x) => x.code === 'DEMO_SECRET');
  assert.ok(demo, '위조 가능한 링크를 실물처럼 내주면 안 된다');
  assert.match(demo.msg, /위조/);
  assert.match(demo.msg, /\[승인 필요\]/);
  assert.equal(codes(a).includes('DERIVED_SECRET'), false, '사유는 하나만 고른다');
});

test('알림: 앱 공통 비밀로 서명하면 링크가 함께 무효화될 수 있다고 알린다', () => {
  const a = linkAdvisories({ base: EUM_LINK_DEFAULT_BASE, ttlMs: EUM_TOKEN_TTL_MS, secretSource: 'AUTH_SECRET' });
  assert.ok(codes(a).includes('DERIVED_SECRET'));
  assert.equal(codes(a).includes('DEMO_SECRET'), false);
});

test('알림: 전용 비밀값이면 비밀값 관련 알림이 없다', () => {
  const a = linkAdvisories({ base: EUM_LINK_DEFAULT_BASE, ttlMs: EUM_TOKEN_TTL_MS, secretSource: 'EUM_TOKEN_SECRET' });
  assert.equal(codes(a).includes('DEMO_SECRET'), false);
  assert.equal(codes(a).includes('DERIVED_SECRET'), false);
});

test('알림: 평문 http 주소와 1회용 판정의 실제 강도를 숨기지 않는다', () => {
  const a = linkAdvisories({ base: 'http://localhost:3000', ttlMs: EUM_TOKEN_TTL_MS, secretSource: 'demo-default' });
  assert.ok(codes(a).includes('PLAINTEXT_BASE'));
  const https = linkAdvisories({ base: EUM_LINK_DEFAULT_BASE, ttlMs: EUM_TOKEN_TTL_MS, secretSource: 'demo-default' });
  assert.equal(codes(https).includes('PLAINTEXT_BASE'), false);
  // 공유 저장소 영속화 전까지는 1회용이 절대 보장이 아님을 발급 시점에도 말한다.
  const spec = TOKEN_SPECS.find((s) => s.name === 'eum-link');
  assert.equal(codes(https).includes('ONE_TIME_LOCAL'), spec.oneTime !== 'durable');
});

test('알림: 이상 입력에도 throw 하지 않는다', () => {
  for (const v of [undefined, null, {}, { base: 1, ttlMs: 'x', secretSource: 2 }]) {
    assert.ok(Array.isArray(linkAdvisories(v)));
  }
});

test('발급 결과는 알림을 함께 들고 온다(링크만 찍어 주는 도구가 되지 않게)', async () => {
  const r = await issueEumLink({ sid: 's-1001', now: T0 });
  assert.ok(Array.isArray(r.advisories) && r.advisories.length >= 2);
  assert.ok(codes(r.advisories).includes('LINK_IS_CREDENTIAL'));
});

// ── 순수성·환경변수 ────────────────────────────────────────────────────────
test('[소스] lib/eumLink.js 는 환경변수를 읽지 않는다(값도 이름도)', () => {
  const src = read('lib/eumLink.js');
  const code = src.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
  assert.equal(/process\.env/.test(code), false, '비밀값 선택은 lib/eumToken 의 일이다');
});

// ── CLI 가드 ───────────────────────────────────────────────────────────────
test('[소스] CLI 는 환경변수 값을 출력하지 않는다', () => {
  const src = read('scripts/eum-link.mjs');
  const code = src.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
  assert.doesNotMatch(code, /console\.[a-z]+\([^)]*process\.env\.[A-Z]/, '환경변수 값 출력 금지');
  assert.match(code, /effectiveSecret\(/, '출처만 받아 온다');
});

test('[소스] CLI 는 파일을 쓰지 않고 DB·네트워크에 접속하지 않는다', () => {
  const src = read('scripts/eum-link.mjs');
  const code = src.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
  assert.doesNotMatch(code, /writeFileSync|appendFileSync|neon\s*\(|fetch\s*\(/);
  assert.match(code, /process\.exit/, '실패를 종료코드로 알린다');
});

test('[소스] CLI 는 온전한 링크를 마지막 한 줄에만 찍는다(그 외에는 가린다)', () => {
  const src = read('scripts/eum-link.mjs');
  const code = src.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l));
  const plain = code.filter((l) => /console\.log\(/.test(l) && /r\.link/.test(l) && !/maskLink/.test(l));
  assert.equal(plain.length, 1, '링크를 여러 번 찍으면 스크롤백·로그에 그만큼 남는다');
  assert.match(code.join('\n'), /maskLink\(r\.link\)/, '요약 줄에서는 토큰을 가린다');
});

test('[통합] package.json 에 eum:link 가 배선돼 있다', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.equal(pkg.scripts['eum:link'], 'node scripts/eum-link.mjs');
});

test('[통합] CI 는 이 도구를 돌리지 않는다(토큰을 찍어 내는 일을 무인 실행하지 않는다)', () => {
  const ci = read(path.join('..', '..', '.github', 'workflows', 'ci.yml'));
  assert.equal(/eum:link/.test(ci), false, '점검 CLI 와 달리 이것은 발급 도구다');
});

test('[통합] EUM_INTEGRATION.md 가 발급 수단을 밝힌다(서술이 코드보다 앞서지 않게)', () => {
  const md = read('EUM_INTEGRATION.md');
  assert.match(md, /eum:link/, '링크를 만드는 방법이 문서에 없으면 아무도 찾지 못한다');
});
