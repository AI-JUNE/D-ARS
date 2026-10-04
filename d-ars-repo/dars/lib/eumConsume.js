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
//     (조용한 손실 금지).
//     정정: 여기까지가 예전 상태였다 — 수를 **세어 두기만 하고 아무도 읽지 않았다**
//     (`stats()` 를 부르는 애플리케이션 코드가 한 줄도 없었고 테스트만 불렀다).
//     그러면 "조용한 손실 금지" 는 이 파일 안에서만 참인 말이 된다. 1회용 보장이 실제로
//     깨진 순간에 그것을 아는 사람이 아무도 없고, 담당자 명단에 중복이 생긴 뒤에도
//     원인을 되짚을 근거가 남지 않는다. 그래서 두 곳에서 읽게 했다 —
//     버리는 **그 순간**은 라우트가 경고 로그로(claim 이 버린 수를 돌려준다),
//     **지금 상태**는 /api/health 의 `eum-onetime` 의존성이(consumeDepStatus).
//   - throw 하지 않는다. 판정 불가는 예외가 아니라 `{ ok:false, reason }` 이다.
//
// 한계(정직하게): 인메모리·인스턴스 로컬이다. 서버리스에서 인스턴스가 여러 개면 다른 인스턴스로
// 간 재제출은 걸러지지 않는다(lib/apiLimits 와 같은 한계). 공유 저장소(DB·Redis)로의 영속화는
// **[승인 필요]** — `createConsumeStore` 와 같은 모양의 어댑터를 끼우면 되도록 인터페이스를
// 좁게 잡아 두었다.

import { EUM_TOKEN_MESSAGE } from './eumMessage.js';

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
  // 이번 호출에서 버린 수를 돌려준다 — 호출측(라우트)이 그 순간을 로그로 남길 수 있게.
  function trim() {
    if (seen.size <= max) return 0;
    const order = [...seen.entries()].sort((a, b) => a[1].exp - b[1].exp);
    let dropped = 0;
    for (const [k] of order) {
      if (seen.size <= max) break;
      seen.delete(k);
      evicted += 1;
      dropped += 1;
    }
    return dropped;
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
      // 자리를 만드느라 버린 기록이 있으면 **이번 응답에 실어 알린다**. 버려진 링크는
      // 다시 제출할 수 있게 되므로, 이 수가 0 이 아닌 순간이 곧 1회용 보장이 깨진 순간이다.
      // 접수 자체는 정상이므로 실패로 만들지 않는다 — 말하지 않는 것만 하지 않는다.
      const dropped = trim();
      return dropped ? { ok: true, evicted: dropped } : { ok: true };
    },

    // 관측용 — 숨기지 않는다.
    stats() { return { size: seen.size, evicted, max }; },
    reset() { seen.clear(); evicted = 0; },
  };
}

// 프로세스 공용 기본 스토어(라우트가 쓰는 것). 테스트는 createConsumeStore 로 격리한다.
//
// **왜 globalThis 인가**: 예전에는 모듈 스코프 변수(`let shared`)였다. 그런데 이 모듈을 읽는
// 곳은 세 군데이고 셋은 서로 **다른 서버 엔트리**다 — 제출 라우트(`/api/eum/senior/preferences`),
// 진입 화면(`app/eum/senior/[token]/page.jsx`), 헬스체크(`/api/health`). Next 는 라우트·페이지마다
// 별도 엔트리를 만들고 각 엔트리가 자기 모듈 레지스트리를 갖기 때문에, 같은 서버 인스턴스
// 안에서도 `lib/eumConsume.js` 가 **여러 번 평가**돼 각자 다른 Map 을 들 수 있다. 그러면
//   · 제출 라우트가 소진한 링크를 **진입 화면은 모른다** → 「이미 신청하셨습니다」가 영영 안 뜬다.
//   · `/api/health` 의 `eum-onetime` 은 **언제나 빈 스토어**를 읽는다 → 축출이 몇 건이든 `ok`.
// 즉 지난 회차에 "조용한 손실 금지" 로 붙인 관측 신호와 헛걸음을 없앤 진입 안내가, 배선은
// 멀쩡한데 **보는 대상이 달라서** 참이 아닐 수 있었다(한계로 적어 둔 것은 인스턴스가 여러 개인
// 경우였는데, 인스턴스가 하나여도 같은 일이 일어난다). 판정을 한 자리에 묶어 두는 것이
// 이 파일의 목적이므로, 스토어는 모듈이 아니라 **프로세스**에 매단다.
//
// Symbol.for 를 쓰는 이유: 문자열 키는 다른 코드와 충돌할 수 있고, 전역 심볼 레지스트리는
// 모듈 평가가 몇 번 일어나도 같은 심볼을 돌려준다.
const STORE_KEY = Symbol.for('dars.eum.consumeStore.v1');

export function consumeStore() {
  const g = globalThis;
  const found = g[STORE_KEY];
  // 모양이 맞지 않는 값이 들어와 있으면(다른 코드가 같은 이름을 썼다면) 새로 만든다 —
  // 여기서 던지면 신청 화면과 헬스체크가 함께 죽는다.
  if (found && typeof found.claim === 'function' && typeof found.recordOf === 'function') return found;
  const made = createConsumeStore();
  g[STORE_KEY] = made;
  return made;
}

// ── 지금 1회용 판정이 실제로 서 있는가 ────────────────────────────────────
//
// /api/health 의 `deps` 한 줄로 내보낸다(lib/audit 의 `audit-persist` 와 같은 방식이다 —
// "켰다" 와 "실제로 남는다" 가 다른 상태를 사람 눈이 아니라 기계가 말하게 한다).
//
// 어휘는 lib/health.DEP_STATUSES 를 따른다. 여기서는 'error' 를 쓰지 않는다 —
// 소진 기록이 모자라도 서비스는 정상 동작하고(토큰 검증·만료는 그대로다), 이 한 줄 때문에
// 헬스체크가 503 이 되면 부가 신호가 전체를 죽이는 셈이 된다. required 도 붙이지 않는다.
//
// 임계값 90% 는 "곧 버리게 된다" 를 버리기 **전에** 알리기 위한 운영 기준값이며 실측 지표가 아니다.
export const EUM_CONSUME_NEAR_FULL = 0.9;

export function consumeDepStatus(stats) {
  const s = stats && typeof stats === 'object' ? stats : {};
  const evicted = Number(s.evicted);
  const size = Number(s.size);
  const max = Number(s.max);
  // 판정할 수 없으면 'degraded' — 모르는 것을 'ok' 라고 말하지 않는다(닫히는 쪽이 기본).
  if (!Number.isFinite(evicted) || !Number.isFinite(size) || !Number.isFinite(max) || max <= 0) {
    return 'degraded';
  }
  // 한 건이라도 버렸다면 그 링크들은 다시 제출 가능해졌다 — 이미 깨진 적이 있다는 뜻이다.
  if (evicted > 0) return 'degraded';
  if (size >= Math.floor(max * EUM_CONSUME_NEAR_FULL)) return 'degraded';
  return 'ok';
}

// 사유별 안내문 — 화면이 고르게(만료 vs 이미 신청함) 하기 위한 단일 출처.
//
// 만료·사용 불가는 **토큰 검증 실패와 같은 사실**이고(링크가 열리지 않는다), 어르신이 그
// 두 경로의 차이를 알 길도 없다. 그래서 문장을 손으로 다시 적지 않고 lib/eumMessage 를
// 가리킨다 — 예전에는 글자까지 같은 사본이 여기 한 벌 더 있었다(한쪽만 고쳐지면 같은 상태를
// 두 문장이 설명하게 된다). `used` 만 이 파일 고유의 사실이다.
export const EUM_CONSUME_MESSAGE = {
  used: '이미 신청이 접수된 링크입니다. 담당자에게 문의해 주세요',
  expired: EUM_TOKEN_MESSAGE.expired,
  unusable: EUM_TOKEN_MESSAGE.malformed,
};

// 이미 접수된 링크를 만난 사람에게 **다음에 무엇을 하면 되는지** 알려 주는 한 문장.
//
// 왜 단일 출처인가: 같은 사실을 두 화면이 보여 준다 — 링크를 **다시 열었을 때**(page.jsx 진입
// 안내)와 **제출이 409 로 돌아왔을 때**(SeniorFlow 완료 화면). 그런데 이 문장은 완료 화면에만
// 있었다. 진입 화면은 "이미 접수됐습니다" 까지만 말하고 끝났다.
// 마음을 바꾼 어르신에게 그것은 막다른 길이다 — 화면에 단추가 없으니 담당자에게 **새 링크**를
// 청하게 되고, 새 링크는 소진 키가 달라 재신청이 실제로 통한다(설계상 정상이다: 막아야 하는
// 것은 같은 링크의 재사용이지 그 어르신의 재신청이 아니다). 그래서 담당자 명단에는 같은
// 어르신이 두 건으로 남고, 어느 쪽이 맞는지는 아무도 모른다 — 「이미 접수됐다」를 두 번 막은
// 끝에 중복이 생긴다. 문장 하나가 빠져서 생기는 중복이다.
// 두 화면이 같은 상수를 쓰게 두어 한쪽만 고쳐지는 일을 없앤다.
export const EUM_CONSUME_CHANGE_HINT = '바꾸고 싶으시면 담당자에게 말씀해 주세요.';

// 접수된 **내용을 모를 때**(다른 인스턴스·재시작·구기록) 하는 말. 요약을 지어내지 않는 대신
// 확인할 곳을 알려 준다 — 모른다고 말하고 끝내면 어르신은 무엇이 접수됐는지 알 길이 없다.
export const EUM_CONSUME_UNKNOWN_HINT = '접수된 내용은 담당자에게 확인해 주세요.';

export function consumeMessage(reason) {
  return EUM_CONSUME_MESSAGE[reason] || EUM_CONSUME_MESSAGE.unusable;
}
