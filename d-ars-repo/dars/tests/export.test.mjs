// tests/export.test.mjs — CSV/Excel 내보내기 순수 유틸 단위 테스트 (무의존성)
// 주의: downloadCSV/downloadExcel/printPDF는 브라우저(window/DOM) 의존이라 여기서는 순수함수만 검증.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stampFilename, toCSV, toExcelHTML, sanitizeCell } from '../lib/export.js';

const TODAY = (() => {
  const d = new Date();
  const z = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
})();

test('stampFilename: 확장자 앞에 날짜 스탬프', () => {
  assert.equal(stampFilename('report.csv'), `report_${TODAY}.csv`);
});

test('stampFilename: 확장자 없으면 끝에 스탬프', () => {
  assert.equal(stampFilename('report'), `report_${TODAY}`);
});

test('stampFilename: 여러 점이 있으면 마지막 점 기준', () => {
  assert.equal(stampFilename('a.b.xls'), `a.b_${TODAY}.xls`);
});

const cols = [
  { label: '이름', value: 'name' },
  { label: '전화', value: (r) => r.phone },
];

test('toCSV: 헤더 + 본문(따옴표 감싸기)', () => {
  const csv = toCSV([{ name: '홍길동', phone: '01012345678' }], cols);
  assert.equal(csv, '"이름","전화"\n"홍길동","01012345678"');
});

test('toCSV: 내부 따옴표 이스케이프(CSV 주입 방지 기초)', () => {
  const csv = toCSV([{ name: 'a"b', phone: '1' }], cols);
  assert.ok(csv.includes('"a""b"'));
});

test('toCSV: null/undefined 값은 빈 문자열', () => {
  const csv = toCSV([{ name: null, phone: undefined }], cols);
  assert.ok(csv.endsWith('"",""'));
});

test('toExcelHTML: HTML 특수문자 이스케이프', () => {
  const html = toExcelHTML([{ name: '<b>&', phone: '1' }], cols);
  assert.ok(html.includes('&lt;b&gt;&amp;'));
  assert.ok(!html.includes('<b>&<'));
});

test('toExcelHTML: 컬럼 라벨과 시트명 포함', () => {
  const html = toExcelHTML([{ name: 'x', phone: '1' }], cols, '세션');
  assert.ok(html.includes('이름'));
  assert.ok(html.includes('전화'));
  assert.ok(html.includes('<x:Name>세션</x:Name>'));
});

test('sanitizeCell: 수식 트리거 문자(=,+,-,@,tab,CR)로 시작하면 작은따옴표 가드', () => {
  assert.equal(sanitizeCell('=SUM(A1)'), "'=SUM(A1)");
  assert.equal(sanitizeCell('+82'), "'+82");
  assert.equal(sanitizeCell('-1'), "'-1");
  assert.equal(sanitizeCell('@cmd'), "'@cmd");
  assert.equal(sanitizeCell('\tTAB'), "'\tTAB");
  assert.equal(sanitizeCell('\rCR'), "'\rCR");
});

test('sanitizeCell: 전화번호·한글·숫자·날짜는 불변(전화번호 처리 무영향)', () => {
  assert.equal(sanitizeCell('010-****-1234'), '010-****-1234');
  assert.equal(sanitizeCell('정상 텍스트'), '정상 텍스트');
  assert.equal(sanitizeCell('2026-07-10'), '2026-07-10');
  assert.equal(sanitizeCell(1234), '1234');
});

test('sanitizeCell: null/undefined → 빈 문자열', () => {
  assert.equal(sanitizeCell(null), '');
  assert.equal(sanitizeCell(undefined), '');
});

test('toCSV: 수식 인젝션 셀은 따옴표로 감싸고 작은따옴표 가드 · 전화번호 불변', () => {
  const csv = toCSV([{ name: '=1+2', phone: '010-****-5678' }], cols);
  assert.ok(csv.includes(`"'=1+2"`));           // 수식 셀 가드
  assert.ok(csv.includes(`"010-****-5678"`));   // 전화번호 그대로
});
