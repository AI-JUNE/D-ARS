// D-ARS 인증·RBAC 공통 (Edge 미들웨어 + Node 라우트 겸용 · Web Crypto만 사용)
// 안전장치: 기본은 '데모 통과' 모드. 운영자가 AUTH_ENFORCE=1 을 켜야 실제 접근 차단.
export const COOKIE = 'dars_session';
export const SESSION_HOURS = 8;
const SECRET = process.env.AUTH_SECRET || 'dars-demo-secret-v1';

// 역할 등급: viewer < operator < admin (고원 직원 사다리 — 누적 권한)
export const ROLES = ['viewer', 'operator', 'admin'];

// ── 파트너 역할(COMMERCIAL_READINESS "파트너 역할 권한") ──────────────
// `partner_admin` 은 사다리 **밖**의 역할이다: 열람 등급은 viewer 와 같지만 데이터 범위가
// "자기가 유치한 고객사"로 제한된다(partnerScopeOf). 운영 편집(operator↑)·관리(admin)는 영원히 불가.
// 활성화는 PARTNER_ROLE_ENABLE=1 — 기본 OFF. 꺼져 있으면 파트너 계정은 로그인도, 권한 판정 통과도 못 한다.
// 켜는 것은 사람의 승인 사항이다 [승인 필요].
export const PARTNER_ROLE = 'partner_admin';
export function isPartnerRoleEnabled() {
  return process.env.PARTNER_ROLE_ENABLE === '1';
}
// 파트너 식별자 형식(lib/partner.isValidId 와 동일 규칙 — Edge 번들을 가볍게 두려고 여기서 재선언).
const PARTNER_ID_RE = /^[A-Z0-9][A-Z0-9-]{2,31}$/;
export function isValidPartnerId(id) {
  return typeof id === 'string' && PARTNER_ID_RE.test(id);
}
// 역할의 등급 숫자. 모르는 역할·꺼진 파트너 역할은 -1(어느 최소 역할에도 못 미친다).
function rankOf(role) {
  if (role === PARTNER_ROLE) return isPartnerRoleEnabled() ? ROLES.indexOf('viewer') : -1;
  return ROLES.indexOf(role);
}
export function roleAtLeast(role, need) {
  return rankOf(role) >= ROLES.indexOf(need);
}
// 데이터 범위 판정 — 테넌트(고객사) 조회 경로에서 lib/partner.scopeOrganizations / scopeSql 에 그대로 넘긴다.
//   null   → 전체(고원 직원 viewer/operator/admin)
//   문자열 → 그 파트너에 귀속된 고객사만(partner_admin · 형식 유효한 partnerId)
//   ''     → 판정 불가(역할 미상 · 파트너 역할 OFF · partnerId 없음/형식 불량) — scopeOrganizations 는 빈 결과를 돌려준다.
// 판정 실패를 전체 공개로 넘기지 않는 것이 핵심이다.
export const PARTNER_SCOPE_NONE = '';
export function partnerScopeOf(user) {
  if (!user || typeof user !== 'object') return PARTNER_SCOPE_NONE;
  if (user.role === PARTNER_ROLE) {
    return isPartnerRoleEnabled() && isValidPartnerId(user.partnerId) ? user.partnerId : PARTNER_SCOPE_NONE;
  }
  return ROLES.includes(user.role) ? null : PARTNER_SCOPE_NONE;
}
// 경로별 최소 역할 (지정 없으면 viewer = 로그인만 되면 열람 가능)
const ROUTE_MIN = {
  '/admin': 'admin',      // 감사 로그 열람 등 관리 화면(P0-7)
  '/api/admin': 'admin',  // 관리 API(감사 열람) — 라우트 guardWrite 와 이중 게이트
  '/launcher': 'admin',
  '/ums': 'operator',
  '/scenarios': 'operator',
  '/docs': 'operator',
  '/templates': 'operator',
};
// 경로-최소역할 매핑의 **단일 출처**를 밖으로 내보낸다(복사본을 반환 — 호출측 변형이 원본을 못 건드린다).
// 운영 계정 발급 문서(docs/AUTH_ROLLOUT.md)의 표가 이 값과 어긋나면 테스트가 실패한다.
export function routeRoleMatrix() {
  return { ...ROUTE_MIN };
}
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
// 세션에 실을 공개 필드만 추린다(비밀번호 제외). partnerId 는 파트너 역할일 때만 싣는다.
function publicUser(u) {
  const out = { u: u.u, role: u.role, name: u.name };
  if (u.role === PARTNER_ROLE) out.partnerId = isValidPartnerId(u.partnerId) ? u.partnerId : null;
  return out;
}
export function findUser(username, password) {
  const u = users().find(x => x.u === username && x.p === password);
  if (!u) return null;
  // 파트너 계정은 스위치가 켜져 있고 partnerId 가 유효할 때만 로그인된다(범위 없는 파트너 세션을 만들지 않는다).
  if (u.role === PARTNER_ROLE && !(isPartnerRoleEnabled() && isValidPartnerId(u.partnerId))) return null;
  return publicUser(u);
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
  const out = { u: payload.u, role: payload.role, name: payload.name, exp: payload.exp };
  // partnerId 는 파트너 역할의 세션에만 존재한다(직원 세션에 섞여 들어와도 버린다).
  if (payload.role === PARTNER_ROLE) out.partnerId = isValidPartnerId(payload.partnerId) ? payload.partnerId : null;
  return out;
}

// ── 쓰기 API 인가 가드 (라우트 핸들러용) ──────────────
// Cookie 헤더에서 세션 토큰만 직접 파싱 (Edge/Node 겸용, next/headers 비의존).
export function parseCookie(header, name) {
  if (!header || typeof header !== 'string') return null;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    if (part.slice(0, i).trim() === name) {
      try { return decodeURIComponent(part.slice(i + 1).trim()); } catch { return part.slice(i + 1).trim(); }
    }
  }
  return null;
}

// ── 가드 감사(P0-7) — 동적 import(Edge 미들웨어 번들 불변) · 기록 실패 무해화(절대 throw 금지) ──
// 요청 경로만 추출(쿼리스트링은 버린다 — PII 유입 방어. lib/log.js 와 동일 규칙).
function pathOf(req) {
  try { return new URL(req.url).pathname; } catch { return ''; }
}

async function auditDenied(event, req, detail, user = null) {
  try {
    const { audit } = await import('./audit.js');
    const { clientIp } = await import('./rateLimit.js');
    await audit(event, { actor: user?.u, role: user?.role, ip: clientIp(req), detail: { ...detail, path: pathOf(req) } });
  } catch { /* 감사 실패가 본 요청을 실패시키면 안 된다 */ }
}

// 세션 쿠키에서 신원만 확인한다(차단 판단 없음 · 어떤 입력에도 throw 하지 않는다).
// 비강제 모드에서도 "누가 썼는지"를 남기기 위해 사용한다 — 반환값으로 접근을 막지 않는다.
async function identityOf(req) {
  try {
    const token = parseCookie(req?.headers?.get?.('cookie'), COOKIE);
    return token ? await verifyToken(token) : null;
  } catch { return null; }
}

// 가드를 통과한 접근을 기록한다(118회차 — 상용 요건 "관리 기능 접근 이력").
// 관리 API 는 ADMIN_ACCESS, 그 외 보호 API 는 WRITE_OK 로 분류(lib/audit.accessEventFor).
// detail.enforced 로 데모(비강제) 접근과 실인증 접근을 사후에 구분할 수 있게 남긴다.
// 실패는 전면 무해화 — 감사가 본 요청(쓰기)을 실패시키면 안 된다.
async function auditGranted(req, need, user = null) {
  try {
    const { audit, accessEventFor } = await import('./audit.js');
    const { clientIp } = await import('./rateLimit.js');
    const path = pathOf(req);
    let method = '';
    try { method = String(req?.method || ''); } catch { method = ''; }
    await audit(accessEventFor(path), {
      actor: user?.u,
      role: user?.role,
      ip: clientIp(req),
      detail: { path, method, need, enforced: isEnforced() },
    });
  } catch { /* 감사 실패가 본 요청을 실패시키면 안 된다 */ }
}

// 요청자의 **데이터 범위**(126회차 — 2계층 확장 여지). 테넌트 조회 라우트는 이 값을 그대로
// lib/tenantQuery.selectTenantRows 의 scope 로 넘긴다. 반환은 partnerScopeOf 와 같은 3값 규약:
//   null = 전체(고원 직원) · 파트너 id = 그 파트너 · '' = 빈 결과(판정 실패).
// 비강제(데모) 모드에서 신원이 없으면 **전체**다 — 그 모드는 인증 자체가 없어 범위 제한이
// 성립하지 않는다(라이브 무붕괴 계약 · guardWrite 가 통과시키는 것과 같은 이유). 반면 강제
// 모드에서 신원이 없으면 게이트 밖 호출이므로 빈 결과로 닫는다. 어떤 입력에도 throw 하지 않는다.
export async function viewerScope(req) {
  const user = await identityOf(req);
  if (user) return partnerScopeOf(user);
  return isEnforced() ? PARTNER_SCOPE_NONE : null;
}

// 쓰기 API 가드. 기본(비강제) 모드에서는 통과(null 반환)하여 라이브 데모 무붕괴.
// 운영자가 AUTH_ENFORCE=1 을 켰을 때만 실제 인증/역할 검사를 수행하고,
// 미인증 → 401, 역할 부족 → 403 Response 를 반환한다(호출측은 값이 있으면 즉시 return).
// 반환: 통과 시 null, 차단 시 Response.
// 감사: 거부는 WRITE_DENIED, 통과는 ADMIN_ACCESS/WRITE_OK 로 기록(마스킹·무해화 · 118회차).
export async function guardWrite(req, need = 'operator') {
  if (!isEnforced()) {
    // 데모/기본: 차단하지 않는다. 다만 접근 이력은 지금부터 남긴다(쿠키가 있으면 마스킹된 계정까지,
    // 없으면 익명 접근으로). 감사 기록은 통과 여부에 영향을 주지 않는다.
    await auditGranted(req, need, await identityOf(req));
    return null;
  }
  const user = await identityOf(req);
  if (!user) {
    await auditDenied('WRITE_DENIED', req, { reason: 'unauthorized', need });   // 감사(P0-7)
    return Response.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }
  if (!roleAtLeast(user.role, need)) {
    await auditDenied('WRITE_DENIED', req, { reason: 'forbidden', need }, user); // 감사(P0-7)
    return Response.json({ ok: false, error: 'forbidden' }, { status: 403 });
  }
  await auditGranted(req, need, user);                   // 감사(118회차): 통과한 접근도 남긴다
  return null;                                           // 통과
}

// 머신-투-머신 수집(ingest) 엔드포인트용 가드 (콜봇 이벤트 등, 쿠키 세션 없는 서버 호출).
// API 키(Authorization: Bearer <INGEST_KEY> 또는 x-ingest-key 헤더)를 우선 지원하고,
// 포털에서의 직접 호출을 위해 operator+ 세션 쿠키 폴백도 허용한다.
// 안전장치(라이브 무붕괴·하위호환): 비강제(AUTH_ENFORCE!=1)이거나 INGEST_KEY 미설정이면 통과(null).
// 강제 + INGEST_KEY 설정 시에만 실제 검사 → 유효 키/세션 없으면 401.
// 반환: 통과 시 null, 차단 시 Response(호출측은 값이 있으면 즉시 return).
export async function guardIngest(req, need = 'operator') {
  if (!isEnforced()) return null;                        // 데모/기본: 통과
  const key = process.env.INGEST_KEY;
  // 1) API 키 확인 (설정된 경우) — 상수시간 비교
  if (key) {
    let presented = null;
    try {
      const auth = req?.headers?.get?.('authorization') || '';
      const m = /^Bearer\s+(.+)$/i.exec(auth);
      presented = m ? m[1].trim() : (req?.headers?.get?.('x-ingest-key') || null);
    } catch { presented = null; }
    if (presented && timingSafeEqual(presented, key)) return null;   // 유효 키 → 통과
  }
  // 2) 세션 쿠키(operator+) 폴백 — 로그인한 운영자의 포털 직접 호출 지원
  let token = null;
  try { token = parseCookie(req?.headers?.get?.('cookie'), COOKIE); } catch { token = null; }
  const user = token ? await verifyToken(token) : null;
  if (user && roleAtLeast(user.role, need)) return null;             // 유효 세션 → 통과
  if (!key) return null;                                             // 키 미설정: 하위호환 통과
  await auditDenied('INGEST_DENIED', req, { reason: 'unauthorized', need });     // 감사(P0-7)
  return Response.json({ ok: false, error: 'unauthorized' }, { status: 401 });
}
