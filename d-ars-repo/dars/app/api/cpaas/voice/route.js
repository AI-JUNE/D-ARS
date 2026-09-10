// 인입 콜 웹훅 — CPaaS/콜봇이 전화 인입 시 호출
// body(프로바이더별 필드 표준화): { from|From|phone|caller, callId|CallSid, scenario? }
// 멱등성(v1.1): 같은 callId 재호출 시 기존 세션 재사용 + 중복 SMS 미발송(콜봇 재시도 대비)
import { signLink, sendSms, verifyWebhook, baseUrl, maskPhone, sessionIdFor, PROVIDER } from '@/lib/cpaas';
import { sql, safe } from '@/lib/db';
import { unauthorized, fail } from '@/lib/apiError';
import { consume, ipKey } from '@/lib/apiLimits';
import { decideInbound, decideEngineError, fallbackEnvelope } from '@/lib/ivrFallback';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// 인입콜 웹훅 남용 완화(SMS 발송 남용·시크릿 브루트포스 방어). 한도는 lib/apiLimits(cpaasVoice).
// verifyWebhook **이전에** 검사해 인증 실패 요청도 카운트한다.
//
// 장애 폴백 계약(lib/ivrFallback): 응답에는 `fallback.mode` 가 항상 실린다.
//   - SMS 실패 → 200 + mode:'ivr'(SMS_FAILED)  : 엔진은 살아 있고 세션은 만들었으나 고객이 링크를 못 받음
//   - 처리 중 예외 → 503 + mode:'ivr'(ENGINE_ERROR): 콜봇은 화면 없이 음성 IVR 로 계속
//   콜봇은 2xx + mode:'visual' 일 때만 "화면을 보세요" 안내를 한다.
export async function POST(req) {
  const over = consume('cpaasVoice', ipKey(req));
  if (over) return over;
  if (!verifyWebhook(req)) return unauthorized();
  try {
    return await handleInbound(req);
  } catch (e) {
    // 오류 원문은 로그로만. 응답에는 고정 코드·문구만(콜봇이 그대로 읽어도 안전).
    console.error('[cpaas:voice] engine error:', e?.message);
    return fail('engine error', 503, fallbackEnvelope(decideEngineError()));
  }
}

async function handleInbound(req) {
  let b = {}; try { b = await req.json(); } catch {}
  const from = b.from || b.From || b.phone || b.caller || '01000000000';
  const callId = b.callId || b.CallSid || b.call_id || ('C' + Date.now());
  const scenario = b.scenario || '복지 상담';
  const gen = ['senior', 'youth', 'family'].includes(b.gen) ? b.gen : null;   // 회선 고정 세대 톤
  const id = sessionIdFor(callId);

  // 세션 생성 — 이미 있으면 do nothing. returning으로 신규 여부 판별(멱등).
  // DB 없으면(데모/mock) inserted=null → 신규로 간주하고 SMS 발송(mock이라 과금 없음).
  const inserted = await safe(() => sql`insert into visual_sessions (id, phone, scenario, step, node, status)
    values (${id}, ${maskPhone(from)}, ${scenario}, 0, 'VISUAL_LAUNCH', '진행')
    on conflict (id) do nothing returning id`, null);
  const isExisting = Array.isArray(inserted) ? inserted.length === 0 : false;

  if (gen) await safe(() => sql`update visual_sessions set gen = ${gen} where id = ${id}`, null);
  const token = signLink(id);
  const link = `${baseUrl()}/visual?s=${token}${gen ? `&gen=${gen}` : ''}`;

  // 기존 세션(콜봇 재시도)이면 SMS 재발송 안 함 → 중복 문자·과금 방지
  let sms;
  if (isExisting) {
    sms = { ok: true, skipped: true, reason: 'idempotent: 기존 세션 재사용' };
  } else {
    sms = await sendSms(from, `[복지 보이는 ARS] 상담 화면을 열어주세요 (15분 유효): ${link}`);
  }

  return Response.json({ ok: true, provider: PROVIDER, sessionId: id, callId, idempotent: isExisting, link, sms, ...fallbackEnvelope(decideInbound({ sms })) });
}
export async function GET() {
  return Response.json({ ok: true, hint: 'POST 로 인입콜 이벤트를 보내세요. 테스트는 /api/dev/simulate' });
}
