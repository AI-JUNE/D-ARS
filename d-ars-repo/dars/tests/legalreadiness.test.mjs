// tests/legalreadiness.test.mjs — 법적 고지 확정 게이트 가드 (무의존성: node:test)
//
// 지키려는 것(COMMERCIAL_READINESS "약관·개인정보 처리방침 확정본 반영")
//   문안 확정은 사람의 일이다. 기계가 맡는 것은 **"아직 초안이다"가 조용히 사라지지 않는 것** 하나다 —
//   사업자등록번호·수탁자 목록·보유기간이 빈 채로 status 만 'published' 로 넘어가면 차단한다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { LEGAL_META, TERMS_SECTIONS, PRIVACY_SECTIONS, SUBPROCESSORS } from '../lib/legalContent.js';
import { legalReadiness, pendingSummary, REQUIRED_META, LEGAL_STATUSES } from '../lib/legalReadiness.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

// 다 채워진 가상의 확정본(테스트 전용 — 정본을 흉내 낸 값이며 실제 사업자 정보가 아니다).
const FULL_META = {
  service: 'X', operator: '주식회사 X', contactEmail: 'a@b.co', effectiveDate: '2026-01-01',
  businessNumber: '000-00-00000', address: '어딘가', privacyOfficer: '아무개 대표',
  retentionNotice: '항목별 기간 명시', status: 'published',
};
const CLEAN_SECTIONS = [{ h: '1. 보유 및 이용기간', body: '수집일로부터 180일 보관 후 파기합니다.' }];
const SUBS = [{ name: 'X', task: '호스팅' }];

test('초안 상태는 통과하되(사람 차례) 남은 칸을 전부 보고한다', () => {
  const r = legalReadiness({ meta: LEGAL_META, terms: TERMS_SECTIONS, privacy: PRIVACY_SECTIONS, subprocessors: SUBPROCESSORS, env: {} });
  assert.equal(r.status, 'draft');
  assert.equal(r.published, false);
  assert.equal(r.ok, true, '초안인데 실패로 판정했다 — 빈 칸은 아직 사람의 차례다');
  assert.ok(r.missing.length > 0, '남은 칸을 하나도 보고하지 않았다');
  assert.ok(r.blockers.some((b) => b.code === 'SUBPROCESSORS_EMPTY'));
});

test('빈 칸이 남은 채 published 로 넘기면 차단된다(이 게이트의 존재 이유)', () => {
  const r = legalReadiness({
    meta: { ...LEGAL_META, status: 'published' },
    terms: TERMS_SECTIONS, privacy: PRIVACY_SECTIONS, subprocessors: SUBPROCESSORS, env: {},
  });
  assert.equal(r.ok, false);
  assert.ok(r.blockers.some((b) => b.code === 'META_MISSING'));
  assert.ok(r.blockers.some((b) => b.code === 'PENDING_MARKERS'), '본문의 [승인 필요] 표식을 못 잡았다');
});

test('전부 확정되면 게시본이 통과한다(게이트가 영원히 빨간불이 아니다)', () => {
  const r = legalReadiness({
    meta: FULL_META, terms: CLEAN_SECTIONS, privacy: CLEAN_SECTIONS,
    subprocessors: SUBS, env: { AUTH_ENFORCE: '1' },
  });
  assert.deepEqual(r.blockers, []);
  assert.equal(r.ok, true);
  assert.equal(pendingSummary(r), '확정 필요 항목 없음');
});

test('필수 항목이 하나만 비어도 게시본은 그 항목을 지목해 막는다', () => {
  for (const key of Object.keys(REQUIRED_META)) {
    const r = legalReadiness({
      meta: { ...FULL_META, [key]: '   ' }, terms: CLEAN_SECTIONS, privacy: CLEAN_SECTIONS,
      subprocessors: SUBS, env: { AUTH_ENFORCE: '1' },
    });
    assert.ok(r.missing.includes(key), `${key} 공백을 미확정으로 보지 않았다`);
    assert.equal(r.ok, false);
  }
});

test('형식 오류(이메일·시행일)는 초안 단계에서도 실패다', () => {
  const bad = legalReadiness({ meta: { ...LEGAL_META, contactEmail: 'not-an-email' }, terms: [], privacy: [], subprocessors: SUBS, env: {} });
  assert.ok(bad.blockers.some((b) => b.code === 'CONTACT_INVALID'));
  assert.equal(bad.ok, false);
  const d = legalReadiness({ meta: { ...LEGAL_META, effectiveDate: '2026/08/01' }, terms: [], privacy: [], subprocessors: SUBS, env: {} });
  assert.ok(d.blockers.some((b) => b.code === 'EFFECTIVE_DATE_INVALID'));
});

test('모르는 status 는 초안으로 간주하고 실패로 본다', () => {
  const r = legalReadiness({ meta: { ...FULL_META, status: 'PUBLISHED' }, terms: CLEAN_SECTIONS, privacy: CLEAN_SECTIONS, subprocessors: SUBS, env: { AUTH_ENFORCE: '1' } });
  assert.equal(r.status, 'draft');
  assert.ok(r.blockers.some((b) => b.code === 'STATUS_UNKNOWN'));
  assert.equal(r.ok, false);
  assert.deepEqual(LEGAL_STATUSES, ['draft', 'published']);
});

test('아직 켜지지 않은 보호조치를 시행 중이라 말하면 잡아낸다(게시본에서는 차단)', () => {
  const claim = [{ h: '7. 안전성 확보 조치', body: '접근권한 관리(RBAC)·접근 통제를 시행합니다. 180일 후 파기합니다.' }];
  const off = legalReadiness({ meta: FULL_META, terms: [], privacy: claim, subprocessors: SUBS, env: {} });
  assert.ok(off.blockers.some((b) => b.code === 'CLAIM_AHEAD_OF_CODE'), '게시본인데 경고로만 처리했다');
  const on = legalReadiness({ meta: FULL_META, terms: [], privacy: claim, subprocessors: SUBS, env: { AUTH_ENFORCE: '1' } });
  assert.ok(!on.blockers.some((b) => b.code === 'CLAIM_AHEAD_OF_CODE'));
  // 초안 단계에서는 경고로만 — 아직 켜지 않은 것이 정상이기 때문.
  const draft = legalReadiness({ meta: { ...FULL_META, status: 'draft' }, terms: [], privacy: claim, subprocessors: SUBS, env: {} });
  assert.ok(draft.warnings.some((w) => w.code === 'CLAIM_AHEAD_OF_CODE'));
});

test('AUTH_ENFORCE 는 정확히 1 일 때만 켜진 것으로 본다(오타 내성)', () => {
  const claim = [{ h: '7. 안전성', body: 'RBAC 를 시행합니다. 180일.' }];
  for (const v of ['true', 'yes', '01', ' 1', 'ON', '']) {
    const r = legalReadiness({ meta: FULL_META, terms: [], privacy: claim, subprocessors: SUBS, env: { AUTH_ENFORCE: v } });
    assert.ok(r.blockers.some((b) => b.code === 'CLAIM_AHEAD_OF_CODE'), `AUTH_ENFORCE='${v}' 를 켜진 것으로 오인했다`);
  }
});

test('보유기간은 보유 조항 안에서만 본다(다른 조항의 7일에 오탐하지 않는다)', () => {
  const vague = [
    { h: '4. 개인정보의 보유 및 이용기간', body: '목적 달성 시 지체 없이 파기합니다.' },
    { h: '9. 고지의 의무', body: '개정 7일 전부터 고지합니다.' },
  ];
  const r = legalReadiness({ meta: { ...FULL_META, retentionNotice: '' }, terms: [], privacy: vague, subprocessors: SUBS, env: { AUTH_ENFORCE: '1' } });
  assert.ok(r.warnings.some((w) => w.code === 'RETENTION_VAGUE'));
  const fixed = legalReadiness({ meta: FULL_META, terms: [], privacy: vague, subprocessors: SUBS, env: { AUTH_ENFORCE: '1' } });
  assert.ok(!fixed.warnings.some((w) => w.code === 'RETENTION_VAGUE'), 'retentionNotice 확정 후에도 경고가 남는다');
});

test('수탁자 목록은 이름·업무가 둘 다 있어야 공개로 친다', () => {
  for (const subs of [[], [{}], [{ name: 'X' }], [{ task: '호스팅' }], [{ name: ' ', task: ' ' }], 'nope', null]) {
    const r = legalReadiness({ meta: FULL_META, terms: CLEAN_SECTIONS, privacy: CLEAN_SECTIONS, subprocessors: subs, env: { AUTH_ENFORCE: '1' } });
    assert.ok(r.blockers.some((b) => b.code === 'SUBPROCESSORS_EMPTY'), `${JSON.stringify(subs)} 를 공개로 인정했다`);
  }
});

test('이상 입력에 throw 하지 않는다', () => {
  for (const bad of [undefined, null, 'x', 7, [], { meta: null, terms: 'x', privacy: 3, subprocessors: 1, env: 'y' }]) {
    const r = legalReadiness(bad);
    assert.equal(typeof r.ok, 'boolean');
    assert.ok(Array.isArray(r.blockers) && Array.isArray(r.warnings));
  }
  assert.equal(pendingSummary(null), '확정 필요 항목 없음');
  assert.equal(pendingSummary({ missing: ['a', 'b'] }), '확정 필요 2건: a, b');
});

test('판정 결과에 환경변수 값이 담기지 않는다', () => {
  const MARK = 'SEKRET-VALUE-1234';
  const r = legalReadiness({
    meta: LEGAL_META, terms: TERMS_SECTIONS, privacy: PRIVACY_SECTIONS, subprocessors: SUBPROCESSORS,
    env: { AUTH_ENFORCE: MARK, AUTH_SECRET: MARK, DATABASE_URL: MARK },
  });
  assert.ok(!JSON.stringify(r).includes(MARK), '환경변수 값이 판정 결과에 새어 나왔다');
});

test('CLI 는 읽기 전용이다(쓰기·네트워크·DB 경로 없음)', () => {
  const src = readFileSync(path.join(ROOT, 'scripts/legal-check.mjs'), 'utf8');
  for (const bad of ['writeFile', 'fetch(', 'neon(', 'unlink', 'DATABASE_URL', 'process.env.AUTH_SECRET']) {
    assert.ok(!src.includes(bad), `CLI 에 있으면 안 되는 호출: ${bad}`);
  }
  assert.match(src, /process\.exit\(r\.ok \? 0 : 1\)/);
});

test('정본에 확정 필요 칸이 선언돼 있고 임의 값으로 채워져 있지 않다', () => {
  // 자동화가 사업자 정보를 지어내지 않았는지 — 비어 있는 것이 **정상**이다.
  for (const key of ['businessNumber', 'address', 'privacyOfficer', 'retentionNotice']) {
    assert.ok(key in LEGAL_META, `LEGAL_META 에 ${key} 칸이 없다`);
  }
  assert.equal(LEGAL_META.status, 'draft', '초안 상태가 사람 승인 없이 바뀌었다');
  assert.ok(Array.isArray(SUBPROCESSORS));
});

test('CI·package.json 에 legal:check 가 배선돼 있다', () => {
  const pkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  assert.equal(pkg.scripts['legal:check'], 'node scripts/legal-check.mjs');
  const ci = readFileSync(path.join(ROOT, '../../.github/workflows/ci.yml'), 'utf8');
  assert.match(ci, /npm run legal:check/, 'CI 에 게이트가 배선되지 않았다');
});
