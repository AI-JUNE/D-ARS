// lib/rateLimit.js — 인메모리 rate limit (상용 하드닝 · 무의존성)
//
// 목적: 로그인 등 남용 가능 엔드포인트의 브루트포스/과다요청을 완화한다.
// 설계:
//   - 순수 코어(hitWindow)는 시간을 인자로 받아 부작용이 없다 → 단위 테스트 가능.
//   - createRateLimiter 는 Map 기반 인메모리 상태(단일 인스턴스 한정). 서버리스/멀티노드
//     환경에서는 완벽하지 않으므로 [승인 필요] 운영 확장 시 Redis 등 공유 스토어로 교체.
//   - 고정 윈도우(fixed window) 방식: window 시간 안에서 max 회 초과 시 차단.
//
// 하위호환: 기존 코드 흐름을 바꾸지 않는다. 호출부가 명시적으로 검사할 때만 동작.

// 순수 코어: 현재 상태(state)와 지금 시각(now)으로 다음 상태·허용여부를 계산한다.
// state: { count, resetAt } | null(최초)
// 반환: { allowed, state, remaining, retryAfterSec }
export function hitWindow(state, { now, windowMs, max }) {
  if (!state || now >= state.resetAt) {
    const next = { count: 1, resetAt: now + windowMs };
    return { allowed: true, state: next, remaining: max - 1, retryAfterSec: 0 };
  }
  if (state.count < max) {
    const next = { count: state.count + 1, resetAt: state.resetAt };
    return { allowed: true, state: next, remaining: max - next.count, retryAfterSec: 0 };
  }
  // 초과
  const retryAfterSec = Math.max(1, Math.ceil((state.resetAt - now) / 1000));
  return { allowed: false, state, remaining: 0, retryAfterSec };
}

// 스테이트풀 리미터 팩토리(인메모리). key 별로 윈도우를 관리한다.
// options: { windowMs=60000, max=10, maxKeys=10000 }
export function createRateLimiter({ windowMs = 60_000, max = 10, maxKeys = 10_000 } = {}) {
  const store = new Map();

  function sweep(now) {
    // 만료 엔트리 정리(메모리 무한증가 방지). 규모가 커지면 가장 오래된 키부터 제거.
    if (store.size < maxKeys) {
      for (const [k, v] of store) if (now >= v.resetAt) store.delete(k);
      return;
    }
    for (const k of store.keys()) {
      store.delete(k);
      if (store.size < maxKeys) break;
    }
  }

  return {
    // key(예: IP)에 대해 1회 소비를 시도한다.
    check(key, now = Date.now()) {
      if (store.size >= maxKeys) sweep(now);
      const cur = store.get(key) || null;
      const r = hitWindow(cur, { now, windowMs, max });
      store.set(key, r.state);
      return { allowed: r.allowed, remaining: r.remaining, retryAfterSec: r.retryAfterSec, limit: max };
    },
    reset(key) { store.delete(key); },
    _size() { return store.size; },
  };
}

// 요청에서 클라이언트 IP 추정(프록시/Vercel 대응). 실패 시 'unknown'.
export function clientIp(req) {
  try {
    const h = req?.headers;
    const xff = h?.get ? h.get('x-forwarded-for') : (h?.['x-forwarded-for'] || null);
    if (xff) return String(xff).split(',')[0].trim();
    const real = h?.get ? h.get('x-real-ip') : (h?.['x-real-ip'] || null);
    if (real) return String(real).trim();
  } catch {}
  return 'unknown';
}
