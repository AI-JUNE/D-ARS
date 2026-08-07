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
];

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

// ── 기록(부수효과 — 무해화 계약: 어떤 입력에도 throw 하지 않는다) ──────────────
// 반환: 기록됨 true / 거부·실패 false (호출측은 반환값을 무시해도 된다).
export async function audit(event, { actor, role, ip, detail } = {}) {
  try {
    const entry = buildAuditEntry({ event, actor, role, ip, detail });
    if (!entry) return false;
    console.log(auditLine(entry));
    if (process.env.AUDIT_DB === '1') {           // [승인 필요] DB 영속화 게이트 — 기본 OFF
      const { hasDB, sql } = await import('./db.js');
      if (hasDB) {
        await sql`insert into audit_events (ts, event, actor, role, ip, detail)
                  values (${entry.ts}, ${entry.event}, ${entry.actor}, ${entry.role}, ${entry.ip}, ${JSON.stringify(entry.detail)}::jsonb)`;
      }
    }
    return true;
  } catch (e) {
    try { console.error('audit fail:', e?.message); } catch {}
    return false;
  }
}
