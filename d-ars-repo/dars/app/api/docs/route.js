import { hasDB, sql, safe } from '@/lib/db';
import { demoDocs } from '@/lib/demo';
import { readJson, badRequest, clampStr } from '@/lib/validate';
import { guardWrite } from '@/lib/auth';
import { parseListParams, likeParam, filterRows, sliceRows, listResponse } from '@/lib/paginate';
import { parseSortParams, orderBySql, sortRowsBy } from '@/lib/sortParams';
// 정렬 화이트리스트·검색 필드는 lib/listSorts.js 로 단일화(라우트 내 중복 스펙 제거 · 스펙 자체를 단위 테스트).
import { DOC_SORTS, DOC_SEARCH_FIELDS } from '@/lib/listSorts';
export const dynamic = 'force-dynamic';

// 목록 조회: limit/offset/q(서버 사이드 검색)/sort·dir(서버 사이드 정렬)/meta 지원.
// 파라미터가 없으면 기존과 동일한 배열 응답(완전 하위호환) — 정렬 미지정 시 기존 `order by req desc` 그대로.
export async function GET(req) {
  const p = parseListParams(req.url, { limit: 100 });
  const like = likeParam(p.q);
  const sort = parseSortParams(req.url, DOC_SORTS);
  const order = orderBySql(sort, DOC_SORTS, 'id asc');
  const hit = await safe(async () => {
    let rows;
    if (order) {
      // 정렬이 지정된 경우에만 함수 호출 형태(sql(text, params))를 쓴다 — 태그드 템플릿은 컬럼명을 바인딩할 수 없다.
      // ORDER BY 조각은 화이트리스트에서 나온 서버 상수이고, 값은 여전히 $1.. 바인딩이다.
      const where = like ? 'where id ilike $1 or biz ilike $1 or name ilike $1' : '';
      const args = like ? [like, p.limit, p.offset] : [p.limit, p.offset];
      const n = like ? 2 : 1;
      rows = await sql(
        `select id,biz,name,req,sent,done,in_use from docs ${where} order by ${order} limit $${n} offset $${n + 1}`,
        args
      );
    } else {
      rows = like
        ? await sql`select id,biz,name,req,sent,done,in_use from docs
                    where id ilike ${like} or biz ilike ${like} or name ilike ${like}
                    order by req desc limit ${p.limit} offset ${p.offset}`
        : await sql`select id,biz,name,req,sent,done,in_use from docs
                    order by req desc limit ${p.limit} offset ${p.offset}`;
    }
    const cnt = like
      ? await sql`select count(*)::int as n from docs
                  where id ilike ${like} or biz ilike ${like} or name ilike ${like}`
      : await sql`select count(*)::int as n from docs`;
    return { rows: rows || [], total: cnt?.[0]?.n ?? (rows?.length || 0) };
  }, null);
  // DB 결과가 비어 있고 검색·페이지 이동이 아닌 첫 조회면 기존처럼 데모로 폴백(라이브 데모 무붕괴).
  if (hit && (hit.rows.length || p.q || p.offset)) return listResponse(hit.rows, hit.total, p, 60);
  const all = sortRowsBy(filterRows(demoDocs, p.q, DOC_SEARCH_FIELDS), sort, DOC_SORTS);
  return listResponse(sliceRows(all, p), all.length, p, 60);
}
export async function POST(req) {
  const denied = await guardWrite(req, 'operator');
  if (denied) return denied;
  const b = await readJson(req);
  if (!b) return badRequest('invalid json');
  const id = clampStr(b.id, 40) || 'D' + Date.now().toString().slice(-4);
  const biz = clampStr(b.biz, 80) || '-';
  const name = clampStr(b.name, 120) || '새 서류';
  if (!hasDB) return Response.json({ id, biz, name, req:0, sent:0, done:0, in_use:true }, { status:201 });
  const row = await safe(async () => (await sql`insert into docs (id,biz,name) values (${id}, ${biz}, ${name}) returning *`)[0], { id, biz, name, req:0, sent:0, done:0, in_use:true });
  return Response.json(row, { status:201 });
}
