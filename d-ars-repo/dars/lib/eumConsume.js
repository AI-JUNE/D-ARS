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

// 소진 기록에 **함께 남기는 것은 선택 결과뿐**이다.
//
// 왜 남기나: 소진된 링크로 다시 제출하면 라우트는 409 를 돌려주고 화면은 완료 화면을 보인다.
// 그런데 화면이 그때 그리던 요약은 **방금 고른 것**이었다 — 실제로 접수된 것은 **먼저 제출된
// 것**인데도. 연결이 끊겨 재시도하는 사이에 마음을 바꿔 다른 활동을 고른 어르신은, 접수되지
// 않은 선택을 "접수되었습니다" 라는 문장과 함께 보게 된다. 담당자에게 간 내용과 어르신이 믿는
// 내용이 달라지고, 두 사람 모두 어긋난 줄 모른다. 기록이 무엇이 접수됐는지 알고 있으면
// 화면은 지어내지 않고 **사실**을 말할 수 있다.
//
// 왜 화이트리스트인가: 이 기록은 409 응답으로 **밖으로 나간다**. 호출측이 무심코 넘긴 값이
// 그대로 실려 나가지 않도록, 여기 적힌 필드만 통과시키고 나머지는 버린다(이름·연락처 같은
// 것이 섞여 들어올 자리를 없앤다).
export const CONSUME_NOTE_FIELDS = ['activity', 'timeslot'];

// 기록에 남길 수 있는 모양으로 좁힌다. 남길 것이 없으면 null(빈 객체를 만들지 않는다).
export function sanitizeNote(note) {
  if (!note || typeof note !== 'object' || Array.isArray(note)) return null;
  const out = {};
  for (const f of CONSUME_NOTE_FIELDS) {
    const v = note[f];
    if (typeof v === 'string' && v && v.length <= 32) out[f] = v;
  }
  return Object.keys(out).length ? out : null;
}

// 토큰 문자열 → 소진 키(서명 부분). 형식이 아니면 '' — 호출측이 판정을 진행하지 않는다.
export function consumeKey(token) {
  if (typeof token !== 'string') return '';
  const parts = token.trim().split('.');
  if (parts.length !== 2) return '';
  const sig = parts[1];
  return sig && /^[A-Za-z0-9_-]{16,}$/.test(sig) ? sig : '';
}

export function createConsumeStore({ max = EUM_CONSUME_MAX } = {}) {
  const seen = new Map(); // key -> { exp: expiresAtMs, note: 접수된 선택 | null }
  let evicted = 0;

  function sweep(now) {
    for (const [k, rec] of seen) if (rec.exp <= now) seen.delete(k);
  }

  // 상한을 넘으면 가장 먼저 만료될 것부터 버린다(남은 수명이 짧은 쪽이 손실도 작다).
  function trim() {
    if (seen.size <= max) return;
    const order = [...seen.entries()].sort((a, b) => a[1].exp - b[1].exp);
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
      const rec = seen.get(key);
      if (rec === undefined) return false;
      if (rec.exp <= t) { seen.delete(key); return false; }
      return true;
    },

    // 이미 쓰인 링크라면 **무엇이 접수됐는지**까지 돌려준다(화면 진입·409 안내가 쓴다).
    // 모르면 note 는 null 이다 — 서버 재시작·다른 인스턴스·구버전 기록 모두 여기로 온다.
    // 모른다는 것을 null 로 분명히 말하고, 화면이 지어내지 않게 한다.
    recordOf(key, now = Date.now()) {
      if (!this.has(key, now)) return { used: false, note: null };
      const rec = seen.get(key);
      return { used: true, note: rec && rec.note ? { ...rec.note } : null };
    },

    // 링크를 소진한다. 처음이면 { ok:true }, 이미 쓰였으면 { ok:false, reason:'used' }.
    // 키·만료가 이상하면 { ok:false, reason:'unusable' } — 통과시키지 않는다(닫히는 쪽이 기본).
    // note 는 접수된 선택(선택) — 화이트리스트를 거쳐서만 기록된다.
    claim(key, expiresAtMs, now = Date.now(), note = null) {
      const t = Number(now);
      const exp = Number(expiresAtMs);
      if (!key || typeof key !== 'string') return { ok: false, reason: 'unusable' };
      if (!Number.isFinite(t) || !Number.isFinite(exp)) return { ok: false, reason: 'unusable' };
      if (exp <= t) return { ok: false, reason: 'expired' };
      sweep(t);
      if (this.has(key, t)) return { ok: false, reason: 'used' };
      seen.set(key, { exp: Math.floor(exp), note: sanitizeNote(note) });
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
