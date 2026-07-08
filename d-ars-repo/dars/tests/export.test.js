// lib/export.js 순수 로직 단위 테스트 (의존성 없음 · node:test)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stampFilename, toCSV, toExcelHTML } from '../lib/export.js';

test('stampFilename: 확장자 앞에 YYYY-MM-DD 삽입', () => {
  assert.match(stampFilename('sessions.csv'), /^sessions_\d{4}-\d{2}-\d{2}\.csv$/);
});

test('stampFilename: 확장자 없으면 끝에 태그 추가', () => {
  assert.match(stampFilename('report'), /^report_\d{4}-\d{2}-\d{2}$/);
});

test('stampFilename: 점이 여러 개면 마지막 확장자 기준', () => {
  assert.match(stampFilename('ums.2026.xls'), /^ums\.2026_\d{4}-\d{2}-\d{2}\.xls$/);
});

test('toCSV: 헤더 + 본문, 값 접근자(함수/키) 모두 지원', () => {
  const rows = [{ id: 'A1', name: '홍길동' }];
  const cols = [
    { label: 'ID', value: 'id' },
    { label: '이름', value: (r) => r.name },
  ];
  const [head, body] = toCSV(rows, cols).split('\n');
  assert.equal(head, '"ID","이름"');
  assert.equal(body, '"A1","홍길동"');
});

test('toCSV: 큰따옴표는 두 개로 이스케이프 (CSV 주입 방지)', () => {
  assert.ok(toCSV([{ v: 'a"b' }], [{ label: 'V', value: 'v' }]).includes('"a""b"'));
});

test('toCSV: null/undefined 값은 빈 문자열로', () => {
  assert.equal(toCSV([{ v: null }], [{ label: 'V', value: 'v' }]).split('\n')[1], '""');
});

test('toCSV: 쉼표·개행이 든 값도 따옴표로 감싸 안전', () => {
  const csv = toCSV([{ v: '가,나\n다' }], [{ label: 'V', value: 'v' }]);
  assert.equal(csv.split('\n')[0], '"V"');
  assert.ok(csv.includes('"가,나\n다"'));
});

test('toExcelHTML: HTML 특수문자 이스케이프 + 라벨/브랜드색/전화서식 포함', () => {
  const html = toExcelHTML([{ v: '<b>&' }], [{ label: '값<>', value: 'v' }], '시트');
  assert.ok(html.includes('&lt;b&gt;&amp;'));
  assert.ok(html.includes('값&lt;&gt;'));
  assert.ok(html.includes('#be5535'));
  assert.ok(html.includes('mso-number-format'));
});
