// tests/conditionsummary.test.mjs — 조회 조건 요약(내보내기 감사 기록) 회귀 테스트
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  conditionText, exportSubtitle, summarizeQuery, currentSearch,
} from '../lib/conditionSummary.js';
import { toExcelHTML } from '../lib/export.js';

test('conditionSummary: 조건이 없으면 빈 문자열', () => {
  assert.equal(conditionText(''), '');
  assert.equal(conditionText('?'), '');
  assert.equal(summarizeQuery('').length, 0);
});

test('conditionSummary: 기간 프리셋은 한글 라벨로', () => {
  assert.equal(conditionText('?range=7d'), '기간: 최근 7일');
  assert.equal(conditionText('range=90d'), '기간: 최근 90일'); // 선행 '?' 유무 무관
});

test('conditionSummary: 검색어는 따옴표로 감싼다', () => {
  assert.equal(conditionText('?q=주문'), "검색어: '주문'");
});

test('conditionSummary: 정렬은 sort+dir 을 한 항목으로 합친다', () => {
  assert.equal(conditionText('?sort=updated_at&dir=desc'), '정렬: 수정일 ↓ 내림차순');
  assert.equal(conditionText('?sort=req&dir=asc'), '정렬: 요청 ↑ 오름차순');
  assert.equal(conditionText('?sort=rate'), '정렬: 완료율 ↑ 오름차순'); // dir 없음 = asc(서버 규칙과 동일)
});

test('conditionSummary: 표시 순서는 기간 → 필터 → 검색어 → 정렬', () => {
  const t = conditionText('?sort=sent_at&dir=desc&q=홍길동&status=실패&range=7d');
  assert.equal(t, "기간: 최근 7일 · 상태: 실패 · 검색어: '홍길동' · 정렬: 발송 시각 ↓ 내림차순");
});

test('conditionSummary: 모르는 파라미터도 버리지 않고 기록한다(감사: 누락보다 과다가 안전)', () => {
  const t = conditionText('?range=7d&futureParam=x');
  assert.equal(t, '기간: 최근 7일 · futureParam: x');
});

test('conditionSummary: 빈 값·이상 입력은 조건이 아니다(폴백 안전)', () => {
  assert.equal(conditionText('?q=&status='), '');
  assert.equal(conditionText('?q=%20%20'), '');   // 공백만 → 조건 아님
  assert.equal(conditionText(null), '');
  assert.equal(conditionText(undefined), '');
  assert.equal(conditionText(123), '');
});

test('conditionSummary: 뷰·채널·날짜 범위 라벨', () => {
  assert.equal(conditionText('?view=table'), '보기: 표');
  assert.equal(conditionText('?ch=문자 발송'), '채널: 문자 발송');
  assert.equal(conditionText('?from=2026-07-01&to=2026-07-14'), '시작일: 2026-07-01 · 종료일: 2026-07-14');
});

test('exportSubtitle: 조건이 없어도 전체임을 명시적으로 남긴다', () => {
  assert.equal(exportSubtitle(''), '조회 조건 — 조회 조건 없음(전체)');
  assert.equal(exportSubtitle('?range=30d'), '조회 조건 — 기간: 최근 30일');
});

test('currentSearch: 비브라우저(SSR·테스트)에서는 빈 문자열', () => {
  assert.equal(currentSearch(), '');
});

test('toExcelHTML: subtitle 미지정 시 기존 출력과 동일(하위호환)', () => {
  const rows = [{ a: '1' }];
  const cols = [{ label: 'A', value: 'a' }];
  const html = toExcelHTML(rows, cols, 'S');
  assert.ok(!html.includes('colspan'));           // 머리말 행 없음
  assert.ok(html.includes('<thead><tr>'));
});

test('toExcelHTML: subtitle 지정 시 표 위에 조건 머리말(병합 셀)이 들어가고 HTML 이스케이프된다', () => {
  const rows = [{ a: '1' }];
  const cols = [{ label: 'A', value: 'a' }, { label: 'B', value: 'b' }];
  const html = toExcelHTML(rows, cols, 'S', { subtitle: "조회 조건 — 검색어: '<b>' & 상태: 실패" });
  assert.ok(html.includes('colspan="2"'));        // 컬럼 수만큼 병합
  assert.ok(html.includes('&lt;b&gt;') && html.includes('&amp;'));
  assert.ok(!html.includes('<b>'));               // 원문 태그가 살아 있으면 안 된다
});
