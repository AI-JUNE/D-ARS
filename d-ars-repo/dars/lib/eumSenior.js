// lib/eumSenior.js — 「이음 어르신 신청」 화면 흐름의 순수 로직(React/DOM 비의존 → 단위 테스트 가능)
//
// 배경: 어르신 화면은 **선택지 4개 이내 · 18pt 이상 · 단계 되돌아가기 안전**이 요건이라,
// 단계 계산을 화면 안에 흩어 두면 새로고침·뒤로가기에서 조용히 깨진다(QUALITY_BAR §1).
// 흐름 규칙을 여기에 모아 두고 화면은 그리기만 한다.
//
// 흐름: 1 희망 활동 → 2 희망 시간대 → 3 확인 → 4 완료
//   - `step` 은 URL(?step=n) 로 유지한다 — 콜봇(음성) 안내와 화면 단계가 어긋나지 않게 하기 위해서다.
//   - URL 은 누구나 고칠 수 있으므로 **항상 clampStep 으로 되돌린다**(선택 없이 3단계 진입 금지).
//   - **고른 것도 같은 자리(?a=·?t=)에 둔다.** 단계만 주소에 있고 선택은 메모리에만 있으면,
//     화면이 한 번 다시 그려지는 순간 고른 것이 전부 사라진다(아래 참조).

export const EUM_STEP_MIN = 1;
export const EUM_STEP_MAX = 4;

// 선택지는 각 4개 — "한 화면 버튼 4개 이내" 요건의 상한과 같다.
export const ACTIVITIES = [
  { k: 'walk', label: '산책·나들이' },
  { k: 'talk', label: '말벗·이야기' },
  { k: 'health', label: '건강·운동' },
  { k: 'learn', label: '배움·교육' },
];

export const TIMESLOTS = [
  { k: 'morning', label: '오전 (9시~12시)' },
  { k: 'afternoon', label: '낮 (12시~3시)' },
  { k: 'evening', label: '늦은 오후 (3시~6시)' },
  { k: 'any', label: '아무 때나 좋아요' },
];

export const STEP_TITLE = {
  1: '어떤 활동을 하고 싶으세요?',
  2: '언제가 좋으세요?',
  3: '이대로 신청할까요?',
  4: '신청이 끝났습니다',
};

// 목록에서 키에 해당하는 표시 이름. 없으면 ''(화면이 빈 요약을 그리지 않도록 호출측이 판단).
export function labelOf(list, key) {
  if (!Array.isArray(list)) return '';
  const hit = list.find((o) => o && o.k === key);
  return hit ? hit.label : '';
}

export function isActivity(k) {
  return !!labelOf(ACTIVITIES, k);
}

export function isTimeslot(k) {
  return !!labelOf(TIMESLOTS, k);
}

// '?step=' 값 → 1~4 정수. 이상값·범위 밖은 1(첫 화면)로 되돌린다.
export function parseStep(value) {
  const n = Number(Array.isArray(value) ? value[0] : value);
  if (!Number.isFinite(n)) return EUM_STEP_MIN;
  const i = Math.floor(n);
  if (i < EUM_STEP_MIN || i > EUM_STEP_MAX) return EUM_STEP_MIN;
  return i;
}

// 지금 선택 상태(draft)에서 **도달 가능한 최대 단계**.
// 새로고침으로 선택이 사라졌는데 URL 만 3단계면 1단계로 되돌리는 것이 이 함수의 목적이다.
export function maxReachableStep(draft) {
  const d = draft || {};
  if (d.done) return 4;
  if (!isActivity(d.activity)) return 1;
  if (!isTimeslot(d.timeslot)) return 2;
  return 3;
}

// URL 의 step 을 실제 상태에 맞게 잘라 낸다(항상 1~4).
export function clampStep(step, draft) {
  const want = parseStep(step);
  const max = maxReachableStep(draft);
  // 제출 완료(done) 상태면 완료 화면에 머문다 — 뒤로 가기로 중복 제출이 일어나지 않게 한다.
  if (draft && draft.done) return 4;
  return Math.min(want, max);
}

// ── 고른 것을 주소에 남긴다 ────────────────────────────────────────────────
//
// 고친 결함: 선택(활동·시간대)이 화면 컴포넌트의 메모리에만 있었다. 주소에는 `?step=3` 만
// 남아, 화면이 **한 번이라도 다시 그려지면** 고른 것이 전부 사라지고 clampStep 이 1단계로
// 되돌렸다. 이것은 드문 일이 아니라 이 사용자층의 **기본 경로**다 —
//   · 어르신은 문자로 링크를 받는다. 화면을 열었다가 문자를 다시 확인하려고 앱을 바꾸고
//     돌아오면, 모바일 브라우저는 메모리 회수를 위해 탭을 **되살리며 다시 불러온다**.
//   · 잘못 눌렀다 싶어 새로고침하거나, 화면을 가로로 돌리거나, 전화가 걸려 와도 같다.
// 그때마다 처음부터 다시 골라야 하는데, 링크 수명은 **5분**이다. 두어 번 되풀이되면
// 링크가 먼저 죽고, 어르신에게는 "고르는 중에 화면이 자꾸 처음으로 간다" 로만 보인다.
// 담당자에게 새 링크를 청하면 같은 일이 되풀이된다 — QUALITY_BAR §1 의
// "새로고침·뒤로가기·중복 클릭에도 상태가 깨지지 않는다" 가 지켜지지 않고 있었다.
//
// 그래서 선택도 단계와 **같은 자리**에 둔다. 새로 만드는 저장소가 아니라 이미 쓰고 있던
// 주소다(sessionStorage 는 탭 복원에서 살아남는 보장이 없고, 콜봇이 읽을 수도 없다).
//
// 안전 요건
//   - 주소에 실리는 것은 **선택지 코드 두 개뿐**이다(`walk`·`morning` 같은 고정 어휘).
//     이름·연락처가 들어갈 자리가 없고, 토큰은 이미 경로에 있으므로 노출 범위가 넓어지지 않는다.
//   - 읽을 때 **화이트리스트로 거른다** — 주소는 누구나 고칠 수 있으므로, 목록에 없는 값은
//     빈 값으로 떨어지고 clampStep 이 단계를 앞 화면으로 되돌린다.
//   - **`done` 은 주소에 싣지 않는다.** 실으면 주소를 손으로 고쳐 「신청이 접수되었습니다」
//     화면을 만들 수 있다 — 접수되지 않은 신청을 접수됐다고 말하는 화면이다.
//     완료 판정은 오직 서버 응답에서만 온다.
export const DRAFT_PARAM = { activity: 'a', timeslot: 't' };

// 선택 두 개를 규격 안의 값으로 좁힌다. 규격 밖은 ''(고르지 않은 것과 같게 다룬다).
export function normalizeDraft(draft) {
  const d = draft || {};
  return {
    activity: isActivity(d.activity) ? d.activity : '',
    timeslot: isTimeslot(d.timeslot) ? d.timeslot : '',
  };
}

// 주소의 질의 문자열 → 선택 두 개.
// params 는 Next 의 searchParams(평면 객체 · 값이 배열일 수 있다)와 URLSearchParams 를 모두 받는다.
export function parseDraft(params) {
  const pick = (key) => {
    let v;
    try {
      if (!params) return '';
      v = typeof params.get === 'function' ? params.get(key) : params[key];
    } catch {
      return '';
    }
    const raw = Array.isArray(v) ? v[0] : v;
    return typeof raw === 'string' ? raw : '';
  };
  return normalizeDraft({
    activity: pick(DRAFT_PARAM.activity),
    timeslot: pick(DRAFT_PARAM.timeslot),
  });
}

// 단계 + 선택 → 주소(`?step=2&a=walk`). 화면의 pushState·되돌아가기 링크가 같은 함수를 쓴다.
// 값은 고정 어휘라 이스케이프가 필요 없고, 필요해지는 값은 애초에 통과하지 못한다.
export function stepQuery(step, draft) {
  const d = normalizeDraft(draft);
  const parts = [`step=${parseStep(step)}`];
  if (d.activity) parts.push(`${DRAFT_PARAM.activity}=${d.activity}`);
  if (d.timeslot) parts.push(`${DRAFT_PARAM.timeslot}=${d.timeslot}`);
  return `?${parts.join('&')}`;
}

// 확인 화면에 읽어 줄 한 줄 요약(스크린리더 낭독 문장과 동일하게 쓴다).
export function summaryText(draft) {
  const a = labelOf(ACTIVITIES, draft?.activity);
  const t = labelOf(TIMESLOTS, draft?.timeslot);
  if (!a || !t) return '';
  return `${a} · ${t}`;
}

// 이음에 보낼 본문. 개인정보는 담지 않는다(sid 는 이음 측 식별자).
// 규격 밖이면 null — 화면은 제출 버튼을 막고, 라우트는 400 을 낸다.
export function buildPreferences(draft, now = Date.now()) {
  const sid = typeof draft?.sid === 'string' ? draft.sid.trim() : '';
  if (!sid || !isActivity(draft?.activity) || !isTimeslot(draft?.timeslot)) return null;
  const t = Number(now);
  return {
    sid,
    activity: draft.activity,
    timeslot: draft.timeslot,
    submittedAt: new Date(Number.isFinite(t) ? t : Date.now()).toISOString(),
  };
}

// 서버가 409(이미 접수됨)와 함께 돌려준 「먼저 접수된 선택」을 화면이 믿어도 되는 값으로 좁힌다.
// 규격 밖(알 수 없는 코드·형태 불량·값 없음)이면 null — 화면은 모를 때 요약을 그리지 않는다.
// 모르는 것을 그럴듯하게 채우면, 접수된 적 없는 내용을 접수됐다고 말하게 된다.
export function parseAccepted(value) {
  const a = value && typeof value === 'object' && !Array.isArray(value) ? value : null;
  if (!a) return null;
  if (!isActivity(a.activity) || !isTimeslot(a.timeslot)) return null;
  return { activity: a.activity, timeslot: a.timeslot };
}

// 로컬 보관 키 — 제출이 접수된 뒤 **그 어르신 단말에** 남는 보조 사본의 자리다(sid 단위).
//
// 정정: 한동안 이 자리의 주석은 "담당자가 확인할 수 있게 한다" 고 적혀 있었다. 그것은 참일 수
// 없다 — localStorage 는 어르신 기기 안에만 있고 담당자는 들여다볼 수 없다. 접수 기록의 원본은
// 서버다(라우트의 구조화 로그). 서술이 코드보다 앞서 있던 세 번째 자리다.
export function storageKey(sid) {
  const s = typeof sid === 'string' ? sid.trim() : '';
  return s ? `dars.eum.senior.${s}` : '';
}

// ── 보조 사본을 **읽는다** ────────────────────────────────────────────────
//
// 고친 결함: 보조 사본은 **쓰기만 하고 아무도 읽지 않았다**. `storageKey` 를 부르는 곳은 쓰는
// 한 줄뿐이었고(SeniorFlow 의 finishSubmitted), 주석이 말한 용도("담당자가 확인")는 성립할 수
// 없는 것이었다. 즉 어르신 기기에는 신청 내용이 남는데 그것으로 하는 일이 하나도 없었다 —
// `issueEumToken`(테스트만 불렀다)·`stats()`(테스트만 읽었다)와 **같은 모양**의 세 번째 자리다.
//
// 그 사본이 메울 수 있는 구멍은 「알려진 한계」에 이미 적혀 있었다 —
//   "진입 화면의 「이미 신청하셨습니다」는 링크가 **아직 살아 있을 때만** 나온다. 소진 기록은
//    토큰 만료와 함께 사라지므로, 만료 뒤 다시 연 사람에게는 만료 안내만 보인다(접수 여부를
//    알 방법이 없어 지어내지 않는다). 그 사람이 새 링크를 받아 다시 신청하면 명단에 두 건이
//    남는다 — 공유 저장소 영속화 [승인 필요] 전에는 닫히지 않는 경로다."
// "접수 여부를 알 방법이 없다" 는 **서버 쪽에서는** 참이지만, 그 기기는 알고 있었다. 그리고 이
// 흐름에서 기기는 늘 같다 — 어르신은 링크를 문자로 받고, 새 링크도 같은 전화로 온다.
// 가장 흔한 중복은 "신청이 됐는지 모르겠어서 한 번 더" 다. 그 사람에게 **전에 낸 내용**을
// 보여 주면 중복을 낼 이유가 사라진다.
//
// 지키는 선
//   - **막지 않는다.** 재신청이 정당한 경우가 있다(담당자가 바꾸라고 새 링크를 보낸 경우).
//     알려 주기만 하고 단추는 늘리지 않는다(버튼 4개 이내 요건도 그대로).
//   - **모르면 말하지 않는다.** 저장소는 누구나 고칠 수 있으므로 화이트리스트(parseAccepted)를
//     거치고, 활동·시간대 둘 다 규격 안일 때만 안내한다. 반쪽짜리 기록으로 "신청하셨습니다" 라고
//     말하면 그 자리에서 거짓이 된다.
//   - 보여 줄 자리는 **확인 화면(3단계)** 이다. 고르는 화면(1·2단계)에 넣으면 375px 에서 선택지가
//     화면 밖으로 밀리고, 중복이 실제로 만들어지는 순간은 「이대로 신청하기」를 누르는 그 순간이다.

// 보조 사본(JSON 문자열) → 먼저 낸 선택. 규격 밖·파손·없음은 모두 null 이다(throw 금지 —
// 저장소에 무엇이 들어 있든 신청 화면이 죽어서는 안 된다).
export function parsePriorLocal(raw) {
  if (typeof raw !== 'string' || !raw) return null;
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  return parseAccepted(data);
}

// 확인 화면에 띄울 한 문장. 보여 줄 것이 없으면 ''(화면은 아무것도 그리지 않는다).
// 조사(「…으로」) 문제를 피해 요약을 문장 중간에 그대로 끼운다 — 시간대 이름이 ')' 나 '요' 로
// 끝나므로 조사를 붙이면 어느 쪽이든 틀린 말이 된다.
export function priorLocalNotice(prior) {
  const s = summaryText(prior ? { activity: prior.activity, timeslot: prior.timeslot } : null);
  if (!s) return '';
  return `이 기기에서 전에 신청하신 내용이 있습니다 — ${s}. 그대로 괜찮으시면 다시 신청하지 않으셔도 됩니다.`;
}
