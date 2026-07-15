// D-ARS ↔ CPaaS/콜봇 연계 계층 (provider 무관 · mock 내장)
// 환경변수:
//   CPAAS_PROVIDER = mock | http   (기본 mock: 키 없이 개발/테스트)
//   CPAAS_SECRET          : 고객 링크 서명용 (미설정 시 개발 기본값)
//   CPAAS_WEBHOOK_SECRET  : 인입 웹훅 공유시크릿(헤더 x-webhook-secret) 검증(설정 시)
//   SMS_GATEWAY_URL       : http provider의 SMS 발송 엔드포인트
//   CALLBOT_CALLBACK_URL  : 화면 액션을 콜봇으로 되돌릴 콜백 URL
//   CPAAS_API_KEY         : 위 아웃바운드 호출 Bearer 토큰(선택)
//   PUBLIC_BASE_URL       : 고객에게 보낼 링크의 베이스(기본 d-ars.vercel.app)
import crypto from 'node:crypto';

export const PROVIDER = process.env.CPAAS_PROVIDER || 'mock';
const SECRET = process.env.CPAAS_SECRET || 'dev-cpaas-secret-change-me';
export const baseUrl = () => (process.env.PUBLIC_BASE_URL || 'https://d-ars.vercel.app').replace(/\/$/, '');
function authHeader() { const t = process.env.CPAAS_API_KEY; return t ? { authorization: `Bearer ${t}` } : {}; }

export function maskPhone(p) {
  const d = String(p || '').replace(/[^0-9]/g, '');
  return d.length >= 8 ? `${d.slice(0, 3)}-****-${d.slice(-4)}` : '010-****-0000';
}
export function signLink(sessionId, ttlMin = 15) {
  const exp = Date.now() + ttlMin * 60000;
  const payload = `${sessionId}.${exp}`;
  const sig = crypto.createHmac('sha256', SECRET).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}
export function verifyLink(token) {
  if (!token) return null;
  const parts = String(token).split('.');
  if (parts.length !== 3) return null;
  const [sessionId, exp, sig] = parts;
  const expect = crypto.createHmac('sha256', SECRET).update(`${sessionId}.${exp}`).digest('base64url');
  if (sig !== expect) return null;
  if (Date.now() > Number(exp)) return { sessionId, expired: true };
  return { sessionId, expired: false };
}
// 인입 웹훅 공유시크릿 검증(설정된 경우에만)
export function verifyWebhook(req) {
  const need = process.env.CPAAS_WEBHOOK_SECRET;
  if (!need) return true;
  try { return req.headers.get('x-webhook-secret') === need; } catch { return false; }
}
// 고객에게 화면 링크를 SMS로 발송
export async function sendSms(to, text) {
  if (PROVIDER === 'mock') {
    console.log(`[cpaas:mock] SMS → ${to}\n  ${text}`);
    return { ok: true, provider: 'mock', to, text };
  }
  const url = process.env.SMS_GATEWAY_URL;
  if (!url) return { ok: false, error: 'SMS_GATEWAY_URL 미설정' };
  try {
    const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', ...authHeader() }, body: JSON.stringify({ to, text }) });
    return { ok: r.ok, provider: PROVIDER, status: r.status };
  } catch (e) { return { ok: false, error: String(e?.message || e) }; }
}
// 고객 화면 액션(메뉴 선택·서류 신청·상담원 전환)을 콜봇/CTI로 되돌림
export async function notifyCallbot(payload) {
  const url = process.env.CALLBOT_CALLBACK_URL;
  if (!url) { console.log('[cpaas:mock] callback →', JSON.stringify(payload)); return { ok: true, provider: 'mock' }; }
  try {
    const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', ...authHeader() }, body: JSON.stringify(payload) });
    return { ok: r.ok, status: r.status };
  } catch (e) { return { ok: false, error: String(e?.message || e) }; }
}
