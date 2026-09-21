"use client";

// app/eum/senior/[token]/SeniorFlow.jsx — 어르신 신청 4단계 흐름(클라이언트)
//
// 흐름: 1 희망 활동 → 2 희망 시간대 → 3 확인 → 4 완료 (lib/eumSenior.js 가 단계 규칙의 단일 출처)
//
// 설계 메모
//  - `step` 을 URL(?step=n)에 유지한다 — 콜봇(음성)과 화면이 어긋나지 않게 하기 위한 요건.
//    다만 단계 이동에 Next 라우팅을 쓰면 서버 컴포넌트가 다시 그려지며 선택이 날아가므로,
//    history.pushState 로 주소만 바꾸고 상태는 이 컴포넌트가 들고 있는다(뒤로가기 = popstate).
//  - 새로고침으로 선택이 사라진 채 ?step=3 으로 들어오면 clampStep 이 1단계로 되돌린다.
//  - 한 화면 버튼 4개 이내: 선택지 4개인 화면에는 버튼을 더 두지 않고, 되돌아가기는 **링크**로 둔다
//    (href 가 있어 자바스크립트 없이도 동작하고, 눌렀을 때는 히스토리 뒤로가 선택을 보존한다).
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
  labelOf,
  summaryText,
  buildPreferences,
  parseAccepted,
  storageKey,
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
import { fetchOnce } from '@/lib/fetchJson';
import { S, Notice, FocusStyles } from './ui.jsx';

function stepFromLocation() {
  try {
    return parseStep(new URLSearchParams(window.location.search).get('step'));
  } catch {
    return 1;
  }
}

export default function SeniorFlow({ sid, token = '', initialStep = 1, remainingMs = 0 }) {
  const [activity, setActivity] = useState('');
  const [timeslot, setTimeslot] = useState('');
  const [done, setDone] = useState(false);
  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
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
  const mountedRef = useRef(false);

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

  // 주소를 실제 도달 가능한 단계로 맞춘다(?step=3 직접 입력·새로고침 대비).
  useEffect(() => {
    const want = clampStep(initialStep, { activity: '', timeslot: '', done: false });
    setStep(want);
    try {
      window.history.replaceState({ step: want }, '', `?step=${want}`);
    } catch {
      /* 히스토리 조작 불가 환경(구형 브라우저) — 화면 동작에는 영향 없다 */
    }
  }, [initialStep]);

  // 뒤로가기/앞으로가기 → 주소의 step 을 현재 선택 상태에 맞게 잘라서 반영.
  useEffect(() => {
    function onPop() {
      setStep(clampStep(stepFromLocation(), draftRef.current));
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

  const go = useCallback((next, draft) => {
    const want = clampStep(next, draft || draftRef.current);
    setStep(want);
    try {
      window.history.pushState({ step: want }, '', `?step=${want}`);
    } catch {
      /* noop */
    }
  }, []);

  function chooseActivity(k) {
    setActivity(k);
    go(2, { activity: k, timeslot: '', done: false });
  }

  function chooseTimeslot(k) {
    setTimeslot(k);
    go(3, { activity, timeslot: k, done: false });
  }

  function back(e) {
    if (e) e.preventDefault();
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
    if (busy) return;
    setError('');
    const body = buildPreferences({ sid, activity, timeslot });
    if (!body) {
      setError('선택이 저장되지 않았습니다. 처음부터 다시 골라 주세요.');
      setStep(1);
      return;
    }
    setBusy(true);
    // 시간 상한(fetchOnce)이 필요한 이유: 맨 fetch 에는 상한이 없어, 서버가 응답하지 않으면
    // 이 화면은 "신청하는 중…" 인 채 **영영 멈춰 있었다**. 단추는 disabled 라 다시 누를 수도
    // 없고, 그 사이 5분 만료가 지나 링크까지 죽는다 — 어르신은 무엇이 잘못됐는지 알 길이 없다.
    const { res, failure } = await fetchOnce('/api/eum/senior/preferences', {
      method: 'POST',
      body: { token, activity, timeslot },
    });
    setBusy(false);

    if (failure) {
      // 오류를 삼키지 않는다 — 사용자가 실패한 줄 모른 채 떠나면 안 된다(QUALITY_BAR §3).
      // 상한을 넘겨 우리가 끊은 경우 요청이 서버에 닿았을 수도 있다. 그래도 다시 눌러도 안전하다 —
      // 이미 접수된 링크는 아래에서 409 로 돌아오고, 오류가 아니라 **완료 화면**이 된다.
      setError(failure === 'offline'
        ? '인터넷 연결이 끊겼습니다. 연결을 확인하고 다시 눌러 주세요.'
        : '연결이 원활하지 않습니다. 아래 단추를 한 번 더 눌러 주세요.');
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
      setError('링크가 올바르지 않습니다. 담당자에게 다시 요청해 주세요.');
      return;
    }
    if (res.status === 429) {
      setError('잠시 후 다시 눌러 주세요.');
      return;
    }
    setError('신청을 접수하지 못했습니다. 아래 단추를 한 번 더 눌러 주세요.');
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
  if (!done && !busy && (expiredByServer || isExpired(left))) {
    return <Notice title="링크가 만료되었습니다" body="링크가 만료되었습니다. 담당자에게 다시 요청해 주세요" />;
  }

  const soon = !done && isSoon(left);
  const stepLabel = step <= 3 ? `${step}단계 / 3단계` : '완료';

  return (
    <main style={S.page}>
      <FocusStyles />
      <div style={S.wrap}>
        <p style={S.kicker}>이음 어르신 신청</p>
        <h1 style={S.h1} ref={headingRef} tabIndex={-1}>{STEP_TITLE[step]}</h1>
        <p style={S.note} role="status" aria-live="polite">{stepLabel}</p>

        {/* 만료 임박 안내는 스크린리더도 들어야 한다 — 예전에는 눈으로만 보이는 문단이라
            보이지 않는 사용자는 화면이 곧 닫힌다는 것을 끝내 알 수 없었다. 문단 자체를 낭독
            영역으로 두되, **매초 바뀌는 초 숫자는 aria-hidden** 으로 빼 둔다. 넣어 두면 1초마다
            낭독이 끊기고 처음부터 다시 읽혀 오히려 문장을 들을 수 없다. */}
        {soon ? (
          <p style={S.warn} role="status" aria-live="polite">
            {EUM_SOON_MESSAGE}
            <span aria-hidden="true"> 남은 시간 {secondsLeft(left)}초</span>
          </p>
        ) : null}

        {error ? <p style={S.alert} role="alert">{error}</p> : null}

        {step === 1 ? (
          <div style={S.list} role="group" aria-label="희망 활동 고르기">
            {ACTIVITIES.map((o) => (
              <button
                key={o.k}
                type="button"
                style={S.choice}
                className="eum-focus"
                aria-pressed={activity === o.k}
                onClick={() => chooseActivity(o.k)}
              >
                {o.label}
              </button>
            ))}
          </div>
        ) : null}

        {step === 2 ? (
          <>
            <div style={S.list} role="group" aria-label="희망 시간대 고르기">
              {TIMESLOTS.map((o) => (
                <button
                  key={o.k}
                  type="button"
                  style={S.choice}
                  className="eum-focus"
                  aria-pressed={timeslot === o.k}
                  onClick={() => chooseTimeslot(o.k)}
                >
                  {o.label}
                </button>
              ))}
            </div>
            <a href="?step=1" className="eum-focus" style={S.back} onClick={back}>앞 화면으로</a>
          </>
        ) : null}

        {step === 3 ? (
          <>
            <p style={S.summary}>{summaryText({ activity, timeslot })}</p>
            <div style={S.list}>
              <button type="button" className="eum-focus" style={S.primary} onClick={submit} disabled={busy}>
                {busy ? '신청하는 중…' : '이대로 신청하기'}
              </button>
            </div>
            <a href="?step=2" className="eum-focus" style={S.back} onClick={back}>다시 고르기</a>
          </>
        ) : null}

        {/* 완료 화면은 **실제로 접수된 것**만 말한다. 세 경우가 서로 다르다.
            ① 방금 접수됨 → 이번 선택을 그대로 요약한다.
            ② 이미 접수돼 있었고 그 내용을 안다 → 그 내용을 요약하고, 바꾸는 길을 알려 준다.
            ③ 이미 접수돼 있으나 내용을 모른다 → 요약을 그리지 않는다. 빈 칸을 지어 채우거나
               이번 선택으로 대신하면 그 자리에서 거짓이 된다. */}
        {step === 4 ? (
          <>
            <p style={S.body} role="status">
              {already
                ? '이미 접수된 신청이 있습니다. 담당자가 곧 전화로 안내해 드립니다.'
                : '신청이 접수되었습니다. 담당자가 곧 전화로 안내해 드립니다.'}
            </p>
            {already ? (
              accepted ? (
                <>
                  <p style={S.summary}>
                    {labelOf(ACTIVITIES, accepted.activity)} · {labelOf(TIMESLOTS, accepted.timeslot)}
                  </p>
                  <p style={S.body}>바꾸고 싶으시면 담당자에게 말씀해 주세요.</p>
                </>
              ) : (
                <p style={S.body}>접수된 내용은 담당자에게 확인해 주세요.</p>
              )
            ) : (
              <p style={S.summary}>
                {labelOf(ACTIVITIES, activity)} · {labelOf(TIMESLOTS, timeslot)}
              </p>
            )}
            <p style={S.note}>이제 이 화면을 닫으셔도 됩니다.</p>
          </>
        ) : null}
      </div>
    </main>
  );
}
