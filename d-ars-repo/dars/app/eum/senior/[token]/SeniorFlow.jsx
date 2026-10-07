"use client";

// app/eum/senior/[token]/SeniorFlow.jsx — 어르신 신청 4단계 흐름(클라이언트)
//
// 흐름: 1 희망 활동 → 2 희망 시간대 → 3 확인 → 4 완료 (lib/eumSenior.js 가 단계 규칙의 단일 출처)
//
// 설계 메모
//  - `step` 을 URL(?step=n)에 유지한다 — 콜봇(음성)과 화면이 어긋나지 않게 하기 위한 요건.
//    다만 단계 이동에 Next 라우팅을 쓰면 서버 컴포넌트가 다시 그려지며 선택이 날아가므로,
//    history.pushState 로 주소만 바꾸고 상태는 이 컴포넌트가 들고 있는다(뒤로가기 = popstate).
//  - **고른 것도 주소에 함께 둔다**(?a=·?t= · lib/eumSenior.stepQuery). 예전에는 단계만
//    주소에 있고 선택은 이 컴포넌트의 메모리뿐이라, 화면이 한 번 다시 그려지면 고른 것이
//    전부 사라지고 1단계로 돌아갔다. 문자를 다시 보려고 앱을 바꿨다 돌아오는 것만으로도
//    모바일 브라우저는 탭을 다시 불러온다 — 링크 수명은 5분이고, 두어 번이면 링크가 먼저
//    죽는다(lib/eumSenior.js 의 「고른 것을 주소에 남긴다」 참조).
//  - 주소가 손으로 고쳐져 ?step=3 으로 들어와도 clampStep 이 **그 주소에 실린 선택만큼**으로
//    되돌린다. 완료(done)는 주소에 싣지 않으므로 주소로는 완료 화면을 만들 수 없다.
//  - 한 화면 버튼 4개 이내: 선택지 4개인 화면에는 버튼을 더 두지 않고, 되돌아가기는 **링크**로 둔다
//    (href 가 있어 자바스크립트 없이도 동작하고, 눌렀을 때는 히스토리 뒤로가 선택을 보존한다).
//    가로채기는 **조건부**다 — 되돌아갈 항목이 있을 때만 preventDefault 한다(back 참조).
//    그러지 않으면 자바스크립트가 멀쩡한 href 를 막고 아무 일도 하지 않는 단추가 된다.
//  - 남은 시간은 서버가 준 **기간**을 받아 기기 안에서의 **경과**로만 센다(lib/eumCountdown.js).
//    예전에는 절대 만료시각을 받아 `Date.now()` 와 비교했는데, 그러면 기기 시계가 앞선 어르신은
//    멀쩡한 링크에서도 곧바로 만료 화면을 보고, 재발급을 받아도 같은 일이 되풀이됐다.
//  - 제출은 **서버(POST /api/eum/senior/preferences)가 판정**한다. 예전에는 이 화면이 혼자
//    localStorage 에 쓰고 성공이라 말했는데, 그러면 담당자는 신청을 볼 수 없고 같은 링크로
//    몇 번이고 다시 신청할 수 있었다. 이제 1회용 판정·토큰 재검증은 서버가 하고, 로컬 저장은
//    어르신 단말에 남는 **보조 사본**일 뿐이다. 이음 API 실전송은 여전히 **[승인 필요]**.

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ACTIVITIES,
  TIMESLOTS,
  STEP_TITLE,
  clampStep,
  parseStep,
  summaryText,
  buildPreferences,
  parseAccepted,
  parseDraft,
  normalizeDraft,
  stepQuery,
  storageKey,
  stepState,
  nextDepth,
  historyDepth,
  backAction,
  stepError,
  errorFor,
  EUM_HISTORY_ROOT,
} from '@/lib/eumSenior';
import {
  EUM_SOON_MESSAGE,
  elapsedSince,
  initialLeftMs,
  isExpired,
  isSoon,
  leftAfter,
  nowTick,
  secondsLeft,
} from '@/lib/eumCountdown';
import { EUM_CONSUME_CHANGE_HINT, EUM_CONSUME_UNKNOWN_HINT } from '@/lib/eumConsume';
// 문구는 `lib/eumMessage` 에서 가져온다. 예전에는 이 파일이 만료·401 안내를 **손으로 적고**
// 있었다(401 쪽은 마침표가 하나 더 붙은 두 번째 판본이었다) — `lib/eumToken` 을 import 할 수
// 없다는 것이(서명 비밀·HMAC 이 브라우저 번들로 따라온다) 사본을 두는 이유가 되지는 않는다.
// 제출 실패 안내도 같은 자리에서 가져온다 — 예전에는 이 파일이 다섯 문장을 손으로 적었고,
// 그중 둘이 「아래 단추를…」로 **자리를 가리키고** 있었다(그 자리를 밀어낸 것이 그 안내
// 자신이었다 · ui.jsx 의 Alert 참조).
// 완료 화면의 두 문장도 같은 자리에서 가져온다 — 예전에는 이 파일이 손으로 적었고, 같은
// 사실(「이미 접수됐다」)을 보여 주는 **진입 안내**는 거기서 「담당자에게 문의해 주세요」라고
// 말했다. 할 일이 없는 사람을 담당자에게 보내면 새 링크가 오고, 명단에 두 건이 남는다
// (lib/eumMessage.js 의 EUM_DONE_MESSAGE 참조).
import { EUM_DONE_MESSAGE, submitMessage, tokenMessage } from '@/lib/eumMessage';
import { fetchOnce } from '@/lib/fetchJson';
import { S, Notice, Alert, EumStyles, EUM_SCOPE, EUM_CHOICE_MARK, EUM_NOTICE_FOOT } from './ui.jsx';
import PriorLocal from './PriorLocal.jsx';

// 주소에서 단계와 선택을 함께 읽는다(뒤로가기·앞으로가기). 읽지 못하면 첫 화면·빈 선택 —
// 여기서 던지면 뒤로가기 한 번에 신청 화면이 통째로 죽는다.
function readLocation() {
  try {
    const q = new URLSearchParams(window.location.search);
    return { step: parseStep(q.get('step')), ...parseDraft(q) };
  } catch {
    return { step: 1, activity: '', timeslot: '' };
  }
}

export default function SeniorFlow({
  sid,
  token = '',
  initialStep = 1,
  initialDraft = null,
  remainingMs = 0,
}) {
  // 첫 값은 **주소에서 복원한 선택**이다. 규격 밖 값은 normalizeDraft 가 빈 값으로 떨어뜨리고,
  // 그러면 clampStep 이 단계도 함께 앞으로 되돌린다(주소를 손으로 고쳐도 건너뛸 수 없다).
  const [restored] = useState(() => normalizeDraft(initialDraft));
  const [activity, setActivity] = useState(restored.activity);
  const [timeslot, setTimeslot] = useState(restored.timeslot);
  const [done, setDone] = useState(false);
  // 첫 렌더부터 복원한 단계로 그린다. 1 로 두고 효과에서 고치면 되살아난 탭이 첫 화면을
  // 한 번 깜빡인 뒤 넘어가, 어르신에게는 "또 처음으로 갔다" 로 보인다.
  const [step, setStep] = useState(() => clampStep(initialStep, { ...restored, done: false }));
  const [busy, setBusy] = useState(false);
  // 안내는 글자열이 아니라 **그것이 속한 단계와 함께** 들고 있는다(lib/eumSenior.stepError).
  // 예전에는 글자열 하나였고, 비우는 곳이 다음 제출의 첫 줄뿐이라 안내가 자기 화면을 떠나
  // 고르는 화면까지 따라다녔다 — 그 화면에서 「아래 단추」는 선택지 버튼이다.
  const [error, setError] = useState(null);
  // 서버가 판정한 남은 기간과, 그것을 받은 시점의 단조 눈금. 둘의 차이로만 남은 시간을 센다.
  const [initialLeft] = useState(() => initialLeftMs(remainingMs));
  const [baseTick] = useState(() => nowTick());
  const [left, setLeft] = useState(initialLeft);
  // 서버가 만료라고 판정한 경우 — 화면은 전송 지연만큼 너그럽게 세므로 아직 유효해 보일 수 있다.
  // 어긋나면 **서버 쪽이 맞다**(최종 판정자).
  const [expiredByServer, setExpiredByServer] = useState(false);
  // 이 링크로는 **이미 접수된 신청이 있다**(409). 완료 화면의 문구와 요약이 달라진다.
  const [already, setAlready] = useState(false);
  // 그때 실제로 접수된 선택. 서버가 알려 주지 못하면 null 이고, 화면은 요약을 그리지 않는다.
  const [accepted, setAccepted] = useState(null);
  const draftRef = useRef({ activity: '', timeslot: '', done: false });
  draftRef.current = { activity, timeslot, done, sid };
  const headingRef = useRef(null);
  // 만료 안내 패널의 제목. 흐름과 패널은 서로 다른 트리라 같은 ref 를 쓸 수 없다.
  const expiredHeadingRef = useRef(null);
  const mountedRef = useRef(false);
  // 제출이 떠 있는 동안인가. 상태(busy)와 달리 **그 자리에서** 바뀌므로 중복 누름을 막는 데 쓴다.
  const submittingRef = useRef(false);
  // 되돌아가기를 이미 요청한 히스토리 깊이. `history.back()` 은 즉시 돌아오지 않으므로(큐),
  // 이것이 없으면 같은 자리의 두 번째 누름이 -1 을 한 번 더 쌓아 **문서 밖**으로 나간다.
  // 되돌아간 뒤(popstate)와 새로 쌓은 뒤(go)에 비운다.
  const backFromRef = useRef(null);

  // 단계가 바뀌면 제목으로 포커스를 옮긴다.
  // 이유: 이 화면은 주소만 바뀌고 문서는 그대로라, 스크린리더 사용자는 화면이 넘어간 것을 모른 채
  // 이전 위치에 남는다. 제목(tabIndex=-1)에 포커스를 주면 새 제목이 낭독되고 이어지는 Tab 이
  // 새 선택지에서 시작한다. 첫 렌더에는 옮기지 않는다 — 사용자가 아직 아무 조작도 하지 않았다.
  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      return;
    }
    try {
      headingRef.current?.focus();
    } catch {
      /* 포커스 불가 환경 — 화면 동작에는 영향 없다 */
    }
  }, [step]);

  // 주소를 실제 도달 가능한 단계로 맞춘다(?step=3 직접 입력·탭 복원 대비).
  // 기준은 **주소에서 복원한 선택**이다 — 예전에는 빈 선택으로 계산해, 주소에 고른 것이
  // 그대로 실려 있어도 무조건 1단계로 떨어뜨렸다.
  useEffect(() => {
    const want = clampStep(initialStep, { ...restored, done: false });
    setStep(want);
    try {
      // 이 항목은 **복원으로 생긴 뿌리**다 — 깊이 0. replaceState 는 항목을 쌓지 않으므로
      // 여기서 history.back() 을 불러도 갈 곳이 없다. 그 사실을 상태에 적어 두어야
      // 되돌아가기 링크가 가로채기 대신 **자기 href 를 따라갈 수 있다**(back 참조).
      const root = stepState(want, EUM_HISTORY_ROOT);
      window.history.replaceState(root, '', stepQuery(want, restored));
    } catch {
      /* 히스토리 조작 불가 환경(구형 브라우저) — 화면 동작에는 영향 없다 */
    }
  }, [initialStep, restored]);

  // 뒤로가기/앞으로가기 → 주소의 단계와 선택을 함께 되살린다.
  useEffect(() => {
    function onPop() {
      // 요청한 되돌아가기가 도착했다 — 다음 누름은 다시 받는다.
      backFromRef.current = null;
      // 제출이 끝난 뒤에는 주소가 어디를 가리키든 완료 화면에 머문다(중복 제출 방지).
      // 이때 선택을 주소에서 다시 읽으면 안 된다 — 히스토리 앞쪽 항목에는 아직 고르기 전의
      // 주소(?step=1)가 들어 있어, 방금 접수된 내용을 그린 요약이 빈 칸으로 덮인다.
      if (draftRef.current.done) {
        setStep(4);
        return;
      }
      const at = readLocation();
      setActivity(at.activity);
      setTimeslot(at.timeslot);
      setStep(clampStep(at.step, { ...at, done: false }));
    }
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  // 남은 시간(1초 간격). 제출이 끝났으면 더 세지 않는다 — 완료 화면이 만료로 덮이지 않게.
  useEffect(() => {
    if (initialLeft === null || done) return undefined;
    const id = setInterval(() => {
      setLeft(leftAfter(initialLeft, elapsedSince(baseTick)));
    }, 1000);
    return () => clearInterval(id);
  }, [initialLeft, baseTick, done]);

  // 화면이 스스로 만료를 선언하는 조건(판정 근거는 아래 이른 return 의 주석). 거기서 구하지
  // 않고 여기 둔 이유는, 그 전환에서 포커스를 옮기는 아래 효과가 **훅이라 조건 뒤에 둘 수
  // 없기** 때문이다.
  const expiredNow = !done && !busy && (expiredByServer || isExpired(left));

  // 흐름 → 만료 안내로 **화면이 통째로 뒤집히는** 순간. 포커스가 얹혀 있던 요소(선택지·주버튼)가
  // 그 순간 문서에서 사라지므로 브라우저는 포커스를 body 로 돌려보낸다. 그러면 바뀐 화면이
  // 낭독되지 않고(새로 태어난 role="status" 는 리더가 변화로 보지 않는 경우가 많다) 다음 Tab 이
  // 문서 맨 앞에서 시작한다 — 이 패널에는 조작 요소가 없어 Tab 이 브라우저 바깥으로 빠진다.
  // 단계 전환과 **같은 방식**으로 새 제목에 포커스를 준다(ui.jsx 의 Notice headingRef 참조).
  useEffect(() => {
    if (!expiredNow) return;
    try {
      expiredHeadingRef.current?.focus();
    } catch {
      /* 포커스 불가 환경 — 화면 동작에는 영향 없다 */
    }
  }, [expiredNow]);

  // draft 는 **이동 직후의 실제 선택 상태**여야 한다 — 단계를 자르는 기준이면서 동시에
  // 주소에 적히는 값이기 때문이다. 둘이 어긋나면 주소가 화면을 설명하지 못한다.
  // clampStep 은 올리지 않고 자르기만 하므로, 실제 선택을 그대로 넘겨도 단계는 넘어가지 않는다.
  const go = useCallback((next, draft) => {
    const d = draft || draftRef.current;
    const want = clampStep(next, d);
    setStep(want);
    backFromRef.current = null;
    try {
      // 쌓는 항목에는 **깊이**를 한 칸 더 적는다 — 되돌아가기가 "여기서 뒤로 갈 곳이 있는가" 를
      // 알 수 있는 유일한 단서다(lib/eumSenior 의 「되돌아가기가 실제로 되돌아가는가」).
      const entry = stepState(want, nextDepth(window.history.state));
      window.history.pushState(entry, '', stepQuery(want, d));
    } catch {
      /* noop */
    }
  }, []);

  function chooseActivity(k) {
    setActivity(k);
    go(2, { activity: k, timeslot, done: false });
  }

  function chooseTimeslot(k) {
    setTimeslot(k);
    go(3, { activity, timeslot: k, done: false });
  }

  // 되돌아가기(「앞 화면으로」·「다시 고르기」). 이 화면의 **유일한 되돌리기 수단**이라
  // 눌렀을 때 아무 일도 일어나지 않는 것이 가장 나쁜 결과다.
  //
  // 예전에는 조건 없이 preventDefault + history.back() 이었다. 그래서
  //   · 되돌아갈 항목이 없으면(문서가 ?step=2 로 직접 열린 경우 — 복원은 replaceState 라
  //     항목을 쌓지 않는다) **꼼짝하지 않았다**. history.back() 은 맨 앞에서 던지지 않고
  //     조용히 아무것도 하지 않으므로 아래 catch 폴백도 돌지 않았다. 멀쩡한 href 를
  //     preventDefault 가 막고 있던 셈이다.
  //   · 두 번 눌리면 -1 이 두 번 쌓여(traversal 은 큐에 들어간다) 앞 단계를 지나쳐
  //     **신청 화면 밖**으로 나갔다. 손이 떨려 두 번 누르는 것은 이 사용자층에서 흔하고,
  //     제출 쪽은 이미 같은 이유로 submittingRef 를 두고 있다.
  // 판정은 lib/eumSenior.backAction 한 곳에서 한다(순수 로직 · 단위 테스트).
  function back(e) {
    let state = null;
    try {
      state = window.history.state;
    } catch {
      /* 히스토리 접근 불가 — 아래 판정이 'follow'(링크가 제 일을 한다)로 떨어진다 */
    }
    const action = backAction(state, backFromRef.current);
    // 가로채지 않는다 — href 가 고른 것을 실은 주소로 데려간다(stepQuery).
    if (action === 'follow') return;
    if (e) e.preventDefault();
    if (action === 'ignore') return;
    backFromRef.current = historyDepth(state);
    try {
      window.history.back();
    } catch {
      setStep((s) => Math.max(1, s - 1));
    }
  }

  // 서버가 접수를 판정한 뒤에만 완료 화면으로 넘어간다.
  // 보조 사본 — 담당자 확인용 기록은 서버 쪽이 원본이다. 여기서 실패해도 접수는 유효하므로
  // 사용자를 붙잡지 않는다(예전에는 이 저장 실패가 곧 제출 실패였다).
  // record 가 null 이면 **아무것도 쓰지 않는다** — 무엇이 접수됐는지 모르는 경우이고, 그때
  // 이번 선택을 적어 두면 단말에 남은 사본까지 사실과 어긋난다(먼저 접수된 내용이 원본이다).
  function finishSubmitted(record) {
    try {
      const key = storageKey(sid);
      if (key && record) window.localStorage.setItem(key, JSON.stringify(record));
    } catch {
      /* 로컬 저장 불가(시크릿 모드·용량 초과) — 접수 자체에는 영향 없다 */
    }
    setDone(true);
    go(4, { activity, timeslot, done: true });
  }

  // 409 본문에서 「먼저 접수된 선택」을 읽는다. 읽지 못하면 null — 모른다고 말하는 편이
  // 그럴듯하게 채우는 것보다 낫다. 본문이 JSON 이 아니어도 던지지 않는다.
  async function acceptedFrom(res) {
    try {
      const data = await res.json();
      return parseAccepted(data && data.accepted);
    } catch {
      return null;
    }
  }

  async function submit() {
    // 중복 전송 방지는 **우리 몫이다.** 예전에는 버튼이 `disabled` 가 되어 브라우저가 막아 주었고,
    // 그 대가로 포커스가 사라졌다(위 주석). 이제 버튼이 눌릴 수 있는 상태로 남으므로,
    // 상태(busy)보다 먼저 반영되는 ref 로 같은 틱의 두 번째 누름까지 막는다.
    // (설령 새어 나가도 서버가 409 로 받아 두 건이 되지는 않는다 — 1회용 판정은 라우트의 몫이다.)
    if (busy || submittingRef.current) return;
    setError(null);
    // 안내를 매달 단계는 **누른 그 순간의 단계**다. 기다리는 사이 어르신이 되돌아갔다면
    // 그 화면에는 이 안내가 뜨지 않는다(다른 화면을 가리키는 말을 하지 않는다).
    const at = step;
    const body = buildPreferences({ sid, activity, timeslot });
    if (!body) {
      // 이 안내만 **고르는 화면**에 속한다 — 되돌릴 길이 「처음부터 다시 고르기」이기 때문이다.
      setError(stepError(1, submitMessage('selection')));
      setStep(1);
      return;
    }
    submittingRef.current = true;
    setBusy(true);
    // 시간 상한(fetchOnce)이 필요한 이유: 맨 fetch 에는 상한이 없어, 서버가 응답하지 않으면
    // 이 화면은 "신청하는 중…" 인 채 **영영 멈춰 있었다**. 그때 단추는 다시 누를 수도 없고,
    // 그 사이 5분 만료가 지나 링크까지 죽는다 — 어르신은 무엇이 잘못됐는지 알 길이 없다.
    const { res, failure } = await fetchOnce('/api/eum/senior/preferences', {
      method: 'POST',
      body: { token, activity, timeslot },
    });
    submittingRef.current = false;
    setBusy(false);

    if (failure) {
      // 오류를 삼키지 않는다 — 사용자가 실패한 줄 모른 채 떠나면 안 된다(QUALITY_BAR §3).
      // 상한을 넘겨 우리가 끊은 경우 요청이 서버에 닿았을 수도 있다. 그래도 다시 눌러도 안전하다 —
      // 이미 접수된 링크는 아래에서 409 로 돌아오고, 오류가 아니라 **완료 화면**이 된다.
      setError(stepError(at, failure === 'offline'
        ? submitMessage('offline')     // 브라우저가 단정한 상태 — 눌러도 네트워크를 두드리지 않는다
        : submitMessage('unreachable')));
      return;
    }

    if (res.ok) {
      finishSubmitted(body);
      return;
    }
    // 이미 접수된 링크(409): 실패가 아니라 **이미 성공한 것**이다. 어르신에게 오류를 내밀지 않고
    // 완료 화면을 보여 준다 — 중복 신청은 서버가 막았고, 원하던 결과는 이미 이뤄져 있다.
    //
    // 다만 그 화면이 보여 줄 내용은 **방금 고른 것이 아니라 먼저 접수된 것**이다. 이 경로는
    // 연결이 끊겨 다시 시도하는 사이에 흔히 밟힌다 — 첫 요청이 서버에 닿은 줄 모르고 되돌아가
    // 다른 활동을 고르는 것. 예전에는 그럴 때 **새 선택**을 요약에 그려 놓고 "접수되었습니다"
    // 라고 말했다. 담당자에게 간 것은 첫 선택인데 어르신은 바뀐 줄 믿고, 약속 날 서로 다른
    // 것을 기대한 채 만난다. 어긋난 줄 아는 사람이 아무도 없다는 것이 이 오류의 성질이다.
    if (res.status === 409) {
      const prior = await acceptedFrom(res);
      setAlready(true);
      setAccepted(prior);
      finishSubmitted(prior ? { ...body, ...prior } : null);
      return;
    }
    if (res.status === 410) {
      setExpiredByServer(true);
      return;
    }
    if (res.status === 401) {
      // 문구는 서버 쪽 화면(진입 시 잘못된 링크)과 **같은 문장**이어야 한다. 예전에는 여기
      // 적힌 사본에 마침표가 하나 더 붙어, 같은 상태를 두 화면이 미묘하게 다르게 말했다.
      setError(stepError(at, tokenMessage('signature')));
      return;
    }
    if (res.status === 429) {
      setError(stepError(at, submitMessage('tooMany')));
      return;
    }
    setError(stepError(at, submitMessage('rejected')));
  }

  // 화면이 스스로 만료를 선언하는 것은 **남은 시간을 실제로 알 때뿐**이다(isExpired 는 null 에
  // 대해 false). 값이 없으면 계속 쓰게 두고 판정은 제출 시점의 서버(410)에 맡긴다.
  //
  // 제출이 **진행 중일 때도 선언하지 않는다**(!busy). 화면의 눈금은 전송 지연만큼 너그럽게
  // 세도록 만들어져 있지만, 남은 시간이 얼마 없을 때 누른 제출은 응답을 기다리는 동안 0 에
  // 닿는다. 그 순간 만료 화면으로 덮으면, 서버가 방금 접수한 신청을 어르신은 「링크가
  // 만료되었습니다」로 읽는다 — 되돌릴 단추가 없는 화면이라 그대로 포기하거나, 이미 접수된
  // 신청 위에 담당자에게 새 링크를 조르게 된다. 응답은 곧 도착하고, 만료의 최종 판정자는
  // 언제나 서버다(410 → expiredByServer).
  if (expiredNow) {
    return (
      <Notice
        title="링크가 만료되었습니다"
        body={tokenMessage('expired')}
        foot={EUM_NOTICE_FOOT.expired}
        headingRef={expiredHeadingRef}
      >
        {/* 이 링크로는 더 할 일이 없는 화면이다. 전에 신청을 마친 사람이라면 **그 기기는 그것을
            알고 있다** — 말해 주지 않으면 담당자에게 새 링크를 청해 처음부터 다시 고른다. */}
        <PriorLocal storeKey={storageKey(sid)} where="expired" />
      </Notice>
    );
  }

  const soon = !done && isSoon(left);
  // 단계 표시. 예전에는 「1단계 / 3단계」였는데 슬래시는 **낭독되지 않아** "1단계 3단계" 로
  // 들렸다 — 지금 몇 번째인지가 아니라 단계 둘을 읽어 주는 것처럼 들린다. 이 문단은 바로
  // aria-live 영역이라 단계마다 다시 낭독되는 자리다. 낱말로 말한다(EUM_MUTE_MARKS 참조).
  const stepLabel = step <= 3 ? `3단계 중 ${step}단계` : '완료';
  // 완료 화면이 보여 줄 요약. 세 경우가 다르다(아래 4단계 주석 참조) — 모르면 빈 문자열이고
  // 화면은 요약을 아예 그리지 않는다. 조립은 lib/eumSenior.summaryText 한 곳에서만 한다:
  // 예전에는 이 자리에서 `labelOf(…) · labelOf(…)` 로 손수 이어 붙여, 확인 화면과 **형식이
  // 두 벌**이었고 한쪽 라벨을 모를 때 「 · 」만 남은 반쪽 요약이 그려질 수 있었다.
  const doneSummary = already ? summaryText(accepted) : summaryText({ activity, timeslot });
  // 지금 이 화면에 속한 안내만 그린다. 다른 단계의 것이면 빈 문자열이고 Alert 는 아무것도
  // 그리지 않는다 — 안내가 자기 화면을 떠나 따라다니던 것을 여기서 끊는다.
  const alertText = errorFor(error, step);

  return (
    <main style={S.page} className={EUM_SCOPE}>
      <EumStyles />
      <div style={S.wrap}>
        <p style={S.kicker}>이음 어르신 신청</p>
        <h1 style={S.h1} ref={headingRef} tabIndex={-1}>{STEP_TITLE[step]}</h1>
        <p style={S.note} role="status" aria-live="polite">{stepLabel}</p>

        {/* 만료 임박 안내는 스크린리더도 들어야 한다 — 예전에는 눈으로만 보이는 문단이라
            보이지 않는 사용자는 링크가 곧 만료되는 것을 끝내 알 수 없었다. 문단 자체를 낭독
            영역으로 두되, **매초 바뀌는 초 숫자는 aria-hidden** 으로 빼 둔다. 넣어 두면 1초마다
            낭독이 끊기고 처음부터 다시 읽혀 오히려 문장을 들을 수 없다. */}
        {soon ? (
          <p style={S.warn} role="status" aria-live="polite">
            {EUM_SOON_MESSAGE}
            <span aria-hidden="true"> 남은 시간 {secondsLeft(left)}초</span>
          </p>
        ) : null}

        {/* 안내 자리는 **단계마다 다르다** — 그 안내가 가리키는 조작 요소를 밀어내지 않는
            자리여야 하기 때문이다(ui.jsx 의 Alert). 고르는 화면(1단계)에서는 선택지 위,
            확인 화면(3단계)에서는 주버튼 **뒤**다. 한 자리에 모아 두었을 때 생긴 결함이
            바로 그것이다 — 실패 안내가 끼어들며 「한 번 더 눌러 주세요」가 가리키는 단추를
            자기가 아래로 밀어냈다. */}

        {/* 고른 것은 **눈에도** 보여야 한다. 예전에는 선택 여부가 `aria-pressed` 하나로만 있어
            스크린리더에만 전해졌고, 네 버튼의 모양은 똑같았다 — 2단계에서 「앞 화면으로」를 눌러
            돌아오면 아까 고른 것이 주소에도 상태에도 남아 있는데 화면은 처음과 구별되지 않았다
            (6회차에 "다시 그려져도 고른 것이 살아남는다" 를 고쳐 놓고, 살아남은 것을 보여 주지
            않고 있었다). 색만으로 말하지 않는다 — ✓ 표시가 함께 붙는다(ui.jsx 의 S.mark). */}
        {step === 1 ? (
          <>
            {/* 이 화면의 안내(「처음부터 다시 골라 주세요」)는 **선택지를 가리킨다** —
                그 선택지 위에 두어야 읽은 뒤에 누르게 된다. */}
            <Alert text={alertText} />
            <div style={S.list} role="group" aria-label="희망 활동 고르기">
              {ACTIVITIES.map((o) => (
                <button
                  key={o.k}
                  type="button"
                  style={activity === o.k ? S.choiceOn : S.choice}
                  className="eum-focus"
                  aria-pressed={activity === o.k}
                  onClick={() => chooseActivity(o.k)}
                >
                  <span aria-hidden="true" style={S.mark}>{activity === o.k ? EUM_CHOICE_MARK : ''}</span>
                  {o.label}
                </button>
              ))}
            </div>
          </>
        ) : null}

        {step === 2 ? (
          <>
            <div style={S.list} role="group" aria-label="희망 시간대 고르기">
              {TIMESLOTS.map((o) => (
                <button
                  key={o.k}
                  type="button"
                  style={timeslot === o.k ? S.choiceOn : S.choice}
                  className="eum-focus"
                  aria-pressed={timeslot === o.k}
                  onClick={() => chooseTimeslot(o.k)}
                >
                  <span aria-hidden="true" style={S.mark}>{timeslot === o.k ? EUM_CHOICE_MARK : ''}</span>
                  {o.label}
                </button>
              ))}
            </div>
            <a href={stepQuery(1, { activity, timeslot })} className="eum-focus" style={S.back} onClick={back}>앞 화면으로</a>
          </>
        ) : null}

        {step === 3 ? (
          <>
            <p style={S.summary}>{summaryText({ activity, timeslot })}</p>
            {/* 「이 기기에서 전에 낸 신청」 — 중복이 실제로 만들어지는 순간은 아래 단추를 누르는
                그 순간이므로 여기서 말한다(고르는 화면에 넣으면 375px 에서 선택지가 밀린다).
                막지는 않는다 — 담당자가 바꾸라고 새 링크를 보낸 경우가 있고, 그때 재신청은 정당하다.
                내용을 모르면 조각이 아무것도 그리지 않는다(지어내지 않는다 · PriorLocal.jsx). */}
            <PriorLocal storeKey={storageKey(sid)} where="confirm" />
            <div style={S.list}>
              {/* 진행 중에는 색이 바뀐다 — 예전에는 포털 전역 CSS 의 `button:disabled{opacity:.55}`
                  가 내려와 투명도로 눌림을 말했고, 그때 대비가 2.87:1(요건 4.5:1)로 떨어졌다.
                  바로 그 순간 어르신이 읽는 글자가 「신청하는 중…」이다(ui.jsx 의 EumStyles 참조).

                  고친 결함: 그 눌림을 `disabled` 로 말하고 있었다. HTML 에서 disabled 요소는
                  **포커스를 가질 수 없다** — 누른 순간 브라우저가 포커스를 이 버튼에서 떼어
                  문서(body)로 보낸다. 그래서 키보드·스크린리더로 쓰는 어르신에게는
                    ① 기다리는 동안(상한 8초) 들리는 말이 한 마디도 없고 — 포커스가 떠났으니
                       바뀐 글자("신청하는 중…")를 읽어 줄 대상이 없다. 멈춘 것과 구별되지 않는다.
                    ② 실패했을 때 화면이 「한 번 더 눌러 주세요」라고 말하는데, 그 단추가
                       **어디 있는지 알 수 없다**. 포커스는 문서 맨 앞에 있어 다시 Tab 으로
                       찾아 내려와야 하고, 그 사이 5분 링크가 줄어든다. (그때 그 문장은
                       「**아래** 단추를…」였다 — 눈에만 뜻이 있는 말이었고, 그 안내가 그려지며
                       가리킨 단추를 자기가 밀어냈다. 지금은 안내가 이 단추 뒤에 붙는다.)
                  바로 그 순간이 ①직전 회차의 "작을 때 읽는 글자" ②그 전 회차의 "흐릴 때 읽는
                  글자" 와 **같은 순간**이다 — 이번에는 들리지 않았다.
                  그래서 눌림은 `aria-disabled` 로 말한다: 상태는 그대로 낭독되는데 포커스는
                  남는다. 중복 전송은 브라우저가 아니라 우리가 막는다(submit 의 submittingRef).
                  `aria-live` 는 글자가 바뀐 것을 포커스 위치와 무관하게 알리기 위한 것이다. */}
              <button
                type="button"
                className="eum-focus"
                style={busy ? S.primaryBusy : S.primary}
                onClick={submit}
                aria-disabled={busy}
                aria-live="polite"
              >
                {busy ? '신청하는 중…' : '이대로 신청하기'}
              </button>
            </div>
            {/* 실패 안내는 주버튼 **뒤**다. 앞에 두면 안내가 생기는 순간 그 단추를 아래로
                밀어내고, 하필 그 안내가 「한 번 더 눌러 주세요」라고 말한다 — 외워 둔 자리를
                누른 손 아래에서 단추가 사라진다. 뒤에 두면 밀려나는 것은 「다시 고르기」
                링크 하나뿐이고, 포커스는 그대로 그 단추에 남아 있다(aria-disabled). */}
            <Alert text={alertText} />
            <a href={stepQuery(2, { activity, timeslot })} className="eum-focus" style={S.back} onClick={back}>다시 고르기</a>
          </>
        ) : null}

        {/* 완료 화면은 **실제로 접수된 것**만 말한다. 세 경우가 서로 다르다.
            ① 방금 접수됨 → 이번 선택을 그대로 요약한다.
            ② 이미 접수돼 있었고 그 내용을 안다 → 그 내용을 요약하고, 바꾸는 길을 알려 준다.
            ③ 이미 접수돼 있으나 내용을 모른다 → 요약을 그리지 않는다. 빈 칸을 지어 채우거나
               이번 선택으로 대신하면 그 자리에서 거짓이 된다. */}
        {step === 4 ? (
          <>
            {/* 진입 안내(page.jsx 의 「이미 신청하셨습니다」)와 **같은 문장**이다. 예전에는
                이 자리만 「담당자가 곧 전화로 안내해 드립니다」라고 바르게 말하고, 진입 안내는
                「담당자에게 문의해 주세요」라고 말했다 — 접수가 끝난 사람에게 할 일을 만들어
                주면 그 전화가 새 링크를 부르고, 새 링크는 소진 키가 달라 재신청이 통한다. */}
            <p style={S.body} role="status">
              {already ? EUM_DONE_MESSAGE.already : EUM_DONE_MESSAGE.accepted}
            </p>
            {doneSummary ? <p style={S.summary}>{doneSummary}</p> : null}
            {/* 진입 화면(page.jsx)의 「이미 신청하셨습니다」와 **같은 갈림**이다 —
                접수 내용을 아는지에 따라 할 말이 다르다. */}
            {already ? (
              <p style={S.body}>{doneSummary ? EUM_CONSUME_CHANGE_HINT : EUM_CONSUME_UNKNOWN_HINT}</p>
            ) : null}
            {/* 진입 화면의 「이미 신청하셨습니다」와 **같은 문장**이다(ui.jsx 의 등록부가 단일 출처) —
                한쪽만 고쳐져 두 화면이 다른 말을 하는 일을 없앤다. */}
            <p style={S.note}>{EUM_NOTICE_FOOT.done}</p>
          </>
        ) : null}
      </div>
    </main>
  );
}
