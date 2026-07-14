import { hasDB, sql, safe } from '@/lib/db';
import { demoScenarios } from '@/lib/demo';
import { readJson, badRequest, clampStr, clampNodes } from '@/lib/validate';
import { guardWrite } from '@/lib/auth';
import { parseListParams, likeParam, filterRows, sliceRows, listResponse } from '@/lib/paginate';
import { parseSortParams, orderBySql, sortRowsBy } from '@/lib/sortParams';
import { SCENARIO_SORTS, SCENARIO_SEARCH_FIELDS } from '@/lib/listSorts';
import { parseRangeParams, rangeBounds, filterByDate } from '@/lib/statsRange';
export const dynamic = 'force-dynamic';

const COLS = 'id,name,type,status,version,nodes,updated_by,updated_at';

// 목록 조회: limit/offset/q(서버 검색)/sort·dir(서버 전체 기준 정렬)/status(운영·미운영)/meta 지원.
// 파라미터가 없으면 기존과 동일한 배열 응답(완전 하위호환) — 정렬 미지정 시 기존 `order by id` 그대로.
// 개인정보 무관(시나리오 메타데이터만 조회) · 읽기 전용 → 저위험.
// SQL 인젝션 무관: 사용자는 정렬 **키 이름**만 보낼 수 있고(화이트리스트), 값은 전부 $n 바인딩.
//
// **기간 파라미터(2026-07-14 야간)**: `?days=N` 또는 `?from=&to=` — **`updated_at` 기준**(lib/statsRange).
//   - 시나리오는 변경 이력 감사 대상이라 "이번 주에 손댄 시나리오만" 같은 조회가 필요했다(기존엔 전 기간 고정).
//   - 목록·상태별 총계(보드 그룹 건수)·내보내기가 **모두 같은 구간**을 참조한다.
//   - 날짜는 strictDay 를 통과한 `YYYY-MM-DD` 만 **$n 바인딩**(문자열 보간 없음) → 인젝션 시도는 구간 미적용 폴백.
//   - 파라미터가 없으면 from/to = null → 기존 쿼리 결과와 동일(**완전 하위호환**).
export async function GET(req) {
  const status = new URL(req.url).searchParams.get('status');
  const hasStatus = !!(status && status !== '전체');
  const p = parseListParams(req.url, { limit: 100 });
  const like = likeParam(p.q);
  const sort = parseSortParams(req.url, SCENARIO_SORTS);
  const order = orderBySql(sort, SCENARIO_SORTS, 'id asc'); // 데모 폴백(sortRowsBy)과 동일한 2차 정렬
  const range = parseRangeParams(req.url);
  const { from: rf, to: rt } = rangeBounds(range);
  const hit = await safe(async () => {
    let rows;
    if (order) {
      // 정렬 지정 시에만 함수 호출 형태(sql(text, params)) — ORDER BY 는 화이트리스트 상수, 값은 $n 바인딩.
      const cond = [];
      const args = [];
      if (hasStatus) { args.push(status); cond.push(`status=$${args.length}`); }
      if (like) {
        args.push(like);
        const i = args.length;
        cond.push(`(id ilike $${i} or name ilike $${i} or type ilike $${i} or status ilike $${i} or updated_by ilike $${i})`);
      }
      if (rf && rt) {
        args.push(rf, rt);
        const i = args.length - 1;
        cond.push(`updated_at >= $${i}::date and updated_at < ($${i + 1}::date + 1)`);
      }
      const where = cond.length ? `where ${cond.join(' and ')}` : '';
      args.push(p.limit, p.offset);
      const n = args.length - 1;
      rows = await sql(
        `select ${COLS} from scenarios ${where} order by ${order} limit $${n} offset $${n + 1}`,
        args
      );
    } else {
      // 태그드 템플릿 경로: 조건을 늘리지 않고 null 통과 패턴으로 표현한다(파라미터 없으면 기존 결과와 동일).
      const stVal = hasStatus ? status : null;
      rows = await sql`select id,name,type,status,version,nodes,updated_by,updated_at from scenarios
        where (${stVal}::text is null or status = ${stVal})
          and (${like}::text is null or id ilike ${like} or name ilike ${like} or type ilike ${like}
               or updated_by ilike ${like} or (${stVal}::text is null and status ilike ${like}))
          and (${rf}::text is null or updated_at >= ${rf}::date)
          and (${rt}::text is null or updated_at < (${rt}::date + 1))
        order by id limit ${p.limit} offset ${p.offset}`;
    }
    const stVal = hasStatus ? status : null;
    const cnt = await sql`select count(*)::int as n from scenarios
      where (${stVal}::text is null or status = ${stVal})
        and (${like}::text is null or id ilike ${like} or name ilike ${like} or type ilike ${like}
             or updated_by ilike ${like} or (${stVal}::text is null and status ilike ${like}))
        and (${rf}::text is null or updated_at >= ${rf}::date)
        and (${rt}::text is null or updated_at < (${rt}::date + 1))`;
    return { rows: rows || [], total: cnt?.[0]?.n ?? (rows?.length || 0) };
  }, null);
  // DB 결과가 비었고 검색·필터·페이지 이동·기간 지정이 아닌 첫 조회면 기존처럼 데모 폴백(라이브 데모 무붕괴).
  // 기간을 좁혀 0건인 것은 **정상 응답**이다 → 데모로 폴백하면 없는 시나리오가 있는 것처럼 보인다(range 조건 추가).
  if (hit && (hit.rows.length || p.q || p.offset || hasStatus || range)) return listResponse(hit.rows, hit.total, p, 60);
  let all = demoScenarios;
  if (hasStatus) all = all.filter((s) => s.status === status);
  all = filterByDate(all, range, 'updated_at');
  all = sortRowsBy(filterRows(all, p.q, SCENARIO_SEARCH_FIELDS), sort, SCENARIO_SORTS);
  return listResponse(sliceRows(all, p), all.length, p, 60);
}
export async function POST(req) {
  const denied = await guardWrite(req, 'operator');
  if (denied) return denied;
  const b = await readJson(req);
  if (!b) return badRequest('invalid json');
  const id = clampStr(b.id, 40) || 'SC-' + Date.now().toString().slice(-4);
  const name = clampStr(b.name, 120) || '새 시나리오';
  const type = clampStr(b.type, 40) || '인바운드';
  const status = clampStr(b.status, 20) || '미운영';
  const updatedBy = clampStr(b.updated_by, 60) || '운영 관리자';
  const nodes = clampNodes(b.nodes) || [{ id:1, type:'VISUAL_LAUNCH', label:'화면 런칭' }, { id:2, type:'END', label:'종료' }];
  if (!hasDB) return Response.json({ id, name, type, status, version:1, nodes }, { status:201 });
  const row = await safe(async () => (await sql`insert into scenarios (id,name,type,status,version,nodes,updated_by)
    values (${id}, ${name}, ${type}, ${status}, 1, ${JSON.stringify(nodes)}, ${updatedBy})
    returning *`)[0], { id, name, type, status, version:1, nodes });
  return Response.json(row, { status:201 });
}
