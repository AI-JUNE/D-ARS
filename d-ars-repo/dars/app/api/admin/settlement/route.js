// /api/admin/settlement — 파트너 정산 리포트 조회·내보내기 (COMMERCIAL_READINESS "정산 리포트" · 관리자 전용)
//
// 게이트: guardWrite(req, 'admin') — 읽기지만 정산 근거는 admin 전용(미들웨어 /api/admin 과 이중 게이트).
// 질의: ?month=YYYY-MM(기본: 이번 달 · UTC) · ?format=csv(기본 json)
// 데이터: DATABASE_URL + db/partner.sql 적용 시 partners·organizations·partner_attributions 조회.
//   표가 없거나 무DB 면 safe() 폴백으로 빈 목록 → 리포트는 "파트너 0"(오류가 아니라 빈 상태 · source 로 구분).
// 이용 실적(세션수·청구액)은 아직 **원천이 없다** — usageSource:'none' 으로 드러내고 줄마다 amount_missing 으로
//   남긴다(0 원으로 꾸미지 않는다). 과금 원장 연결은 계약 확정 후 [승인 필요].
// 수수료율: PARTNER_COMMISSION_RATES(JSON · 퍼센트)에서만 온다. 설정 오류는 rateProblems 로 보고(값 원문 미포함).
// 저장·전송 없음(GET 전용).

import { hasDB, sql, safe } from '@/lib/db';
import { guardWrite } from '@/lib/auth';
import { ok, badRequest } from '@/lib/apiError';
import { parseCommissionRates, parseMonth, buildSettlement, settlementCsv } from '@/lib/settlement';

export const dynamic = 'force-dynamic';

function defaultMonth() {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export async function GET(req) {
  const denied = await guardWrite(req, 'admin');
  if (denied) return denied;

  const sp = new URL(req.url).searchParams;
  const monthParam = sp.get('month');
  const month = monthParam == null || monthParam === '' ? defaultMonth() : monthParam;
  if (!parseMonth(month)) return badRequest('month must be YYYY-MM');
  const format = sp.get('format') === 'csv' ? 'csv' : 'json';

  const partners = await safe(() => sql`select id, name, status from partners order by id`, []);
  const organizations = await safe(() => sql`select id, name, contracted_at, status from organizations order by id`, []);
  const attributions = await safe(
    () => sql`select id, org_id, partner_id, channel, contracted_at, attributed_by, reason, created_at
              from partner_attributions order by id`,
    [],
  );

  const { rates, problems: rateProblems } = parseCommissionRates(process.env.PARTNER_COMMISSION_RATES);
  const report = buildSettlement({
    month,
    partners: partners || [], organizations: organizations || [], attributions: attributions || [],
    usage: [],                 // 과금 원장 미연결 — 입력 없음
    rates,
  });

  if (format === 'csv') {
    return new Response(settlementCsv(report), {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="settlement_${month}.csv"`,
        'Cache-Control': 'no-store',
      },
    });
  }
  return ok(
    { ...report, source: hasDB ? 'db' : 'none', usageSource: 'none', rateProblems },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
