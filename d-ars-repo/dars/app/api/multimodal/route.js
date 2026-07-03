import { sql, safe, jsonCached } from '@/lib/db';
import { demoMultimodal } from '@/lib/demo';

export const dynamic = 'force-dynamic';

// 멀티모달 이력 조회(읽기 전용). 테이블 미존재/오류 시 데모로 폴백 → 화면이 멈추지 않음.
export async function GET(req) {
  const channel = new URL(req.url).searchParams.get('channel');
  const rows = await safe(
    () => sql`select id, ts, phone, scenario, service, channel, node, result, duration
              from multimodal_log order by ts desc limit 200`,
    demoMultimodal(48)
  );
  const data = (rows && rows.length ? rows : demoMultimodal(48))
    .filter(r => !channel || channel === '전체' || r.channel === channel);
  return jsonCached(data, 20);
}
