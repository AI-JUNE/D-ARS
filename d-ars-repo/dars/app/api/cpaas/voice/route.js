// 인입 콜 웹훅 — CPaaS/콜봇이 전화 인입 시 호출
// body(프로바이더별 필드 표준화): { from|From|phone|caller, callId|CallSid, scenario? }
// 멱등성(v1.1): 같은 callId 재호출 시 기존 세션 재사용 + 중복 SMS 미발송(콜봇 재시도 대비)
import { signLink, sendSms, verifyWebhook, baseUrl, maskPhone, sessionIdFor, PROVIDER } from '@/lib/cpaas';
import { sql, safe } from '@/lib/db';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req) {
  if (!verifyWebhook(req)) return Response.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  let b = {}; try { b = await req.json(); } catch {}
  const from = b.from || b.From || b.phone || b.caller || '01000000000';
  const callId = b.callId || b.CallSid || b.call_id || ('C' + Date.now());
  const scenario = b.scenario || '복지 상담';
  const id = sessionIdFor(callId);

  // 세션 생성 — 이미 있으면 do nothing. returning으로 신규 여부 판별(멱등).
  // DB 없으면(데모/mock) inserted=null → 신규로 간주하고 SMS 발송(mock이라 과금 없음).
  const inserted = await safe(() => sql`insert into visual_sessions (id, phone, scenario, step, node, status)
    values (${id}, ${maskPhone(from)}, ${scenario}, 0, 'VISUAL_LAUNCH', '진행')
    on conflict (id) do nothing returning id`, null);
  const isExisting = Array.isArray(inserted) ? inserted.length === 0 : false;

  const token = signLink(id);
  const link = `${baseUrl()}/visual?s=${token}`;

  // 기존 세션(콜봇 재시도)이면 SMS 재발송 안 함 → 중복 문자·과금 방지
  let sms;
  if (isExisting) {
    sms = { ok: true, skipped: true, reason: 'idempotent: 기존 세션 재사용' };
  } else {
    sms = await sendSms(from, `[복지 보이는 ARS] 상담 화면을 열어주세요 (15분 유효): ${link}`);
  }

  return Response.json({ ok: true, provider: PROVIDER, sessionId: id, callId, idempotent: isExisting, link, sms });
}
export async function GET() {
  return Response.json({ ok: true, hint: 'POST 로 인입콜 이벤트를 보내세요. 테스트는 /api/dev/simulate' });
}
