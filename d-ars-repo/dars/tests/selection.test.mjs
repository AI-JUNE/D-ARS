// tests/selection.test.mjs — 목록 행 선택 + 선택 행만 내보내기(25회차, 백로그 (v)) 회귀 테스트
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  rowIds, toggleId, setMany, allSelected, someSelected, headerState,
  selectedRows, pruneSelection, selectionNote, exportScope, exportRunner,
} from '../lib/selection.js';

const ROWS = [
  { id: 3, name: '가' },
  { id: 1, name: '나' },
  { id: 2, name: '다' },
];

test('selection: rowIds — id 없는 행은 선택 대상이 아니다', () => {
  assert.deepEqual(rowIds(ROWS), [3, 1, 2]);
  assert.deepEqual(rowIds([{ id: 1 }, { name: 'x' }, {}, null]), [1]);
  assert.deepEqual(rowIds(null), []);          // 이상 입력도 throw 하지 않는다
  assert.deepEqual(rowIds(undefined), []);
});

test('selection: toggleId — 새 Set 을 반환하고 원본은 불변', () => {
  const a = new Set([1]);
  const b = toggleId(a, 2);
  assert.deepEqual([...a], [1]);               // 원본 불변(React 상태 갱신 감지)
  assert.deepEqual([...b].sort(), [1, 2]);
  const c = toggleId(b, 1);
  assert.deepEqual([...c], [2]);               // 다시 누르면 해제
  assert.deepEqual([...toggleId(new Set([1]), null)], [1]); // id 없음 = 무시
  assert.deepEqual([...toggleId(undefined, 5)], [5]);       // Set 이 아니어도 폴백
});

test('selection: setMany — 일괄 선택/해제', () => {
  const on = setMany(new Set(), [1, 2, 3], true);
  assert.equal(on.size, 3);
  const off = setMany(on, [1, 3], false);
  assert.deepEqual([...off], [2]);
  assert.equal(setMany(new Set([1]), null, true).size, 1); // 이상 입력 무시
});

test('selection: allSelected — 빈 목록에서 "전체 선택됨"은 false', () => {
  assert.equal(allSelected(new Set(), []), false);
  assert.equal(allSelected(new Set([1, 2]), []), false);  // 표가 비었는데 체크됨은 거짓말
  assert.equal(allSelected(new Set([1, 2]), [1, 2]), true);
  assert.equal(allSelected(new Set([1]), [1, 2]), false);
  assert.equal(someSelected(new Set([1]), [1, 2]), true);
  assert.equal(someSelected(new Set([9]), [1, 2]), false);
});

test('selection: headerState — 3상태(전체·일부·미선택)', () => {
  assert.deepEqual(headerState(new Set([1, 2]), [1, 2]), { checked: true, indeterminate: false });
  assert.deepEqual(headerState(new Set([1]), [1, 2]), { checked: false, indeterminate: true });
  assert.deepEqual(headerState(new Set(), [1, 2]), { checked: false, indeterminate: false });
  assert.deepEqual(headerState(new Set(), []), { checked: false, indeterminate: false });
});

test('selection: selectedRows — 체크 순서가 아니라 **화면(서버) 정렬 순서**를 보존한다', () => {
  const sel = new Set([2, 3]); // 2번을 먼저 체크했더라도
  assert.deepEqual(selectedRows(ROWS, sel).map(r => r.id), [3, 2]); // 표에 보이는 순서대로
  assert.deepEqual(selectedRows(ROWS, new Set()), []);
  assert.deepEqual(selectedRows(null, new Set([1])), []);
});

test('selection: pruneSelection — 화면에서 사라진 행의 선택은 정리(유령 선택 방지)', () => {
  assert.deepEqual([...pruneSelection(new Set([1, 2, 9]), [1, 2, 3])], [1, 2]);
  assert.deepEqual([...pruneSelection(new Set([1]), [])], []);
  assert.deepEqual([...pruneSelection(new Set([1]), null)], []);
});

test('selection: selectionNote — 0건이면 빈 문자열', () => {
  assert.equal(selectionNote(0), '');
  assert.equal(selectionNote(-1), '');
  assert.equal(selectionNote('x'), '');
  assert.equal(selectionNote(3), '선택한 3건만 내보냄');
});

test('exportScope: 선택 0건이면 **빈 opts** → 기존 내보내기 동작과 100% 동일(하위호환)', () => {
  assert.deepEqual(exportScope(0, '?range=7d'), {});
  assert.deepEqual(exportScope(undefined, ''), {});
});

test('exportScope: 선택 N건이면 문서 머리말·파일명에 선택 사실을 남긴다(감사 추적)', () => {
  const s = exportScope(3, '?range=7d&status=실패');
  assert.match(s.subtitle, /^조회 조건 — /);
  assert.match(s.subtitle, /기간: 최근 7일/);
  assert.match(s.subtitle, /상태: 실패/);
  assert.match(s.subtitle, /선택한 3건만 내보냄$/);
  assert.equal(s.slug, '7d_실패_선택3건');      // 조건 슬러그 + 선택 태그
});

test('exportScope: 조회 조건이 없어도 선택 사실은 남는다', () => {
  const s = exportScope(2, '');
  assert.equal(s.slug, '선택2건');
  assert.match(s.subtitle, /조회 조건 없음\(전체\) · 선택한 2건만 내보냄/);
});

test('exportRunner: 선택 0건 → 서버 전체 수집(X.run) 경로, opts 는 비어 있다', () => {
  let called = 0; let passed = null; let passedOpts = null;
  const X = { run: (h) => { called += 1; h([{ id: 1 }, { id: 2 }]); } };
  const S = { count: 0, rows: [] };
  const R = exportRunner(S, X, { search: () => '?range=7d' });
  assert.equal(R.scoped, false);
  R.run((rows, opts) => { passed = rows; passedOpts = opts; });
  assert.equal(called, 1);                       // 서버에서 전체 행을 받아온다(기존 동작)
  assert.deepEqual(passed.map(r => r.id), [1, 2]);
  assert.deepEqual(passedOpts, {});              // 조건 기록은 export.js 가 자동 수행(기존 경로)
});

test('exportRunner: 선택 N건 → 서버 요청 0회, 선택 행만 즉시 전달', () => {
  let serverCalls = 0;
  const X = { run: () => { serverCalls += 1; } };
  const S = { count: 2, rows: [ROWS[0], ROWS[2]] };
  const R = exportRunner(S, X, { search: () => '?status=실패' });
  assert.equal(R.scoped, true);
  assert.equal(R.count, 2);
  let got = null; let opts = null;
  R.run((rows, o) => { got = rows; opts = o; });
  assert.equal(serverCalls, 0);                  // 이미 로드된 행이라 재수집이 필요 없다
  assert.deepEqual(got.map(r => r.id), [3, 2]);  // 화면 순서 보존
  assert.equal(opts.slug, '실패_선택2건');
  assert.match(opts.subtitle, /선택한 2건만 내보냄$/);
});

test('exportRunner: 이상 입력에도 throw 하지 않는다', () => {
  assert.doesNotThrow(() => exportRunner(null, null).run(() => {}));
  assert.doesNotThrow(() => exportRunner({ count: 1, rows: [] }, null).run(null));
  assert.equal(exportRunner(undefined, undefined).scoped, false);
});
