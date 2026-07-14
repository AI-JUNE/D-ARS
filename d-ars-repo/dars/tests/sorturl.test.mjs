// tests/sorturl.test.mjs — 정렬 상태 URL 보존(lib/sortUrl.js) 회귀 테스트
// 핵심 계약: (1) 정렬 없으면 주소가 기존과 100% 동일(하위호환) (2) 화이트리스트 밖 키는 조용히 무시
//            (3) 다른 파라미터(q·range·view)는 보존 (4) dir 규칙이 서버 parseSortParams 와 동일
import test from 'node:test';
import assert from 'node:assert/strict';
import { coerceSort, parseSortState, withSortState, sortStateHref } from '../lib/sortUrl.js';
import { DOC_SORTS, UMS_SORTS } from '../lib/listSorts.js';

test('sorturl: URL 의 정렬을 화이트리스트 통과분만 읽는다', () => {
  assert.deepEqual(parseSortState('?sort=req&dir=desc', DOC_SORTS), { key: 'req', dir: 'desc' });
  assert.deepEqual(parseSortState('sort=biz&dir=asc', DOC_SORTS), { key: 'biz', dir: 'asc' });
  assert.deepEqual(parseSortState('?sort=rate', DOC_SORTS), { key: 'rate', dir: 'asc' }); // dir 없으면 asc
});

test('sorturl: 화이트리스트 밖 키·빈 값·쓰레기는 null(기본 정렬)로 폴백', () => {
  assert.equal(parseSortState('?sort=drop%20table&dir=desc', DOC_SORTS), null);
  assert.equal(parseSortState('?sort=phone', DOC_SORTS), null); // docs 스펙에 phone 은 없다
  assert.equal(parseSortState('?sort=&dir=desc', DOC_SORTS), null);
  assert.equal(parseSortState('', DOC_SORTS), null);
  assert.equal(parseSortState('?q=abc&range=7d', DOC_SORTS), null);
});

test('sorturl: dir 은 desc 만 인정하고 그 밖은 모두 asc(서버 규칙과 동일)', () => {
  assert.equal(parseSortState('?sort=req&dir=DESC', DOC_SORTS).dir, 'desc');
  assert.equal(parseSortState('?sort=req&dir=descending', DOC_SORTS).dir, 'asc');
  assert.equal(parseSortState('?sort=req&dir=1;--', DOC_SORTS).dir, 'asc');
});

test('sorturl: 정렬이 없으면 sort·dir 키가 주소에서 제거된다(하위호환)', () => {
  assert.equal(withSortState('?sort=req&dir=desc', null, DOC_SORTS), '');
  assert.equal(withSortState('?q=반품&sort=req&dir=desc', null, DOC_SORTS), 'q=%EB%B0%98%ED%92%88');
  assert.equal(sortStateHref({ pathname: '/docs', search: '?sort=req&dir=desc' }, null, DOC_SORTS), '/docs');
});

test('sorturl: 스펙 밖 파라미터(q·range·view)는 보존된다 → 다른 URL 훅과 공존', () => {
  const qs = withSortState('?q=abc&range=7d&view=table', { key: 'nodes', dir: 'desc' }, { nodes: { sql: 'x' } });
  const sp = new URLSearchParams(qs);
  assert.equal(sp.get('q'), 'abc');
  assert.equal(sp.get('range'), '7d');
  assert.equal(sp.get('view'), 'table');
  assert.equal(sp.get('sort'), 'nodes');
  assert.equal(sp.get('dir'), 'desc');
});

test('sorturl: 화이트리스트 밖 정렬을 쓰려 하면 주소에 실리지 않는다(SQL 인젝션 표면 없음)', () => {
  assert.equal(withSortState('?q=a', { key: 'req; drop table docs', dir: 'desc' }, DOC_SORTS), 'q=a');
  assert.equal(withSortState('', { key: 'sent_at', dir: 'asc' }, DOC_SORTS), ''); // ums 키를 docs 스펙에 쓰면 무시
});

test('sorturl: coerceSort 는 화면 값·URL 값을 같은 규칙으로 정규화한다', () => {
  assert.deepEqual(coerceSort({ key: ' status ', dir: 'desc' }, UMS_SORTS), { key: 'status', dir: 'desc' });
  assert.equal(coerceSort(null, UMS_SORTS), null);
  assert.equal(coerceSort({}, UMS_SORTS), null);
  assert.equal(coerceSort({ key: 'nope' }, UMS_SORTS), null);
  assert.deepEqual(coerceSort({ key: 'doc' }, UMS_SORTS), { key: 'doc', dir: 'asc' });
});

test('sorturl: href 는 pathname·해시를 보존한다', () => {
  assert.equal(
    sortStateHref({ pathname: '/ums', search: '?range=7d', hash: '#top' }, { key: 'status', dir: 'desc' }, UMS_SORTS),
    '/ums?range=7d&sort=status&dir=desc#top'
  );
  assert.equal(sortStateHref(undefined, null, UMS_SORTS), '/');
});

test('sorturl: 정렬 토글(오름→내림→해제) 왕복이 주소와 상태를 일치시킨다', () => {
  const spec = DOC_SORTS;
  let search = '?q=반품';
  search = '?' + withSortState(search, { key: 'req', dir: 'asc' }, spec);
  assert.deepEqual(parseSortState(search, spec), { key: 'req', dir: 'asc' });
  search = '?' + withSortState(search, { key: 'req', dir: 'desc' }, spec);
  assert.deepEqual(parseSortState(search, spec), { key: 'req', dir: 'desc' });
  search = '?' + withSortState(search, null, spec); // 해제
  assert.equal(parseSortState(search, spec), null);
  assert.equal(new URLSearchParams(search).get('q'), '반품'); // 검색어는 내내 보존
});

test('sorturl: 형식이 깨진 입력에도 예외 없이 폴백', () => {
  assert.equal(parseSortState(null, DOC_SORTS), null);
  assert.equal(parseSortState({ sort: 'req', dir: 'desc' }, DOC_SORTS).key, 'req'); // 객체 입력도 허용
  assert.equal(withSortState(undefined, undefined, undefined), '');
});
