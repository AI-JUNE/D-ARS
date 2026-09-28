// lib/eumLink.js — 「이음 어르신 신청」 1회용 링크 **발급**(담당자 쪽)
//
// 왜 이 파일이 생겼나: `issueEumToken` 을 **부르는 코드가 한 줄도 없었다**. 테스트만 불렀다.
// 그동안 EUM_INTEGRATION.md·화면 주석·안내 문구는 모두 "담당자가 보낸 1회용 링크", "담당자에게
// 다시 요청해 주세요", "재발급을 받아도" 라고 적어 왔지만, 그 링크를 **만들 수단이 제품 안에
// 없었다**. 여기서도 서술이 코드보다 앞서 있었던 것이고, 그 대가는 검증 메모에 세 번 연속으로
// 남아 있다 — "실기기 확인은 **유효 토큰 링크가 없어** 대신하지 못했다". 375px 실렌더도,
// 시계가 틀린 단말도, 스크린리더도, 링크 한 줄이 없어서 확인하지 못한 것이다.
//
// 그래서 발급을 **순수 로직(이 파일) + 사람이 직접 돌리는 CLI(scripts/eum-link.mjs)** 로 나눴다.
//
// 왜 관리 API 라우트가 아닌가: 이 링크는 그 자체가 인증 수단이다. 라이브는 `AUTH_ENFORCE` 가
// 꺼져 있어(docs/AUTH_ROLLOUT.md) 지금 발급 라우트를 열면 **누구나 임의 sid 로 링크를 찍어**
// 담당자 명단에 신청을 밀어 넣을 수 있다. 판정을 켤 수 없는 상태에서 문을 먼저 내는 것은
// 순서가 뒤바뀐 일이라, 발급 라우트는 실인증 전환과 함께 **[승인 필요]** 로 남긴다.
//
// 설계
//   - 환경변수를 읽지 않는다(값도, 이름도). 서명 비밀은 lib/eumToken 이 고르고, 어느 출처가
//     쓰였는지(secretSource)만 호출측이 알려 준다 — 판정에 값이 필요하지 않다.
//   - throw 하지 않는다. 거부는 예외가 아니라 `{ ok:false, reason }` 이다(저장소 공통 계약).
//   - 결과에 **토큰을 따로 담지 않는다**. 인증 수단의 사본을 두 개 돌릴 이유가 없다.

import { EUM_TOKEN_TTL_MS, issueEumToken, normalizeSid } from './eumToken.js';
import { TOKEN_SPECS } from './tokenAudit.js';

// 어르신 화면 경로. 라우트(app/eum/senior/[token])와 어긋나면 링크가 404 가 되므로
// 테스트가 실제 디렉터리와 대조한다.
export const EUM_LINK_PATH = '/eum/senior';

// 기본 주소 — 라이브 배포처(EUM_INTEGRATION.md). 로컬 시험은 --base 로 바꾼다.
export const EUM_LINK_DEFAULT_BASE = 'https://d-ars.vercel.app';

// 수명 상한은 토큰 명세(lib/tokenAudit)의 maxTtlMs 를 그대로 쓴다 — 같은 숫자를 두 곳에 적으면
// 한쪽만 늘어나는 날이 온다. 명세를 못 찾으면 기본 수명으로 **좁히는 쪽**으로 물러선다.
const EUM_SPEC = TOKEN_SPECS.find((s) => s.name === 'eum-link') || null;
export const EUM_LINK_MAX_TTL_MS = EUM_SPEC && Number.isFinite(EUM_SPEC.maxTtlMs)
  ? EUM_SPEC.maxTtlMs
  : EUM_TOKEN_TTL_MS;

// http 를 허용하는 곳은 개발용 로컬 주소뿐이다. 이 링크는 토큰을 URL 에 실어 보내므로
// 평문 http 로 나가면 경로 중간에서 그대로 읽힌다(= 남이 대신 신청할 수 있다).
function isLocalHostname(h) {
  const s = String(h || '').toLowerCase();
  return s === 'localhost' || s === '127.0.0.1' || s === '::1' || s === '[::1]' || s.endsWith('.localhost');
}

// 주소 정규화. 규격 밖이면 null(링크를 만들지 않는다).
//  - 쿼리·해시는 버린다(링크 뒤에 붙은 흔적이 토큰 옆에 따라다니지 않게).
//  - 자격정보가 박힌 주소(user:pass@)는 받지 않는다.
//  - 뒤 슬래시는 떼어 경로가 이중 슬래시로 붙지 않게 한다.
export function normalizeBase(value) {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw) return null;
  let u;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  if (u.username || u.password) return null;
  if (u.protocol === 'http:' && !isLocalHostname(u.hostname)) return null;
  const prefix = u.pathname.replace(/\/+$/, '');
  return `${u.protocol}//${u.host}${prefix}`;
}

// 수명(분) 입력 → ms. 값이 없으면 요건값(5분). 상한을 넘으면 거부한다 —
// 조용히 깎으면 담당자는 자기가 적은 수명이 통했다고 믿는다.
export function resolveTtlMs(minutes) {
  if (minutes === undefined || minutes === null || minutes === '') {
    return { ok: true, ttlMs: EUM_TOKEN_TTL_MS, defaulted: true };
  }
  const n = Number(minutes);
  if (!Number.isFinite(n) || Math.floor(n) !== n || n <= 0) return { ok: false, reason: 'ttl_invalid' };
  const ms = n * 60000;
  if (ms > EUM_LINK_MAX_TTL_MS) return { ok: false, reason: 'ttl_too_long' };
  return { ok: true, ttlMs: ms, defaulted: false };
}

// 최종 링크. 주소나 토큰이 규격 밖이면 ''(빈 문자열 — 호출측이 출력하지 않는다).
export function buildLink(base, token) {
  const b = normalizeBase(base);
  const t = typeof token === 'string' ? token.trim() : '';
  if (!b || !t) return '';
  return `${b}${EUM_LINK_PATH}/${encodeURIComponent(t)}`;
}

// 링크에서 **토큰을 가린** 형태. 링크 한 줄이 곧 인증 수단이라, 의도한 출력 한 곳 말고는
// (오류 메시지·로그·재확인 문구) 언제나 이쪽을 쓴다. 토큰 앞부분 몇 자를 남기는 것도 하지
// 않는다 — 부분 노출이 안전하다는 근거가 없고, 담당자에게 유용하지도 않다.
export const EUM_LINK_MASK = '…(토큰 숨김)';
export function maskLink(link) {
  const s = typeof link === 'string' ? link : '';
  const at = s.indexOf(`${EUM_LINK_PATH}/`);
  if (at < 0) return '';
  return `${s.slice(0, at)}${EUM_LINK_PATH}/${EUM_LINK_MASK}`;
}

// 거부 사유 → 사람이 읽는 문장(CLI 단일 출처).
export const EUM_LINK_REASON = {
  sid_invalid: 'sid 가 규격 밖입니다 — 영문·숫자·_·- 만, 1~64자(이음 측 식별자를 그대로 씁니다).',
  base_invalid: '주소를 쓸 수 없습니다 — https 주소여야 하고(로컬 시험만 http), 자격정보를 담을 수 없습니다.',
  ttl_invalid: '수명(분)이 잘못됐습니다 — 1 이상의 정수로 적어 주세요.',
  ttl_too_long: `수명이 상한을 넘습니다 — 최대 ${Math.round(EUM_LINK_MAX_TTL_MS / 60000)}분(lib/tokenAudit 명세).`,
  now_invalid: '발급 시각이 잘못됐습니다.',
  issue_failed: '토큰을 발급하지 못했습니다.',
};

export function linkReason(reason) {
  return EUM_LINK_REASON[reason] || EUM_LINK_REASON.issue_failed;
}

// 발급과 **함께 반드시 말해야 하는 것**. 링크만 찍어 주고 마는 도구는 담당자에게
// "이게 시험용인지 실물인지" 를 감추게 된다.
export function linkAdvisories(input) {
  // `null` 은 기본 인자가 막아 주지 않는다 — 구조분해가 그 자리에서 던진다. 이 모듈의 계약은
  // "거부는 예외가 아니다" 이므로 이상 입력도 빈 목록이 아니라 **말할 수 있는 만큼** 돌려준다.
  const o = input && typeof input === 'object' ? input : {};
  const base = typeof o.base === 'string' ? o.base : '';
  const ttlMs = o.ttlMs;
  const secretSource = typeof o.secretSource === 'string' ? o.secretSource : '';
  const out = [];
  const minutes = Number.isFinite(Number(ttlMs)) ? Math.round(Number(ttlMs) / 60000) : 0;

  // 항상 — 이 한 줄이 인증 수단이다.
  out.push({
    code: 'LINK_IS_CREDENTIAL',
    msg: '이 링크 한 줄이 곧 인증 수단입니다. 단체 대화방·게시판·티켓에 올리지 말고 당사자에게만 보내 주세요.',
  });

  // 수명의 시작점을 분명히 한다 — 발급부터 센다. 문자 전달과 어르신이 화면을 여는 시간까지
  // 이 안에 들어간다. 통화 중에 보내는 것을 전제한 값이지, 미리 만들어 두는 용도가 아니다.
  out.push({
    code: 'SHORT_LIFE',
    msg: `수명은 **발급 시각부터** ${minutes}분입니다. 문자 전달·어르신이 화면을 여는 시간이 모두 이 안에 들어갑니다 — 통화 중에 보내 주세요.`,
  });

  if (secretSource === 'demo-default') {
    out.push({
      code: 'DEMO_SECRET',
      msg: '저장소에 공개된 **데모 기본값**으로 서명했습니다 — 같은 링크를 누구나 위조할 수 있습니다. 시험용으로만 쓰고 실제 어르신에게 보내지 마세요. EUM_TOKEN_SECRET 주입은 [승인 필요].',
    });
  } else if (secretSource === 'AUTH_SECRET') {
    out.push({
      code: 'DERIVED_SECRET',
      msg: '전용 비밀값(EUM_TOKEN_SECRET)이 없어 앱 공통 비밀로 서명했습니다 — 한쪽을 교체하면 이미 보낸 링크도 함께 무효가 됩니다.',
    });
  }

  if (normalizeBase(base) && String(base).trim().toLowerCase().startsWith('http:')) {
    out.push({
      code: 'PLAINTEXT_BASE',
      msg: '평문 http 주소입니다 — 로컬 시험에서만 쓰세요.',
    });
  }

  // 1회용 판정의 실제 강도를 숨기지 않는다(EUM_INTEGRATION.md 「알려진 한계」와 같은 사실).
  if (EUM_SPEC && EUM_SPEC.oneTime !== 'durable') {
    out.push({
      code: 'ONE_TIME_LOCAL',
      msg: '1회용 판정 기록은 인스턴스 로컬 메모리입니다 — 재제출이 다른 인스턴스로 가면 걸러지지 않습니다(실질적 보장이지 절대 보장이 아닙니다).',
    });
  }

  return out;
}

// 링크 발급. 성공하면 { ok:true, link, sid, ttlMs, issuedAt, expiresAt, advisories }.
// 실패는 { ok:false, reason } — 어느 단계에서 막혔는지 그대로 말한다.
export async function issueEumLink({
  sid,
  base = EUM_LINK_DEFAULT_BASE,
  minutes,
  secretSource = '',
  now = Date.now(),
} = {}) {
  const s = normalizeSid(sid);
  if (!s) return { ok: false, reason: 'sid_invalid' };
  const b = normalizeBase(base);
  if (!b) return { ok: false, reason: 'base_invalid' };
  const ttl = resolveTtlMs(minutes);
  if (!ttl.ok) return { ok: false, reason: ttl.reason };
  const t = Number(now);
  if (!Number.isFinite(t)) return { ok: false, reason: 'now_invalid' };

  let token = null;
  try {
    token = await issueEumToken(s, { ttlMs: ttl.ttlMs, now: t });
  } catch {
    return { ok: false, reason: 'issue_failed' };
  }
  const link = buildLink(b, token);
  if (!link) return { ok: false, reason: 'issue_failed' };

  return {
    ok: true,
    link,
    sid: s,
    base: b,
    ttlMs: ttl.ttlMs,
    ttlDefaulted: ttl.defaulted,
    issuedAt: Math.floor(t),
    expiresAt: Math.floor(t + ttl.ttlMs),
    advisories: linkAdvisories({ base: b, ttlMs: ttl.ttlMs, secretSource }),
  };
}
