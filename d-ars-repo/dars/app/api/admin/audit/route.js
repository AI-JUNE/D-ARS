// /api/admin/audit — 감사 이벤트 열람 API (P0-7 · 관리자 전용)
//
// 게이트: guardWrite(req, 'admin') — 읽기지만 감사 데이터는 admin 전용.
//   비강제(AUTH_ENFORCE!=1) 데모 모드에서는 통과(다른 API 와 동일 정책)하되,
//   그 경우 영속화(AUDIT_DB)도 꺼져 있어 실데이터가 없다(콘솔 로그 모드).
//   거부 시 WRITE_DENIED 감사가 자동 기록된다(guardWrite 내장 · 마스킹·무해화).
// 데이터: AUDIT_DB=1 + DATABASE_URL 일 때만 audit_events 조회(persisted:true).
//   아니면 persisted:false + 빈 목록 — 화면이 "콘솔 로그 모드" 안내를 띄운다.
// 페이징: id 내림차순 커서(before) · limit 1..200 클램프(lib/auditView 순수 모듈).

import { hasDB, sql, safe } from '@/lib/db';
import { guardWrite } from '@/lib/auth';
import { ok } from '@/lib/apiError';
import { parseAuditQuery, auditPage } from '@/lib/auditView';

export const dynamic = 'force-dynamic';

export async function GET(req) {
  const denied = await guardWrite(req, 'admin');
  if (denied) return denied;

  const { event, before, limit } = parseAuditQuery(req.url);
  const persisted = process.env.AUDIT_DB === '1' && hasDB;   // [승인 필요] 게이트 — 기본 OFF
  if (!persisted) {
    return ok(
      { persisted: false, events: [], nextBefore: null, hasMore: false },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  }

  // limit+1 조회로 hasMore 판정(auditPage). 조건 조합은 4가지뿐이라 정적 템플릿으로 나열
  // (neon tagged template — 문자열 조립 SQL 금지).
  const n = limit + 1;
  const rows = await safe(() => {
    if (event && before) {
      return sql`select id, ts, event, actor, role, ip, detail from audit_events
                 where event = ${event} and id < ${before} order by id desc limit ${n}`;
    }
    if (event) {
      return sql`select id, ts, event, actor, role, ip, detail from audit_events
                 where event = ${event} order by id desc limit ${n}`;
    }
    if (before) {
      return sql`select id, ts, event, actor, role, ip, detail from audit_events
                 where id < ${before} order by id desc limit ${n}`;
    }
    return sql`select id, ts, event, actor, role, ip, detail from audit_events
               order by id desc limit ${n}`;
  }, []);

  return ok(
    { persisted: true, ...auditPage(rows, limit) },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
