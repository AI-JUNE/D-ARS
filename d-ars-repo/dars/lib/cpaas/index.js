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
// 아웃바운드 요청의 **시간 상한·재시도 정책**은 장애 폴백 계약이 든다 — 판정이 반드시
// 일어나려면 요청이 반드시 끝나야 하고, 그 전제를 지키는 값은 계약과 같은 자리에 있어야
// 한다(lib/ivrFallback 의 RELAY_TIMEOUT_MS 주석 참조).
import {
  RELAY_MAX_ATTEMPTS, RELAY_RETRY_BASE_MS, RELAY_TIMEOUT_MS,
} from '../ivrFallback.js';

export const PROVIDER = process.env.CPAAS_PROVIDER || 'mock';
const SECRET = process.env.CPAAS_SECRET || 'dev-cpaas-secret-change-me';
export const baseUrl = () => (process.env.PUBLIC_BASE_URL || 'https://d-ars.vercel.app').replace(/\/$/, '');
function authHeader() { const t = process.env.CPAAS_API_KEY; return t ? { authorization: `Bearer ${t}` } : {}; }

export function maskPhone(p) {
  const d = String(p || '').replace(/[^0-9]/g, '');
  return d.length >= 8 ? `${d.slice(0, 3)}-****-${d.slice(-4)}` : '010-****-0000';
}
// callId 기준 결정적 세션 ID → 콜봇 재시도 시 동일 세션(멱등성). callId 없으면 타임스탬프 폴백.
export function sessionIdFor(callId) {
  if (!callId) return 'VS-' + Date.now().toString().slice(-7);
  return 'VS-' + crypto.createHash('sha256').update(String(callId)).digest('hex').slice(0, 10);
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
// 인입 웹훅 공유시크릿 검증(설정된 경우에만). voice·events 양쪽에 적용(v1.1).
export function verifyWebhook(req) {
  const need = process.env.CPAAS_WEBHOOK_SECRET;
  if (!need) return true;
  try { return req.headers.get('x-webhook-secret') === need; } catch { return false; }
}
// ── 아웃바운드 결과는 **고정 어휘**만 들고 돌아온다 ────────────────────────
//
// 고친 결함: 이 두 함수의 실패 결과는 `error: String(e?.message || e)` — 즉 **오류 원문**을
// 들고 있었고, 그 객체가 콜봇 대면 응답에 **그대로** 실려 나갔다
// (`/api/cpaas/voice` 의 `sms`, `/api/visual/action` 의 `relayed`). 두 자리의 규칙은
// 이미 반대로 적혀 있었다 —
//   · `lib/ivrFallback` 머리 주석: "판정 결과에 PII·URL·오류 원문을 담지 않는다
//     (reason 은 고정 코드, message 는 고정 문구)".
//   · `/api/cpaas/voice` 의 예외 경로 주석: "오류 원문은 로그로만. 응답에는 고정 코드·문구만
//     (콜봇이 그대로 읽어도 안전)". **그 줄은 예외 경로에만 걸려 있었다**(503 쪽).
// 정상 경로의 봉투 **옆자리**가 그 둘을 함께 비껴갔다. 나가던 것은 이렇다 —
//   · `fetch` 실패 메시지에는 대상 주소가 붙는다(`request to https://… failed`·
//     `getaddrinfo ENOTFOUND sms.internal`). 즉 `SMS_GATEWAY_URL`·`CALLBOT_CALLBACK_URL`
//     이 응답으로 새어 나간다. 하필 `/api/visual/action` 을 받는 쪽은 **고객 브라우저**다.
//   · mock 프로바이더(라이브 기본값이다 — 위 PROVIDER)의 `sendSms` 는 `{ to, text }` 를
//     그대로 돌려줬다: `to` 는 **가리지 않은 발신번호**이고 `text` 에는 서명 링크가 들어 있다.
//     같은 라우트가 DB 에는 `maskPhone(from)` 을 넣으면서 응답에는 원문을 실었다.
// 왜 아무도 몰랐나: 그것을 지킨다는 테스트의 이름이 「판정 결과에 오류 원문·URL·전화번호가
// 실리지 않는다」인데, 실제로 대조한 것은 `fallbackEnvelope(...)` **한 필드**였다 —
// 응답은 그 봉투와 이 객체를 **나란히** 싣는다. 가드가 자기 이름보다 좁았던 또 한 자리다.
//
// 그래서 **반환 모양 자체를** 좁힌다(라우트에서 깎지 않는다 — 깎는 자리가 셋이면 한 곳을
// 빠뜨리는 날이 온다). 사유는 아래 고정 어휘뿐이고, 원문은 **서버 로그에만** 남는다.
// 판정이 보는 필드(`ok`·`skipped`·`failed`·`attempts`)는 한 자도 바뀌지 않는다.
export const CPAAS_FAIL_REASONS = Object.freeze({
  not_configured: '엔드포인트가 설정되지 않았다',
  timeout: '상한을 넘겨 우리가 끊었다',
  network: '연결 실패·중단',
  http: '2xx 가 아닌 응답',
});

// 상한이 걸린 단발 POST. **절대 throw 하지 않는다** — 모니터링·릴레이가 본 요청을
// 실패시키면 그것이 곧 장애 원인이 된다(lib/monitor 와 같은 계약).
// 상한이 필요한 이유는 lib/ivrFallback 의 RELAY_TIMEOUT_MS 주석에 적었다.
// `fetchImpl`·`timeoutMs`·`sleep` 를 주입받는 이유는 lib/fetchJson·lib/eumToken 과 같다 —
// 테스트가 실제 시계·실제 네트워크에 의존하지 않고 **멈추는 게이트웨이**를 재현할 수 있어야
// 한다(상한이 없던 자리가 바로 재현할 수단이 없던 자리다). 운영 호출부는 인자를 주지 않는다.
async function postJson(url, payload, label, { fetchImpl, timeoutMs = RELAY_TIMEOUT_MS } = {}) {
  if (!fetchImpl && typeof fetch !== 'function') return { ok: false, provider: PROVIDER, reason: 'network' };
  const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
  // 우리가 끊은 것인지(timeout) 바깥에서 끊긴 것인지(network) 나눠 말한다 —
  // 운영자가 다음에 볼 자리가 다르다(게이트웨이가 느린 것 ↔ 주소가 틀린 것).
  let timedOut = false;
  const timer = ctrl && timeoutMs > 0
    ? setTimeout(() => { timedOut = true; try { ctrl.abort(); } catch { /* noop */ } }, timeoutMs)
    : null;
  // 요청 모양은 **한 벌**이고, 주입된 구현도 같은 것을 받는다 — 상한(signal)이 주입 여부에
  // 따라 갈리면 테스트가 재현하는 것이 운영 경로가 아니게 된다.
  const init = {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...authHeader() },
    body: JSON.stringify(payload),
    signal: ctrl ? ctrl.signal : undefined,
  };
  try {
    const r = fetchImpl ? await fetchImpl(url, init) : await fetch(url, init);
    if (!r) return { ok: false, provider: PROVIDER, reason: 'network' };
    if (r.ok) return { ok: true, provider: PROVIDER, status: r.status };
    return { ok: false, provider: PROVIDER, status: r.status, reason: 'http' };
  } catch (e) {
    // 원문은 **여기까지만** 온다. 돌려주는 것은 위 고정 어휘뿐이다.
    console.error(`[cpaas] ${label} 실패:`, e?.message || e);
    return { ok: false, provider: PROVIDER, reason: timedOut ? 'timeout' : 'network' };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

// 고객에게 화면 링크를 SMS로 발송
export async function sendSms(to, text, opts = {}) {
  if (PROVIDER === 'mock') {
    console.log(`[cpaas:mock] SMS → ${to}\n  ${text}`);
    // 번호·문구를 **결과에 담지 않는다** — 이 객체는 인입 웹훅 응답에 그대로 실린다(위 주석).
    return { ok: true, provider: 'mock', mocked: true };
  }
  const url = process.env.SMS_GATEWAY_URL;
  if (!url) return { ok: false, provider: PROVIDER, reason: 'not_configured' };
  return postJson(url, { to, text }, 'SMS 발송', opts);
}
// 고객 화면 액션(메뉴 선택·서류 신청·상담원 전환)을 콜봇/CTI로 되돌림
// 실패 시 지수 백오프로 재시도(v1.1). 횟수·백오프·요청 상한은 lib/ivrFallback 단일 출처이고,
// **최악 소요(요청 시간 + 백오프)가 서버리스 예산 안에 든다**는 것은 `relayWorstCaseMs` 가
// 셈하고 테스트가 고정한다 — 예전에는 이 자리의 주석이 백오프만 세어 "10초 한도 내(0.2s,0.4s)"
// 라고 적었고, 요청 하나가 멈추면 그 셈이 통째로 거짓이 됐다.
export async function notifyCallbot(payload, opts = {}) {
  const url = process.env.CALLBOT_CALLBACK_URL;
  if (!url) { console.log('[cpaas:mock] callback →', JSON.stringify(payload)); return { ok: true, provider: 'mock', mocked: true }; }
  const sleep = typeof opts.sleep === 'function' ? opts.sleep : ((ms) => new Promise((res) => setTimeout(res, ms)));
  let last = { ok: false, provider: PROVIDER, reason: 'network' };
  for (let i = 0; i < RELAY_MAX_ATTEMPTS; i++) {
    const r = await postJson(url, payload, '콜봇 콜백', opts);
    if (r.ok) return { ...r, attempts: i + 1 };
    last = r;
    if (i < RELAY_MAX_ATTEMPTS - 1) await sleep(RELAY_RETRY_BASE_MS * (1 << i));
  }
  return { ...last, attempts: RELAY_MAX_ATTEMPTS, failed: true };
}
