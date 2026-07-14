// lib/shareLink.js — **조회 조건 공유 링크** 순수 유틸
// (React/DOM 비의존 → 단위 테스트 가능. UI 는 lib/CopyLink.jsx)
//
// 배경: 17~20회차로 기간·검색어·필터·뷰·정렬이 전부 URL 에 보존되고(주소 하나 = 화면 완전 재현),
//       자주 쓰는 조건은 **저장된 뷰**로 재사용할 수 있게 됐다. 그런데 저장된 뷰는 브라우저
//       localStorage 전용이라 **남에게 건넬 수단이 없다** — "실패 발송 · 최근 7일 · 시각 내림차순"을
//       동료에게 보여 주려면 주소창을 직접 긁어야 했고(모바일에서는 사실상 불가), 조건 없이 주소만
//       보내면 상대는 기본 화면을 본다. → **현재 조건의 절대 URL 을 한 번에 복사**한다.
//
// 설계:
//   - 링크의 단위는 여전히 **쿼리 문자열 그 자체**(clearParams·savedViews 와 동일한 규약)
//     → 새 조건 파라미터가 추가돼도 이 모듈은 바뀌지 않는다.
//   - origin 이 없거나 이상하면 **경로 상대 링크**로 폴백한다(화면이 절대 깨지지 않는다).
//   - 조건이 없으면 파라미터 없는 순수 경로 → 기본 화면 주소와 100% 동일.
//   - 개인정보(전화번호)는 어느 목록에서도 URL 쿼리에 실리지 않는다(PII 정책 유지)
//     → 공유 링크에 PII 가 새어 나갈 경로가 원천적으로 없다.

// '?a=1' · 'a=1' · URLSearchParams · 객체 → 정규화된 쿼리 문자열(선행 '?' 없음).
export function normalizeQuery(query) {
  try {
    if (query instanceof URLSearchParams) return query.toString();
    if (typeof query === 'string') {
      const s = query.trim();                       // 트림 먼저 — ' ?q=a ' 처럼 앞뒤 공백이 붙어도 '?' 를 놓치지 않는다
      return (s.startsWith('?') ? s.slice(1) : s).trim();
    }
    if (query && typeof query === 'object') {
      const sp = new URLSearchParams();
      for (const [k, v] of Object.entries(query)) if (v != null) sp.set(k, String(v));
      return sp.toString();
    }
  } catch {
    /* noop */
  }
  return '';
}

// origin 정규화: 'https://d-ars.vercel.app/' → 'https://d-ars.vercel.app'.
// http(s) 가 아니거나(about:·file: 등) 비어 있으면 '' → 상대 링크 폴백.
export function normalizeOrigin(origin) {
  const s = String(origin || '').trim();
  if (!s || !/^https?:\/\/[^/\s]+$/i.test(s.replace(/\/+$/, ''))) return '';
  return s.replace(/\/+$/, '');
}

export function normalizePath(pathname) {
  const p = String(pathname || '/').trim() || '/';
  return p.startsWith('/') ? p : `/${p}`;
}

// 공유할 링크 문자열. origin 이 유효하면 절대 URL, 아니면 경로 상대 URL.
export function shareUrl(origin, pathname, query) {
  const path = normalizePath(pathname);
  const qs = normalizeQuery(query);
  const href = qs ? `${path}?${qs}` : path;
  const o = normalizeOrigin(origin);
  return o ? `${o}${href}` : href;
}

// 링크를 만들 수 있는가(= 항상 가능하지만, 호출부의 가드 의도를 명시적으로 표현).
export function canShare(pathname) {
  return !!normalizePath(pathname);
}

// 클립보드 복사 — navigator.clipboard 가 없거나(비보안 컨텍스트·구형 브라우저) 실패하면
// 숨김 textarea + execCommand('copy') 로 폴백한다. 둘 다 실패하면 false(호출부가 안내를 바꾼다).
// deps 주입으로 테스트 가능(기본은 전역 navigator·document).
export async function copyText(text, deps = {}) {
  const s = String(text ?? '');
  if (!s) return false;
  const nav = deps.navigator ?? (typeof navigator !== 'undefined' ? navigator : null);
  const doc = deps.document ?? (typeof document !== 'undefined' ? document : null);

  try {
    if (nav?.clipboard?.writeText) {
      await nav.clipboard.writeText(s);
      return true;
    }
  } catch {
    /* 권한 거부·비보안 컨텍스트 → 폴백으로 넘어간다 */
  }

  try {
    if (!doc?.body) return false;
    const ta = doc.createElement('textarea');
    ta.value = s;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '-1000px';
    ta.style.opacity = '0';
    doc.body.appendChild(ta);
    ta.select();
    const ok = typeof doc.execCommand === 'function' ? doc.execCommand('copy') : false;
    doc.body.removeChild(ta);
    return !!ok;
  } catch {
    return false;
  }
}

export default shareUrl;
