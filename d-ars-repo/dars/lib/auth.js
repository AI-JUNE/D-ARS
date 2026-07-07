// D-ARS 인증·RBAC 공통 (Edge 미들웨어 + Node 라우트 겸용 · Web Crypto만 사용)
// 안전장치: 기본은 '데모 통과' 모드. 운영자가 AUTH_ENFORCE=1 을 켜야 실제 접근 차단.
export const COOKIE = 'dars_session';
export const SESSION_HOURS = 8;
const SECRET = process.env.AUTH_SECRET || 'dars-demo-secret-v1';

// 역할 등급: viewer < operator < admin
export const ROLES = ['viewer', 'operator', 'admin'];
export function roleAtLeast(role, need) {
  return ROLES.indexOf(role) >= ROLES.indexOf(need);
}
// 경로별 최소 역할 (지정 없으면 viewer = 로그인만 되면 열람 가능)
const ROUTE_MIN = {
  '/launcher': 'admin',
  '/ums': 'operator',
  '/scenarios': 'operator',
  '/docs': 'operator',
  '/templates': 'operator',
};
export function minRoleFor(pathname) {
  for (const p in ROUTE_MIN) if (pathname === p || pathname.startsWith(p + '/')) return ROUTE_MIN[p];
  return 'viewer';
}
export function isEnforced() {
  return process.env.AUTH_ENFORCE === '1';
}

// 사용자 목록: AUTH_USERS(JSON)가 있으면 사용, 없으면 데모 계정
const DEMO_USERS = [
  { u: 'admin', p: 'dars2026!', role: 'admin', name: '운영 관리자' },
  { u: 'operator', p: 'dars2026!', role: 'operator', name: '상담 운영자' },
  { u: 'viewer', p: 'dars2026!', role: 'viewer', name: '뷰어' },
];
export function users() {
  if (process.env.AUTH_USERS) {
    try { const a = JSON.parse(process.env.AUTH_USERS); if (Array.isArray(a) && a.length) return a; } catch {}
  }
  return DEMO_USERS;
}
export const usingDemoUsers = !process.env.AUTH_USERS;
export function findUser(username, password) {
  const u = users().find(x => x.u === username && x.p === password);
  return u ? { u: u.u, role: u.role, name: u.name } : null;
}

// ── base64url + HMAC-SHA256 (Web Crypto) ──────────────
function b64urlFromBytes(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlToBytes(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  const bin = atob(str);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
const enc = (s) => new TextEncoder().encode(s);
async function hmac(msg) {
  const key = await crypto.subtle.importKey('raw', enc(SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc(msg));
  return b64urlFromBytes(new Uint8Array(sig));
}
function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

export async function signToken(payload) {
  const body = { ...payload, exp: Date.now() + SESSION_HOURS * 3600 * 1000 };
  const b = b64urlFromBytes(enc(JSON.stringify(body)));
  const sig = await hmac(b);
  return b + '.' + sig;
}
export async function verifyToken(token) {
  if (!token || typeof token !== 'string' || token.indexOf('.') < 0) return null;
  const [b, sig] = token.split('.');
  const expect = await hmac(b);
  if (!timingSafeEqual(sig, expect)) return null;
  let payload;
  try { payload = JSON.parse(new TextDecoder().decode(b64urlToBytes(b))); } catch { return null; }
  if (!payload || !payload.exp || Date.now() > payload.exp) return null;
  return { u: payload.u, role: payload.role, name: payload.name, exp: payload.exp };
}
