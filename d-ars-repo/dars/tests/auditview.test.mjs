// tests/auditview.test.mjs — 감사 열람(P0-7 · /admin/audit) 순수 로직 단위 테스트
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseAuditQuery, shapeAuditRow, auditPage, AUDIT_VIEW_DEFAULT, AUDIT_VIEW_MAX,
} from '../lib/auditView.js';

test('parseAuditQuery: 기본값 — 전체 이벤트·커서 없음·기본 limit', () => {
  const q = parseAuditQuery('http://x/api/admin/audit');
  assert.deepEqual(q, { event: null, before: null, limit: AUDIT_VIEW_DEFAULT });
});

test('parseAuditQuery: 화이트리스트 이벤트만 인정, 밖은 무시(전체)', () => {
  assert.equal(parseAuditQuery('http://x/a?event=AUTH_LOGIN').event, 'AUTH_LOGIN');
  assert.equal(parseAuditQuery('http://x/a?event=WRITE_DENIED').event, 'WRITE_DENIED');
  assert.equal(parseAuditQuery('http://x/a?event=DROP_TABLE').event, null);
  assert.equal(parseAuditQuery('http://x/a?event=').event, null);
});

test('parseAuditQuery: limit 클램프(상한 200)·비정상 값은 기본값', () => {
  assert.equal(parseAuditQuery('http://x/a?limit=10').limit, 10);
  assert.equal(parseAuditQuery('http://x/a?limit=99999').limit, AUDIT_VIEW_MAX);
  assert.equal(parseAuditQuery('http://x/a?limit=0').limit, AUDIT_VIEW_DEFAULT);
  assert.equal(parseAuditQuery('http://x/a?limit=abc').limit, AUDIT_VIEW_DEFAULT);
  assert.equal(parseAuditQuery('http://x/a?limit=-5').limit, AUDIT_VIEW_DEFAULT);
});

test('parseAuditQuery: before 커서는 양의 정수만, 깨진 URL 도 throw 없이 기본값', () => {
  assert.equal(parseAuditQuery('http://x/a?before=120').before, 120);
  assert.equal(parseAuditQuery('http://x/a?before=0').before, null);
  assert.equal(parseAuditQuery('http://x/a?before=zz').before, null);
  assert.deepEqual(parseAuditQuery(null), { event: null, before: null, limit: AUDIT_VIEW_DEFAULT });
});

test('shapeAuditRow: 정형화 — Date ts 직렬화·문자열 detail 파싱·불량 행 null', () => {
  const d = new Date('2026-08-07T01:02:03.000Z');
  const r = shapeAuditRow({ id: '7', ts: d, event: 'AUTH_LOGIN', actor: 'a****n', role: 'admin', ip: '1.2.3.x', detail: '{"path":"/x"}' });
  assert.equal(r.id, 7);
  assert.equal(r.ts, '2026-08-07T01:02:03.000Z');
  assert.deepEqual(r.detail, { path: '/x' });
  assert.equal(shapeAuditRow(null), null);
  assert.equal(shapeAuditRow({ event: 'AUTH_LOGIN' }), null);          // id 없음
  assert.deepEqual(shapeAuditRow({ id: 1, detail: 'not-json' }).detail, {}); // 깨진 jsonb 흡수
  assert.deepEqual(shapeAuditRow({ id: 1, detail: [1] }).detail, {});        // 배열 거부
});

test('auditPage: limit+1 행이면 hasMore·nextBefore, 이하면 종료 페이지', () => {
  const rows = [{ id: 30 }, { id: 20 }, { id: 10 }];
  const p = auditPage(rows, 2);
  assert.equal(p.hasMore, true);
  assert.equal(p.events.length, 2);
  assert.equal(p.nextBefore, 20);
  const last = auditPage(rows, 3);
  assert.equal(last.hasMore, false);
  assert.equal(last.nextBefore, null);
  assert.deepEqual(auditPage(null, 5), { events: [], nextBefore: null, hasMore: false });
});
