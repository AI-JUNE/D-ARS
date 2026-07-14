import { sql, safe } from '@/lib/db';
import { demoMultimodal } from '@/lib/demo';
import { parseListParams, likeParam, filterRows, sliceRows, listResponse } from '@/lib/paginate';
import { aggregateRows, foldGroups } from '@/lib/aggregate';
import { parseSortParams, orderBySql, sortRowsBy } from '@/lib/sortParams';
import { MM_SORTS } from '@/lib/listSorts';
import { parseRangeParams, rangeBounds, filterByDate } from '@/lib/statsRange';

export const dynamic = 'force-dynamic';

// 검색 대상: 시나리오·서비스·노드·결과. 전화번호(PII)는 서버 검색 대상에서 제외.
const MM_SEARCH_FIELDS = ['scenario', 'service', 'node', 'result'];

// 서버 사이드 정렬 화이트리스트는 lib/listSorts.js(MM_SORTS) — 사용자는 키 이름만 보낼 수 있다(SQL 인젝션 무관).
// 정렬 미지정 시에는 기존 기본 정렬(order by ts desc) 경로가 한 줄도 바뀌지 않는다.

// 멀티모달 이력 조회(읽기 전용). 테이블 미존재/오류 시 데모로 폴백 → 화면이 멈추지 않음.
// 채널 필터는 기존대로, 추가로 limit/offset/q/meta 지원(파라미터 없으면 기존과 동일 배열 200건).
// agg=1 : 현재 조건(채널·검색어·기간) **전체**에 대한 집계만 반환 → 화면 KPI/도넛/채널분포가
//         "로드된 행"이 아니라 서버 총계를 쓰므로 "더 보기" 페이징에도 수치가 왜곡되지 않는다.
//
// **기간 파라미터(2026-07-13 야간)**: `?days=N` 또는 `?from=&to=` (lib/statsRange).
//   - 목록·총계·집계가 **모두 같은 구간**을 쓴다 → 화면 KPI·도넛·표·내보내기가 서로 어긋나지 않는다.
//   - 날짜는 `strictDay` 를 통과한 `YYYY-MM-DD` 만 사용하고 **항상 $n 바인딩**(문자열 보간 없음) → 인젝션 무관.
//   - 파라미터가 없으면 from/to = null → 기존 where 절이 그대로 통과(**완전 하위호환**).
export async function GET(req) {
  const url = new URL(req.url);
  const channel = url.searchParams.get('channel');
  const hasCh = !!(channel && channel !== '전체');
  const p = parseListParams(url, { limit: 200 });
  const like = likeParam(p.q);
  const isAgg = url.searchParams.get('agg') === '1' || url.searchParams.get('agg') === 'true';
  const range = parseRangeParams(url);
  const { from: rf, to: rt } = rangeBounds(range);
  const chVal = hasCh ? channel : null;

  if (isAgg) {
    const groups = await safe(async () => {
      const rows = await sql`select result, channel, count(*)::int as n, coalesce(sum(duration), 0)::int as dur
        from multimodal_log
        where (${chVal}::text is null or channel = ${chVal})
          and (${like}::text is null or scenario ilike ${like} or service ilike ${like} or node ilike ${like} or result ilike ${like})
          and (${rf}::text is null or ts >= ${rf}::date)
          and (${rt}::text is null or ts < (${rt}::date + 1))
        group by result, channel`;
      return rows || [];
    }, null);
    if (groups && groups.length) return aggResponse(foldGroups(groups), range);
    const demo = filterRows(
      filterByDate(demoMultimodal(48).filter((r) => !hasCh || r.channel === channel), range, 'ts'),
      p.q,
      MM_SEARCH_FIELDS
    );
    return aggResponse(aggregateRows(demo), range);
  }

  const sort = parseSortParams(url, MM_SORTS);
  const order = orderBySql(sort, MM_SORTS, 'id asc');

  const hit = await safe(async () => {
    let rows;
    if (order) {
      // 정렬이 지정된 경우에만 함수 호출 형태(sql(text, params)) — 태그드 템플릿은 컬럼명을 바인딩할 수 없다.
      // ORDER BY 조각은 화이트리스트에서 나온 서버 상수이고, 값은 여전히 $1.. 바인딩이다.
      rows = await sql(
        `select id, ts, phone, scenario, service, channel, node, result, duration
         from multimodal_log
         where ($1::text is null or channel = $1)
           and ($2::text is null or scenario ilike $2 or service ilike $2 or node ilike $2 or result ilike $2)
           and ($3::text is null or ts >= $3::date)
           and ($4::text is null or ts < ($4::date + 1))
         order by ${order} limit $5 offset $6`,
        [chVal, like, rf, rt, p.limit, p.offset]
      );
    } else {
      rows = await sql`select id, ts, phone, scenario, service, channel, node, result, duration
        from multimodal_log
        where (${chVal}::text is null or channel = ${chVal})
          and (${like}::text is null or scenario ilike ${like} or service ilike ${like} or node ilike ${like} or result ilike ${like})
          and (${rf}::text is null or ts >= ${rf}::date)
          and (${rt}::text is null or ts < (${rt}::date + 1))
        order by ts desc limit ${p.limit} offset ${p.offset}`;
    }
    const cnt = await sql`select count(*)::int as n from multimodal_log
      where (${chVal}::text is null or channel = ${chVal})
        and (${like}::text is null or scenario ilike ${like} or service ilike ${like} or node ilike ${like} or result ilike ${like})
        and (${rf}::text is null or ts >= ${rf}::date)
        and (${rt}::text is null or ts < (${rt}::date + 1))`;
    return { rows: rows || [], total: cnt?.[0]?.n ?? (rows?.length || 0) };
  }, null);
  // 기간을 좁혀 결과가 0건인 것은 **정상 응답**이다 → 데모로 폴백하면 없는 이력이 있는 것처럼 보인다(range 조건 추가).
  if (hit && (hit.rows.length || p.q || p.offset || range)) return listResponse(hit.rows, hit.total, p, 20);
  let all = demoMultimodal(48).filter((r) => !hasCh || r.channel === channel);
  all = filterByDate(all, range, 'ts');
  all = filterRows(all, p.q, MM_SEARCH_FIELDS);
  all = sortRowsBy(all, sort, MM_SORTS);
  return listResponse(sliceRows(all, p), all.length, p, 20);
}

function aggResponse(agg, range = null) {
  // range 는 **서버가 실제 적용한 구간** — 화면이 라벨을 서버 응답에서 만들 수 있게 함께 내린다(라벨-숫자 불일치 방지).
  return Response.json({ ...agg, range }, {
    headers: { 'Cache-Control': 'public, s-maxage=20, stale-while-revalidate=100' },
  });
}
