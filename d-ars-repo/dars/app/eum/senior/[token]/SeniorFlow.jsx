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
//  - 제출은 이음 API 실연결 전이므로 **콘솔 로그 + 로컬 저장**까지만 한다(EUM_INTEGRATION.md).

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
  storageKey,
} from '@/lib/eumSenior';
import { S, Notice, FocusStyles } from './ui.jsx';

function stepFromLocation() {
  try {
    return parseStep(new URLSearchParams(window.location.search).get('step'));
  } catch {
    return 1;
  }
}

export default function SeniorFlow({ sid, initialStep = 1, expiresAt = 0 }) {
  const [activity, setActivity] = useState('');
  const [timeslot, setTimeslot] = useState('');
  const [done, setDone] = useState(false);
  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [left, setLeft] = useState(() => Math.max(0, Number(expiresAt) - Date.now()));
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
    const exp = Number(expiresAt);
    if (!Number.isFinite(exp) || exp <= 0 || done) return undefined;
    const id = setInterval(() => setLeft(Math.max(0, exp - Date.now())), 1000);
    return () => clearInterval(id);
  }, [expiresAt, done]);

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

  function submit() {
    if (busy) return;
    setError('');
    const body = buildPreferences({ sid, activity, timeslot });
    if (!body) {
      setError('선택이 저장되지 않았습니다. 처음부터 다시 골라 주세요.');
      setStep(1);
      return;
    }
    setBusy(true);
    // [승인 필요] 이음 API 실연결 전 — 전송하지 않고 콘솔 로그 + 브라우저 로컬 저장까지만 한다.
    // 실연결 시 이 자리에서 POST {EUM_API}/seniors/{id}/preferences (토큰 검증 동반) 로 바꾼다.
    let saved = false;
    try {
      // eslint-disable-next-line no-console
      console.log('[EUM] POST /seniors/{id}/preferences (미연동 · 로컬 저장)', body);
      const key = storageKey(sid);
      if (key) {
        window.localStorage.setItem(key, JSON.stringify(body));
        saved = true;
      }
    } catch {
      saved = false;
    }
    setBusy(false);
    if (!saved) {
      // 오류를 삼키지 않는다 — 사용자가 실패한 줄 모른 채 떠나면 안 된다(QUALITY_BAR §3).
      setError('신청을 저장하지 못했습니다. 아래 단추를 한 번 더 눌러 주세요.');
      return;
    }
    setDone(true);
    go(4, { activity, timeslot, done: true });
  }

  if (!done && Number(expiresAt) > 0 && left <= 0) {
    return <Notice title="링크가 만료되었습니다" body="링크가 만료되었습니다. 담당자에게 다시 요청해 주세요" />;
  }

  const soon = !done && left > 0 && left <= 60000;
  const stepLabel = step <= 3 ? `${step}단계 / 3단계` : '완료';

  return (
    <main style={S.page}>
      <FocusStyles />
      <div style={S.wrap}>
        <p style={S.kicker}>이음 어르신 신청</p>
        <h1 style={S.h1} ref={headingRef} tabIndex={-1}>{STEP_TITLE[step]}</h1>
        <p style={S.note} role="status" aria-live="polite">{stepLabel}</p>

        {soon ? (
          <p style={S.warn}>
            잠시 후 이 화면이 닫힙니다. 남은 시간 {Math.ceil(left / 1000)}초
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

        {step === 4 ? (
          <>
            <p style={S.body} role="status">
              신청이 접수되었습니다. 담당자가 곧 전화로 안내해 드립니다.
            </p>
            <p style={S.summary}>
              {labelOf(ACTIVITIES, activity)} · {labelOf(TIMESLOTS, timeslot)}
            </p>
            <p style={S.note}>이제 이 화면을 닫으셔도 됩니다.</p>
          </>
        ) : null}
      </div>
    </main>
  );
}
