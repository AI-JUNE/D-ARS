// lib/monitorEvent.js — 오류 봉투를 **짓는** 순수 부분(마스킹 · 봉투 · 한 줄 포맷)
//
// 왜 떼어 냈나: 이 둘(`buildEvent`·`monitorLine`)을 쓰는 곳에 **브라우저에서 도는 오류
// 경계**가 있다 — `app/error.jsx`(운영 포털)와 `app/eum/error.jsx`(「이음 어르신 신청」).
// 그 두 화면은 원인 한 줄을 **콘솔에만** 적고 외부로 보내지 않는데, 두 함수가 `lib/monitor.js`
// 안에 있었기 때문에 그 모듈이 통째로 클라이언트 번들로 따라 들어갔다.
//
// 빌드 산출물로 확인한 사실(고치기 전):
//   `.next/static/chunks/app/eum/error-*.js` 안에 `captureError`·`isMonitorEnabled`·
//   스로틀 상태 Map·그리고 **수집기로 POST 하는 `deliver`(`fetch(dsn, …)`)** 와
//   `MONITOR_DSN` 조회가 모두 들어 있었다. 더구나 그 청크는 오류가 났을 때만 받는 것이 아니다 —
//   `/eum` HTML 의 head 가 `app/eum/error` 청크를 **미리 받는다**(어르신이 화면을 열 때마다다).
//
// 지금 새는 값은 없다 — 공개 접두어(`NEXT_PUBLIC_`)가 아닌 환경변수는 클라이언트 번들에
// 끼워 넣어지지 않으므로 `MONITOR_DSN` 은 브라우저에서 언제나 `undefined` 이고, 화면은 그 길을
// 부르지도 않는다. 그래서 이 분리는 **값을 막는 일이 아니라 경계를 지키는 일**이다. 그 경계는
// 이 저장소가 이미 두 번 그었다 —
//   · 9회차: 문구 표를 `lib/eumToken`(서명 비밀·HMAC)에서 떼어 `lib/eumMessage` 로.
//   · 26회차: 힌트 두 줄을 `lib/eumConsume`(프로세스 전역 Map·축출·헬스 판정)에서 같은 자리로.
// 두 번 모두 「당장 새는 것은 없지만 다음에 들어온다」가 떼어 낸 이유였다(그 파일에 공유 저장소
// 어댑터가 예약돼 있다). 그런데 `lib/monitor` 를 허용한 사유는 「화면이 전송 쪽을 **부르지**
// 않는다」였다 — **부르는가**를 본 것이고, 앞의 두 번이 본 것은 **실리는가**였다. 같은 전제에서
// 반대 결론을 낸 자리이고, 실제로 실려 있었다. 수집기 SDK 를 끼우는 일은 「남은 승인 사항」
// (MONITOR_DSN 주입 **[승인 필요]**)에 예약돼 있고, 그날 그 SDK 가 어르신 화면 번들을 따라
// 들어간다 — 26회차가 적어 둔 위험과 글자 그대로 같다.
//
// 이 파일이 지키는 선: **환경변수·네트워크·전역 상태를 한 줄도 두지 않는다.**
//   전송·스로틀·DSN 판정은 `lib/monitor.js` 에 남는다. 거기서 **다시 export 하지 않는다** —
//   import 경로가 둘이면 단일 출처가 다시 말뿐이 된다(`lib/eumMessage` 와 같은 계약).
//
// 개인정보: 메시지·컨텍스트는 봉투에 담기 전에 반드시 `scrubText` 로 마스킹한다.
//   전화번호·이메일·주민등록번호·카드번호·자격증명은 원문이 로그/외부로 나가지 않는다.
//   스택트레이스는 내부 경로가 드러나므로 **봉투에 담지 않는다**(콘솔에만 남는다).

// 심각도 어휘(자유 문자열 금지 — 필터·알림 라우팅 가능성 확보)
export const MONITOR_LEVELS = ['fatal', 'error', 'warn'];
const DEFAULT_LEVEL = 'error';

// 메시지 길이 상한(로그 폭주 방어)
const MAX_MSG = 300;

// ── PII·자격증명 마스킹(순수 함수) ────────────────────────────────
// 규칙 순서가 중요하다: 자릿수가 겹치는 패턴(주민번호 · 카드 · 전화)은 넓은 것부터 지운다.
const SCRUB_RULES = [
  // 자격증명: bearer 토큰 / key=... / token=... / password=... / secret=...
  [/\b(bearer)\s+[\w.\-~+/=]+/gi, '$1 [redacted]'],
  [/\b(api[_-]?key|token|secret|password|passwd|pwd)\s*[=:]\s*[^\s&,;"']+/gi, '$1=[redacted]'],
  // 주민등록번호(6-7)
  [/\b\d{6}[-\s]?[1-4]\d{6}\b/g, '[rrn]'],
  // 카드번호(4-4-4-4)
  [/\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g, '[card]'],
  // 이메일
  [/\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g, '[email]'],
  // 전화번호: 휴대폰(01x) · 유선(02/0xx) 모두
  [/\b0\d{1,2}[-\s]?\d{3,4}[-\s]?\d{4}\b/g, '[phone]'],
];

// 문자열에서 PII·자격증명을 마스킹하고 길이를 제한한다. 문자열이 아니면 ''.
export function scrubText(s, max = MAX_MSG) {
  if (typeof s !== 'string' || !s) return '';
  let out = s;
  for (const [re, to] of SCRUB_RULES) out = out.replace(re, to);
  return out.length > max ? out.slice(0, max) : out;
}

// 컨텍스트(평면 객체)를 마스킹한다. 키 8개 상한 · 원시값만(감사로그 sanitizeDetail 과 동일 보수 정책).
export function scrubContext(ctx) {
  if (!ctx || typeof ctx !== 'object' || Array.isArray(ctx)) return {};
  const out = {};
  let n = 0;
  for (const k of Object.keys(ctx)) {
    if (n >= 8) break;
    const v = ctx[k];
    if (v == null) continue;
    const t = typeof v;
    if (t === 'string') out[k] = scrubText(v, 120);
    else if (t === 'number' || t === 'boolean') out[k] = v;
    else continue;
    n++;
  }
  return out;
}

// Error(또는 임의 값)에서 전송 가능한 형태만 뽑는다. 스택은 제외한다(내부 경로 노출 방지).
export function errorShape(err) {
  if (err instanceof Error) {
    return { name: err.name || 'Error', message: scrubText(err.message) };
  }
  if (typeof err === 'string') return { name: 'Error', message: scrubText(err) };
  if (err && typeof err === 'object') {
    const name = typeof err.name === 'string' ? err.name : 'Error';
    const message = typeof err.message === 'string' ? err.message : '';
    return { name, message: scrubText(message) };
  }
  return { name: 'Error', message: '' };
}

// 레벨 정규화(화이트리스트 밖은 기본값으로).
export function normalizeLevel(level) {
  return MONITOR_LEVELS.includes(level) ? level : DEFAULT_LEVEL;
}

// 수집기로 보낼 이벤트(평면 객체). now 주입 가능 — 테스트 결정성.
//
// `env`·`commit` 을 **인자로 받는다**(환경을 여기서 읽지 않는다) — 환경변수를 읽는 자리는
// 서버 쪽 `captureError` 한 곳이고, 브라우저에서 도는 오류 경계는 그 둘을 넘기지 않는다.
export function buildEvent({
  err,
  level,
  source = 'server',
  requestId = null,
  env = 'unknown',
  commit = null,
  context,
  now = new Date(),
} = {}) {
  const e = errorShape(err);
  return {
    ts: now.toISOString(),
    level: normalizeLevel(level),
    source: typeof source === 'string' && source ? source.slice(0, 40) : 'server',
    name: e.name,
    message: e.message,
    requestId: typeof requestId === 'string' && requestId ? requestId.slice(0, 64) : null,
    env: typeof env === 'string' ? env : 'unknown',
    commit: typeof commit === 'string' && commit ? commit : null,
    context: scrubContext(context),
  };
}

// 콘솔 한 줄 포맷(수집기 파싱 가능한 JSON · 접두어 [MONITOR] 고정 — [AUDIT] 와 동일 관례).
export function monitorLine(event) {
  return '[MONITOR] ' + JSON.stringify(event);
}

// 익명 default export 금지(ESLint import/no-anonymous-default-export) — apiError.js 와 동일 관례.
const monitorEvent = {
  MONITOR_LEVELS, scrubText, scrubContext, errorShape, normalizeLevel, buildEvent, monitorLine,
};
export default monitorEvent;
