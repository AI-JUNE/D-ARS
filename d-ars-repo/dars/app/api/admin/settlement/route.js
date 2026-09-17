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
import { guardWrite, viewerScope } from '@/lib/auth';
import { ok, badRequest } from '@/lib/apiError';
import { parseCommissionRates, parseMonth, buildSettlement, settlementCsv } from '@/lib/settlement';
import { selectTenantRows } from '@/lib/tenantQuery';

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

  // 테넌트 표는 **쿼리 계층(lib/tenantQuery)** 을 통해서만 읽는다 — 파트너 범위가 끼어드는 단일 지점이다.
  // scope 는 명시 필수(빠뜨리면 전체가 아니라 빈 결과). 이 라우트는 admin 게이트를 이미 통과했고
  // partner_admin 은 viewer 등급이라 여기까지 올 수 없지만, 범위는 요청자에게서 받아 온다 —
  // 게이트 구성이 바뀌어도 이 줄이 알아서 좁아지도록 두는 편이 안전하다.
  const scope = await viewerScope(req);
  const io = { sql, safe };
  const partners = await selectTenantRows(io, 'partners', { scope, columns: ['id', 'name', 'status'] });
  const organizations = await selectTenantRows(io, 'organizations', {
    scope, columns: ['id', 'name', 'contracted_at', 'status'],
  });
  const attributions = await selectTenantRows(io, 'partner_attributions', { scope });

  const { rates, problems: rateProblems } = parseCommissionRates(process.env.PARTNER_COMMISSION_RATES);
  const report = buildSettlement({
    month,
    partners, organizations, attributions,   // selectTenantRows 는 어떤 실패에도 배열을 보장한다
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
