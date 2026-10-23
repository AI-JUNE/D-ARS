// lib/eumCountdown.js — 「이음 어르신 신청」 남은 시간 계산(순수 · React/DOM 비의존)
//
// (DOM 을 **import 하지 않는다**는 뜻이다. 맨 아래 눈금 이어받기는 화면이 넘겨 준 노드에
//  속성 한 칸을 적고 읽는다 — lib/eumSenior 의 markRetried 와 같은 계약이고, 그래서 이
//  파일은 서버에서도 그대로 import 된다.)
//
// 왜 별도 모듈인가 — 고친 결함
//   화면은 서버가 준 **절대 만료시각(exp)** 을 받아 `exp - Date.now()` 로 남은 시간을 셌다.
//   `Date.now()` 는 **어르신 기기의 시계**다. 서버는 이미 "이 링크는 유효하다"고 판정해
//   화면을 내려보냈는데, 기기 시계가 몇 분만 앞서 있으면 화면은 첫 렌더에서 곧바로
//   「링크가 만료되었습니다」로 덮였다. 담당자가 새 링크를 보내도 결과는 같다 —
//   어르신은 영영 신청할 수 없고, 양쪽 모두 이유를 알 방법이 없다.
//   (반대로 시계가 느리면 만료 임박 안내가 뜨지 않은 채 제출이 410 으로 떨어진다.)
//
// 해법: 화면에 **절대 시각을 주지 않는다.** 서버가 판정한 **남은 기간(ms)** 만 넘기고,
//   화면은 "받은 뒤 얼마나 지났는가" 만 센다. 경과는 같은 시계에서 뺀 **차이**라
//   절대 오차(시계가 몇 시로 맞춰져 있는가)의 영향을 받지 않는다.
//
// 남는 오차와 그 방향: 서버 렌더 → 기기 표시 사이의 전송 지연만큼 화면이 **너그럽게**(조금 더
//   남은 것처럼) 센다. 이 방향이 안전하다 — 최악이라야 제출 한 번이 410 으로 돌아오고 화면이
//   그 사유를 안내하는 것이고, 반대 방향(엄하게)은 유효한 링크를 화면이 혼자 막아 버리는
//   되돌릴 수 없는 사고다. 만료의 **최종 판정자는 언제나 서버**다(라우트의 재검증).

// 만료 임박 안내를 띄우는 기준. 1분은 "지금 고르던 것을 마저 끝낼 수 있는가" 를 알리기에
// 충분한 여유로 잡은 운영 기준값이며 실측 지표가 아니다.
export const EUM_SOON_MS = 60 * 1000;

// 만료 임박 안내 **문구는 이 파일에 두지 않는다** → lib/eumMessage.js 의
// `EUM_SOON_LEAD`·`EUM_SOON_NEXT`·`EUM_SOON_BUSY`·`soonMessage(step, busy)`.
//
// 왜 옮겼나: 이 파일은 눈금과 판정(언제 임박인가)을 들고, 화면에 그려지는 **문장**의 단일
// 출처는 lib/eumMessage 하나다(9·11·12회차가 `lib/eumToken`·`SeniorFlow`·경계 화면에서 차례로
// 그 자리로 모은 것이다). 여기 한 벌 남아 있던 동안 두 가지가 그 표의 가드를 비껴갔다 —
// 묵음 경계 판정도, 자리를 가리키는 낱말 금지도 이 문장만 보지 않았다.
// 그리고 **한 벌이라는 것 자체**가 결함이었다: 그 문장은 1~3단계 어디서나 「지금 고르신 것을
// 신청해 주세요」라고 말했는데, 고른 것도 신청 단추도 없는 1·2단계에서는 가리킬 것이 화면에
// 없는 말이었다(자세한 내용은 lib/eumMessage 의 그 등록부 주석 참조).
// (그 갈림도 한동안 **단계까지**였다 — 제출이 떠 있는 동안에는 3단계의 그 단추마저 그
//  이름으로 화면에 없다. 지금은 `busy` 도 함께 가른다 · lib/eumMessage 의 EUM_SOON_BUSY.)
//
// 아래 `isSoon` 은 **언제** 말하는가만 정한다 — 무엇을 말하는가는 표의 몫이다.

// 안전한 수 변환. `Number(Symbol)` 은 **throw 한다** — 순수 계산 함수가 화면 렌더 도중 던지면
// 남은 시간 표시 하나 때문에 신청 화면 전체가 빈 화면이 된다(QUALITY_BAR §1). 모든 입력은
// 여기를 거치고, 수가 아니면 NaN 으로 돌아간다.
function num(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : NaN;
  if (typeof v === 'string' || typeof v === 'boolean') {
    const n = Number(v);
    return Number.isFinite(n) ? n : NaN;
  }
  return NaN;
}

// 단조 증가 눈금. performance.now() 는 시스템 시계를 고쳐도 뒤로 가지 않아 경과 측정에 맞다.
// 없는 환경(구형 브라우저·일부 런타임)에서는 Date.now() 로 물러서되, 아래 elapsedSince 가
// 뒤로 간 경우를 흡수한다. 절대 throw 하지 않는다 — 화면이 남은 시간 때문에 죽으면 안 된다.
export function nowTick() {
  try {
    const p = typeof performance !== 'undefined' ? performance : null;
    const v = p && typeof p.now === 'function' ? p.now() : NaN;
    if (Number.isFinite(v)) return v;
  } catch {
    /* performance 접근 불가 — 아래로 물러선다 */
  }
  const t = Date.now();
  return Number.isFinite(t) ? t : 0;
}

// 서버가 준 남은 기간을 화면이 쓸 값으로 정규화. 이상한 값이면 0 이 아니라 **null**(=시간 표시
// 없음). 0 으로 뭉개면 "만료됨" 과 구분되지 않아, 값이 빠진 순간 멀쩡한 링크가 만료로 보인다.
export function initialLeftMs(remainingMs) {
  const v = num(remainingMs);
  if (!Number.isFinite(v) || v <= 0) return null;
  return Math.floor(v);
}

// 두 눈금 사이의 경과(ms). 뒤로 간 값(시계 수정·눈금 교체)은 0 으로 흡수한다 —
// 음수 경과는 남은 시간을 늘려 만료를 영영 오지 않게 만든다.
export function elapsedSince(startTick, tick = nowTick()) {
  const a = num(startTick);
  const b = num(tick);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.max(0, b - a);
}

// 남은 시간(ms · 음수 없음). initial 이 null 이면 null 을 그대로 돌려준다(표시 없음).
export function leftAfter(initialMs, elapsedMs) {
  if (initialMs === null || initialMs === undefined) return null;
  const init = num(initialMs);
  if (!Number.isFinite(init)) return null;
  const used = num(elapsedMs);
  const gone = Number.isFinite(used) && used > 0 ? used : 0;
  return Math.max(0, init - gone);
}

// 화면이 스스로 만료를 선언해도 되는가. **모를 때는 선언하지 않는다**(null → false) —
// 판정 실패를 만료로 넘기면 유효한 링크를 화면이 막는다. 확정 판정은 서버가 한다.
export function isExpired(leftMs) {
  return typeof leftMs === 'number' && Number.isFinite(leftMs) && leftMs <= 0;
}

// 만료 임박 안내를 띄울 구간인가(남은 시간이 있고, 기준 이하일 때만).
export function isSoon(leftMs, threshold = EUM_SOON_MS) {
  if (typeof leftMs !== 'number' || !Number.isFinite(leftMs) || leftMs <= 0) return false;
  const th = num(threshold);
  return Number.isFinite(th) && th > 0 && leftMs <= th;
}

// 화면에 보여 줄 남은 초. 올림이라 "0초" 가 남은 채로 머무르지 않는다.
export function secondsLeft(leftMs) {
  if (typeof leftMs !== 'number' || !Number.isFinite(leftMs) || leftMs <= 0) return 0;
  return Math.ceil(leftMs / 1000);
}

// ── 되살아난 화면도 **같은 눈금**을 쓴다 ───────────────────────────────────
//
// 고친 결함: 화면은 `remainingMs` 를 **서버가 넘긴 값**으로 받아 마운트 시점을 출발점으로
// 삼았다. 그런데 문서가 열려 있는 동안 화면이 다시 마운트되는 길이 하나 있다 — 오류 화면의
// 「다시 시도」(`reset()` 은 같은 자식을 **다시 그린다** · lib/eumSenior 의 restorePoint 참조).
// 그때 출발점이 다시 지금으로 맞춰지므로, 4분 30초가 지난 링크가 **5분 남은 링크로** 되살아난다.
// 그러면
//   · 「잠시 후 링크가 만료됩니다」가 **뜨지 않는다**(13회차가 그 경고를 넣은 이유가 "남은
//     1분 안에 마저 끝낼 수 있게" 인데, 하필 시간이 가장 급한 그 순간에 침묵한다).
//   · 화면은 스스로 만료를 선언하지 않으므로 어르신은 네 화면을 끝까지 걷고 **제출에서**
//     410 을 만난다 — 고른 것을 다 고른 뒤에 「링크가 만료되었습니다」를 본다.
// 서버가 다시 판정해 주지 않는다는 점이 핵심이다(`reset()` 은 서버를 거치지 않는다).
//
// 그래서 「서버가 준 남은 기간」과 「그것을 받은 눈금」을 **문서에** 적어 두고 이어받는다.
//   · 자리를 문서로 고른 이유는 lib/eumSenior 의 EUM_RETRY_FLAG 와 같다 — 모듈 변수는 번들
//     경계마다 갈라지고, 저장소(localStorage·sessionStorage)는 문서를 넘겨 살아남아 **다음에
//     링크를 여는 어르신**이 남의 눈금을 물려받는다. 문서 속성은 이 문서 안에서만 산다.
//   · `performance.now()` 는 문서의 시간원점을 기준으로 하므로, 같은 문서 안에서 적어 둔
//     눈금과 나중에 읽은 눈금은 **그대로 뺄 수 있다**(기기 시계와 무관하다는 성질도 그대로다).
//   · 이 모듈은 DOM 을 import 하지 않는다 — 화면이 `document.documentElement` 만 넘긴다.
export const EUM_CLOCK_FLAG = 'data-eum-clock';

// 「남은 기간/눈금」 한 칸. 규격 밖이면 ''(적지 않는다 — 반쪽 값을 적으면 읽는 쪽이 그것을
// 믿을지 말지를 다시 정해야 한다).
export function serializeClock(left, tick) {
  const l = num(left);
  const t = num(tick);
  if (!Number.isFinite(l) || l <= 0 || !Number.isFinite(t)) return '';
  return `${Math.floor(l)}/${t}`;
}

// 적어 둔 칸 → { left, tick }. 모르는 글자·반쪽·0 이하는 전부 null(모른다) — 지어내지 않는다.
export function parseClock(text) {
  if (typeof text !== 'string' || !text) return null;
  const m = /^(\d+)\/(-?\d+(?:\.\d+)?)$/.exec(text);
  if (!m) return null;
  const left = Number(m[1]);
  const tick = Number(m[2]);
  if (!Number.isFinite(left) || left <= 0 || !Number.isFinite(tick)) return null;
  return { left, tick };
}

// 적는다. 적지 못해도 **던지지 않는다** — 잃는 것은 되살아났을 때의 정확한 남은 시간이고,
// 그때도 서버가 만료의 최종 판정자로 남는다(markRetried 와 같은 계약).
export function markClock(root, left, tick) {
  try {
    const text = serializeClock(left, tick);
    if (!text || !root || typeof root.setAttribute !== 'function') return false;
    root.setAttribute(EUM_CLOCK_FLAG, text);
    return true;
  } catch {
    return false;
  }
}

// 읽는다. **지우지 않는다** — 이 사실은 문서가 사는 동안 계속 참이고, 다시 마운트될 때마다
// 필요하다(EUM_RETRY_FLAG 는 한 번만 쓰이는 사실이라 읽고 지운다 — 성질이 반대다).
export function readClock(root) {
  try {
    if (!root || typeof root.getAttribute !== 'function') return null;
    return parseClock(root.getAttribute(EUM_CLOCK_FLAG));
  } catch {
    return null;
  }
}

// 문서에 적힌 눈금을 **이어받거나**, 없으면 서버가 준 기간으로 새 눈금을 만든다.
// `resumed` 는 「이어받았는가」다 — 화면은 그때만 경과를 선반영한다(첫 마운트에서 그러면
// 서버가 그린 첫 그림과 어긋날 수 있고, 이어받는 경우에는 하이드레이션이 애초에 없다).
// 여기서 **적지는 않는다**: 쓰기는 효과의 몫이다(렌더 중에 문서를 고치지 않는다).
export function resumeClock(stored, remainingMs, tick) {
  const s = stored && typeof stored === 'object' && !Array.isArray(stored) ? stored : null;
  const l = s ? num(s.left) : NaN;
  const t = s ? num(s.tick) : NaN;
  if (Number.isFinite(l) && l > 0 && Number.isFinite(t)) {
    return { left: Math.floor(l), tick: t, resumed: true };
  }
  const now = num(tick);
  return {
    left: initialLeftMs(remainingMs),
    tick: Number.isFinite(now) ? now : nowTick(),
    resumed: false,
  };
}
