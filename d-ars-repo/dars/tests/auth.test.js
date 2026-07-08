// lib/auth.js RBAC 순수 로직 단위 테스트 (환경변수 미설정 · 데모 기본값)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { roleAtLeast, minRoleFor, findUser, ROLES } from '../lib/auth.js';

test('roleAtLeast: viewer<operator<admin 등급 비교', () => {
  assert.ok(roleAtLeast('admin', 'operator'));
  assert.ok(roleAtLeast('operator', 'operator'));
  assert.ok(!roleAtLeast('viewer', 'operator'));
  assert.ok(!roleAtLeast('operator', 'admin'));
});

test('ROLES: 순서 보장', () => {
  assert.deepEqual(ROLES, ['viewer', 'operator', 'admin']);
});

test('minRoleFor: 경로별 최소 역할 (하위 경로 포함)', () => {
  assert.equal(minRoleFor('/launcher'), 'admin');
  assert.equal(minRoleFor('/ums'), 'operator');
  assert.equal(minRoleFor('/ums/123'), 'operator');   // startsWith
  assert.equal(minRoleFor('/scenarios'), 'operator');
  assert.equal(minRoleFor('/dashboard'), 'viewer');   // 미지정 → viewer
});

test('findUser: 데모 계정 검증, 비밀번호는 반환값에서 제외', () => {
  const u = findUser('admin', 'dars2026!');
  assert.equal(u.role, 'admin');
  assert.equal(u.p, undefined);         // 비밀번호 누출 방지
  assert.equal(findUser('admin', 'wrong'), null);
  assert.equal(findUser('nobody', 'x'), null);
});
