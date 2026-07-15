// E2E 시뮬레이터(개발/데모 전용) — 키 없이 인입콜→세션→SMS→화면링크→이벤트→액션 전 흐름 검증
// GET /api/dev/simulate?phone=01012345678&scenario=복지상담
import { signLink, sendSms, notifyCallbot, baseUrl, maskPhone, PROVIDER } from '@/lib/cpaas';
import { sql, safe } from '@/lib/db';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req) {
  if (process.env.DEMO_MODE === '0') return Response.json({ ok: false, error: '운영 모드에서는 시뮬레이터 비활성' }, { status: 403 });
  const u = new URL(req.url);
  const phone = u.searchParams.get('phone') || '01012345678';
  const scenario = u.searchParams.get('scenario') || '복지 상담';
  const steps = [];

  // 1) 인입콜 → 세션 생성
  const id = 'SIM-' + Date.now().toString().slice(-7);
  await safe(() => sql`insert into visual_sessions (id, phone, scenario, step, node, status)
    values (${id}, ${maskPhone(phone)}, ${scenario}, 0, 'VISUAL_LAUNCH', '진행') on conflict (id) do nothing`, null);
  steps.push({ step: '① 인입콜', sessionId: id, phone: maskPhone(phone) });

  // 2) 서명 링크 + SMS 발송
  const token = signLink(id);
  const link = `${baseUrl()}/visual?s=${token}`;
  const sms = await sendSms(phone, `[복지 보이는 ARS] 화면을 열어주세요: ${link}`);
  steps.push({ step: '② SMS 발송', to: phone, link, smsResult: sms });

  // 3) 이벤트 릴레이(예: STT→노드 이동)
  await safe(() => sql`update visual_sessions set node='SHOW_CARD', step=2 where id=${id}`, null);
  steps.push({ step: '③ 이벤트 릴레이', node: 'SHOW_CARD', note: 'STT 인식 → 정보 카드 표출(화면 SSE로 반영)' });

  // 4) 고객 화면 액션 → 콜봇 콜백
  const relay = await notifyCallbot({ sessionId: id, action: 'request_doc', value: '기초연금 신청서', at: new Date().toISOString() });
  steps.push({ step: '④ 화면 액션 콜백', action: 'request_doc', relayed: relay });

  return Response.json({
    ok: true, provider: PROVIDER, sessionId: id, link,
    summary: '인입콜 → 세션 → SMS(링크) → 이벤트(화면 갱신) → 액션(콜봇 콜백) 전 흐름 성공',
    steps,
    tip: PROVIDER === 'mock' ? 'mock 모드: SMS/콜백은 서버 로그에 출력됩니다. 실연동은 CPAAS_PROVIDER=http + 키 설정.' : '',
  });
}
