// tests/validate.test.mjs — 쓰기 API 입력검증 유틸 단위 테스트 (무의존성: node:test)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clampStr, clampNodes, readJson, badRequest } from '../lib/validate.js';

test('clampStr: 양끝 공백 제거', () => {
  assert.equal(clampStr('  안녕  '), '안녕');
});

test('clampStr: 제어문자 제거', () => {
  assert.equal(clampStr('a\x01b\x1fc'), 'abc');
  assert.equal(clampStr('a\x00b\x7fc'), 'abc');
  assert.equal(clampStr('탭\t줄바꿈\n제거'), '탭줄바꿈제거');
  assert.equal(clampStr('가 나 다'), '가 나 다');
});

test('clampStr: 최대 길이로 절단', () => {
  assert.equal(clampStr('abcdef', 3), 'abc');
});

test('clampStr: null/undefined → null (기존 기본값 흐름 유지)', () => {
  assert.equal(clampStr(null), null);
  assert.equal(clampStr(undefined), null);
});

test('clampStr: 숫자도 문자열로 강제', () => {
  assert.equal(clampStr(123), '123');
});

test('clampNodes: 배열이 아니면 null', () => {
  assert.equal(clampNodes(null), null);
  assert.equal(clampNodes('nope'), null);
  assert.equal(clampNodes({}), null);
});

test('clampNodes: 최대 개수 제한', () => {
  const many = Array.from({ length: 150 }, (_, i) => ({ id: i, type: 'END', label: 'x' }));
  assert.equal(clampNodes(many, 100).length, 100);
});

test('clampNodes: 필드 안전화(type 40자, label 120자, id 보존)', () => {
  const out = clampNodes([{ id: 'n1', type: 'T'.repeat(50), label: 'L'.repeat(200) }]);
  assert.equal(out[0].id, 'n1');
  assert.equal(out[0].type.length, 40);
  assert.equal(out[0].label.length, 120);
});

test('readJson: 유효한 객체 반환', async () => {
  const req = { json: async () => ({ a: 1 }) };
  assert.deepEqual(await readJson(req), { a: 1 });
});

test('readJson: 배열/원시값/파싱실패 → null', async () => {
  assert.equal(await readJson({ json: async () => [1, 2] }), null);
  assert.equal(await readJson({ json: async () => 5 }), null);
  assert.equal(await readJson({ json: async () => { throw new Error('bad'); } }), null);
});

test('badRequest: 400 상태 응답', async () => {
  const res = badRequest('oops');
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.equal(body.ok, false);
  assert.equal(body.error, 'oops');
});

// 쓰기 라우트(scenarios·docs·ums) 하드닝 계약 회귀 테스트
// 라우트는 @/ 별칭을 써 node:test에서 직접 import 불가 → 라우트가 의존하는 합성 패턴을 검증한다.
test('라우트 계약: 잘못된 JSON body → badRequest(400) 경로', async () => {
  const b = await readJson({ json: async () => { throw new Error('bad'); } });
  assert.equal(b, null); // 라우트는 !b 이면 badRequest('invalid json') 반환
  const res = badRequest('invalid json');
  assert.equal(res.status, 400);
});

test('라우트 계약: 필드 미제공 시 clampStr(null)||기본값 → 기존 기본값 흐름 유지', () => {
  // scenarios: name/type/status/updated_by
  assert.equal(clampStr(undefined, 120) || '새 시나리오', '새 시나리오');
  assert.equal(clampStr(undefined, 40) || '인바운드', '인바운드');
  // docs: biz/name
  assert.equal(clampStr(undefined, 80) || '-', '-');
  assert.equal(clampStr(undefined, 120) || '새 서류', '새 서류');
  // ums: service/doc (phone은 clamp 미적용 — 개인정보 처리 로직 불변)
  assert.equal(clampStr(undefined, 80) || '영수증 발급', '영수증 발급');
});

test('라우트 계약: 과대 입력은 컬럼 한도로 클램핑(DB 오염 방지)', () => {
  assert.equal((clampStr('X'.repeat(500), 120) || '새 시나리오').length, 120);
  assert.equal((clampStr('Y'.repeat(500), 80) || '-').length, 80);
});

test('라우트 계약: 시나리오 nodes 미제공 시 기본 런칭·종료 노드로 폴백', () => {
  const nodes = clampNodes(undefined) || [{ id:1, type:'VISUAL_LAUNCH', label:'화면 런칭' }, { id:2, type:'END', label:'종료' }];
  assert.equal(nodes.length, 2);
  assert.equal(nodes[0].type, 'VISUAL_LAUNCH');
  assert.equal(nodes[1].type, 'END');
});

// ── apiError 위임 회귀(2026-09-02) ────────────────────────────────────────
// validate.badRequest 는 이제 lib/apiError.badRequest 에 위임한다. 본문 형태는 그대로여야
// 하고(기존 클라이언트 무영향), no-store 헤더만 추가된다.
test('badRequest: 본문 형태 불변 + no-store 추가', async () => {
  const res = badRequest('invalid json');
  assert.equal(res.status, 400);
  assert.equal(res.headers.get('Cache-Control'), 'no-store');
  const body = await res.json();
  assert.deepEqual(body, { ok: false, error: 'invalid json' });
});

test('badRequest: 인자 없으면 기본 문구', async () => {
  assert.equal((await badRequest().json()).error, 'invalid request');
});
