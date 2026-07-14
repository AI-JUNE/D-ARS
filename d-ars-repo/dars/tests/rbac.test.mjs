// tests/rbac.test.mjs — 역할 기반 접근제어 규칙 단위 테스트 (무의존성)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { requiredRole, canAccess, RANK, ROLES } from '../lib/rbac.js';

test('공개 경로는 규칙 없음(null) → 누구나 접근', () => {
  assert.equal(requiredRole('/'), null);
  assert.equal(requiredRole('/visual'), null);
  assert.equal(requiredRole('/login'), null);
  assert.equal(canAccess('viewer', '/'), true);
});

test('운영 변경 화면은 operator 이상 필요', () => {
  assert.equal(requiredRole('/scenarios'), 'operator');
  assert.equal(requiredRole('/ums'), 'operator');
  assert.equal(canAccess('operator', '/scenarios'), true);
  assert.equal(canAccess('admin', '/scenarios'), true);
  assert.equal(canAccess('viewer', '/scenarios'), false);
});

test('조회 화면은 viewer 이상 필요', () => {
  assert.equal(requiredRole('/dashboard'), 'viewer');
  assert.equal(canAccess('viewer', '/dashboard'), true);
  assert.equal(canAccess('operator', '/dashboard'), true);
  assert.equal(canAccess('admin', '/dashboard'), true);
});

test('하위경로도 접두사 매칭', () => {
  assert.equal(requiredRole('/scenarios/123'), 'operator');
  assert.equal(canAccess('viewer', '/scenarios/123'), false);
});

test('알 수 없는 역할은 접근 불가(권한 0)', () => {
  assert.equal(canAccess('ghost', '/dashboard'), false);
  assert.equal(canAccess(undefined, '/dashboard'), false);
});

test('역할 계층 상수 정합성', () => {
  assert.deepEqual(ROLES, ['admin', 'operator', 'viewer']);
  assert.ok(RANK.admin > RANK.operator && RANK.operator > RANK.viewer);
});
