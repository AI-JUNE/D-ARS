// tests/viewsio.test.mjs — 저장된 뷰 가져오기/내보내기(백로그 (u)) 회귀 테스트
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FILE_KIND, FILE_VERSION, MAX_VIEWS,
  buildExport, exportFileName, importSummary, mergeViews, parseImport, serializeExport,
} from '../lib/viewsIO.js';

const D = new Date('2026-07-14T12:00:00Z');
const V = (n, q) => ({ name: n, q });

test('exportFileName: 화면·날짜가 파일명에 들어가고 금지문자는 치환된다', () => {
  assert.equal(exportFileName('ums', D), 'dars-views_ums_2026-07-14.json');
  assert.equal(exportFileName('a/b:c d', D), 'dars-views_a-b-c-d_2026-07-14.json');
  assert.equal(exportFileName('', D), 'dars-views_default_2026-07-14.json');
  assert.equal(exportFileName('ums', new Date('nope')).startsWith('dars-views_ums_'), true); // 잘못된 날짜 → 오늘로 폴백
});

test('buildExport: 자기 서술적 봉투 + 손상 항목은 애초에 나가지 않는다', () => {
  const e = buildExport('ums', [V('실패 7일', 'range=7d&status=실패'), { name: '', q: 'x' }, null, 'junk'], D);
  assert.equal(e.kind, FILE_KIND);
  assert.equal(e.version, FILE_VERSION);
  assert.equal(e.screen, 'ums');
  assert.equal(e.exportedAt, '2026-07-14T12:00:00.000Z');
  assert.deepEqual(e.views, [V('실패 7일', 'range=7d&status=실패')]);
});

test('serializeExport: 파싱 왕복(round-trip)이 동일 뷰를 돌려준다 · 말미 개행', () => {
  const views = [V('전체', ''), V('최근 30일', 'range=30d')];
  const text = serializeExport('docs', views, D);
  assert.equal(text.endsWith('\n'), true);
  const r = parseImport(text);
  assert.equal(r.error, null);
  assert.equal(r.screen, 'docs');
  assert.deepEqual(r.views, views);   // 빈 쿼리('전체' 프리셋)도 유효한 뷰다
});

test('parseImport: 배열만 든 파일(레거시·수기)도 수용한다', () => {
  const r = parseImport(JSON.stringify([V('a', 'q=1')]));
  assert.equal(r.error, null);
  assert.equal(r.screen, null);
  assert.deepEqual(r.views, [V('a', 'q=1')]);
});

test('parseImport: 손상·타앱·빈 파일은 throw 없이 error 로 돌아온다', () => {
  for (const bad of ['', '   ', '{oops', 'null', '42', '"str"']) {
    const r = parseImport(bad);
    assert.equal(r.views.length, 0);
    assert.equal(typeof r.error, 'string');
  }
  assert.match(parseImport(JSON.stringify({ kind: 'other.app', views: [] })).error, /D-ARS/);
  assert.match(parseImport(JSON.stringify({ kind: FILE_KIND, views: 'nope' })).error, /views/);
  assert.match(parseImport(JSON.stringify({ kind: FILE_KIND, version: 99, views: [V('a', '')] })).error, /버전/);
  assert.equal(parseImport(undefined).views.length, 0);
});

test('parseImport: 유효 항목이 하나도 없으면 error(조용한 성공 금지)', () => {
  const r = parseImport(JSON.stringify({ kind: FILE_KIND, version: 1, views: [{ name: '  ' , q: 'x' }, 3] }));
  assert.equal(r.views.length, 0);
  assert.match(r.error, /가져올 수 있는 뷰가 없습니다/);
});

test('mergeViews: 같은 이름은 덮어쓰고, 새 이름은 추가된다(원본 불변)', () => {
  const cur = [V('a', 'q=1'), V('b', 'q=2')];
  const frozen = JSON.parse(JSON.stringify(cur));
  const r = mergeViews(cur, [V('b', 'q=9'), V('c', 'q=3')]);
  assert.deepEqual(r.list, [V('a', 'q=1'), V('b', 'q=9'), V('c', 'q=3')]);
  assert.equal(r.added, 1);
  assert.equal(r.updated, 1);
  assert.equal(r.skipped, 0);
  assert.deepEqual(cur, frozen);      // 원본 불변
});

test('mergeViews: 조건이 같으면 갱신으로 세지 않는다(거짓 보고 금지)', () => {
  const r = mergeViews([V('a', 'q=1')], [V('a', 'q=1')]);
  assert.deepEqual(r, { list: [V('a', 'q=1')], added: 0, updated: 0, skipped: 0 });
});

test('mergeViews: 상한 초과분은 조용히 밀어내지 않고 skipped 로 보고한다', () => {
  const cur = Array.from({ length: MAX_VIEWS }, (_, i) => V(`cur${i}`, `q=${i}`));
  const r = mergeViews(cur, [V('new1', 'q=a'), V('new2', 'q=b')]);
  assert.equal(r.list.length, MAX_VIEWS);
  assert.deepEqual(r.list, cur);      // 기존 뷰는 하나도 사라지지 않는다
  assert.equal(r.added, 0);
  assert.equal(r.skipped, 2);
});

test('mergeViews: replace 모드는 현재 목록을 파일로 대체하고 상한까지만 취한다', () => {
  const inc = Array.from({ length: MAX_VIEWS + 3 }, (_, i) => V(`v${i}`, `q=${i}`));
  const r = mergeViews([V('old', 'q=x')], inc, 'replace');
  assert.equal(r.list.length, MAX_VIEWS);
  assert.equal(r.list[0].name, 'v0');
  assert.equal(r.skipped, 3);
  assert.equal(r.list.some((v) => v.name === 'old'), false);
});

// 회귀(24회차에 실제로 검출된 버그): parseViews 는 MAX_VIEWS 에서 잘라내므로 그대로 쓰면
// 13개짜리 파일을 가져와도 "넘쳐서 빠진 항목"이 0으로 보였다 → 사용자에게 손실을 알릴 수 없었다.
test('상한을 넘는 파일: 넘친 항목 수가 정확히 보고된다(조용한 손실 금지)', () => {
  const many = Array.from({ length: MAX_VIEWS + 3 }, (_, i) => V(`v${i}`, `q=${i}`));
  const r = parseImport(JSON.stringify({ kind: FILE_KIND, version: 1, screen: 'ums', views: many }));
  assert.equal(r.error, null);
  assert.equal(r.views.length, MAX_VIEWS + 3);          // 파싱 단계에서는 자르지 않는다
  const m = mergeViews([], r.views);
  assert.equal(m.list.length, MAX_VIEWS);
  assert.equal(m.added, MAX_VIEWS);
  assert.equal(m.skipped, 3);
  assert.match(importSummary(m), /3개 제외/);
});

test('importSummary: 무엇이 바뀌었는지 침묵하지 않는다', () => {
  assert.equal(importSummary({ added: 2, updated: 1 }), '2개 추가 · 1개 갱신');
  assert.equal(importSummary({ added: 0, updated: 0 }), '변경 없음(이미 같은 조건으로 저장되어 있습니다)');
  assert.match(importSummary({ added: 1, skipped: 3 }), /3개 제외/);
});
