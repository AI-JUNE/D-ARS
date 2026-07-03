import { sql, safe, jsonCached } from '@/lib/db';
import { demoDaily } from '@/lib/demo';
export const dynamic = 'force-dynamic';
export async function GET() {
  const daily = await safe(() => sql`select day,inbound,multimodal,completed,dropped from daily_stats order by day`, demoDaily);
  const services = [
    { name:'주문상세 안내', sent:540, launch:300, sms:120, drop:120, done:420 },
    { name:'배송추적 안내', sent:420, launch:160, sms:160, drop:120, done:300 },
    { name:'영수증 발급', sent:260, launch:80, sms:108, drop:78, done:182 },
  ];
  return jsonCached({ daily: daily && daily.length ? daily : demoDaily, services }, 120);
}
