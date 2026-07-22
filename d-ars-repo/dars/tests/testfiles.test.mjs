// tests/testfiles.test.mjs — 테스트 러너 파일 선별(26회차)
import test from 'node:test';
import assert from 'node:assert/strict';
import { pickTestFiles, testPaths } from '../scripts/testFiles.mjs';

const SAMPLE = [
  'README.md',
  'selection.test.mjs',
  'auth.test.js',
  'auth.test.mjs',
  'helper.mjs',        // 테스트가 아닌 헬퍼
  'notes.test.txt',    // 확장자가 js/mjs 가 아니다
  'aggregate.test.mjs',
];

test('테스트 파일만 고른다(README·헬퍼·비 js 제외)', () => {
  const got = pickTestFiles(SAMPLE);
  assert.deepEqual(got, ['aggregate.test.mjs', 'auth.test.js', 'auth.test.mjs', 'selection.test.mjs']);
});

test('.test.js 와 .test.mjs 를 모두 포함한다', () => {
  const got = pickTestFiles(['a.test.js', 'b.test.mjs']);
  assert.deepEqual(got, ['a.test.js', 'b.test.mjs']);
});

test('정렬은 안정적이다(실행 순서 재현)', () => {
  const a = pickTestFiles(['c.test.mjs', 'a.test.mjs', 'b.test.mjs']);
  const b = pickTestFiles(['b.test.mjs', 'c.test.mjs', 'a.test.mjs']);
  assert.deepEqual(a, b);
  assert.deepEqual(a, ['a.test.mjs', 'b.test.mjs', 'c.test.mjs']);
});

test('원본 배열을 변형하지 않는다', () => {
  const src = ['b.test.mjs', 'a.test.mjs'];
  pickTestFiles(src);
  assert.deepEqual(src, ['b.test.mjs', 'a.test.mjs']);
});

test('이상 입력에 throw 하지 않는다', () => {
  assert.deepEqual(pickTestFiles(null), []);
  assert.deepEqual(pickTestFiles(undefined), []);
  assert.deepEqual(pickTestFiles('x.test.mjs'), []);
  assert.deepEqual(pickTestFiles([null, 1, {}, 'a.test.mjs']), ['a.test.mjs']);
});

test('빈 목록이면 빈 결과(러너가 이 경우 실패로 처리한다)', () => {
  assert.deepEqual(pickTestFiles([]), []);
  assert.deepEqual(testPaths('tests', ['README.md']), []);
});

test('경로 구분자는 항상 / (Windows 에서도 Node 가 받는다)', () => {
  assert.deepEqual(testPaths('tests', SAMPLE), [
    'tests/aggregate.test.mjs', 'tests/auth.test.js', 'tests/auth.test.mjs', 'tests/selection.test.mjs',
  ]);
  assert.deepEqual(testPaths('tests/', ['a.test.mjs']), ['tests/a.test.mjs']);
  assert.deepEqual(testPaths('', ['a.test.mjs']), ['a.test.mjs']);
});
