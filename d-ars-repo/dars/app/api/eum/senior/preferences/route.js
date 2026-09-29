// app/api/eum/senior/preferences/route.js — 「이음 어르신 신청」 제출 접수
//
// 왜 이 라우트가 생겼나: 지금까지 제출은 **브라우저 안에서만** 일어났다(console.log +
// localStorage). 그 결과 두 가지가 조용히 깨져 있었다.
//   ① 담당자가 신청 여부를 알 방법이 없다 — 기록이 어르신 단말에만 남는다.
//   ② 링크가 "1회용" 이 아니었다 — 서버가 제출을 보지 않으니 같은 링크로 몇 번이고 신청됐다.
// 이 라우트는 제출을 **서버가 판정**하게 만든다. 실제 이음 API 전송은 여전히 하지 않는다
// (**[승인 필요]** · 아래 delivery 주석) — 바뀐 것은 "누가 판정하는가" 다.
//
// 토큰은 쿼리스트링이 아니라 **본문**으로 받는다. 이 토큰은 그 자체가 인증 수단이라
// URL 에 실리면 접근로그·리퍼러·브라우저 기록에 남는다(lib/log 는 쿼리스트링을 통째로 버린다).
//
// 응답은 언제나 무엇이 실제로 일어났는지 그대로 말한다 — `delivered:false` 를 성공처럼
// 꾸미지 않는다(QUALITY_BAR §3).

import { verifyEumToken } from '@/lib/eumToken';
import { consumeKey, consumeStore, consumeMessage } from '@/lib/eumConsume';
import { buildPreferences } from '@/lib/eumSenior';
import { readJson } from '@/lib/validate';
import { ok, badRequest, unauthorized, gone, invalidJson, fail } from '@/lib/apiError';
import { consume, ipKey } from '@/lib/apiLimits';
import { logRequest, requestIdFrom, startTimer } from '@/lib/log';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// 토큰 검증 실패 사유 → 상태코드. 만료만 410(다시 요청하면 되는 상태),
// 나머지는 401(링크가 잘못됨). 화면이 두 경우에 다른 안내를 하기 위한 구분이다.
function tokenFailure(reason) {
  if (reason === 'expired') return gone('expired');
  return unauthorized('invalid link');
}

export async function POST(req) {
  const timer = startTimer();
  const requestId = requestIdFrom(req?.headers);
  const finish = (res, code) => {
    logRequest({
      requestId, method: 'POST', path: '/api/eum/senior/preferences',
      status: res.status, durationMs: timer.done(), code,
      msg: '이음 어르신 신청 제출',
    });
    return res;
  };

  const body = await readJson(req);
  if (!body) return finish(invalidJson(), 'invalid_json');

  const token = typeof body.token === 'string' ? body.token : '';
  const verdict = await verifyEumToken(token);

  // ── 한도의 **키** ── 이 라우트가 지켜야 할 선은 lib/apiLimits 헤더에 이미 적혀 있다:
  // 서명이 유효하면 그 서명 단위로, 검증 실패만 IP 단위로 조인다. 그런데 여기만 그 규칙을
  // 따르지 않고 처음부터 IP 로 조이고 있었다 — 하필 공유 IP 가 가장 흔한 경로에서.
  //   복지관·경로당에서 담당자가 여러 어르신을 한 자리에 모아 놓고 링크를 하나씩 보내는 것이
  //   이 기능이 쓰이는 전형적인 모습이다. 그 방은 공유기 하나 뒤에 있어 공인 IP 가 하나다.
  //   손이 떨려 여러 번 누르는 것까지 세면 몇 분 안에 한도에 닿고, 그 뒤에 신청하려던 어르신은
  //   자기가 아무 잘못도 하지 않았는데 「잠시 후 다시 눌러 주세요」만 보다가 5분 링크가 죽는다.
  //   정책표 주석은 "공유 IP 에서 잇따라 신청하는 상황도 막지 않아야 한다" 고 적어 두었지만,
  //   IP 를 키로 쓰는 한 그것은 코드가 보장할 수 없는 서술이었다.
  // 그래서 유효한 링크는 **링크 단위**로 센다(consumeKey = 서명 부분 · 페이로드 복원 불가).
  // 한 어르신의 재시도가 옆자리 어르신에게 전이되지 않는다. 위조 토큰 홍수는 아래 tokenFail
  // (IP 단위)이 그대로 막는다 — 실제 위협만 겨냥한다는 원칙은 그대로다.
  if (!verdict.ok) {
    const flood = consume('tokenFail', ipKey(req));
    if (flood) return finish(flood, 'rate_limited');
    return finish(tokenFailure(verdict.reason), `token_${verdict.reason}`);
  }

  const linkKey = consumeKey(token);
  // 서명 형식이 깨져 키를 못 만들면(검증을 통과했으므로 정상적으로는 오지 않는 경로)
  // 링크 단위로 셀 수 없다 → IP 로 물러선다. 한도 없이 통과시키지는 않는다.
  const over = consume('eumSubmit', linkKey || ipKey(req));
  if (over) return finish(over, 'rate_limited');

  // 선택값 검증은 화면과 같은 규칙(lib/eumSenior)을 쓴다 — 화면을 우회한 제출도 같은 잣대.
  const prefs = buildPreferences({
    sid: verdict.payload.sid,
    activity: body.activity,
    timeslot: body.timeslot,
  });
  if (!prefs) return finish(badRequest('invalid selection'), 'invalid_selection');

  // 1회용 소진 — 여기까지 와서 처음 쓰이는 링크여야 접수한다.
  // 무엇이 접수됐는지를 기록에 함께 남긴다(선택 코드 2개뿐 · 개인정보 없음). 아래 409 응답이
  // 그것을 돌려주고, 화면은 「방금 고른 것」이 아니라 「실제로 접수된 것」을 보여 준다.
  const claim = consumeStore().claim(linkKey, verdict.payload.exp, Date.now(), {
    activity: prefs.activity,
    timeslot: prefs.timeslot,
  });
  if (!claim.ok) {
    // 이미 접수된 링크: 409. 실패가 아니라 **이미 성공했음**을 뜻하므로 화면이 구분해 안내한다.
    if (claim.reason === 'used') {
      // 먼저 접수된 내용을 함께 돌려준다 — 없으면(다른 인스턴스·재시작·구기록) 아예 싣지 않는다.
      // 빈 값이나 이번 요청의 선택으로 대신 채우면 화면이 일어나지 않은 일을 사실처럼 말하게 된다.
      const prior = consumeStore().recordOf(linkKey);
      return finish(fail(consumeMessage('used'), 409, {
        code: 'already_submitted',
        ...(prior.note ? { accepted: prior.note } : {}),
      }), 'already_submitted');
    }
    if (claim.reason === 'expired') return finish(gone('expired'), 'token_expired');
    return finish(unauthorized('invalid link'), 'consume_unusable');
  }

  // 소진 기록이 상한에 닿아 **다른 링크의 기록을 버리고** 자리를 만들었다면 그 순간을 남긴다.
  // 버려진 링크는 다시 제출할 수 있게 되므로, 이 줄이 찍힌 시각이 곧 1회용 보장이 깨진 시각이다.
  // 예전에는 버린 수를 세어 두기만 하고 아무도 읽지 않아, 깨져도 아는 사람이 없었다.
  // 접수는 정상적으로 이뤄졌으므로 응답은 바꾸지 않는다 — 말하지 않는 것만 하지 않는다.
  if (claim.evicted) {
    logRequest({
      requestId, method: 'POST', path: '/api/eum/senior/preferences',
      level: 'warn', code: 'eum_consume_evicted',
      msg: `1회용 소진 기록 ${claim.evicted}건 축출 — 해당 링크는 재제출 가능해졌다`,
    });
  }

  // [승인 필요] 이음 API 실연결 — 승인 전까지 **전송하지 않는다**.
  // 실연결 시 이 자리에서 POST {EUM_API}/seniors/{sid}/preferences 를 호출하고,
  // 전송 실패 시 위 소진 기록을 되돌릴지(재시도 허용) 여부를 함께 정해야 한다.
  // 그때까지는 구조화 로그가 유일한 접수 기록이다(Vercel 함수 로그 보존기간에 종속).
  // sid 는 이음 측 불투명 식별자로 이름·연락처가 아니다 — 이 줄에 개인정보는 없다.
  logRequest({
    requestId, method: 'POST', path: '/api/eum/senior/preferences',
    status: 200, durationMs: timer.done(), code: 'eum_intake',
    msg: `접수 sid=${prefs.sid} activity=${prefs.activity} timeslot=${prefs.timeslot}`,
  });

  return finish(ok({
    received: true,
    // 정직한 표시: 접수는 됐지만 이음으로 **보내지는 않았다**.
    delivered: false,
    deliveryMode: 'log-only',
    submittedAt: prefs.submittedAt,
    requestId,
  }), 'accepted');
}
