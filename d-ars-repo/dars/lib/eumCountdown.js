// lib/eumCountdown.js — 「이음 어르신 신청」 남은 시간 계산(순수 · React/DOM 비의존)
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

// 만료 임박 안내 문구(단일 출처 — 화면과 테스트가 같은 문장을 본다).
// 초 단위 숫자는 여기에 넣지 않는다: 이 문장은 스크린리더가 **한 번만** 낭독해야 하고,
// 매초 바뀌는 숫자를 섞으면 1초마다 말을 끊고 다시 읽는다.
export const EUM_SOON_MESSAGE = '잠시 후 이 화면이 닫힙니다. 지금 고르신 것을 신청해 주세요.';

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
