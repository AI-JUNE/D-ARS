// lib/eumConsume.js — 「이음 어르신 신청」 1회용 링크의 **소진(consume) 판정**
//
// 왜 필요한가: EUM_INTEGRATION.md 와 화면 주석은 링크를 "1회용" 이라 부르는데, 지금까지
// 코드가 실제로 보장한 것은 **만료(5분)뿐**이었다. 같은 링크로 5분 안에 몇 번이고 다시 들어와
// 몇 번이고 신청할 수 있었다 — 담당자에게는 같은 어르신의 신청이 여러 건으로 보인다.
// "1회용" 이라는 서술이 코드보다 앞서 있었던 것이고, 이 파일은 그 간극을 메운다.
//
// 설계
//   - 키는 토큰의 **서명 부분**(`body.sig` 의 sig)만 쓴다. 서명만으로는 페이로드를 복원할 수
//     없어 기록 자체가 유효한 링크가 되지 않는다. sid 는 키에 넣지 않는다 —
//     sid 단위로 막으면 담당자가 새 링크를 발급해도 재신청이 영영 불가능해진다.
//     막아야 하는 것은 "같은 링크의 재사용" 이지 "그 어르신의 재신청" 이 아니다.
//   - 기록은 토큰 만료시각(exp)까지만 산다. 만료 뒤에는 검증이 어차피 거부하므로 더 들고 있을
//     이유가 없고, 메모리도 무한히 자라지 않는다.
//   - 상한(EUM_CONSUME_MAX)을 두고, 넘치면 **가장 먼저 만료될 항목부터** 버린다.
//     항목을 버리면 그 링크는 다시 제출 가능해지므로, 버린 수를 감추지 않고 세어 둔다
//     (조용한 손실 금지 — 라우트가 로그로 드러낼 수 있게 한다).
//   - throw 하지 않는다. 판정 불가는 예외가 아니라 `{ ok:false, reason }` 이다.
//
// 한계(정직하게): 인메모리·인스턴스 로컬이다. 서버리스에서 인스턴스가 여러 개면 다른 인스턴스로
// 간 재제출은 걸러지지 않는다(lib/apiLimits 와 같은 한계). 공유 저장소(DB·Redis)로의 영속화는
// **[승인 필요]** — `createConsumeStore` 와 같은 모양의 어댑터를 끼우면 되도록 인터페이스를
// 좁게 잡아 두었다.

export const EUM_CONSUME_MAX = 5000;

// 토큰 문자열 → 소진 키(서명 부분). 형식이 아니면 '' — 호출측이 판정을 진행하지 않는다.
export function consumeKey(token) {
  if (typeof token !== 'string') return '';
  const parts = token.trim().split('.');
  if (parts.length !== 2) return '';
  const sig = parts[1];
  return sig && /^[A-Za-z0-9_-]{16,}$/.test(sig) ? sig : '';
}

export function createConsumeStore({ max = EUM_CONSUME_MAX } = {}) {
  const seen = new Map(); // key -> expiresAtMs
  let evicted = 0;

  function sweep(now) {
    for (const [k, exp] of seen) if (exp <= now) seen.delete(k);
  }

  // 상한을 넘으면 가장 먼저 만료될 것부터 버린다(남은 수명이 짧은 쪽이 손실도 작다).
  function trim() {
    if (seen.size <= max) return;
    const order = [...seen.entries()].sort((a, b) => a[1] - b[1]);
    for (const [k] of order) {
      if (seen.size <= max) break;
      seen.delete(k);
      evicted += 1;
    }
  }

  return {
    // 이미 쓰인 링크인가. 판정만 하고 기록하지 않는다(화면 진입 시 사용).
    has(key, now = Date.now()) {
      const t = Number(now);
      if (!key || !Number.isFinite(t)) return false;
      const exp = seen.get(key);
      if (exp === undefined) return false;
      if (exp <= t) { seen.delete(key); return false; }
      return true;
    },

    // 링크를 소진한다. 처음이면 { ok:true }, 이미 쓰였으면 { ok:false, reason:'used' }.
    // 키·만료가 이상하면 { ok:false, reason:'unusable' } — 통과시키지 않는다(닫히는 쪽이 기본).
    claim(key, expiresAtMs, now = Date.now()) {
      const t = Number(now);
      const exp = Number(expiresAtMs);
      if (!key || typeof key !== 'string') return { ok: false, reason: 'unusable' };
      if (!Number.isFinite(t) || !Number.isFinite(exp)) return { ok: false, reason: 'unusable' };
      if (exp <= t) return { ok: false, reason: 'expired' };
      sweep(t);
      if (this.has(key, t)) return { ok: false, reason: 'used' };
      seen.set(key, Math.floor(exp));
      trim();
      return { ok: true };
    },

    // 관측용 — 숨기지 않는다.
    stats() { return { size: seen.size, evicted, max }; },
    reset() { seen.clear(); evicted = 0; },
  };
}

// 프로세스 공용 기본 스토어(라우트가 쓰는 것). 테스트는 createConsumeStore 로 격리한다.
let shared = null;
export function consumeStore() {
  if (!shared) shared = createConsumeStore();
  return shared;
}

// 사유별 안내문 — 화면이 고르게(만료 vs 이미 신청함) 하기 위한 단일 출처.
export const EUM_CONSUME_MESSAGE = {
  used: '이미 신청이 접수된 링크입니다. 담당자에게 문의해 주세요',
  expired: '링크가 만료되었습니다. 담당자에게 다시 요청해 주세요',
  unusable: '링크가 올바르지 않습니다. 담당자에게 다시 요청해 주세요',
};

export function consumeMessage(reason) {
  return EUM_CONSUME_MESSAGE[reason] || EUM_CONSUME_MESSAGE.unusable;
}
