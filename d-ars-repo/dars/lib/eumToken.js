// lib/eumToken.js — 「이음 어르신 신청」 1회용 링크 토큰 (발급·검증·5분 만료)
//
// 배경(이음 2R 연동 · EUM_INTEGRATION.md): 어르신은 **회원가입 없이** 담당자가 보내 준 링크
// 하나로 신청 화면에 들어온다. 즉 URL 자체가 유일한 인증 수단이므로 (1) 위조 불가(HMAC 서명),
// (2) 짧은 수명(5분), (3) **개인정보 무탑재**가 동시에 성립해야 한다.
//
// 설계
//   - 페이로드는 { sid, iat, exp } 뿐 — 이름·전화번호 등 PII 는 절대 담지 않는다(QUALITY_BAR §3).
//     sid 는 이음 측 어르신 식별자(불투명 문자열)로, 화면에도 표시하지 않는다.
//   - lib/auth.js 와 동일하게 **Web Crypto 만** 사용한다(Edge 미들웨어·Node 라우트·테스트 공통).
//   - 검증은 예외를 던지지 않고 항상 { ok, reason } 을 돌려준다 — 화면이 사유별 안내를
//     고르게(만료 vs 잘못된 링크) 하기 위해서다. 실패를 삼키고 빈 화면을 주지 않는다.
//   - 시각(now)을 주입받아 테스트가 시계에 의존하지 않는다.

export const EUM_TOKEN_TTL_MS = 5 * 60 * 1000; // 5분 — 가이드 §6-2 요건

// 서명 비밀: 전용 값이 있으면 그것, 없으면 앱 공통 비밀, 그것도 없으면 데모 기본값.
// (데모 기본값은 실운영 배포 전 반드시 EUM_TOKEN_SECRET 로 대체 — docs 에 [승인 필요] 로 남긴다.)
function secret() {
  return process.env.EUM_TOKEN_SECRET || process.env.AUTH_SECRET || 'dars-eum-demo-secret-v1';
}

const SID_RE = /^[A-Za-z0-9_-]{1,64}$/;

// sid 정규화 — 규격 밖이면 null(발급 거부). URL 세그먼트에 그대로 실리므로 문자 집합을 좁게 잡는다.
export function normalizeSid(sid) {
  const s = typeof sid === 'string' ? sid.trim() : '';
  return SID_RE.test(s) ? s : null;
}

const enc = (s) => new TextEncoder().encode(s);

function b64urlFromBytes(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlToString(str) {
  let s = String(str).replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(out);
}

async function hmac(msg) {
  const key = await crypto.subtle.importKey('raw', enc(secret()), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc(msg));
  return b64urlFromBytes(new Uint8Array(sig));
}

// 길이가 달라도 즉시 반환하지 않도록 하는 상수시간 비교(lib/auth.js 와 동일 계약).
function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

// 1회용 링크 토큰 발급. sid 가 규격 밖이거나 ttl 이 이상하면 null(호출측이 링크를 만들지 않는다).
export async function issueEumToken(sid, { ttlMs = EUM_TOKEN_TTL_MS, now = Date.now() } = {}) {
  const s = normalizeSid(sid);
  if (!s) return null;
  const ttl = Number(ttlMs);
  const t = Number(now);
  if (!Number.isFinite(ttl) || ttl <= 0 || !Number.isFinite(t)) return null;
  const body = { sid: s, iat: Math.floor(t), exp: Math.floor(t + ttl) };
  const b = b64urlFromBytes(enc(JSON.stringify(body)));
  return `${b}.${await hmac(b)}`;
}

// 남은 유효 시간(ms · 음수 없음). 페이로드가 이상하면 0.
export function remainingMs(payload, now = Date.now()) {
  const exp = Number(payload?.exp);
  const t = Number(now);
  if (!Number.isFinite(exp) || !Number.isFinite(t)) return 0;
  return Math.max(0, exp - t);
}

// 토큰 검증. 항상 { ok, reason?, payload?, remainingMs? } 를 돌려준다(throw 없음).
// reason: 'missing'(빈 값) · 'malformed'(형식/본문 파손) · 'signature'(위조) · 'expired'(만료)
export async function verifyEumToken(token, now = Date.now()) {
  if (typeof token !== 'string' || !token.trim()) return { ok: false, reason: 'missing' };
  const parts = token.trim().split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return { ok: false, reason: 'malformed' };
  const [b, sig] = parts;

  let expect;
  try {
    expect = await hmac(b);
  } catch {
    return { ok: false, reason: 'malformed' };
  }
  if (!timingSafeEqual(sig, expect)) return { ok: false, reason: 'signature' };

  let payload;
  try {
    payload = JSON.parse(b64urlToString(b));
  } catch {
    return { ok: false, reason: 'malformed' };
  }
  const sid = normalizeSid(payload?.sid);
  const exp = Number(payload?.exp);
  if (!sid || !Number.isFinite(exp)) return { ok: false, reason: 'malformed' };

  const left = remainingMs({ exp }, now);
  if (left <= 0) return { ok: false, reason: 'expired' };
  return { ok: true, payload: { sid, iat: Number(payload?.iat) || 0, exp }, remainingMs: left };
}

// 화면이 쓰는 사유별 안내문(단일 출처 — 페이지와 테스트가 같은 문장을 참조한다).
export const EUM_TOKEN_MESSAGE = {
  expired: '링크가 만료되었습니다. 담당자에게 다시 요청해 주세요',
  signature: '링크가 올바르지 않습니다. 담당자에게 다시 요청해 주세요',
  malformed: '링크가 올바르지 않습니다. 담당자에게 다시 요청해 주세요',
  missing: '링크가 올바르지 않습니다. 담당자에게 다시 요청해 주세요',
};

export function tokenMessage(reason) {
  return EUM_TOKEN_MESSAGE[reason] || EUM_TOKEN_MESSAGE.malformed;
}
