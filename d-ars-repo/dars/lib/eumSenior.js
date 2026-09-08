// lib/eumSenior.js — 「이음 어르신 신청」 화면 흐름의 순수 로직(React/DOM 비의존 → 단위 테스트 가능)
//
// 배경: 어르신 화면은 **선택지 4개 이내 · 18pt 이상 · 단계 되돌아가기 안전**이 요건이라,
// 단계 계산을 화면 안에 흩어 두면 새로고침·뒤로가기에서 조용히 깨진다(QUALITY_BAR §1).
// 흐름 규칙을 여기에 모아 두고 화면은 그리기만 한다.
//
// 흐름: 1 희망 활동 → 2 희망 시간대 → 3 확인 → 4 완료
//   - `step` 은 URL(?step=n) 로 유지한다 — 콜봇(음성) 안내와 화면 단계가 어긋나지 않게 하기 위해서다.
//   - URL 은 누구나 고칠 수 있으므로 **항상 clampStep 으로 되돌린다**(선택 없이 3단계 진입 금지).

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

// 로컬 보관 키 — 이음 API 실연결 전까지 제출 내용을 브라우저에 남겨 담당자가 확인할 수 있게 한다.
export function storageKey(sid) {
  const s = typeof sid === 'string' ? sid.trim() : '';
  return s ? `dars.eum.senior.${s}` : '';
}
