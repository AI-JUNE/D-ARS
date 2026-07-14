import { hasDB, sql, safe } from '@/lib/db';
import { demoUms } from '@/lib/demo';
import { readJson, badRequest, clampStr } from '@/lib/validate';
import { guardWrite } from '@/lib/auth';
import { parseListParams, likeParam, filterRows, sliceRows, listResponse } from '@/lib/paginate';
import { parseSortParams, orderBySql, sortRowsBy } from '@/lib/sortParams';
// 정렬 화이트리스트·검색 필드는 lib/listSorts.js 로 단일화(중복 스펙 제거).
// 검색 대상은 서비스·서류·상태 — 전화번호(PII)는 정렬 대상이지만 서버 검색 대상이 아니다(기존 정책 유지).
import { UMS_SORTS, UMS_SEARCH_FIELDS } from '@/lib/listSorts';
import { parseRangeParams, rangeBounds, filterByDate } from '@/lib/statsRange';
export const dynamic = 'force-dynamic';

// **기간 파라미터(2026-07-13 야간)**: `?days=N` 또는 `?from=&to=` (lib/statsRange).
//   - 발송 로그는 감사·정산 대상이라 "지난 30일 발송분만" 같은 구간 조회가 필요했다(기존엔 전 기간 고정).
//   - 목록·총계(KPI)·내보내기가 **모두 같은 구간**을 참조하므로 화면 숫자와 파일 내용이 어긋나지 않는다.
//   - 날짜는 `strictDay` 검증을 통과한 `YYYY-MM-DD` 만 **$n 바인딩**으로 전달(문자열 보간 없음) → 인젝션 무관.
//   - 파라미터가 없으면 from/to = null → 기존 쿼리 결과와 동일(**완전 하위호환**). 전화번호(PII) 처리 불변.
export async function GET(req) {
  const status = new URL(req.url).searchParams.get('status');
  const hasStatus = !!(status && status !== '전체');
  const p = parseListParams(req.url, { limit: 100 });
  const like = likeParam(p.q);
  const sort = parseSortParams(req.url, UMS_SORTS);
  const order = orderBySql(sort, UMS_SORTS, 'id asc'); // 데모 폴백(sortRowsBy)과 동일한 2차 정렬
  const range = parseRangeParams(req.url);
  const { from: rf, to: rt } = rangeBounds(range);
  const hit = await safe(async () => {
    let rows;
    if (order) {
      // 정렬 지정 시에만 함수 호출 형태(값은 $1.. 바인딩, ORDER BY 는 화이트리스트 상수).
      const cond = [];
      const args = [];
      if (hasStatus) { args.push(status); cond.push(`status=$${args.length}`); }
      if (like) {
        args.push(like);
        const i = args.length;
        cond.push(hasStatus
          ? `(service ilike $${i} or doc ilike $${i})`
          : `(service ilike $${i} or doc ilike $${i} or status ilike $${i})`);
      }
      if (rf && rt) {
        args.push(rf, rt);
        const i = args.length - 1;
        cond.push(`sent_at >= $${i}::date and sent_at < ($${i + 1}::date + 1)`);
      }
      const where = cond.length ? `where ${cond.join(' and ')}` : '';
      args.push(p.limit, p.offset);
      const n = args.length - 1;
      rows = await sql(
        `select id,sent_at,phone,service,doc,status from ums_log ${where} order by ${order} limit $${n} offset $${n + 1}`,
        args
      );
    } else {
      // 태그드 템플릿 경로: 조건을 늘리지 않고 null 통과 패턴으로 표현한다(파라미터 없으면 기존 결과와 동일).
      const stVal = hasStatus ? status : null;
      rows = await sql`select id,sent_at,phone,service,doc,status from ums_log
        where (${stVal}::text is null or status = ${stVal})
          and (${like}::text is null or service ilike ${like} or doc ilike ${like} or (${stVal}::text is null and status ilike ${like}))
          and (${rf}::text is null or sent_at >= ${rf}::date)
          and (${rt}::text is null or sent_at < (${rt}::date + 1))
        order by sent_at desc limit ${p.limit} offset ${p.offset}`;
    }
    const cnt = await sql`select count(*)::int as n from ums_log
      where (${hasStatus ? status : null}::text is null or status = ${hasStatus ? status : null})
        and (${like}::text is null or service ilike ${like} or doc ilike ${like} or (${hasStatus ? status : null}::text is null and status ilike ${like}))
        and (${rf}::text is null or sent_at >= ${rf}::date)
        and (${rt}::text is null or sent_at < (${rt}::date + 1))`;
    return { rows: rows || [], total: cnt?.[0]?.n ?? (rows?.length || 0) };
  }, null);
  // 기간을 좁혀 0건인 것은 정상 응답 → 데모로 폴백하면 없는 발송이 있는 것처럼 보인다(range 조건 추가).
  if (hit && (hit.rows.length || p.q || p.offset || range)) return listResponse(hit.rows, hit.total, p, 15);
  let all = demoUms(30);
  if (hasStatus) all = all.filter((x) => x.status === status);
  all = filterByDate(all, range, 'sent_at');
  all = sortRowsBy(filterRows(all, p.q, UMS_SEARCH_FIELDS), sort, UMS_SORTS);
  return listResponse(sliceRows(all, p), all.length, p, 15);
}
export async function POST(req) {
  const denied = await guardWrite(req, 'operator');
  if (denied) return denied;
  const b = await readJson(req);
  if (!b) return badRequest('invalid json');
  // 전화번호(개인정보)는 기존 처리 로직을 그대로 유지 — 비PII 필드만 안전화(길이 클램핑).
  const phone = b.phone || '010-****-0000';
  const service = clampStr(b.service, 80) || '영수증 발급';
  const doc = clampStr(b.doc, 120) || '거래 영수증';
  if (!hasDB) return Response.json({ id: Date.now(), sent_at:new Date().toISOString(), status:'발송완료', phone, service, doc }, { status:201 });
  const row = await safe(async () => (await sql`insert into ums_log (phone,service,doc,status)
    values (${phone}, ${service}, ${doc}, '발송완료') returning *`)[0],
    { id: Date.now(), sent_at:new Date().toISOString(), status:'발송완료', phone, service, doc });
  return Response.json(row, { status:201 });
}
