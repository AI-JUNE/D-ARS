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

  // 공개 경로다(어르신은 로그인하지 않는다) → 한도를 먼저 건다.
  const over = consume('eumSubmit', ipKey(req));
  if (over) return finish(over, 'rate_limited');

  const body = await readJson(req);
  if (!body) return finish(invalidJson(), 'invalid_json');

  const token = typeof body.token === 'string' ? body.token : '';
  const verdict = await verifyEumToken(token);
  if (!verdict.ok) return finish(tokenFailure(verdict.reason), `token_${verdict.reason}`);

  // 선택값 검증은 화면과 같은 규칙(lib/eumSenior)을 쓴다 — 화면을 우회한 제출도 같은 잣대.
  const prefs = buildPreferences({
    sid: verdict.payload.sid,
    activity: body.activity,
    timeslot: body.timeslot,
  });
  if (!prefs) return finish(badRequest('invalid selection'), 'invalid_selection');

  // 1회용 소진 — 여기까지 와서 처음 쓰이는 링크여야 접수한다.
  const key = consumeKey(token);
  const claim = consumeStore().claim(key, verdict.payload.exp);
  if (!claim.ok) {
    // 이미 접수된 링크: 409. 실패가 아니라 **이미 성공했음**을 뜻하므로 화면이 구분해 안내한다.
    if (claim.reason === 'used') {
      return finish(fail(consumeMessage('used'), 409, { code: 'already_submitted' }), 'already_submitted');
    }
    if (claim.reason === 'expired') return finish(gone('expired'), 'token_expired');
    return finish(unauthorized('invalid link'), 'consume_unusable');
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
