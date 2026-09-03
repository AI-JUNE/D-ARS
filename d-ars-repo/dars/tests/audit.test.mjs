// tests/audit.test.mjs — 접근/감사 로그(P0-7 · 117회차) 단위 테스트
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AUDIT_EVENTS, maskActor, maskIp, sanitizeDetail, buildAuditEntry, auditLine, audit, accessEventFor,
} from '../lib/audit.js';

// ── maskActor: 원문 계정이 그대로 남지 않는다 ──
test('maskActor: 일반 계정 마스킹(첫·끝 글자만 노출)', () => {
  assert.equal(maskActor('operator'), 'o******r');
  assert.ok(!maskActor('operator').includes('perato'));
});
test('maskActor: 짧은 계정·이메일·비문자열', () => {
  assert.equal(maskActor('ab'), 'a*');
  assert.equal(maskActor('a'), 'a*');
  assert.equal(maskActor('gowon@corp.kr'), 'g***n@corp.kr');
  assert.equal(maskActor(''), '');
  assert.equal(maskActor(null), '');
});

// ── maskIp: 원문 IP 가 그대로 남지 않는다 ──
test('maskIp: IPv4 마지막 옥텟 마스킹', () => {
  assert.equal(maskIp('203.0.113.42'), '203.0.113.x');
});
test('maskIp: IPv6 뒤 절반 마스킹·비정형은 masked', () => {
  assert.equal(maskIp('2001:db8:85a3:0:0:8a2e:370:7334'), '2001:db8:85a3:0::x');
  assert.equal(maskIp('unknown-format'), 'masked');
  assert.equal(maskIp(''), '');
  assert.equal(maskIp(undefined), '');
});

// ── sanitizeDetail: 로그 폭주·PII 유입 방어 ──
test('sanitizeDetail: 원시값만·키 8개 상한·문자열 200자 절단', () => {
  const big = {};
  for (let i = 0; i < 12; i++) big['k' + i] = i;
  assert.equal(Object.keys(sanitizeDetail(big)).length, 8);
  const s = sanitizeDetail({ msg: 'x'.repeat(500), n: 3, b: true, nested: { a: 1 }, fn: () => {}, nil: null });
  assert.equal(s.msg.length, 200);
  assert.equal(s.n, 3);
  assert.equal(s.b, true);
  assert.ok(!('nested' in s) && !('fn' in s) && !('nil' in s));
});
test('sanitizeDetail: 비객체 입력은 빈 객체', () => {
  assert.deepEqual(sanitizeDetail(null), {});
  assert.deepEqual(sanitizeDetail('str'), {});
  assert.deepEqual(sanitizeDetail([1, 2]), {});
});

// ── buildAuditEntry: 화이트리스트 강제 + 마스킹 적용 ──
test('buildAuditEntry: 유효 이벤트는 마스킹된 평면 엔트리', () => {
  const e = buildAuditEntry({ event: 'AUTH_LOGIN', actor: 'operator', role: 'operator', ip: '10.0.0.9', detail: { via: 'form' } });
  assert.equal(e.event, 'AUTH_LOGIN');
  assert.equal(e.actor, 'o******r');
  assert.equal(e.ip, '10.0.0.x');
  assert.equal(e.detail.via, 'form');
  assert.ok(!Number.isNaN(Date.parse(e.ts)));
});
test('buildAuditEntry: 화이트리스트 밖 이벤트는 null(기록 거부)', () => {
  assert.equal(buildAuditEntry({ event: 'DROP_TABLE' }), null);
  assert.equal(buildAuditEntry({}), null);
  assert.equal(buildAuditEntry(), null);
  for (const ev of AUDIT_EVENTS) assert.ok(buildAuditEntry({ event: ev }), ev);
});

// ── auditLine: 수집기 파싱 계약 ──
test('auditLine: [AUDIT] 접두어 + JSON 파싱 가능', () => {
  const e = buildAuditEntry({ event: 'AUTH_LOGOUT', actor: 'admin', ip: '1.2.3.4' });
  const line = auditLine(e);
  assert.ok(line.startsWith('[AUDIT] '));
  const parsed = JSON.parse(line.slice('[AUDIT] '.length));
  assert.equal(parsed.event, 'AUTH_LOGOUT');
});

// ── audit(): 무해화 계약 — 어떤 입력에도 throw 하지 않는다 ──
test('audit: DB 없이 유효 이벤트 true·무효 이벤트 false·무throw', async () => {
  assert.equal(await audit('AUTH_LOGIN_FAIL', { actor: 'x', ip: '9.9.9.9' }), true);
  assert.equal(await audit('NOT_AN_EVENT'), false);
  assert.equal(await audit(), false);
});

// ── accessEventFor: 접근 성공 이벤트 분류(118회차) ──
test('accessEventFor: 관리 API 는 ADMIN_ACCESS, 나머지는 WRITE_OK', () => {
  assert.equal(accessEventFor('/api/admin/audit'), 'ADMIN_ACCESS');
  assert.equal(accessEventFor('/api/admin'), 'ADMIN_ACCESS');
  assert.equal(accessEventFor('/api/docs'), 'WRITE_OK');
  assert.equal(accessEventFor('/api/scenarios/17'), 'WRITE_OK');
});
test('accessEventFor: 접두어 오인 방지(/api/administration 은 관리 API 가 아니다)', () => {
  assert.equal(accessEventFor('/api/administration'), 'WRITE_OK');
  assert.equal(accessEventFor('/api/adminx/y'), 'WRITE_OK');
});
test('accessEventFor: 쿼리·해시 무시 · 이상 입력은 WRITE_OK 로 축약(무throw)', () => {
  assert.equal(accessEventFor('/api/admin/audit?event=AUTH_LOGIN'), 'ADMIN_ACCESS');
  assert.equal(accessEventFor('/api/admin/audit#x'), 'ADMIN_ACCESS');
  assert.equal(accessEventFor(''), 'WRITE_OK');
  assert.equal(accessEventFor(null), 'WRITE_OK');
  assert.equal(accessEventFor(undefined), 'WRITE_OK');
  assert.equal(accessEventFor(42), 'WRITE_OK');
});
test('accessEventFor 반환값은 항상 화이트리스트 안이다', () => {
  for (const p of ['/api/admin/audit', '/api/docs', '', null]) {
    assert.ok(AUDIT_EVENTS.includes(accessEventFor(p)));
  }
});
