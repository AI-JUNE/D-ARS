import { hasDB, sql, safe } from '@/lib/db';
import { demoSessions } from '@/lib/demo';
import { guardIngest } from '@/lib/auth';
import { parseListParams, likeParam, filterRows, sliceRows, listResponse } from '@/lib/paginate';
import { sessionAggRows, foldSessionGroups } from '@/lib/sessionsAgg';
import { parseSortParams, orderBySql, sortRowsBy } from '@/lib/sortParams';
import { SESSION_SORTS } from '@/lib/listSorts';
export const dynamic = 'force-dynamic';

// 검색 대상: 세션ID·시나리오·노드. 전화번호(마스킹 PII)는 서버 검색 대상에서 제외.
const SESSION_SEARCH_FIELDS = ['id', 'scenario', 'node'];

// 서버 사이드 정렬 화이트리스트는 lib/listSorts.js(SESSION_SORTS) — 사용자는 키 이름만 보낼 수 있다(SQL 인젝션 무관).

// 진행 세션 조회(보드/실시간 폴백). SSE 스트림(/api/sessions/stream)이 push하는 스냅샷과 동일 스키마.
// limit/offset/q/meta 지원. 파라미터 없으면 기존과 동일(진행 세션 20건 배열).
// agg=1 : 현재 조건(검색어) **전체**에 대한 집계만 반환 → 화면 KPI가 "로드된 행"이 아니라
//         서버 총계를 쓰므로 "더 보기" 페이징에도 수치가 왜곡되지 않는다.
export async function GET(req) {
  const rawUrl = req?.url || 'http://local/api/sessions';
  const p = parseListParams(rawUrl, { limit: 20 });
  const like = likeParam(p.q);

  const aggFlag = new URL(rawUrl, 'http://local').searchParams.get('agg');
  if (aggFlag === '1' || aggFlag === 'true') {
    const groups = await safe(async () => {
      const rows = like
        ? await sql`select step, node, count(*)::int as n, coalesce(sum(elapsed),0)::int as el
                    from visual_sessions
                    where status='진행' and (id ilike ${like} or scenario ilike ${like} or node ilike ${like})
                    group by step, node`
        : await sql`select step, node, count(*)::int as n, coalesce(sum(elapsed),0)::int as el
                    from visual_sessions where status='진행' group by step, node`;
      return rows || [];
    }, null);
    if (groups && groups.length) return aggResponse(foldSessionGroups(groups));
    const demo = filterRows(demoSessions(6), p.q, SESSION_SEARCH_FIELDS);
    return aggResponse(sessionAggRows(demo));
  }

  const sort = parseSortParams(rawUrl, SESSION_SORTS);
  const order = orderBySql(sort, SESSION_SORTS, 'id asc');

  const hit = await safe(async () => {
    let rows;
    if (order) {
      // 정렬 지정 시에만 함수 호출 형태(sql(text, params)) — 태그드 템플릿은 컬럼명을 바인딩할 수 없다.
      // ORDER BY 조각은 화이트리스트에서 나온 서버 상수이고, 값은 여전히 $1.. 바인딩이다.
      const where = like
        ? `where status='진행' and (id ilike $1 or scenario ilike $1 or node ilike $1)`
        : `where status='진행'`;
      const args = like ? [like, p.limit, p.offset] : [p.limit, p.offset];
      const n = like ? 2 : 1;
      rows = await sql(
        `select id,phone,scenario,step,node,elapsed,status from visual_sessions ${where}
         order by ${order} limit $${n} offset $${n + 1}`,
        args
      );
    } else {
      rows = like
        ? await sql`select id,phone,scenario,step,node,elapsed,status from visual_sessions
                    where status='진행' and (id ilike ${like} or scenario ilike ${like} or node ilike ${like})
                    order by started_at desc limit ${p.limit} offset ${p.offset}`
        : await sql`select id,phone,scenario,step,node,elapsed,status from visual_sessions
                    where status='진행' order by started_at desc limit ${p.limit} offset ${p.offset}`;
    }
    const cnt = like
      ? await sql`select count(*)::int as n from visual_sessions
                  where status='진행' and (id ilike ${like} or scenario ilike ${like} or node ilike ${like})`
      : await sql`select count(*)::int as n from visual_sessions where status='진행'`;
    return { rows: rows || [], total: cnt?.[0]?.n ?? (rows?.length || 0) };
  }, null);
  if (hit && (hit.rows.length || p.q || p.offset)) return listResponse(hit.rows, hit.total, p, 3);
  const all = sortRowsBy(filterRows(demoSessions(6), p.q, SESSION_SEARCH_FIELDS), sort, SESSION_SORTS);
  return listResponse(sliceRows(all, p), all.length, p, 3);
}

function aggResponse(agg) {
  return Response.json(agg, { headers: { 'Cache-Control': 'no-store' } });
}

// 콜봇 이벤트 → Neon 세션 write API.
// body: { event:'launch'|'progress'|'complete'|'drop', id?, callId?, phone?, scenario?, node?, step?, elapsed? }
// 되돌리기 어려운 변경 아님(삭제·스키마 파괴 없음). visual_sessions에 upsert만 수행.
const NODE_BY_STEP = ['VISUAL_LAUNCH', 'SHOW_CARD', 'SHOW_MENU', 'REQUEST_DOC', 'END'];
function maskPhone(p) {
  if (!p) return null;
  const d = String(p).replace(/[^0-9]/g, '');
  return d.length >= 8 ? d.slice(0, 3) + '-****-' + d.slice(-4) : p;
}
export async function POST(req) {
  // 머신 수집 가드: 강제 모드 + INGEST_KEY 설정 시에만 실제 검사(그 외 통과 → 라이브 무붕괴).
  const denied = await guardIngest(req, 'operator');
  if (denied) return denied;
  let body;
  try { body = await req.json(); } catch { return Response.json({ ok: false, error: 'invalid json' }, { status: 400 }); }
  const event = String(body.event || 'progress');
  const id = body.id || body.callId || 'VS-' + Date.now().toString(36).toUpperCase();
  const callId = body.callId || null;
  const phone = maskPhone(body.phone);
  const scenario = body.scenario || null;
  // 이벤트별 파생값
  let step = Number.isInteger(body.step) ? body.step : null;
  let status = '진행';
  let ended = false;
  if (event === 'launch') { step = step ?? 0; status = '진행'; }
  else if (event === 'complete') { step = 4; status = '완료'; ended = true; }
  else if (event === 'drop') { status = '이탈'; ended = true; }
  else { step = step ?? 0; status = '진행'; } // progress
  const node = body.node || (step != null ? NODE_BY_STEP[Math.min(step, 4)] : null);
  const elapsed = Number.isFinite(body.elapsed) ? Math.max(0, Math.floor(body.elapsed)) : 0;

  if (!hasDB) {
    // DB 미설정 시: 화면이 멈추지 않도록 정규화된 세션 객체만 에코(데모 폴백).
    return Response.json({ ok: true, mode: 'demo-fallback', session: { id, phone, scenario, step: step ?? 0, node, elapsed, status } });
  }
  const saved = await safe(async () => {
    const rows = await sql`
      insert into visual_sessions (id, call_id, phone, scenario, step, node, elapsed, status, started_at, ended_at)
      values (${id}, ${callId}, ${phone}, ${scenario}, ${step ?? 0}, ${node}, ${elapsed}, ${status}, now(), ${ended ? new Date().toISOString() : null})
      on conflict (id) do update set
        call_id  = coalesce(excluded.call_id, visual_sessions.call_id),
        phone    = coalesce(excluded.phone, visual_sessions.phone),
        scenario = coalesce(excluded.scenario, visual_sessions.scenario),
        step     = greatest(excluded.step, visual_sessions.step),
        node     = coalesce(excluded.node, visual_sessions.node),
        elapsed  = greatest(excluded.elapsed, visual_sessions.elapsed),
        status   = excluded.status,
        ended_at = coalesce(excluded.ended_at, visual_sessions.ended_at)
      returning id, phone, scenario, step, node, elapsed, status`;
    return rows?.[0];
  }, null);
  if (!saved) return Response.json({ ok: false, error: 'write failed', mode: 'db-error' }, { status: 500 });
  return Response.json({ ok: true, mode: 'db', session: saved });
}
