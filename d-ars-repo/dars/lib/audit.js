// D-ARS 접근/감사 로그 (P0-7) — 117회차
//
// 원칙 "build now, activate on approval":
//   - 기본(플래그 OFF): 구조화 콘솔 로그만 남긴다([AUDIT] JSON 한 줄 — Vercel 함수 로그로 수집).
//     계정·IP 는 **마스킹 후에만** 기록하므로 원문 PII 는 어디에도 저장되지 않는다.
//   - AUDIT_DB=1 + DATABASE_URL 설정 시에만 audit_events 테이블에 영속화한다. [승인 필요]
//     테이블 생성은 db/audit.sql 을 운영자가 수동 적용(스키마 변경 — 주간 컨펌 규칙).
//   - 기록 실패는 무해화: 감사 로그가 본 요청(로그인 등)을 실패시키면 안 된다 — 절대 throw 하지 않는다.
//
// 이벤트 어휘는 화이트리스트로 고정한다(자유 문자열 금지 — 조회·집계 가능성 확보, PMS 와 동일 계약).

export const AUDIT_EVENTS = [
  'AUTH_LOGIN',             // 로그인 성공
  'AUTH_LOGIN_FAIL',        // 자격증명 불일치
  'AUTH_LOGIN_RATELIMITED', // 브루트포스 완화 게이트 차단(429)
  'AUTH_LOGOUT',            // 로그아웃
  'WRITE_DENIED',           // 쓰기 API 가드 거부(401 미인증 / 403 역할 부족) — guardWrite
  'INGEST_DENIED',          // 수집(ingest) 가드 거부(401) — guardIngest
  'ADMIN_ACCESS',           // 관리 API(/api/admin/*) 접근 성공 — guardWrite 통과 시
  'WRITE_OK',               // 일반 쓰기/보호 API 접근 성공 — guardWrite 통과 시
];

// 접근 성공 이벤트 분류(순수 함수 · 118회차).
// 배경: 지금까지 감사는 '거부'와 인증 이벤트만 남겼다. 상용 요건인 "관리 기능 접근 이력"은
//   **성공한 접근**이 남아야 성립한다(누가·언제·어떤 관리 기능을 썼는가). 관리 API 는 별도
//   이벤트로 분리해 감사 화면에서 필터 한 번으로 관리 행위만 추려볼 수 있게 한다.
// 판정은 경로 접두어만 본다(쿼리스트링·호스트 무관 — 호출측이 pathname 만 넘긴다).
export function accessEventFor(pathname) {
  if (typeof pathname !== 'string' || !pathname) return 'WRITE_OK';
  const path = pathname.split('?')[0].split('#')[0];
  return /^\/api\/admin(\/|$)/.test(path) ? 'ADMIN_ACCESS' : 'WRITE_OK';
}

// ── 마스킹(순수 함수 — PII 는 마스킹 후에만 기록) ──────────────
function maskCore(s) {
  if (s.length <= 2) return s[0] + '*';
  return s[0] + '*'.repeat(Math.min(s.length - 2, 6)) + s[s.length - 1];
}

// 계정 식별자 마스킹: 'operator' → 'o******r', 'ab' → 'a*', 이메일은 로컬파트만 마스킹.
export function maskActor(u) {
  if (typeof u !== 'string' || !u) return '';
  const at = u.indexOf('@');
  if (at > 0) return maskCore(u.slice(0, at)) + '@' + u.slice(at + 1);
  return maskCore(u);
}

// IP 마스킹: IPv4 는 마지막 옥텟, IPv6 는 뒤 절반을 가린다. 형식을 모르면 통째로 'masked'.
export function maskIp(ip) {
  if (typeof ip !== 'string' || !ip) return '';
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.\d{1,3}$/.exec(ip);
  if (v4) return `${v4[1]}.${v4[2]}.${v4[3]}.x`;
  if (ip.includes(':')) {
    const parts = ip.split(':');
    const keep = Math.ceil(parts.length / 2);
    return parts.slice(0, keep).join(':') + '::x';
  }
  return 'masked';
}

// ── 엔트리 구성(순수 함수 — 단위 테스트 대상) ──────────────
// detail 은 얕은 평면 객체만 허용: 키 8개 상한 · 원시값만 · 문자열 200자 절단(로그 폭주·PII 유입 방어).
export function sanitizeDetail(detail) {
  if (!detail || typeof detail !== 'object' || Array.isArray(detail)) return {};
  const out = {};
  let n = 0;
  for (const k of Object.keys(detail)) {
    if (n >= 8) break;
    const v = detail[k];
    if (v == null) continue;
    const t = typeof v;
    if (t === 'string') out[k] = v.length > 200 ? v.slice(0, 200) : v;
    else if (t === 'number' || t === 'boolean') out[k] = v;
    else continue; // 중첩 객체·함수 등은 버린다(보수적)
    n++;
  }
  return out;
}

// 검증·마스킹된 감사 엔트리(평면 객체)를 만든다. 화이트리스트 밖 이벤트는 null(기록 거부).
export function buildAuditEntry({ event, actor, role, ip, detail } = {}) {
  if (!AUDIT_EVENTS.includes(event)) return null;
  return {
    ts: new Date().toISOString(),
    event,
    actor: maskActor(actor),
    role: typeof role === 'string' ? role : '',
    ip: maskIp(ip),
    detail: sanitizeDetail(detail),
  };
}

// 콘솔 한 줄 포맷(수집기 파싱 가능한 JSON · 접두어 [AUDIT] 고정).
export function auditLine(entry) {
  return '[AUDIT] ' + JSON.stringify(entry);
}

// ── 적재 관측(인스턴스 로컬 카운터) ──────────────
// 왜 필요한가: 적재 실패는 무해화 계약상 **조용히 삼켜진다**(감사 기록이 로그인 요청을 실패시키면
//   안 되므로 옳은 동작이다). 그런데 그 조용함 때문에 `db/audit.sql` 미적용 같은 사고가
//   "감사 0건"으로만 보인다 — 사고 조사 시점에야 비어 있는 것을 알게 된다.
//   그래서 시도/성공/실패를 세어 /api/health 와 점검 CLI 가 읽을 수 있게 한다.
// 한계(정직하게): 서버리스 인스턴스 로컬 메모리다. 인스턴스가 재활용되면 0으로 돌아가고,
//   인스턴스마다 값이 다르다. "최근 이 인스턴스에서 적재가 되고 있는가"의 신호이지 총계가 아니다.
const stats = { attempted: 0, persisted: 0, failed: 0, lastFailedAt: null };

// 관측값 복사본(외부에서 수정하지 못하게). 오류 메시지 원문은 담지 않는다(PII·내부정보 유출 방어).
export function auditStats() {
  return { ...stats };
}

// 테스트 전용 초기화(운영 코드에서 호출하지 않는다).
export function resetAuditStats() {
  stats.attempted = 0;
  stats.persisted = 0;
  stats.failed = 0;
  stats.lastFailedAt = null;
}

// 적재 실패를 에러 모니터로 한 번 올린다(무해화 — 실패해도 무시).
// 동적 import 로만 부른다: 정상 경로의 모듈 그래프를 바꾸지 않기 위해서다(엣지 번들 영향 회피).
async function escalate(e) {
  try {
    const { captureError } = await import('./monitor.js');
    // await 하지 않는다 — 모니터 지연이 본 요청을 늦추면 안 된다(captureError 는 reject 하지 않는다).
    captureError(e, { level: 'error', source: 'lib/audit', context: { stage: 'persist' } });
  } catch {}
}

// ── 기록(부수효과 — 무해화 계약: 어떤 입력에도 throw 하지 않는다) ──────────────
// 반환: 기록됨 true / 거부·실패 false (호출측은 반환값을 무시해도 된다).
export async function audit(event, { actor, role, ip, detail } = {}) {
  try {
    const entry = buildAuditEntry({ event, actor, role, ip, detail });
    if (!entry) return false;
    console.log(auditLine(entry));
    if (process.env.AUDIT_DB === '1') {           // [승인 필요] DB 영속화 게이트 — 기본 OFF
      stats.attempted += 1;
      const { hasDB, sql } = await import('./db.js');
      if (hasDB) {
        try {
          await sql`insert into audit_events (ts, event, actor, role, ip, detail)
                    values (${entry.ts}, ${entry.event}, ${entry.actor}, ${entry.role}, ${entry.ip}, ${JSON.stringify(entry.detail)}::jsonb)`;
          stats.persisted += 1;
        } catch (e) {
          // 여기서 삼키는 이유: 감사 적재 실패가 본 요청(로그인·쓰기)을 실패시키면 안 된다.
          // 대신 **세고, 올린다** — 조용히 사라지지 않게.
          stats.failed += 1;
          stats.lastFailedAt = entry.ts;
          try { console.error('audit persist fail:', e?.message); } catch {}
          escalate(e);
        }
      } else {
        // 스위치는 켰는데 DB 가 없다 = 영속화가 전혀 일어나지 않는 상태(auditReadiness 의 db-blind).
        stats.failed += 1;
        stats.lastFailedAt = entry.ts;
      }
    }
    return true;
  } catch (e) {
    try { console.error('audit fail:', e?.message); } catch {}
    return false;
  }
}
