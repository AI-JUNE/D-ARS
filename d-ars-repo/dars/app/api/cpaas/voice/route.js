// 인입 콜 웹훅 — CPaaS/콜봇이 전화 인입 시 호출
// body(프로바이더별 필드 표준화): { from|From|phone|caller, callId|CallSid, scenario? }
import { signLink, sendSms, verifyWebhook, baseUrl, maskPhone, PROVIDER } from '@/lib/cpaas';
import { sql, safe } from '@/lib/db';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req) {
  if (!verifyWebhook(req)) return Response.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  let b = {}; try { b = await req.json(); } catch {}
  const from = b.from || b.From || b.phone || b.caller || '01000000000';
  const callId = b.callId || b.CallSid || b.call_id || ('C' + Date.now());
  const scenario = b.scenario || '복지 상담';
  const id = 'VS-' + Date.now().toString().slice(-7);

  // 세션 생성(DB 있으면 기록, 없으면/스키마 다르면 조용히 스킵 → mock E2E도 동작)
  await safe(() => sql`insert into visual_sessions (id, phone, scenario, step, node, status)
    values (${id}, ${maskPhone(from)}, ${scenario}, 0, 'VISUAL_LAUNCH', '진행')
    on conflict (id) do nothing`, null);

  const token = signLink(id);
  const link = `${baseUrl()}/visual?s=${token}`;
  const smsText = `[복지 보이는 ARS] 상담 화면을 열어주세요 (15분 유효): ${link}`;
  const sms = await sendSms(from, smsText);

  // 프로바이더가 TwiML을 기대하면 XML로 응답하도록 확장 가능. 기본은 JSON.
  return Response.json({ ok: true, provider: PROVIDER, sessionId: id, callId, link, sms });
}
export async function GET() {
  return Response.json({ ok: true, hint: 'POST 로 인입콜 이벤트를 보내세요. 테스트는 /api/dev/simulate', provider: PROVIDER });
}
