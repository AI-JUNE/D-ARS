import { sql, safe, jsonCached } from '@/lib/db';
import { demoDocs, demoUms, demoSessions, demoDaily } from '@/lib/demo';
import { deriveNotifications } from '@/lib/notify';
import { parseThresholdParams } from '@/lib/notifyRules';

export const dynamic = 'force-dynamic';

// 알림 센터: 운영 데이터(서류 완료율·UMS 실패·장기 세션·이탈률)에서 알림을 자동 도출.
// 별도 테이블 없이 기존 지표를 규칙 기반으로 요약 → 운영자가 한 화면에서 이상 징후를 확인.
// 도출 로직은 순수 함수 lib/notify.js(deriveNotifications)로 분리 → 회귀 테스트 가능(tests/notify.test.mjs).
//
// 임계값 설정화(2026-07-13 야간): 규칙 임계값(서류 완료율·UMS 실패/대기·장기 세션·이탈률)을 쿼리 파라미터로 받는다.
// 값은 lib/notifyRules 의 화이트리스트 키만 읽어 정수화·범위 클램핑하고, **SQL 에는 들어가지 않는다**(집계 쿼리 불변).
// 파라미터가 없으면 기존 상수와 동일한 기본값 → 완전 하위호환(기존 클라이언트 무영향).
export async function GET(req) {
  const thresholds = parseThresholdParams(req?.url || 'http://local/api/notifications');

  const docs = await safe(() => sql`select id,biz,name,req,sent,done,in_use from docs order by req desc`, demoDocs);
  const ums = await safe(() => sql`select id,sent_at,phone,service,doc,status from ums_log order by sent_at desc limit 100`, demoUms(30));
  const sessions = await safe(() => sql`select id,phone,scenario,step,node,elapsed,status from visual_sessions where status='진행' order by started_at desc limit 20`, demoSessions(6));
  const daily = await safe(() => sql`select day,inbound,multimodal,completed,dropped from daily_stats order by day`, demoDaily);

  const { notes, summary, thresholds: applied } = deriveNotifications({
    docs: docs && docs.length ? docs : demoDocs,
    ums: ums && ums.length ? ums : demoUms(30),
    sessions: sessions && sessions.length ? sessions : demoSessions(6),
    daily: daily && daily.length ? daily : demoDaily,
  }, Date.now(), thresholds);

  return jsonCached({ notes, summary, thresholds: applied }, 20);
}
