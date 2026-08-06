// tests/demo.test.mjs — lib/demo.js(DATABASE_URL 미설정 시 데모 폴백 데이터) 불변식 고정
//
// 목적: 데모 데이터는 랜덤 생성이지만 화면·집계가 의존하는 "형태 계약"은 고정이다.
//  - 개인정보 안전: 데모 전화번호는 항상 마스킹(010-****-NNNN) — 실번호 형태가 새어 나가면 안 된다.
//  - 상태·노드 값은 화면 필터/뱃지가 아는 집합 안에서만 나와야 한다.
//  - n 인자·기본 길이·id 유일성은 목록 페이징/키 렌더링의 전제다.
// 랜덤 요소는 반복 실행으로 훑되, 단정은 결정적 불변식에만 건다.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  demoScenarios, demoDocs, demoDaily,
  demoUms, demoSessions, demoMultimodal,
  journey, nodeByStep,
} from '../lib/demo.js';

const MASKED = /^010-\*{4}-\d{4}$/;
const NODE_TYPES = new Set(['VISUAL_LAUNCH', 'SHOW_CARD', 'SHOW_MENU', 'REQUEST_DOC', 'RAG_ANSWER', 'CHANNEL_SWITCH', 'END']);

/* ── 정적 데이터 ── */

test('demoScenarios: 형태 계약(id·name·nodes)과 노드 타입 집합', () => {
  assert.ok(Array.isArray(demoScenarios) && demoScenarios.length >= 1);
  const ids = new Set();
  for (const sc of demoScenarios) {
    assert.equal(typeof sc.id, 'string');
    assert.ok(!ids.has(sc.id), '시나리오 id 중복 없음');
    ids.add(sc.id);
    assert.equal(typeof sc.name, 'string');
    assert.ok(['인바운드', '아웃바운드'].includes(sc.type));
    assert.ok(['운영', '미운영'].includes(sc.status));
    assert.ok(Array.isArray(sc.nodes) && sc.nodes.length >= 1);
    for (const n of sc.nodes) {
      assert.ok(NODE_TYPES.has(n.type), `알 수 없는 노드 타입: ${n.type}`);
      assert.equal(typeof n.label, 'string');
    }
  }
});

test('demoDocs: 깔때기 단조성(req ≥ sent ≥ done ≥ 0) — 완료율 KPI 분모 전제', () => {
  assert.ok(demoDocs.length >= 1);
  for (const d of demoDocs) {
    assert.ok(d.req >= d.sent && d.sent >= d.done && d.done >= 0, `${d.name} 깔때기 역전`);
    assert.equal(typeof d.in_use, 'boolean');
  }
});

test('demoDaily: 날짜 형식(YYYY-MM-DD)·수치 필드 — 일별 추이 차트 전제', () => {
  assert.ok(demoDaily.length >= 1);
  for (const r of demoDaily) {
    assert.match(r.day, /^\d{4}-\d{2}-\d{2}$/);
    for (const k of ['inbound', 'multimodal', 'completed', 'dropped']) {
      assert.ok(Number.isFinite(r[k]) && r[k] >= 0, `${r.day}.${k} 비수치`);
    }
    assert.ok(r.completed + r.dropped <= r.inbound, `${r.day} 완료+이탈 > 인입`);
  }
});

test('journey·nodeByStep: 단계 5개 병렬 배열(step 인덱스 공유)', () => {
  assert.equal(journey.length, 5);
  assert.equal(nodeByStep.length, 5);
  for (const t of nodeByStep) assert.ok(NODE_TYPES.has(t));
});

/* ── 생성 함수(랜덤) — 반복 실행으로 불변식 고정 ── */

test('demoUms: 길이(n·기본 24)·id 유일·전화번호 마스킹·상태 집합·sent_at ISO', () => {
  assert.equal(demoUms().length, 24);
  assert.equal(demoUms(0).length, 0);
  for (let iter = 0; iter < 5; iter++) {
    const rows = demoUms(30);
    assert.equal(rows.length, 30);
    const ids = new Set(rows.map((r) => r.id));
    assert.equal(ids.size, rows.length, 'id 중복 없음(React key·행선택 전제)');
    for (const r of rows) {
      assert.match(r.phone, MASKED, '데모 전화번호는 반드시 마스킹');
      assert.ok(['발송완료', '대기', '실패'].includes(r.status));
      assert.ok(Number.isFinite(Date.parse(r.sent_at)), 'sent_at 파싱 가능');
      assert.equal(typeof r.service, 'string');
      assert.equal(typeof r.doc, 'string');
    }
  }
});

test('demoSessions: 길이(기본 6)·마스킹·step-node-status 정합', () => {
  assert.equal(demoSessions().length, 6);
  for (let iter = 0; iter < 5; iter++) {
    const rows = demoSessions(12);
    assert.equal(rows.length, 12);
    assert.equal(new Set(rows.map((r) => r.id)).size, rows.length);
    for (const r of rows) {
      assert.match(r.phone, MASKED);
      assert.ok(Number.isInteger(r.step) && r.step >= 0 && r.step < nodeByStep.length);
      assert.equal(r.node, nodeByStep[r.step], 'node 는 step 병렬 배열과 일치');
      assert.equal(r.status, r.step >= 4 ? '완료' : '진행', 'status 는 step 파생');
      assert.ok(Number.isFinite(r.elapsed) && r.elapsed >= 0);
    }
  }
});

test('demoMultimodal: 길이(기본 40)·마스킹·결과 집합·duration 하한·ts 파싱', () => {
  assert.equal(demoMultimodal().length, 40);
  for (let iter = 0; iter < 5; iter++) {
    const rows = demoMultimodal(20);
    assert.equal(rows.length, 20);
    assert.equal(new Set(rows.map((r) => r.id)).size, rows.length);
    for (const r of rows) {
      assert.match(r.phone, MASKED);
      assert.ok(['완료', '이탈', '상담원 전환'].includes(r.result));
      assert.ok(NODE_TYPES.has(r.node));
      assert.ok(Number.isFinite(r.duration) && r.duration >= 8, 'duration 하한 8초');
      assert.ok(Number.isFinite(Date.parse(r.ts)));
    }
  }
});
