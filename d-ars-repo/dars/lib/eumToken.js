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

import { TOKEN_SPECS } from './tokenAudit.js';

export const EUM_TOKEN_TTL_MS = 5 * 60 * 1000; // 5분 — 가이드 §6-2 요건

// ── 「5분」을 **검증도** 확인한다 ────────────────────────────────────────────
//
// 고친 결함: 이 토큰의 수명 상한을 지키는 코드가 **발급 쪽 한 곳**뿐이었다
// (`lib/eumLink.resolveTtlMs` — CLI 가 부른다). `issueEumToken` 은 양수 ttl 이면 무엇이든
// 받았고, `verifyEumToken` 은 토큰이 적어 온 수명을 **한 번도 보지 않았다** — `exp` 가
// 지금보다 뒤이기만 하면 통과했다. 즉 `{ iat, exp: iat + 1년 }` 로 서명된 토큰은 1년 동안
// 유효한 「1회용 5분 링크」였다.
//
// 왜 사소하지 않은가: 이 기능의 위험 완화는 **거의 전부 「수명 5분」에 걸려 있다.**
// EUM_INTEGRATION.md 의 「알려진 한계」가 그 문장을 세 번 인용한다 —
//   · 서버 재시작·재배포로 소진 기록이 비워진다 → "5분 만료가 피해 범위를 그만큼으로 한정한다"
//   · 토큰이 든 주소가 **접근로그**에 남는다 → "완화 수단은 짧은 수명(5분)과 1회용"
//   · 문자·메신저의 **미리보기 요청**이 곧 토큰 사용이다 → 같은 문장
// 그런데 그 수명을 지키는 쪽은 발급자이고, **발급자는 위협 모델 안에 없다**. 지키는 쪽과
// 깨뜨리는 쪽이 다른 사람인 불변식을 발급 시점에만 확인하고 있었던 셈이다(「서술이 코드보다
// 앞서 있다」의 또 한 자리 — 이번에는 「알려진 한계」가 완화 수단으로 적은 숫자였다).
// 지금 당장 그런 토큰을 만드는 코드는 **없다**(잠복이다). 위험한 쪽은 둘이다 —
//   ① 서명 비밀이 미설정이면 **저장소에 공개된 데모 기본값**으로 서명한다(아래 secret() ·
//      `npm run token:check` 의 TOKEN_SECRET_DEMO 경고 · 라이브가 그 상태다). 그 값을 아는
//      사람은 수명을 자기가 정해 토큰을 찍을 수 있고, 검증이 수명을 보지 않으면 그 링크는
//      1회용 소진 전까지 **영구 유효**다.
//   ② 「남은 승인 사항」에 **발급 화면·API** 가 예약돼 있다. 발급 경로가 둘이 되는 날,
//      상한을 기억하는 책임이 또 한 곳으로 늘어난다.
//
// 상한의 단일 출처는 토큰 명세(lib/tokenAudit)다 — `lib/eumLink` 도 같은 값을 쓰며, 그쪽은
// 이제 여기서 가져간다(같은 명세를 두 곳에서 각자 풀면 한쪽만 늘어나는 날이 온다).
// 명세를 못 찾으면 요건값(5분)으로 **좁히는 쪽**으로 물러선다.
const EUM_SPEC = TOKEN_SPECS.find((s) => s.name === 'eum-link') || null;
export const EUM_TOKEN_MAX_TTL_MS = EUM_SPEC && Number.isFinite(EUM_SPEC.maxTtlMs)
  ? EUM_SPEC.maxTtlMs
  : EUM_TOKEN_TTL_MS;

// 이 토큰이 **우리가 발급할 수 있는 수명**인가. 두 가지를 본다.
//   · 적어 온 수명(`exp - iat`)이 상한 이내인가. `iat` 가 없거나 이상하면 **판정할 수 없으므로
//     거부한다** — 여기서 모르는 것을 통과시키면 `iat` 를 빼기만 해도 이 검사가 사라진다
//     (tapSettled 가 「모를 때는 통과」인 것과 방향이 반대인 이유: 거기서 닫는 것은 어르신의
//      누름이고, 여기서 닫는 것은 우리가 발급하지 않은 모양의 링크다).
//   · 남은 시간도 상한 이내인가. `iat` 를 **미래로** 적으면 수명은 5분인데 남은 시간이
//     그보다 길어질 수 있고, 화면의 눈금은 그 값을 그대로 받는다(page.jsx → remainingMs).
// 만료된 토큰은 남은 시간이 음수라 이 판정을 통과한다 — 만료는 만료로 말해야 하기 때문이다
// (그 화면만 「담당자에게 다시 요청하면 되는 상태」라고 말하고 보조 사본까지 보여 준다).
// (`Number(Symbol)` 은 **throw 한다** — 검증이 던지면 신청 화면이 통째로 빈 화면이 되고,
//  이 모듈의 계약은 "실패는 예외가 아니라 { ok:false, reason }" 이다. 그래서 수로 바꿀 수
//  있는 종류에만 변환을 건다 · lib/eumCountdown 의 num·lib/eumSenior 의 parseStep 과 같은 이유.)
function num(v) {
  const k = typeof v;
  if (k === 'number') return Number.isFinite(v) ? v : NaN;
  if (k === 'string' || k === 'boolean') {
    const n = Number(v);
    return Number.isFinite(n) ? n : NaN;
  }
  if (v === null) return 0; // Number(null) === 0 — 종전 거동을 그대로 둔다(상한 판정이 막는다)
  return NaN;
}

export function withinTokenLifetime(payload, now, maxTtlMs = EUM_TOKEN_MAX_TTL_MS) {
  const p = payload && (typeof payload === 'object' || typeof payload === 'function') ? payload : {};
  const iat = num(p.iat);
  const exp = num(p.exp);
  const t = num(now);
  const cap = num(maxTtlMs);
  if (!Number.isFinite(iat) || !Number.isFinite(exp) || !Number.isFinite(t)) return false;
  if (!Number.isFinite(cap) || cap <= 0) return false;
  const declared = exp - iat;
  if (!(declared > 0) || declared > cap) return false;
  return exp - t <= cap;
}

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
// 상한을 넘는 수명도 **거부**한다 — 조용히 깎으면 부른 쪽은 자기가 적은 수명이 통한 줄로
// 믿는다(`lib/eumLink.resolveTtlMs` 가 사람이 읽는 사유까지 붙여 먼저 막지만, 상한을 아는
// 자리가 호출측뿐이면 발급 경로가 늘어나는 날 또 빠진다 — 위 EUM_TOKEN_MAX_TTL_MS 주석).
export async function issueEumToken(sid, { ttlMs = EUM_TOKEN_TTL_MS, now = Date.now() } = {}) {
  const s = normalizeSid(sid);
  if (!s) return null;
  const ttl = Number(ttlMs);
  const t = Number(now);
  if (!Number.isFinite(ttl) || ttl <= 0 || !Number.isFinite(t)) return null;
  if (ttl > EUM_TOKEN_MAX_TTL_MS) return null;
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
// reason: 'missing'(빈 값) · 'malformed'(형식/본문 파손) · 'signature'(위조) ·
//         'lifetime'(수명이 상한 밖 — 우리가 발급할 수 있는 모양이 아니다) · 'expired'(만료)
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

  // 수명 판정은 **만료 판정보다 먼저** 한다. 상한 밖의 수명은 우리가 발급할 수 있는 모양이
  // 아니므로 「만료」로 말해서는 안 된다 — 그 화면만 「담당자가 새 링크를 보내면 해결되는
  // 상태」라고 안내하고, 그 기기의 보조 사본을 찾으라고 sid 까지 돌려준다. 수명이 규격 밖인
  // 토큰에는 둘 다 주지 않는다(잘못된 링크와 같은 쪽으로 떨어뜨린다 · 위 withinTokenLifetime).
  if (!withinTokenLifetime({ iat: payload?.iat, exp }, now)) {
    return { ok: false, reason: 'lifetime' };
  }

  const left = remainingMs({ exp }, now);
  // 만료에는 **sid 를 함께 돌려준다.** 여기까지 왔다는 것은 서명이 이미 검증됐고 sid 도 규격
  // 안이라는 뜻이다(위 두 단계) — 즉 이 sid 는 우리가 발급한 값이지 호출자가 적어 넣은 값이
  // 아니다. 쓰이는 곳은 하나다: 만료 화면이 **그 기기에 남은 보조 사본**을 찾는 데 쓴다
  // (이미 신청을 마친 사람이 만료 링크를 다시 열었을 때, 서버는 모르지만 그 기기는 안다).
  // `ok:false` 이므로 payload 는 주지 않는다 — 검증 통과와 혼동되지 않게 자리를 따로 둔다.
  if (left <= 0) return { ok: false, reason: 'expired', sid };
  return { ok: true, payload: { sid, iat: Number(payload?.iat) || 0, exp }, remainingMs: left };
}

// 사유별 안내문은 **이 파일에 두지 않는다** → lib/eumMessage.js.
//
// 왜 옮겼나: 이 파일은 서명 비밀을 읽고 HMAC 을 계산하므로 클라이언트 번들에 들어갈 수 없다.
// 그래서 브라우저에서 도는 화면(SeniorFlow)은 같은 문장을 **손으로 적어** 쓰고 있었고,
// 401 안내는 마침표가 하나 더 붙은 두 번째 판본이 돌아다녔다. 문구는 비밀을 모르는 자리에
// 있어야 양쪽이 같은 문장을 가리킬 수 있다. 여기서 다시 export 하지도 않는다 —
// import 경로가 둘이면 "단일 출처" 가 다시 말뿐이 된다.
