import { sql, safe, jsonCached } from '@/lib/db';
import { demoDocs, demoUms, demoSessions, demoDaily } from '@/lib/demo';
import { pct } from '@/lib/ui';

export const dynamic = 'force-dynamic';

// 알림 센터: 운영 데이터(서류 완료율·UMS 실패·장기 세션·이탈률)에서 알림을 자동 도출.
// 별도 테이블 없이 기존 지표를 규칙 기반으로 요약 → 운영자가 한 화면에서 이상 징후를 확인.
export async function GET() {
  const docs = await safe(() => sql`select id,biz,name,req,sent,done,in_use from docs order by req desc`, demoDocs);
  const ums = await safe(() => sql`select id,sent_at,phone,service,doc,status from ums_log order by sent_at desc limit 100`, demoUms(30));
  const sessions = await safe(() => sql`select id,phone,scenario,step,node,elapsed,status from visual_sessions where status='진행' order by started_at desc limit 20`, demoSessions(6));
  const daily = await safe(() => sql`select day,inbound,multimodal,completed,dropped from daily_stats order by day`, demoDaily);

  const D = docs && docs.length ? docs : demoDocs;
  const U = ums && ums.length ? ums : demoUms(30);
  const S = sessions && sessions.length ? sessions : demoSessions(6);
  const DL = daily && daily.length ? daily : demoDaily;

  const notes = [];
  const push = (level, cat, icon, title, body, href) =>
    notes.push({ id: `${cat}-${notes.length}`, level, cat, icon, title, body, href, ts: Date.now() });

  // 1) 서류 완료율 저조 (운영 중 서류 중 완료율 60% 미만)
  D.filter(d => d.in_use).forEach(d => {
    const p = pct(d.done, d.req);
    if (d.req >= 50 && p < 60) push('warn', '서류', '📋', `${d.name} 완료율 ${p}%`,
      `요청 ${d.req}건 대비 완료 ${d.done}건. 안내 문구·발송 흐름 점검이 필요합니다.`, '/docs');
  });

  // 2) UMS 발송 실패 집계
  const fail = U.filter(x => x.status === '실패').length;
  const wait = U.filter(x => x.status === '대기').length;
  if (fail > 0) push(fail >= 3 ? 'bad' : 'warn', 'UMS', '✉️', `UMS 발송 실패 ${fail}건`,
    `최근 발송 100건 중 실패 ${fail}건. 수신 거부·번호 오류 여부를 확인하세요.`, '/ums');
  if (wait >= 3) push('info', 'UMS', '✉️', `UMS 발송 대기 ${wait}건`,
    `대기 상태 발송 건이 누적되었습니다. 발송 큐 상태를 확인하세요.`, '/ums');

  // 3) 장기 진행 세션(경과 180초 이상)
  const longS = S.filter(s => s.elapsed >= 180);
  longS.forEach(s => push('warn', '세션', '📡', `장기 진행 세션 ${s.id}`,
    `${s.scenario} · 경과 ${Math.floor(s.elapsed / 60)}분 ${s.elapsed % 60}초. 상담원 전환 필요 여부를 확인하세요.`, '/sessions'));

  // 4) 이탈률 상승(최근일 이탈/인입 비율)
  const last = DL[DL.length - 1];
  if (last) {
    const dropRate = pct(last.dropped, last.inbound);
    if (dropRate >= 8) push('warn', '통계', '📈', `이탈률 ${dropRate}%`,
      `${last.day} 인입 ${last.inbound.toLocaleString()}건 중 이탈 ${last.dropped.toLocaleString()}건. 시나리오 초반 이탈 지점을 점검하세요.`, '/stats');
  }

  // 5) 정상 운영 요약(항상 1건 · 최신 상태 안내)
  push('ok', '시스템', '✅', '콜봇 연동 정상',
    `보이는 ARS·UMS·Neon 연결이 정상입니다. 진행 세션 ${S.length}건 모니터링 중.`, '/dashboard');

  // 심각도 우선 정렬(bad > warn > info > ok)
  const rank = { bad: 0, warn: 1, info: 2, ok: 3 };
  notes.sort((a, b) => rank[a.level] - rank[b.level]);

  const summary = {
    total: notes.length,
    bad: notes.filter(n => n.level === 'bad').length,
    warn: notes.filter(n => n.level === 'warn').length,
    info: notes.filter(n => n.level === 'info').length,
  };
  return jsonCached({ notes, summary }, 20);
}
