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

// ── 귀로 들을 때 사라지는 글자 ─────────────────────────────────────────────
//
// 고친 결함: 이 화면의 모든 표시 이름과 요약이 **눈에만 맞춰져 있었다.** 스크린리더는 기호를
// 대개 읽지 않거나(구두점 설정 기본값) 리더마다 다른 이름으로 읽는다 — '·' 는 침묵·"중간점"·
// "점" 으로 갈리고, '~' 와 괄호도 보통 소리가 되지 않는다. 그래서 들리는 말은 이랬다.
//   · 선택지  「오전 (9시~12시)」 → "오전 9시 12시"  (9시인가, 12시인가, 그 사이인가)
//   · 요약    「산책·나들이 · 오전 (9시~12시)」 → "산책 나들이 오전 9시 12시"
//     — **활동과 시간대의 경계가 통째로 사라진다.** 하필 그 문장이 나오는 자리는 확인 화면과
//     완료 화면, 즉 어르신이 「이대로 신청하기」를 누르기 직전과 접수된 내용을 확인하는
//     자리다. 눈으로 보는 어르신에게는 띄어 쓴 '·' 가 경계지만, 활동 이름 **안에도** 같은
//     '·' 가 있어(「산책·나들이」) 보는 쪽에서도 어느 것이 경계인지 알 수 없었다.
// 이것은 8·9회차에 고친 「한쪽 감각에만 전해진 사실」과 같은 모양이다 — 그때는 고른 것(눈)과
// 전송 중(귀)이었고, 이번에는 **무엇을 신청하는가** 그 자체다.
//
// 그래서 경계를 기호가 아니라 **낱말과 구두점**으로 말한다. 기호를 눈용·낭독용 두 벌로 가르는
// 길도 있었지만(aria-hidden + sr-only) 그것은 이 과제가 9회차에 걷어낸 「조용히 갈라지는 것」을
// 다시 만드는 일이다 — 한 사실을 두 곳에서 각자 지으면 언젠가 한쪽만 고쳐진다.
// 아래 목록은 그 재발을 막는 대조의 기준이다(tests/eumsenior.test.mjs).
export const EUM_MUTE_MARKS = ['·', '—', '–', '~', '|', '/', '…', '(', ')'];

// 주어진 글자열에서 묵음 기호를 찾아낸다(없으면 빈 배열). 표시 이름·구분자 검사용 —
// 사람이 눈으로 세지 않도록 테스트가 이 함수로 대조한다.
export function muteMarksIn(text) {
  const s = typeof text === 'string' ? text : '';
  return EUM_MUTE_MARKS.filter((m) => s.includes(m));
}

// 읽을 글자인가(공백도 묵음 기호도 아닌 것).
function readable(text) {
  return [...String(text)].some((ch) => !/\s/.test(ch) && !EUM_MUTE_MARKS.includes(ch));
}

// 묵음 기호 중 **경계로 쓰인 것**만 골라낸다 — 양옆에 읽을 글자가 있는 자리다.
//
// 왜 전부가 아니라 경계만인가: 잃는 것이 있을 때만 결함이다. 문장 끝에 붙은 장식
// (「신청하는 중…」)은 무엇과 무엇을 가르지 않으므로 소리가 되지 않아도 뜻이 그대로다.
// 반대로 양옆에 글자가 있는 기호는 **그 기호가 유일한 경계**이고, 그것이 침묵하면
// 두 사실이 한 덩어리로 들린다(「산책·나들이 · 오전 (9시~12시)」가 그랬다).
export function muteSeparatorsIn(text) {
  const s = typeof text === 'string' ? text : '';
  const found = [];
  for (const m of EUM_MUTE_MARKS) {
    for (let i = s.indexOf(m); i !== -1; i = s.indexOf(m, i + m.length)) {
      if (readable(s.slice(0, i)) && readable(s.slice(i + m.length))) {
        found.push(m);
        break;
      }
    }
  }
  return found;
}

// 선택지는 각 4개 — "한 화면 버튼 4개 이내" 요건의 상한과 같다.
// 표시 이름에는 묵음 기호를 쓰지 않는다(위 참조) — 구간은 「부터…까지」로 말한다.
export const ACTIVITIES = [
  { k: 'walk', label: '산책과 나들이' },
  { k: 'talk', label: '말벗과 이야기' },
  { k: 'health', label: '건강과 운동' },
  { k: 'learn', label: '배움과 교육' },
];

export const TIMESLOTS = [
  { k: 'morning', label: '오전 9시부터 12시까지' },
  { k: 'afternoon', label: '낮 12시부터 3시까지' },
  { k: 'evening', label: '늦은 오후 3시부터 6시까지' },
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

// 활동과 시간대를 가르는 자리. 예전에는 띄어 쓴 '·' 였는데 그것은 **낭독되지 않고**(위
// EUM_MUTE_MARKS) 활동 이름 안에도 같은 글자가 있어 보는 쪽에서도 경계가 아니었다.
// 쉼표는 어떤 리더든 **쉼**으로 바꿔 주고, 어느 표시 이름에도 들어 있지 않다(테스트가 대조한다).
export const EUM_SUMMARY_JOIN = ', ';

// ── 되돌아가기가 실제로 되돌아가는가 ──────────────────────────────────────
//
// 고친 결함: 이 화면의 **유일한 되돌리기 수단**인 「앞 화면으로」·「다시 고르기」는 href 를 가진
// 링크다(버튼 4개 이내 요건 때문에 링크로 두었고, 주소에는 고른 것이 실려 있어 자바스크립트
// 없이 눌러도 제 자리로 간다). 그런데 onClick 이 **조건 없이** `preventDefault()` 를 하고
// `history.back()` 을 불렀다. 그래서 두 자리에서 깨졌다.
//
//   ① **되돌아갈 항목이 없으면 아무 일도 일어나지 않는다.** `history.back()` 은 히스토리
//      맨 앞에서 부르면 **던지지 않고 조용히 아무것도 하지 않는다** — 그래서 try/catch 의
//      폴백(setStep)은 애초에 돌 일이 없었다. 단계를 주소에서 복원할 때 쓰는 것은
//      `replaceState`(항목을 쌓지 않는다)이므로, 문서가 `?step=2` 로 **직접 열린** 경우
//      (문자 앱이 새 탭으로 열고 탭이 세션 히스토리 없이 되살아난 경우)가 바로 그 상태다.
//      href 는 멀쩡한데 preventDefault 가 그 길을 막아, 눌러도 꼼짝하지 않는 단추가 된다.
//      **자바스크립트 없이 동작하던 링크를, 자바스크립트가 아무것도 하지 않는 단추로 바꿔
//      놓고 있었다.**
//   ② **두 번 눌리면 신청 화면 밖으로 나간다.** `history.back()` 은 즉시 돌아오지 않고
//      traversal 이 큐에 들어간다 — 손이 떨려 같은 자리를 두 번 누르면(이 사용자층에서
//      흔한 일이고, 제출 쪽은 이미 `submittingRef` 로 막아 둔 경우다) -1 이 두 번 쌓여
//      앞 단계를 지나쳐 **문서 밖**으로 나간다. 링크는 문자 안에 있고 수명은 5분이라,
//      한 번 나가면 돌아오는 길을 스스로 찾지 못한다(경계 화면에서 「대시보드」 단추를
//      없앤 것과 같은 이유다).
//
// 고침의 핵심은 **지금 어디인지 알고 나서 가로채는 것**이다. 우리가 쌓은 항목에만 깊이를
// 적어 두고(stepState), 그 깊이가 0(=복원으로 만든 뿌리 항목)이면 가로채지 않는다 —
// 링크가 제 일을 한다. 같은 깊이에서 두 번째 누름은 삼킨다.
export const EUM_HISTORY_ROOT = 0;

// history.pushState/replaceState 에 싣는 상태. `step` 외에 **깊이**를 함께 적는다 —
// 이것이 "이 항목은 우리가 쌓은 것인가, 복원으로 생긴 뿌리인가" 를 말해 주는 유일한 단서다.
export function stepState(step, depth) {
  const d = Number.isInteger(depth) && depth > EUM_HISTORY_ROOT ? depth : EUM_HISTORY_ROOT;
  return { step: parseStep(step), depth: d };
}

// history.state 에서 깊이를 읽는다. 우리가 적은 값이 아니면(null·다른 페이지의 상태·형식 불량)
// 뿌리로 본다 — 모를 때는 가로채지 않는 쪽이 안전하다(링크는 언제나 제 일을 할 수 있다).
export function historyDepth(state) {
  const d = state && typeof state === 'object' && !Array.isArray(state) ? state.depth : undefined;
  return Number.isInteger(d) && d > EUM_HISTORY_ROOT ? d : EUM_HISTORY_ROOT;
}

// 다음 항목의 깊이(한 칸 더 쌓는다).
export function nextDepth(state) {
  return historyDepth(state) + 1;
}

// ── 떠나는 화면의 주소도 거기서 고른 것을 안다 ────────────────────────────
//
// 고친 결함: 고른 것은 **다음 항목**의 주소에만 실렸다. 1단계에서 활동을 고르면 그 값은
// `pushState` 로 쌓는 2단계 항목의 주소(`?step=2&a=walk`)에만 적히고, 방금 떠난 1단계 항목의
// 주소는 `?step=1` 그대로였다 — **그 화면에서 고른 것을 그 화면의 주소는 모른다.**
// 그래서 되돌아오면 주소가 아무것도 모르는 상태를 되살린다.
//   · 2단계에서 「앞 화면으로」 → 1단계 항목(`?step=1`)으로 돌아가고 `popstate` 가 주소를
//     읽으므로 고른 활동이 **빈 값**이 된다. 11회차가 「고른 것이 눈에도 보이게」 넣은 ✓ 표시는
//     하필 그 회차가 지목한 바로 그 경로(「2단계에서 앞 화면으로를 눌러 1단계로 돌아갔을 때」)
//     에서 **한 번도 보이지 않았다**. 고친 것이 보이지 않는 자리에 있었던 셈이다.
//   · 3단계에서 「다시 고르기」 → 2단계 항목(`?step=2&a=walk`)에는 시간대가 없으므로, 방금
//     고른 시간대가 지워진 채 네 선택지가 처음처럼 나온다. 어르신에게는 "아까 뭘 골랐는지"
//     를 화면이 더 이상 말해 주지 않는 것이고, 기억에 의지해 다시 고르는 사이 5분이 준다.
//   · 같은 단추가 가로채이지 않은 경우(히스토리 뿌리 — `backAction` 의 'follow')에는 href 에
//     고른 것이 실려 있어 **남는다**. 즉 같은 단추가 경로에 따라 다르게 동작했다.
// 6회차가 "고른 것을 주소에 남긴다" 로 고친 것은 **쌓는 쪽**뿐이었고, 떠나는 항목은 그대로였다.
//
// 그래서 단계를 옮길 때 **지금 항목의 주소**도 그 자리에서 고른 것으로 고쳐 쓴다
// (`replaceState` — 항목을 쌓지 않으므로 되돌아가기 판정(깊이)은 그대로다).
// 어느 단계의 항목인지는 그 항목에 적힌 `step` 만 믿는다 — 모르면 고치지 않는다(아래).

// 히스토리 항목에 적힌 단계. 우리가 적은 값이 아니면(null·다른 페이지의 상태·형식 불량) 0 이고,
// 그때 호출측은 그 항목의 주소를 **건드리지 않는다** — 어느 화면의 항목인지 모르면서 주소를
// 고쳐 쓰면 주소가 화면을 더 심하게 잘못 설명한다(historyDepth 의 "모를 때는 가로채지 않는다"와
// 같은 쪽으로 기운다).
export function historyStep(state) {
  const s = state && typeof state === 'object' && !Array.isArray(state) ? state.step : undefined;
  if (!Number.isInteger(s) || s < EUM_STEP_MIN || s > EUM_STEP_MAX) return 0;
  return s;
}

// 되돌아가기 한 번의 판정. 상태(깊이)와 「이 자리에서 이미 요청했는가」만 보고 정한다.
//   'follow' — 가로채지 않는다. 링크의 href 가 같은 자리로 데려간다(고른 것은 주소에 있다).
//   'ignore' — 가로채고 **아무것도 하지 않는다**(같은 자리에서 두 번째 누름).
//   'back'   — 가로채고 history.back() 을 부른다.
export function backAction(state, pendingDepth) {
  const depth = historyDepth(state);
  if (depth <= EUM_HISTORY_ROOT) return 'follow';
  if (Number.isInteger(pendingDepth) && pendingDepth === depth) return 'ignore';
  return 'back';
}

// ── 안내는 자기 단계에만 머문다 ───────────────────────────────────────────
//
// 고친 결함: 제출 실패 안내가 **글자열 하나**로만 들려 있었다(`useState('')`). 그 값을 비우는
// 곳은 다음 제출의 첫 줄뿐이고, 단계를 옮기는 길(`go`·`popstate`·되돌아가기)은 어느 쪽도
// 비우지 않는다. 그래서 안내가 **자기 화면을 떠나 다른 화면까지 따라다녔다.**
//   · 확인 화면에서 제출이 실패해 「연결이 원활하지 않습니다. 아래 단추를 한 번 더 눌러
//     주세요」가 뜬다. 어르신이 「다시 고르기」를 누르면 **고르는 화면(2단계)** 으로 가는데,
//     그 빨간 안내가 네 선택지 위에 그대로 남는다 — 거기서 「아래 단추」는 **선택지 버튼**이다.
//     안내대로 누른 어르신은 재시도가 아니라 다음 화면으로 넘어가고, 무엇이 됐는지 알 수 없다.
//   · 401 안내(「링크가 올바르지 않습니다. 담당자에게 다시 요청해 주세요」)는 더 나쁘다 —
//     고르는 화면 위에 얹혀, 아직 멀쩡히 고르고 있는 어르신에게 링크가 죽었다고 말한다.
//   · 같은 되돌아가기가 **가로채이지 않은 경우**(히스토리 뿌리 — `backAction` 의 'follow')에는
//     전체 이동이라 안내가 사라진다. 즉 같은 단추가 어떤 경로를 타느냐에 따라 다르게 보였다.
//
// 그래서 안내에 **그것이 속한 단계**를 함께 적는다. 자리를 잊지 않도록 비우는 쪽이 아니라
// **적는 쪽**으로 고친 이유는, 비우는 길이 늘어날 때마다 한 곳을 빠뜨리면 결함이 그대로
// 돌아오기 때문이다(기본값을 두지 않는 EUM_NOTICE_FOOT·EUM_PRIOR_TAIL 과 같은 계약).
// ── 그리고 그 화면의 **그 방문**에만 머문다 ────────────────────────────────
//
// 고친 결함: 안내에 적힌 것이 **단계뿐**이었다. 그런데 단계는 같은 번호로 몇 번이고 되돌아오는
// 자리다 — 확인 화면(3단계)에서 제출이 실패해 안내가 뜬 뒤 「다시 고르기」로 2단계에 가면
// 안내는 사라지지만(단계가 다르다), 시간대를 다시 골라 3단계로 돌아오면 **조금 전의 그 안내가
// 다시 뜬다**. 어르신이 보는 것은 아직 아무것도 누르지 않았는데 빨간 안내가 이미 떠 있는
// 화면이고, 「한 번 더 눌러 주세요」는 **누른 적 없는 누름**을 가리킨다. 지금 문장들은 그
// 자리에서도 참이라(연결·한도·링크) 거짓을 말하지는 않지만, 「방금 일어난 일」이 아닌 것을
// 말하는 것은 바로 위 결함에서 끊으려던 성질 그 자체다 — 고침이 **절반**이었던 셈이다.
//   하필 그 경로가 가장 흔하다: 실패를 본 어르신이 가장 먼저 누르는 것이 되돌아가기이고,
//   되돌아가면 다시 고르고, 다시 고르면 확인 화면으로 온다.
//
// 그래서 **방문 번호**를 함께 적는다. 단계를 옮기는 자리가 그 번호를 한 칸 올리고(화면은
// enterStep 한 곳에서만 단계를 바꾼다 — 소스 순서 대조가 그것을 고정한다), 그리는 쪽은
// 단계와 방문이 **둘 다** 맞을 때만 그린다. 여기서도 비우는 쪽이 아니라 **적는 쪽**으로
// 고치는 이유는 같다: 비우는 길은 늘어나고, 한 곳을 빠뜨리는 날 결함이 그대로 돌아온다.
export const EUM_VISIT_MIN = 0;

// 방문 번호를 규격 안의 값으로 좁힌다. 정수가 아니거나 음수면 첫 방문으로 본다.
export function visitNo(value) {
  return Number.isInteger(value) && value >= EUM_VISIT_MIN ? value : EUM_VISIT_MIN;
}

export function stepError(step, text, visit) {
  const t = typeof text === 'string' ? text.trim() : '';
  if (!t) return null;
  return { step: parseStep(step), visit: visitNo(visit), text: t };
}

// 지금 그릴 안내 문구. 다른 단계·다른 방문의 것이거나 형식이 다르면 ''(화면은 아무것도
// 그리지 않는다). 방문 번호가 **적혀 있지 않은** 안내도 그리지 않는다 — 어느 방문의 것인지
// 모르는 안내를 그리면 이 함수가 막아야 하는 결과(따라다니는 안내)가 그대로 돌아온다.
export function errorFor(error, step, visit) {
  const e = error && typeof error === 'object' && !Array.isArray(error) ? error : null;
  if (!e || typeof e.text !== 'string' || !e.text) return '';
  if (!Number.isInteger(e.visit)) return '';
  return e.step === parseStep(step) && e.visit === visitNo(visit) ? e.text : '';
}

// 확인 화면에 읽어 줄 한 줄 요약(보이는 글자와 낭독되는 글자가 **같은 한 벌**이다 —
// 눈용·낭독용으로 가르면 한 사실을 두 곳에서 짓게 된다).
export function summaryText(draft) {
  const a = labelOf(ACTIVITIES, draft?.activity);
  const t = labelOf(TIMESLOTS, draft?.timeslot);
  if (!a || !t) return '';
  return `${a}${EUM_SUMMARY_JOIN}${t}`;
}

// ── 제출이 막히는 이유는 하나가 아니다 ────────────────────────────────────
//
// 고친 결함: 제출 직전 판정이 `buildPreferences(…) === null` 하나였고, 화면은 그것을 전부
// 「선택이 저장되지 않았습니다. 처음부터 다시 골라 주세요」로 안내하며 1단계로 되돌렸다.
// 그런데 막히는 이유는 **둘**이고 어르신이 할 수 있는 일이 서로 다르다.
//   · 고른 것이 규격 밖이다 → 다시 고르면 **된다**. 안내가 맞다.
//   · 링크에 식별자(sid)가 없다 → 몇 번을 다시 골라도 같은 자리에서 막힌다. 되돌릴 길은
//     고르기가 아니라 **담당자에게 새 링크를 청하는 것**인데, 화면은 끝없이 처음으로
//     돌려보내며 되지 않는 일을 시키고 그 사이 5분이 준다. 「알려진 한계」와 같은 모양으로,
//     멀쩡해 보이는 화면이 영영 통하지 않는 길을 가리키던 자리다.
// 그래서 **왜 막혔는지**를 돌려주고 화면이 그에 맞게 말하게 한다.
//   'link'      — 링크 쪽 문제(sid 없음). 잘못된 링크와 같은 문장을 쓴다(401 과 같은 자리).
//   'selection' — 고른 것 쪽 문제. 되돌릴 길은 처음부터 다시 고르기다.
//   null        — 막을 이유 없음.
export function submitBlock(draft) {
  const sid = typeof draft?.sid === 'string' ? draft.sid.trim() : '';
  if (!sid) return 'link';
  if (!isActivity(draft?.activity) || !isTimeslot(draft?.timeslot)) return 'selection';
  return null;
}

// 이음에 보낼 본문. 개인정보는 담지 않는다(sid 는 이음 측 식별자).
// 규격 밖이면 null — 화면은 제출 버튼을 막고, 라우트는 400 을 낸다.
// 판정은 위 submitBlock 한 곳에서만 한다(둘이 갈라지면 화면이 「막혔다」와 「왜 막혔다」를
// 서로 다른 잣대로 말하게 되고, 그때 안내는 일어나지 않은 일을 가리킨다).
export function buildPreferences(draft, now = Date.now()) {
  if (submitBlock(draft)) return null;
  const sid = draft.sid.trim();
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
//   - 보여 줄 자리는 **확인 화면(3단계)** 과 **만료 화면**이다. 고르는 화면(1·2단계)에 넣으면
//     375px 에서 선택지가 화면 밖으로 밀리고, 중복이 실제로 만들어지는 순간은 「이대로
//     신청하기」를 누르는 그 순간이다. 만료 화면을 뒤늦게 더한 이유는 아래 EUM_PRIOR_TAIL 참조.

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

// ── 같은 사실, 자리마다 다른 「다음에 할 일」 ──────────────────────────────
//
// 이 안내가 처음 들어간 자리는 확인 화면(3단계) 하나였고, 끝 문장은 「다시 신청하지 않으셔도
// 됩니다」 하나로 박혀 있었다. 그런데 **만료 화면**에서도 같은 사실을 말해야 한다는 것이
// 드러났다 — 「알려진 한계」가 적어 둔 대로, 신청을 이미 마친 어르신이 링크가 죽은 뒤 다시
// 열면 소진 기록은 토큰과 함께 사라져 **서버는 전에 신청했는지 답할 수 없다**. 그 화면은
// 만료 안내만 하고 끝나므로, 어르신은 담당자에게 새 링크를 청하고 처음부터 다시 고른다.
// 중복 접수 자체는 확인 화면의 안내가 막지만(새 링크로 들어와도 사본은 같은 기기에 있다),
// **헛수고**는 그대로 남는다 — 5분 링크를 다시 받아 네 화면을 또 걷고 나서야 같은 말을 듣는다.
// 그 기기는 처음부터 답을 알고 있었다.
//
// 그런데 그 자리에서 할 수 있는 말은 확인 화면과 다르다. 확인 화면에서는 「이대로 신청하기」를
// 누르지 않으면 되지만, 만료 화면에는 누를 것이 없다 — 하지 않아도 되는 일은 **담당자에게
// 새 링크를 청하는 것**이다. 그래서 끝 문장을 상황별 등록부로 두고 **호출마다 적게 한다**.
// 기본값을 두지 않는 이유는 직전 회차의 EUM_NOTICE_FOOT 과 같다: 기본값은 아무도 적지 않아도
// 조용히 붙고, 틀린 자리에 붙어도 아무 신호를 내지 않는다. 모르는 자리 이름을 넘기면
// **아무 말도 하지 않는다**(틀린 말을 조용히 하지 않는다 · tests 가 등록부 ↔ 호출 자리를
// 양방향으로 대조한다).
export const EUM_PRIOR_TAIL = {
  // 확인 화면(3단계) — 중복이 실제로 만들어지는 순간이 바로 다음 한 번의 누름이다.
  confirm: '그대로 괜찮으시면 다시 신청하지 않으셔도 됩니다.',
  // 만료 화면 — 이 링크로는 누를 것이 없다. 하지 않아도 되는 일은 새 링크를 청하는 것이다.
  expired: '그대로 괜찮으시면 담당자에게 새 링크를 청하지 않으셔도 됩니다.',
};

// 「아는 사실」과 「전에 낸 내용」 사이를 가르는 자리. 예전에는 줄표(' — ')였는데 그것도
// 낭독되지 않아(EUM_MUTE_MARKS) 세 토막이 한 문장으로 들러붙었다 — "내용이 있습니다 산책
// 나들이 오전 9시 12시 그대로 괜찮으시면". 마침표는 어떤 리더든 **문장 끝**으로 읽는다.
export const EUM_PRIOR_JOIN = '. ';

// 화면에 띄울 한 문장. 보여 줄 것이 없거나 자리 이름을 모르면 ''(화면은 아무것도 그리지 않는다).
// 조사(「…으로」) 문제를 피해 요약을 문장 중간에 그대로 끼운다 — 시간대 이름이 '지' 나 '요' 로
// 끝나므로 조사를 붙이면 어느 쪽이든 틀린 말이 된다.
export function priorLocalNotice(prior, where) {
  // 등록부에 **실제로 적힌 문장**일 때만 쓴다. `EUM_PRIOR_TAIL[where]` 를 그대로 믿으면
  // 'constructor'·'__proto__' 같은 이름이 프로토타입의 값을 끌어와 참처럼 보인다.
  const tail = typeof EUM_PRIOR_TAIL[where] === 'string' ? EUM_PRIOR_TAIL[where] : '';
  const s = summaryText(prior ? { activity: prior.activity, timeslot: prior.timeslot } : null);
  if (!s || !tail) return '';
  return `이 기기에서 전에 신청하신 내용이 있습니다${EUM_PRIOR_JOIN}${s}. ${tail}`;
}

// ── 되살아난 화면이 「방금 다시 시도를 눌렀다」를 안다 ──────────────────────
//
// 고친 결함: 오류 경계(app/eum/error.jsx)의 「다시 시도」는 누르는 순간 **자기 자신이 사라지는**
// 단추다 — `reset()` 이 그 화면을 걷어내고 신청 흐름을 되살린다. 그러면 포커스가 얹혀 있던 그
// 단추가 문서에서 사라지므로 브라우저는 포커스를 body 로 돌려보낸다. 11·12·13회차가 세 번 고친
// 바로 그 모양인데(흐름 → 만료 패널 · 흐름 → 오류 경계 · 새로 태어난 낭독 영역), **경계에서
// 나오는 길**만 손대지 않은 채 남아 있었다. 되살아난 흐름은 첫 렌더에서 포커스를 옮기지
// 않는데(SeniorFlow), 그 규칙의 근거가 "사용자가 아직 아무 조작도 하지 않았다" 인데 이 경우엔
// **조작해서 온 것**이다. 그래서 어르신은 눌렀는데 들리는 말이 한 마디도 없고, 다음 Tab 은
// 문서 맨 앞에서 시작한다 — 그 화면은 이 흐름의 유일한 되돌리기 수단이었다.
//
// 두 화면은 서로를 모른다(경계는 무엇이 되살아날지 알 수 없고, 흐름은 자기가 왜 다시 그려졌는지
// 알 수 없다). 그래서 사실 하나를 **문서에** 적어 넘긴다.
//   · 모듈 변수로 넘기지 않는다 — 두 화면은 서로 다른 번들 엔트리에 실릴 수 있고, 같은 파일이
//     두 번 평가되면 변수도 두 벌이 된다(12회차에 소진 스토어가 바로 그 길로 갈라졌다).
//   · 저장소(localStorage·sessionStorage)에 넣지 않는다 — 그것들은 문서를 넘겨 살아남으므로,
//     다음에 링크를 여는 어르신이 **누른 적 없는 누름**의 뒤처리를 받는다.
//   문서 뿌리의 속성은 이 문서 안에서만 살고(새로 열면 없다) 번들 경계와 무관하다.
// 판정은 여기 두고(순수 · 단위 테스트) 화면은 `document.documentElement` 만 넘긴다 —
// 이 모듈은 DOM 을 import 하지 않는다(서버 라우트도 같은 파일을 쓴다).
export const EUM_RETRY_FLAG = 'data-eum-retried';

// 적는다. 적지 못해도 **던지지 않는다** — 이 한 줄이 「다시 시도」를 죽이면 안 된다
// (잃는 것은 포커스 이동 하나이고, 얻는 것이 신청 자체다).
export function markRetried(root) {
  try {
    if (!root || typeof root.setAttribute !== 'function') return false;
    root.setAttribute(EUM_RETRY_FLAG, '1');
    return true;
  } catch {
    return false;
  }
}

// 읽고 **지운다** — 한 번만 쓰이는 사실이다. 지우지 않으면 같은 문서에서 흐름이 다시
// 그려질 때마다 누른 적 없는 누름을 근거로 포커스를 빼앗는다.
export function takeRetried(root) {
  try {
    if (!root || typeof root.getAttribute !== 'function') return false;
    if (root.getAttribute(EUM_RETRY_FLAG) === null) return false;
    if (typeof root.removeAttribute === 'function') root.removeAttribute(EUM_RETRY_FLAG);
    return true;
  } catch {
    return false;
  }
}
