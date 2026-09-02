import { hasDB, sql, safe } from '@/lib/db';
import { guardWrite } from '@/lib/auth';
import { readJson, badRequest, clampStr } from '@/lib/validate';
export const dynamic = 'force-dynamic';

// 부분 수정(PUT). 입력검증(상용 하드닝): 예전에는 `await req.json()` 이 그대로 throw 되어
// 깨진 본문 하나가 500 으로 새어 나갔다 → readJson 으로 파싱 실패를 400 으로 정규화한다.
// 값은 POST 와 같은 규칙으로 클램핑(길이·제어문자)하고, 없으면 null → coalesce 로 기존 값 유지(하위호환).
export async function PUT(req, { params }) {
  const denied = await guardWrite(req, 'operator');
  if (denied) return denied;
  const b = await readJson(req);
  if (!b) return badRequest('invalid json');
  const biz = b.biz == null ? null : clampStr(b.biz, 80);
  const name = b.name == null ? null : clampStr(b.name, 120);
  const inUse = typeof b.in_use === 'boolean' ? b.in_use : null;
  if (!hasDB) return Response.json({ id: params.id, ...b, updated: true });
  const row = await safe(async () => (await sql`update docs set
    biz=coalesce(${biz}, biz), name=coalesce(${name}, name),
    in_use=coalesce(${inUse}, in_use)
    where id=${params.id} returning *`)[0], { id: params.id, ...b, updated: true });
  return Response.json(row || {});
}
