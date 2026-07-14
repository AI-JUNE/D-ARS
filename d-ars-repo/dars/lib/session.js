// lib/session.js — 경량 서명 세션 쿠키 (로그인·RBAC 제안 · 사람 승인 전 비활성)
//
// 설계 원칙: "하위호환 · 무중단 · 무DB"
//   - process.env.RBAC_SESSION_SECRET 미설정 시 rbacEnabled=false → 미들웨어가 완전 무동작(기존과 동일).
//   - DB/스키마 변경 없음. HMAC-SHA256 서명 토큰을 httpOnly 쿠키에 저장(무상태).
//   - Web Crypto(subtle)만 사용 → Edge 런타임(미들웨어)과 Node 런타임(라우트) 모두 호환.
//
// 토큰 형식: base64url(JSON payload) + "." + base64url(HMAC)
// payload: { sub, role, iat, exp }

export const RBAC_SECRET = process.env.RBAC_SESSION_SECRET || '';
export const rbacEnabled = !!RBAC_SECRET;
export const SESSION_COOKIE = 'dars_session';
export const DEFAULT_TTL_SEC = 60 * 60 * 8; // 8시간

const _enc = new TextEncoder();
const _dec = new TextDecoder();

function bytesToB64url(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlToBytes(s) {
  s = String(s).replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
const strToB64url = (str) => bytesToB64url(_enc.encode(str));
const b64urlToStr = (s) => _dec.decode(b64urlToBytes(s));

async function hmacKey(secret) {
  return globalThis.crypto.subtle.importKey(
    'raw', _enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']
  );
}

// 페이로드를 서명해 토큰 문자열 반환
export async function signSession(payload, secret = RBAC_SECRET, ttlSec = DEFAULT_TTL_SEC) {
  if (!secret) throw new Error('RBAC_SESSION_SECRET not set');
  const now = Math.floor(Date.now() / 1000);
  const body = { ...payload, iat: now, exp: now + ttlSec };
  const data = strToB64url(JSON.stringify(body));
  const key = await hmacKey(secret);
  const sig = await globalThis.crypto.subtle.sign('HMAC', key, _enc.encode(data));
  return `${data}.${bytesToB64url(new Uint8Array(sig))}`;
}

// 토큰 검증. 성공 시 payload, 실패/만료/변조 시 null
export async function verifySession(token, secret = RBAC_SECRET) {
  if (!token || !secret) return null;
  const parts = String(token).split('.');
  if (parts.length !== 2) return null;
  const [data, sig] = parts;
  if (!data || !sig) return null;
  let ok = false;
  try {
    const key = await hmacKey(secret);
    ok = await globalThis.crypto.subtle.verify('HMAC', key, b64urlToBytes(sig), _enc.encode(data));
  } catch {
    return null;
  }
  if (!ok) return null;
  let body;
  try {
    body = JSON.parse(b64urlToStr(data));
  } catch {
    return null;
  }
  if (!body || typeof body !== 'object') return null;
  if (typeof body.exp !== 'number' || body.exp < Math.floor(Date.now() / 1000)) return null;
  return body;
}
