// tests/eumsenior.test.mjs — 이음 어르신 신청 화면 흐름 로직 단위 테스트
// 계약: URL(?step=) 의 단계는 항상 실제 선택 상태로 잘린다 · 제출 본문에 개인정보가 없다.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ACTIVITIES,
  TIMESLOTS,
  STEP_TITLE,
  stepTitle,
  stepProgress,
  EUM_FLOW_STEPS,
  EUM_STEP_MIN,
  parseStep,
  clampStep,
  maxReachableStep,
  labelOf,
  summaryText,
  buildPreferences,
  storageKey,
  normalizeDraft,
  parseDraft,
  restorePoint,
  stepQuery,
  DRAFT_PARAM,
  EUM_STEP_MAX,
  parsePriorLocal,
  priorLocalNotice,
  EUM_PRIOR_TAIL,
  EUM_MUTE_MARKS,
  EUM_SUMMARY_JOIN,
  EUM_PRIOR_JOIN,
  muteMarksIn,
  muteSeparatorsIn,
  EUM_HISTORY_ROOT,
  stepState,
  historyDepth,
  historyStep,
  nextDepth,
  backAction,
  stepError,
  errorFor,
  errorAt,
  visitNo,
  EUM_VISIT_MIN,
  submitBlock,
  EUM_RETRY_FLAG,
  markRetried,
  takeRetried,
  popFromTap,
  EUM_SETTLE_MS,
  tapSettled,
} from '../lib/eumSenior.js';
// 완료 화면의 제목·본문은 접수 사실의 **한 토막**에서 갈라져 나온다(아래 제목 테스트).
import { EUM_DONE_NEXT, EUM_DONE_STATE } from '../lib/eumMessage.js';

test('선택지는 각 4개다(한 화면 버튼 4개 이내 요건)', () => {
  assert.equal(ACTIVITIES.length, 4);
  assert.equal(TIMESLOTS.length, 4);
  for (const o of [...ACTIVITIES, ...TIMESLOTS]) {
    assert.ok(o.k && o.label, '키와 표시 이름이 모두 있어야 한다');
  }
  const keys = [...ACTIVITIES, ...TIMESLOTS].map((o) => o.k);
  assert.equal(new Set(keys).size, keys.length, '키 중복 금지');
});

test('단계는 4개이고 모든 단계에 제목이 있다', () => {
  assert.equal(EUM_STEP_MAX, 4);
  for (let i = 1; i <= 4; i++) assert.ok(STEP_TITLE[i], `${i}단계 제목 누락`);
});

// ── 고친 결함: 완료 화면이 같은 사실을 **세 줄**로 말했다 ───────────────────
//
// 4단계 제목 「신청이 끝났습니다」 / 단계 표시 「완료」 / 본문 「**신청이 접수되었습니다**.
// 담당자가 곧 전화로 안내해 드립니다」 — 이 화면은 전환과 함께 제목으로 포커스를 옮기므로
// (SeniorFlow) 듣는 어르신은 같은 사실을 연달아 세 번 듣고, 보는 어르신에게는 24px 넘는
// 글자 석 줄이 같은 말을 한다. 9회차(만료·잘린 링크)·22회차(「이미 접수됐다」 패널)가 없앤
// 중복의 마지막 자리다.
// 22회차가 이 자리를 미룬 이유는 「그 h1 이 네 단계가 한 표에서 나오는 자리라, 한 단계만
// 다른 표에서 가져오면 단계 제목의 단일 출처가 갈라진다」였다 — 사실은 맞고 결론만 넓었다:
// 표를 가르지 않고 **표가 그 토막을 가리키면** 된다.
test('완료 화면 제목: 접수 사실의 토막에서 오고 본문을 되풀이하지 않는다', () => {
  // 제목은 **무엇이 되어 있는가**, 본문은 **다음에 무슨 일이 일어나는가**(패널과 같은 계약).
  assert.equal(STEP_TITLE[EUM_STEP_MAX], EUM_DONE_STATE.accepted,
    '완료 화면 제목이 접수 문구 단일 출처에서 오지 않는다');
  assert.ok(!STEP_TITLE[EUM_STEP_MAX].includes(EUM_DONE_NEXT), '제목이 본문을 그대로 담고 있다');
  assert.ok(!EUM_DONE_NEXT.includes(STEP_TITLE[EUM_STEP_MAX]), '본문이 제목을 그대로 담고 있다');
  // 옛 제목이 되살아나면 다시 세 줄이 된다.
  assert.equal(Object.values(STEP_TITLE).includes('신청이 끝났습니다'), false,
    '같은 사실을 다른 낱말로 한 번 더 말하는 제목이 되살아났다');

  // 완료 화면만 두 가지다 — 그 갈림은 이 함수 한 곳에서 한다.
  assert.equal(stepTitle(4, { already: true }), EUM_DONE_STATE.already);
  assert.equal(stepTitle(4, { already: false }), EUM_DONE_STATE.accepted);
  assert.equal(stepTitle(4), EUM_DONE_STATE.accepted, '모르면 방금 접수된 쪽으로 둔다');
  // 완료가 아닌 단계는 접수 여부와 무관하다(그 화면의 제목이 바뀌면 안 된다).
  for (const s of [1, 2, 3]) {
    assert.equal(stepTitle(s, { already: true }), STEP_TITLE[s], `${s}단계 제목이 접수 여부에 흔들린다`);
    assert.equal(stepTitle(s), STEP_TITLE[s]);
  }
  // 이상 입력에 throw 하지 않고 빈 제목을 만들지 않는다 — 제목이 비면 패널의 머리글이 사라진다.
  for (const bad of [null, undefined, '열', 0, 9, ['3'], Symbol('x')]) {
    const t = stepTitle(bad, null);
    assert.ok(typeof t === 'string' && t, `입력: ${String(bad)}`);
  }
  for (const bad of [null, 'yes', 42, [], Symbol('x')]) {
    assert.equal(stepTitle(4, bad), EUM_DONE_STATE.accepted, `state 입력: ${String(bad)}`);
  }
});

// ── 고친 결함: 단계 표시만 **화면이 손으로** 적었다 ─────────────────────────
//
// `const stepLabel = step <= 3 ? \`3단계 중 ${step}단계\` : '';` 였다(SeniorFlow).
//   (1) 흐름 단계 수를 아는 쪽은 이 파일이고(EUM_STEP_MAX · 완료는 세지 않는다) 말하는 쪽은
//       화면이었다 — 둘을 맞춰 보는 곳이 없었다(24회차의 「5분」·23회차의 수명 상한과 같은
//       모양: 값을 보장하는 쪽과 말하는 쪽이 다르다). 단계가 하나 늘면 「3단계 중 4단계」다.
//   (2) 단계에 매달린 문구의 집은 이미 여기다(STEP_TITLE) — 그 옆 한 줄만 등록부 밖이라
//       문구 표 전수 검사(묵음 경계 · tests/eummessage)가 이 문장만 보지 못했다.
//   (3) 그 자리를 지키던 테스트는 **리터럴을 고정**하고 있었다(9회차가 없앤 모양).
test('단계 표시는 단계 수에서 파생된다(화면이 숫자를 적지 않는다)', () => {
  assert.equal(EUM_FLOW_STEPS, EUM_STEP_MAX - 1, '완료 단계를 세고 있다');
  for (let s = EUM_STEP_MIN; s <= EUM_FLOW_STEPS; s++) {
    assert.equal(stepProgress(s), `${EUM_FLOW_STEPS}단계 중 ${s}단계`);
    // 낭독 영역에 들어가는 문장이다 — 묵음 기호로 두 수를 가르면 "1단계 3단계" 로 들린다
    // (예전 「1단계 / 3단계」가 바로 그 결함이었다).
    assert.deepEqual(muteSeparatorsIn(stepProgress(s)), [], `${s}단계: 묵음 경계가 들어왔다`);
  }
  // 완료 화면에서는 **아무 말도 하지 않는다**(셀 단계가 없는 화면에는 셀 것도 없다).
  assert.equal(stepProgress(EUM_STEP_MAX), '');
  // 범위 밖·이상 입력에 던지지 않고, 지어내지도 않는다.
  for (const bad of [0, 9, '열', null, undefined, [], {}, Symbol('x')]) {
    assert.doesNotThrow(() => stepProgress(bad), `입력에 던졌다: ${String(bad)}`);
  }
  assert.equal(stepProgress(EUM_FLOW_STEPS + 1), '', '완료 뒤 단계를 세고 있다');
});

test('parseStep: 범위 밖·이상값은 1단계로 되돌린다', () => {
  assert.equal(parseStep('3'), 3);
  assert.equal(parseStep(2), 2);
  assert.equal(parseStep('2.7'), 2);
  assert.equal(parseStep(['3']), 3);
  assert.equal(parseStep('0'), 1);
  assert.equal(parseStep('5'), 1);
  assert.equal(parseStep('열'), 1);
  assert.equal(parseStep(null), 1);
  assert.equal(parseStep(undefined), 1);
});

test('maxReachableStep: 선택이 쌓인 만큼만 앞으로 갈 수 있다', () => {
  assert.equal(maxReachableStep({}), 1);
  assert.equal(maxReachableStep({ activity: '없는값' }), 1);
  assert.equal(maxReachableStep({ activity: 'walk' }), 2);
  assert.equal(maxReachableStep({ activity: 'walk', timeslot: '없는값' }), 2);
  assert.equal(maxReachableStep({ activity: 'walk', timeslot: 'morning' }), 3);
  assert.equal(maxReachableStep({ done: true }), 4);
  assert.equal(maxReachableStep(null), 1);
});

test('clampStep: 새로고침으로 선택이 사라진 채 ?step=3 이면 1단계로 되돌린다', () => {
  assert.equal(clampStep(3, {}), 1);
  assert.equal(clampStep(3, { activity: 'walk' }), 2);
  assert.equal(clampStep(3, { activity: 'walk', timeslot: 'any' }), 3);
  assert.equal(clampStep(1, { activity: 'walk', timeslot: 'any' }), 1, '뒤로 가기는 허용');
});

test('clampStep: 제출 완료 뒤에는 뒤로 가도 완료 화면에 머문다(중복 제출 방지)', () => {
  assert.equal(clampStep(1, { activity: 'walk', timeslot: 'any', done: true }), 4);
  assert.equal(clampStep(9, { activity: 'walk', timeslot: 'any', done: true }), 4);
});

test('labelOf·summaryText: 값이 없거나 규격 밖이면 빈 문자열이다', () => {
  assert.equal(labelOf(ACTIVITIES, 'walk'), '산책과 나들이');
  assert.equal(labelOf(ACTIVITIES, '없는값'), '');
  assert.equal(labelOf(null, 'walk'), '');
  assert.equal(summaryText({ activity: 'walk', timeslot: 'morning' }), '산책과 나들이, 오전 9시부터 12시까지');
  assert.equal(summaryText({ activity: 'walk' }), '');
  assert.equal(summaryText(null), '');
});

// ── 귀로 들을 때 사라지는 경계 ─────────────────────────────────────────────
//
// 고친 결함: 표시 이름과 요약이 **눈에만 맞춰져 있었다.** 스크린리더는 '·'·'~'·괄호를 대개
// 읽지 않으므로(구두점 설정 기본값), 확인 화면의 요약 「산책·나들이 · 오전 (9시~12시)」는
// "산책 나들이 오전 9시 12시" 로 들렸다 — **활동과 시간대의 경계가 통째로 사라진다.** 하필
// 그 문장을 듣는 자리가 「이대로 신청하기」를 누르기 직전과 접수된 내용을 확인하는 자리다.
// 보는 쪽에서도 애매했다: 띄어 쓴 '·' 가 경계인데 활동 이름 **안에도** 같은 '·' 가 있었다.
// 8·9회차의 「한쪽 감각에만 전해진 사실」과 같은 모양이고, 이번 것은 **무엇을 신청하는가** 다.

test('표시 이름에 묵음 기호가 없다 — 구간은 낱말로 말한다(낭독 경계 불변식)', () => {
  for (const o of [...ACTIVITIES, ...TIMESLOTS]) {
    assert.deepEqual(
      muteMarksIn(o.label),
      [],
      `낭독되지 않는 기호가 표시 이름에 있다: ${o.k} = ${o.label}`,
    );
  }
  // 「부터…까지」로 말한다 — '~' 는 들리지 않아 "9시 12시" 가 되고, 9시인지 12시인지
  // 그 사이인지 귀로는 가릴 수 없다.
  for (const t of TIMESLOTS.filter((o) => o.k !== 'any')) {
    assert.match(t.label, /부터 .*까지$/, `시간 구간을 기호로 말한다: ${t.label}`);
  }
});

test('요약 구분자는 들리고, 어느 표시 이름에도 들어 있지 않다(양방향 대조)', () => {
  // 들린다: 쉼표·마침표는 어떤 리더든 쉼·문장 끝으로 바꿔 준다.
  assert.deepEqual(muteMarksIn(EUM_SUMMARY_JOIN), []);
  assert.deepEqual(muteMarksIn(EUM_PRIOR_JOIN), []);
  // 경계다: 표시 이름이 같은 글자를 들고 있으면 눈으로도 어느 것이 경계인지 알 수 없다
  // (예전 '·' 가 그랬다 — 「산책·나들이 · 오전…」).
  for (const o of [...ACTIVITIES, ...TIMESLOTS]) {
    for (const join of [EUM_SUMMARY_JOIN, EUM_PRIOR_JOIN]) {
      assert.ok(
        !o.label.includes(join.trim()),
        `구분자(${join.trim()})가 표시 이름 안에도 있다: ${o.label}`,
      );
    }
  }
  // 요약은 실제로 그 구분자 하나로만 갈린다 — 조립은 summaryText 한 곳이다.
  const s = summaryText({ activity: 'walk', timeslot: 'morning' });
  assert.equal(s.split(EUM_SUMMARY_JOIN).length, 2, `구분자가 하나여야 한다: ${s}`);
});

test('muteMarksIn: 목록에 있는 기호만 찾아내고 이상 입력에 던지지 않는다', () => {
  assert.deepEqual(muteMarksIn('가 · 나'), ['·']);
  assert.deepEqual(muteMarksIn('9시~12시 (오전)').sort(), ['(', ')', '~'].sort());
  assert.deepEqual(muteMarksIn('쉼표, 마침표.'), []);
  for (const bad of [null, undefined, 42, {}, []]) assert.deepEqual(muteMarksIn(bad), []);
  assert.ok(EUM_MUTE_MARKS.includes('·') && EUM_MUTE_MARKS.includes('~'));
});

// 잃는 것이 있을 때만 결함이다 — 양옆에 읽을 글자가 있는 기호는 **그것이 유일한 경계**이고,
// 문장 끝에 붙은 장식은 소리가 되지 않아도 뜻이 그대로다. 그 둘을 가리는 것이 이 함수다.
test('muteSeparatorsIn: 경계로 쓰인 기호만 결함으로 본다(끝에 붙은 장식은 아니다)', () => {
  // 예전 요약. '·' 는 구분자이면서 활동 이름 안에도 있었고, '~'·'(' 도 경계였다 —
  // 들리는 말은 "산책 나들이 오전 9시 12시" 였다. 끝의 ')' 는 뒤에 읽을 글자가 없어 경계가 아니다.
  assert.deepEqual(muteSeparatorsIn('산책·나들이 · 오전 (9시~12시)').sort(), ['(', '~', '·'].sort());
  assert.deepEqual(muteSeparatorsIn('1단계 / 3단계'), ['/'], '슬래시는 "1단계 3단계" 로 들린다');
  assert.deepEqual(muteSeparatorsIn('신청하는 중…'), [], '끝에 붙은 줄임표는 무엇도 가르지 않는다');
  assert.deepEqual(muteSeparatorsIn('오전 9시부터 12시까지'), [], '구간을 낱말로 말하면 경계가 들린다');
  assert.deepEqual(muteSeparatorsIn(summaryText({ activity: 'walk', timeslot: 'morning' })), []);
  assert.deepEqual(muteSeparatorsIn(priorLocalNotice(PRIOR, 'confirm')), []);
  for (const bad of [null, undefined, 42, {}, []]) assert.deepEqual(muteSeparatorsIn(bad), []);
});

test('buildPreferences: 정상 본문에는 sid·선택·제출시각만 담긴다(개인정보 없음)', () => {
  const now = 1_760_000_000_000;
  const body = buildPreferences({ sid: 's-1001', activity: 'walk', timeslot: 'morning' }, now);
  assert.deepEqual(Object.keys(body).sort(), ['activity', 'sid', 'submittedAt', 'timeslot']);
  assert.equal(body.sid, 's-1001');
  assert.equal(body.submittedAt, new Date(now).toISOString());
});

test('buildPreferences: 선택 누락·규격 밖이면 null(제출을 막는다)', () => {
  assert.equal(buildPreferences({ sid: 's-1', activity: 'walk' }), null);
  assert.equal(buildPreferences({ sid: 's-1', activity: '없는값', timeslot: 'morning' }), null);
  assert.equal(buildPreferences({ sid: '', activity: 'walk', timeslot: 'morning' }), null);
  assert.equal(buildPreferences(null), null);
});

// ── 고친 결함: 제출이 막히는 이유가 둘인데 화면은 한 가지로만 말했다 ─────────
//
// 판정이 `buildPreferences(…) === null` 하나였고, 화면은 그것을 전부 「처음부터 다시 골라
// 주세요」로 안내하며 1단계로 되돌렸다. 그런데 링크에 식별자(sid)가 없는 경우에는 **몇 번을
// 다시 골라도 같은 자리에서 막힌다** — 끝없이 처음으로 돌려보내며 되지 않는 일을 시키고,
// 그 사이 5분이 준다. 되돌릴 길은 고르기가 아니라 담당자에게 새 링크를 청하는 것이다.
test('submitBlock: 막힌 이유를 구분한다(다시 고르면 되는 것과 되지 않는 것)', () => {
  assert.equal(submitBlock({ sid: 's-1', activity: 'walk', timeslot: 'morning' }), null);
  // 링크 쪽 — 다시 고르는 것으로는 되지 않는다.
  for (const sid of ['', '   ', null, undefined, 42, {}]) {
    assert.equal(submitBlock({ sid, activity: 'walk', timeslot: 'morning' }), 'link', `sid: ${String(sid)}`);
  }
  assert.equal(submitBlock(null), 'link');
  // 고른 것 쪽 — 다시 고르면 된다.
  assert.equal(submitBlock({ sid: 's-1', activity: 'walk' }), 'selection');
  assert.equal(submitBlock({ sid: 's-1', timeslot: 'morning' }), 'selection');
  assert.equal(submitBlock({ sid: 's-1', activity: '없는값', timeslot: 'morning' }), 'selection');
  assert.equal(submitBlock({ sid: 's-1', activity: 'walk', timeslot: '없는값' }), 'selection');
  // 링크가 먼저다 — sid 도 선택도 없을 때 「다시 골라 주세요」라고 하면 되지 않는 일을 시킨다.
  assert.equal(submitBlock({ sid: '', activity: '없는값', timeslot: '없는값' }), 'link');
});

test('submitBlock ↔ buildPreferences: 두 판정이 갈라지지 않는다(양방향)', () => {
  const sids = ['s-1', '', '  s-2  ', null];
  const acts = ['walk', '없는값', undefined];
  const slots = ['morning', '', 7];
  for (const sid of sids) {
    for (const activity of acts) {
      for (const timeslot of slots) {
        const draft = { sid, activity, timeslot };
        const blocked = submitBlock(draft);
        const built = buildPreferences(draft);
        assert.equal(!!blocked, built === null, `어긋남: ${JSON.stringify(draft)} → ${blocked} / ${built}`);
      }
    }
  }
});

// ── 되살아난 화면이 「방금 다시 시도를 눌렀다」를 안다 ──────────────────────
//
// 고친 결함: 오류 경계의 「다시 시도」는 눌린 순간 자기 자신이 사라지는 단추다(reset). 그러면
// 포커스가 body 로 떨어지는데, 되살아난 흐름은 첫 렌더에서 포커스를 옮기지 않는다 — 그 규칙의
// 근거("아직 아무 조작도 하지 않았다")가 여기서는 성립하지 않는다. 그래서 어르신은 눌렀는데
// 들리는 말이 한 마디도 없고 다음 Tab 이 문서 맨 앞에서 시작한다.
function fakeRoot(initial = {}) {
  const attrs = new Map(Object.entries(initial));
  return {
    attrs,
    getAttribute: (k) => (attrs.has(k) ? attrs.get(k) : null),
    setAttribute: (k, v) => attrs.set(k, String(v)),
    removeAttribute: (k) => attrs.delete(k),
  };
}

test('markRetried/takeRetried: 적은 사실은 **한 번만** 읽힌다', () => {
  const root = fakeRoot();
  assert.equal(takeRetried(root), false, '적지 않았는데 눌렀다고 한다');
  assert.equal(markRetried(root), true);
  assert.equal(root.getAttribute(EUM_RETRY_FLAG), '1');
  assert.equal(takeRetried(root), true);
  // 지우지 않으면 같은 문서에서 흐름이 다시 그려질 때마다 누른 적 없는 누름을 근거로
  // 포커스를 빼앗는다.
  assert.equal(root.getAttribute(EUM_RETRY_FLAG), null, '읽고 지우지 않았다');
  assert.equal(takeRetried(root), false);
});

test('markRetried/takeRetried: 어떤 입력에도 던지지 않는다(단추가 죽으면 안 된다)', () => {
  for (const bad of [null, undefined, {}, 42, 'html', []]) {
    assert.equal(markRetried(bad), false, `입력: ${String(bad)}`);
    assert.equal(takeRetried(bad), false, `입력: ${String(bad)}`);
  }
  // 속성 조작이 막힌 환경(던지는 구현)에서도 통째로 죽지 않는다.
  const hostile = {
    getAttribute() { throw new Error('nope'); },
    setAttribute() { throw new Error('nope'); },
    removeAttribute() { throw new Error('nope'); },
  };
  assert.equal(markRetried(hostile), false);
  assert.equal(takeRetried(hostile), false);
  // 지울 수단이 없으면 읽지도 않는다 — 한 번만 쓰이는 사실을 되풀이해 쓰지 않는다.
  const readOnly = { getAttribute: () => '1' };
  assert.equal(takeRetried(readOnly), true);
});

// ── 화면이 바뀐 직후의 두 번째 누름 ────────────────────────────────────────
//
// 고친 결함: 이 과제는 「손이 떨려 두 번 누르는 것은 이 사용자층에서 흔하다」를 두 번 근거로
// 삼아 고쳤다(제출의 submittingRef · 되돌아가기의 backFromRef). 그런데 **앞으로 나아가는
// 쪽**에는 그 가드가 없었고, 거기서 두 번째 누름이 가장 비싸다 — 눌린 순간 화면이 다음
// 단계로 바뀌고, 1단계 선택지 네 개와 2단계 선택지 네 개는 **같은 자리·같은 모양**이다.
// 활동을 고른 손가락이 한 번 더 떨어지면 **읽지도 않은 시간대**가 고른 것이 되고, 2→3 에서는
// 그 자리 근처에 「이대로 신청하기」가 온다 — 확인 화면을 한 번도 읽지 않은 신청이 접수되고
// 링크는 1회용이라 되돌릴 길이 없다. 두 번의 탭이 **두 번의 click** 으로 도착하므로
// "같은 요소의 두 번째 누름" 을 막는 기존 두 가드로는 잡히지 않는다.
test('tapSettled: 화면이 방금 바뀌었으면 삼키고, 충분히 지났으면 받는다', () => {
  assert.ok(EUM_SETTLE_MS >= 300 && EUM_SETTLE_MS <= 1000, `기준값이 사람 손 밖으로 나갔다: ${EUM_SETTLE_MS}`);
  const t = 10_000;
  assert.equal(tapSettled(t, t), false, '같은 틱의 두 번째 누름이 통과했다');
  assert.equal(tapSettled(t, t + EUM_SETTLE_MS - 1), false, '떨림이 만드는 두 번째 탭이 통과했다');
  assert.equal(tapSettled(t, t + EUM_SETTLE_MS), true, '경계값은 받는다(누름을 삼키는 쪽으로 기울지 않는다)');
  assert.equal(tapSettled(t, t + 5_000), true, '한참 뒤의 누름까지 삼키면 화면이 먹통으로 보인다');
});

test('tapSettled: 모를 때는 **통과시킨다**(판정 실패가 누름을 삼키면 안 된다)', () => {
  // 아직 아무 이동도 없었다(문서를 막 열었다 · 되돌아온 직후) → 첫 누름은 언제나 통한다.
  assert.equal(tapSettled(null, 1000), true);
  for (const bad of [undefined, NaN, Infinity, '1000', {}, [], true]) {
    assert.equal(tapSettled(bad, 1000), true, `movedTick: ${String(bad)}`);
    assert.equal(tapSettled(1000, bad), true, `tick: ${String(bad)}`);
  }
  // 눈금이 뒤로 갔다(눈금 교체) → 얼마나 지났는지 알 수 없으므로 받는다.
  assert.equal(tapSettled(10_000, 9_000), true);
  // 기준값이 이상하면 가드를 끈다 — 모르는 값으로 어르신의 누름을 막지 않는다.
  for (const bad of [0, -1, NaN, 'x', null]) {
    assert.equal(tapSettled(10_000, 10_000, bad), true, `settleMs: ${String(bad)}`);
  }
  const junk = [undefined, null, NaN, 'x', {}, [], () => {}, Symbol.iterator];
  for (const v of junk) assert.doesNotThrow(() => tapSettled(v, v, v));
});

// ── 그 눈금을 적어야 하는 전환이 하나 더 있었다 ────────────────────────────
//
// 고친 결함: 눈금을 적는 가름선은 「그 화면 전환이 **누름의 결과**인가」인데, popstate 는
// "겨눈 손이 없다" 는 사유로 빠져 있었다. 그 사유는 브라우저가 일으킨 뒤로가기(제스처·
// 하드웨어 단추)에는 맞지만 **우리 링크를 눌러서** 일어난 되돌아가기에는 맞지 않는다 —
// 「앞 화면으로」·「다시 고르기」는 `history.back()` 을 거쳐 popstate 로 돌아온다. 그래서
// 그 누름의 두 번째 탭이 **앞 단계**에 떨어졌다: 1단계의 활동 선택지가 골라져 화면이 다시
// 2단계로 가거나(되돌아가려고 누른 손이 앞으로 간다), 2단계의 시간대가 골라진 채 확인
// 화면이 다시 열린다. 20회차가 막은 사고와 같고 방향만 반대다.
// 가름선은 그대로 둔다 — 적는 것은 **우리가 요청한** 되돌아가기뿐이고, 그 사실은 화면이
// 이미 들고 있었다(backFromRef — 14회차가 같은 자리의 두 번째 누름을 삼키려고 적는 깊이).
test('popFromTap: 우리가 요청한 되돌아가기만 「누름의 결과」로 본다', () => {
  // 요청해 둔 깊이가 적혀 있다 → 이 전환은 「앞 화면으로」·「다시 고르기」 누름의 결과다.
  assert.equal(popFromTap(1), true);
  assert.equal(popFromTap(3), true);
  // 뿌리(0)도 우리가 적은 값이다 — backAction 은 뿌리에서 가로채지 않으므로 보통 오지 않지만,
  // 적혀 있다는 사실 자체가 「우리가 요청했다」이므로 통과시킨다(모양으로만 판정한다).
  assert.equal(popFromTap(0), true);
});

test('popFromTap: 브라우저가 일으킨 뒤로가기·앞으로가기는 **모르는 쪽**이다', () => {
  // 적혀 있지 않다 = 우리가 요청하지 않았다 → 적지 않는다(멀쩡한 첫 누름을 삼키지 않게).
  assert.equal(popFromTap(null), false);
  for (const bad of [undefined, NaN, Infinity, '1', 1.5, -0.5, {}, [], true, 'x']) {
    assert.equal(popFromTap(bad), false, `입력: ${String(bad)}`);
  }
  const junk = [undefined, null, NaN, 'x', {}, [], () => {}, Symbol.iterator];
  for (const v of junk) assert.doesNotThrow(() => popFromTap(v));
});

test('넘기는 자리는 문서 속성이다(모듈 변수·저장소가 아니다)', () => {
  // 모듈 변수는 번들 경계마다 갈라지고(12회차의 소진 스토어), 저장소는 문서를 넘겨 살아남아
  // 다음에 링크를 여는 어르신이 누른 적 없는 누름의 뒤처리를 받는다.
  assert.match(EUM_RETRY_FLAG, /^data-[a-z-]+$/, '문서 속성 이름이 아니다');
});

// ── 고른 것을 주소에 남긴다 ────────────────────────────────────────────────
// 고친 결함: 선택이 화면 메모리에만 있어, 탭이 되살아나며 다시 불러와지면(문자 확인하러 앱을
// 바꿨다 돌아오는 것만으로도 일어난다) 고른 것이 전부 사라지고 1단계로 돌아갔다. 링크 수명은
// 5분이라 두어 번이면 링크가 먼저 죽는다. 아래 계약이 그 회귀를 막는다.

test('parseDraft: Next 의 searchParams(평면 객체)와 URLSearchParams 를 모두 읽는다', () => {
  assert.deepEqual(parseDraft({ a: 'walk', t: 'morning' }), { activity: 'walk', timeslot: 'morning' });
  assert.deepEqual(
    parseDraft(new URLSearchParams('step=3&a=talk&t=any')),
    { activity: 'talk', timeslot: 'any' },
  );
  // 같은 이름이 여러 번 실리면 첫 값만 본다(?a=walk&a=talk).
  assert.deepEqual(parseDraft({ a: ['walk', 'talk'] }), { activity: 'walk', timeslot: '' });
});

test('parseDraft: 주소는 누구나 고친다 — 목록 밖 값은 빈 값으로 떨어진다', () => {
  for (const bad of ['<script>', 'WALK', 'walk ', '없는값', '', '../../etc', 'walk&t=any']) {
    assert.equal(parseDraft({ a: bad }).activity, '', `거르지 못한 값: ${bad}`);
  }
  assert.deepEqual(parseDraft({ a: { k: 'walk' }, t: 7 }), { activity: '', timeslot: '' });
  assert.deepEqual(parseDraft(null), { activity: '', timeslot: '' });
  assert.deepEqual(parseDraft(undefined), { activity: '', timeslot: '' });
});

test('parseDraft: 읽다가 던지는 객체에도 throw 하지 않는다(뒤로가기가 화면을 죽이면 안 된다)', () => {
  const hostile = { get value() { throw new Error('boom'); } };
  Object.defineProperty(hostile, 'a', { get() { throw new Error('boom'); }, enumerable: true });
  assert.deepEqual(parseDraft(hostile), { activity: '', timeslot: '' });
});

test('normalizeDraft: 규격 밖 선택은 고르지 않은 것과 같게 다룬다', () => {
  assert.deepEqual(normalizeDraft({ activity: 'walk', timeslot: 'any' }), { activity: 'walk', timeslot: 'any' });
  assert.deepEqual(normalizeDraft({ activity: 'walk', timeslot: '없는값' }), { activity: 'walk', timeslot: '' });
  assert.deepEqual(normalizeDraft(null), { activity: '', timeslot: '' });
  // 넘겨도 되는 값만 나온다 — done·sid 같은 것이 섞여 나가지 않는다.
  assert.deepEqual(
    Object.keys(normalizeDraft({ activity: 'walk', timeslot: 'any', done: true, sid: 's-1' })).sort(),
    ['activity', 'timeslot'],
  );
});

test('stepQuery: 단계와 고른 것을 함께 싣고, 고르지 않은 것은 싣지 않는다', () => {
  assert.equal(stepQuery(1, {}), '?step=1');
  assert.equal(stepQuery(2, { activity: 'walk' }), '?step=2&a=walk');
  assert.equal(stepQuery(3, { activity: 'walk', timeslot: 'morning' }), '?step=3&a=walk&t=morning');
  assert.equal(stepQuery(3, { activity: '없는값', timeslot: 'morning' }), '?step=3&t=morning');
  assert.equal(stepQuery('9', { activity: 'walk' }), '?step=1&a=walk', '범위 밖 단계는 1로');
});

test('stepQuery: 완료(done)는 어떤 경우에도 주소에 실리지 않는다', () => {
  // 실으면 주소 한 줄로 「신청이 접수되었습니다」 화면이 만들어진다.
  const q = stepQuery(4, { activity: 'walk', timeslot: 'any', done: true });
  assert.equal(q, '?step=4&a=walk&t=any');
  assert.ok(!q.includes('done'), `완료 상태가 주소에 실렸다: ${q}`);
  assert.ok(!Object.keys(DRAFT_PARAM).includes('done'));
});

test('stepQuery: 주소에 나가는 값은 고정 어휘뿐이라 이스케이프가 필요 없다', () => {
  const values = [...ACTIVITIES, ...TIMESLOTS].map((o) => o.k);
  for (const v of values) {
    assert.match(v, /^[a-z]+$/, `주소에 그대로 실리는 값은 안전한 문자여야 한다: ${v}`);
    assert.equal(encodeURIComponent(v), v);
  }
  // 파라미터 이름도 짧은 고정 어휘다(토큰 옆에 긴 흔적을 남기지 않는다).
  for (const k of Object.values(DRAFT_PARAM)) assert.match(k, /^[a-z]$/);
});

test('주소 왕복: 고른 것이 그대로 돌아오고 단계도 유지된다(탭 복원)', () => {
  for (const a of ACTIVITIES) {
    for (const t of TIMESLOTS) {
      const draft = { activity: a.k, timeslot: t.k };
      const q = new URLSearchParams(stepQuery(3, draft).slice(1));
      assert.deepEqual(parseDraft(q), draft);
      assert.equal(clampStep(parseStep(q.get('step')), { ...parseDraft(q), done: false }), 3);
    }
  }
});

test('주소 왕복: 선택을 지운 주소는 단계도 함께 되돌아간다(건너뛰기 불가)', () => {
  const forged = new URLSearchParams('step=3&a=없는값&t=morning');
  const draft = parseDraft(forged);
  assert.deepEqual(draft, { activity: '', timeslot: 'morning' });
  assert.equal(clampStep(parseStep(forged.get('step')), { ...draft, done: false }), 1);
});

test('주소만으로는 완료 화면에 닿을 수 없다(접수는 서버 응답에서만 온다)', () => {
  const q = new URLSearchParams('step=4&a=walk&t=morning&done=1');
  const draft = parseDraft(q);
  assert.ok(!('done' in draft));
  assert.equal(clampStep(parseStep(q.get('step')), { ...draft, done: false }), 3, '확인 화면까지만');
});

// ── 복원의 기준은 **지금 주소**다 ─────────────────────────────────────────
//
// 고친 결함: 복원이 서버가 넘긴 값(initialStep·initialDraft)을 기준으로 삼았다. 그 값은
// **문서를 열 때의 주소**를 찍은 사진이고, 단계 이동은 pushState 라 서버를 거치지 않으므로
// 그 뒤의 주소를 모른다. 문서가 열려 있는 동안 화면이 다시 마운트되는 길이 하나 있었다 —
// 오류 화면의 「다시 시도」(Next 의 `reset()` 은 경계 상태만 비우고 **같은 자식을 다시
// 그린다** · 재요청·새로고침이 없다). 그래서 3단계에서 오류를 만난 어르신이 이 흐름의
// **유일한 되돌리기 수단**을 누르면 1단계·빈 선택으로 돌아가고, 마지막 사본이던 주소까지
// 같은 숨에 지워졌다(화면이 그 사진으로 replaceState 했다). 수명은 5분이다.
test('restorePoint: 지금 주소가 기준이고 서버가 넘긴 값은 폴백이다', () => {
  const photo = { step: '1', activity: '', timeslot: '' };          // 문서를 열 때의 주소
  const live = { step: '3', activity: 'walk', timeslot: 'morning' }; // 그 뒤로 고른 것
  assert.deepEqual(restorePoint(photo, live), { step: 3, activity: 'walk', timeslot: 'morning' });
  // 처음 열린 문서에서는 둘이 **같은 주소**다 — 그래서 첫 그림이 어긋나지 않는다.
  assert.deepEqual(restorePoint(live, live), restorePoint(live, null));
});

test('restorePoint: 주소를 못 읽은 것(null)과 「1단계·빈 선택」은 다른 사실이다', () => {
  const photo = { step: '3', activity: 'walk', timeslot: 'morning' };
  // 못 읽었다 → 사진으로 떨어진다(고른 것을 잃지 않는다).
  assert.deepEqual(restorePoint(photo, null), { step: 3, activity: 'walk', timeslot: 'morning' });
  // 읽었고 비어 있다 → 주소가 맞다(주소는 누구나 고칠 수 있고, 그것이 진짜 지금 상태다).
  assert.deepEqual(restorePoint(photo, { step: '1' }), { step: 1, activity: '', timeslot: '' });
  // 객체가 아닌 값은 「못 읽었다」와 같게 다룬다 — 모르는 것을 믿지 않는다.
  for (const bad of [undefined, '', 0, false, 'x', [], NaN]) {
    assert.deepEqual(restorePoint(photo, bad), { step: 3, activity: 'walk', timeslot: 'morning' });
  }
});

test('restorePoint: 규격 밖 값은 화이트리스트로 떨어지고 단계도 함께 되돌아간다', () => {
  const at = restorePoint(null, { step: '3', activity: '없는값', timeslot: 'morning' });
  assert.deepEqual(at, { step: 3, activity: '', timeslot: 'morning' });
  assert.equal(clampStep(at.step, { ...at, done: false }), 1, '건너뛰기가 통하면 안 된다');
  // 양쪽이 다 없으면 첫 화면·빈 선택이다(그 자리에서 지어낼 것이 없다).
  assert.deepEqual(restorePoint(null, null), { step: 1, activity: '', timeslot: '' });
});

test('restorePoint: 어떤 입력에도 throw 하지 않는다(복원이 화면을 죽이면 안 된다)', () => {
  const junk = [undefined, null, NaN, Infinity, 'x', 0, [], () => {}, Symbol.iterator,
    { step: Symbol.iterator }, { step: {}, activity: {}, timeslot: [] }];
  for (const a of junk) {
    for (const b of junk) assert.doesNotThrow(() => restorePoint(a, b));
  }
  // 프로토타입에서 끌어온 값이 선택으로 통과하지 않는다.
  assert.deepEqual(restorePoint(null, { activity: 'constructor', timeslot: '__proto__' }),
    { step: 1, activity: '', timeslot: '' });
});

// ── 되돌아가기가 실제로 되돌아가는가 ──────────────────────────────────────
//
// 고친 결함: 「앞 화면으로」·「다시 고르기」는 href 를 가진 <a> 인데 onClick 이 **조건 없이**
// preventDefault + history.back() 을 했다. 두 자리에서 깨졌다.
//   ① 되돌아갈 항목이 없으면(문서가 ?step=2 로 직접 열린 경우 — 단계 복원은 replaceState 라
//      항목을 쌓지 않는다) history.back() 은 **던지지 않고 조용히 아무것도 하지 않는다**.
//      그래서 catch 폴백도 돌지 않고, 멀쩡한 href 를 preventDefault 가 막은 채 **꼼짝하지
//      않는 단추**가 된다 — 이 화면의 유일한 되돌리기 수단이 그것이다.
//   ② 두 번 눌리면 -1 이 두 번 쌓여(traversal 은 큐에 들어간다) 앞 단계를 지나쳐 **신청 화면
//      밖**으로 나간다. 링크는 문자 안에 있고 수명은 5분이라 돌아오는 길이 없다.
// 그래서 우리가 쌓은 항목에만 깊이를 적고, 그것을 보고서 가로챈다.

test('stepState: 쌓은 항목에만 깊이가 남고 뿌리는 0이다', () => {
  assert.deepEqual(stepState(2, 1), { step: 2, depth: 1 });
  assert.deepEqual(stepState(1, EUM_HISTORY_ROOT), { step: 1, depth: 0 });
  // 단계는 언제나 1~4 로 좁혀진다(parseStep 과 같은 규칙).
  assert.deepEqual(stepState('9', 3), { step: 1, depth: 3 });
  // 깊이가 수가 아니거나 음수면 뿌리로 본다 — 모를 때 가로채지 않는 쪽이 안전하다.
  for (const bad of [undefined, null, -1, 1.5, '2', NaN, {}]) {
    assert.equal(stepState(2, bad).depth, 0, `깊이: ${String(bad)}`);
  }
});

test('historyDepth·nextDepth: 우리가 적은 상태만 깊이로 읽는다', () => {
  assert.equal(historyDepth({ step: 2, depth: 1 }), 1);
  assert.equal(nextDepth({ step: 2, depth: 1 }), 2);
  // 다른 페이지가 남긴 상태·형식 불량·없음은 전부 뿌리(0) → 다음은 1.
  for (const bad of [null, undefined, {}, { depth: '1' }, { depth: -3 }, [1], 'x', 7]) {
    assert.equal(historyDepth(bad), 0, `상태: ${JSON.stringify(bad)}`);
    assert.equal(nextDepth(bad), 1);
  }
});

// ── 고친 결함: 떠나는 항목의 주소가 거기서 고른 것을 몰랐다 ──────────────────
// 고른 것은 쌓는 항목의 주소에만 실려, 되돌아오면 그 항목이 **고른 것이 빠진 주소**를
// 되살렸다(1단계 항목은 끝까지 단계만 적힌 채였다). 그 주소를 그 자리에서 고쳐 쓰려면
// "지금 항목이 어느 단계인가" 를 알아야 하는데, 믿을 수 있는 단서는 그 항목에 우리가 적어
// 둔 `step` 하나뿐이다 — 모르면 **고치지 않는다**(historyDepth 의 "모를 때는 가로채지
// 않는다" 와 같은 쪽으로 기운다. 어느 화면의 항목인지 모르면서 주소를 바꾸면 주소가 화면을
// 더 심하게 잘못 설명한다).
test('historyStep: 우리가 적은 단계만 읽고, 모르면 0(주소를 건드리지 않는다)', () => {
  assert.equal(historyStep(stepState(2, 1)), 2);
  assert.equal(historyStep({ step: 4, depth: 3 }), 4);
  assert.equal(historyStep({ step: 1 }), 1, '깊이가 없어도 단계는 읽는다(예전 형식)');
  for (const bad of [null, undefined, {}, { step: 0 }, { step: 5 }, { step: '2' }, { step: 2.5 }, [2], 'x', 7]) {
    assert.equal(historyStep(bad), 0, `상태: ${JSON.stringify(bad)}`);
  }
});

test('backAction: 되돌아갈 항목이 없으면 가로채지 않는다(링크가 제 일을 한다)', () => {
  // 가장 중요한 경로 — 예전에는 여기서 preventDefault 만 하고 아무 일도 일어나지 않았다.
  assert.equal(backAction(stepState(2, EUM_HISTORY_ROOT), null), 'follow');
  assert.equal(backAction(null, null), 'follow', '히스토리 상태를 읽을 수 없어도 링크는 간다');
  assert.equal(backAction({ step: 2 }, null), 'follow', '예전 형식(깊이 없음)도 링크로 간다');
});

test('backAction: 같은 자리에서 두 번째 누름은 삼킨다(화면 밖으로 나가지 않게)', () => {
  const at2 = stepState(2, 1);
  assert.equal(backAction(at2, null), 'back', '첫 누름은 되돌아간다');
  assert.equal(backAction(at2, 1), 'ignore', '응답이 오기 전의 두 번째 누름');
  // 되돌아간 뒤에는 깊이가 달라지므로 다시 받는다(화면이 popstate 에서 비운다).
  assert.equal(backAction(stepState(1, EUM_HISTORY_ROOT), 1), 'follow');
  assert.equal(backAction(stepState(3, 2), 1), 'back', '다른 자리의 누름은 삼키지 않는다');
});

test('backAction: 1→2→3 을 쌓았다 되돌아가는 왕복이 끝까지 성립한다', () => {
  let state = stepState(1, EUM_HISTORY_ROOT);          // 진입(복원 · replaceState)
  const stack = [state];
  for (const step of [2, 3]) {                          // 고를 때마다 pushState
    state = stepState(step, nextDepth(state));
    stack.push(state);
  }
  assert.deepEqual(stack.map((s) => s.depth), [0, 1, 2]);
  // 꼭대기에서 두 번 되돌아가면 뿌리에 닿고, 그 뒤로는 링크가 받는다(문서 밖으로 나가지 않는다).
  assert.equal(backAction(stack[2], null), 'back');
  assert.equal(backAction(stack[1], null), 'back');
  assert.equal(backAction(stack[0], null), 'follow');
});

// ── 안내는 자기 단계에만 머문다 ───────────────────────────────────────────
//
// 고친 결함: 제출 실패 안내가 글자열 하나였고(`useState('')`), 비우는 곳은 다음 제출의 첫
// 줄뿐이었다. 단계를 옮기는 길은 어느 쪽도 비우지 않으므로 안내가 **자기 화면을 떠나**
// 고르는 화면까지 따라다녔다 — 거기서 「아래 단추」는 선택지 버튼이고, 안내대로 누른
// 어르신은 재시도가 아니라 다음 화면으로 넘어간다.
// 정정: 이 테스트는 한동안 안내가 **단계만** 들고 있는 모양을 고정했다(deepEqual 에 step·text
// 둘뿐). 단계는 같은 번호로 몇 번이고 되돌아오는 자리라 그것만으로는 안내가 머물 자리를
// 가릴 수 없었다 — 아래 「같은 화면의 다른 방문」 참조. 계약을 **더 좁게** 다시 적는다.
test('stepError: 안내는 그것이 속한 단계·방문과 함께만 존재한다(빈 안내는 만들지 않는다)', () => {
  assert.deepEqual(stepError(3, '연결이 원활하지 않습니다', 2),
    { step: 3, visit: 2, text: '연결이 원활하지 않습니다' });
  // 할 말이 없으면 안내 자체가 없다 — 빈 줄을 그리지 않게.
  for (const empty of ['', '   ', null, undefined, 42, {}]) {
    assert.equal(stepError(3, empty, 1), null, `입력: ${String(empty)}`);
  }
  // 단계는 언제나 규격 안으로 잘린다(주소·상태가 이상해도 안내가 어느 화면에도 속하지 않는
  // 유령이 되지 않게 — parseStep 과 같은 규칙으로 1단계로 떨어진다).
  assert.equal(stepError(9, '가', 0).step, 1);
  assert.equal(stepError('x', '가', 0).step, 1);
  assert.equal(stepError(2.7, '가', 0).step, 2);
  // 방문 번호도 같다 — 정수가 아니거나 음수면 첫 방문으로 떨어진다(visitNo).
  for (const bad of [undefined, null, '2', 2.5, -1, NaN, {}]) {
    assert.equal(stepError(3, '가', bad).visit, EUM_VISIT_MIN, `입력: ${String(bad)}`);
  }
  assert.equal(visitNo(7), 7);
});

test('errorFor: 다른 단계의 안내는 한 글자도 그리지 않는다(따라다니지 않는다)', () => {
  const at3 = stepError(3, '연결이 원활하지 않습니다. 한 번 더 눌러 주세요', 5);
  assert.equal(errorFor(at3, 3, 5), at3.text);
  for (const step of [1, 2, 4]) {
    assert.equal(errorFor(at3, step, 5), '', `${step}단계에 다른 화면의 안내가 남는다`);
  }
  // 고르는 화면에 속한 안내는 그 화면에서만 보인다(「처음부터 다시 골라 주세요」).
  const at1 = stepError(1, '선택이 저장되지 않았습니다. 처음부터 다시 골라 주세요', 5);
  assert.equal(errorFor(at1, 1, 5), at1.text);
  assert.equal(errorFor(at1, 3, 5), '');
  // 안내가 없거나 형식이 다르면 아무것도 그리지 않는다(여기서 던지면 화면이 통째로 죽는다).
  // 방문이 **적혀 있지 않은** 안내도 그리지 않는다 — 어느 방문의 것인지 모르는 안내를
  // 그리면 이 함수가 막아야 하는 결과가 그대로 돌아온다.
  for (const bad of [
    null, undefined, '', '문자열', 7, [], ['가'], { step: 3 }, { text: '' }, { text: 1, step: 3 },
    { step: 3, text: '가' }, { step: 3, text: '가', visit: '0' },
  ]) {
    assert.equal(errorFor(bad, 3, 0), '', `입력: ${JSON.stringify(bad) ?? String(bad)}`);
  }
});

// ── 고친 결함: 같은 화면의 **다른 방문**에 조금 전의 실패가 되살아났다 ───────
//
// 안내에 적힌 것이 단계뿐이었다. 확인 화면(3단계)에서 제출이 실패해 안내가 뜨고, 어르신이
// 「다시 고르기」로 2단계에 가면 안내는 사라진다(단계가 다르다). 그런데 시간대를 다시 골라
// 3단계로 돌아오면 **그 안내가 다시 뜬다** — 아직 아무것도 누르지 않았는데 빨간 안내가
// 이미 떠 있고, 「한 번 더 눌러 주세요」는 누른 적 없는 누름을 가리킨다. 하필 그 경로가 가장
// 흔하다(실패를 본 어르신이 가장 먼저 누르는 것이 되돌아가기다).
test('errorFor: 되돌아갔다 돌아온 같은 화면에는 조금 전의 안내가 되살아나지 않는다', () => {
  // 3단계 첫 방문(번호 2)에서 실패했다.
  const failed = stepError(3, '연결이 원활하지 않습니다. 한 번 더 눌러 주세요', 2);
  assert.equal(errorFor(failed, 3, 2), failed.text, '실패한 그 화면에는 떠야 한다');
  // 「다시 고르기」 → 2단계(번호 3). 단계가 다르므로 보이지 않는다(종전 계약).
  assert.equal(errorFor(failed, 2, 3), '');
  // 시간대를 다시 골라 3단계로 **돌아왔다**(번호 4). 단계는 같지만 방문이 다르다.
  assert.equal(errorFor(failed, 3, 4), '', '같은 단계로 돌아오자 조금 전의 실패가 되살아났다');
  // 되돌아가기가 가로채이지 않아 번호가 그대로인 경우는 없다 — 단계를 바꾸는 자리가
  // 하나뿐이고(enterStep) 거기서 번호가 반드시 오른다. 그 계약은 화면 쪽 소스 대조가 든다.
  assert.notEqual(errorFor(failed, 3, 2), '');
});

// ── 고친 결함: 안내 자리가 **단계 블록 안**에 있어 영역이 단계와 함께 태어났다 ──
//
// 안내 자리는 단계마다 다르다(고르는 화면은 선택지 위 · 확인 화면은 주버튼 뒤). 그 둘을
// 각자의 단계 블록 **안**에 두었더니, 1단계 쪽에서는 낭독 영역이 그 단계와 **함께 태어났다** —
// 제출이 `'selection'` 으로 막히면 `go(1, …)` 과 `setError` 가 같은 커밋에서 일어난다.
// 자리는 블록 바로 앞으로 옮기면 그대로이므로(그 자리가 곧 「선택지 위」다) 영역만 꺼냈고,
// 그 대신 그리는 쪽이 **이 자리의 안내인가**를 묻는다. 묻지 않으면 안내 하나가 두 자리에
// 그려진다(영역을 블록 밖으로 꺼낸 순간 그 자리는 모든 단계에서 살아 있다).
test('errorAt: 자기 자리의 안내만 그린다(한 안내가 두 자리에 뜨지 않는다)', () => {
  const at1 = stepError(1, '선택이 저장되지 않았습니다. 처음부터 다시 골라 주세요', 2);
  const at3 = stepError(3, '연결이 원활하지 않습니다. 한 번 더 눌러 주세요', 2);
  // 1단계에 매달린 안내는 1단계 자리에만 — 같은 화면의 확인 화면 자리에는 그려지지 않는다.
  assert.equal(errorAt(at1, 1, 1, 2), at1.text);
  assert.equal(errorAt(at1, 3, 1, 2), '');
  // 확인 화면의 실패도 마찬가지다. 예전처럼 자리를 묻지 않으면 3단계에서 두 자리가 함께 뜬다.
  assert.equal(errorAt(at3, 3, 3, 2), at3.text);
  assert.equal(errorAt(at3, 1, 3, 2), '');
  // 자리 이름이 지금 단계와 같을 때만 errorFor 의 판정으로 넘어간다 — 단계·방문 계약은 그대로다.
  assert.equal(errorAt(at3, 3, 3, 9), '', '다른 방문의 안내가 자리 판정만으로 통과했다');
  assert.equal(errorAt(at3, 2, 2, 2), '', '그 단계에 속하지 않은 안내가 그려졌다');
  // 자리 이름이 규격 밖이면 parseStep 과 같은 규칙으로 1단계로 떨어진다(유령 자리를 만들지 않는다).
  assert.equal(errorAt(at1, 'x', 1, 2), at1.text);
  assert.equal(errorAt(at3, 'x', 3, 2), '');
  // 던지지 않는다 — 여기서 던지면 안내 한 줄 때문에 신청 화면이 통째로 죽는다.
  for (const bad of [null, undefined, '', 7, [], { step: 3 }]) {
    assert.equal(errorAt(bad, 3, 3, 2), '', `입력: ${JSON.stringify(bad) ?? String(bad)}`);
  }
});

test('storageKey: sid 별로 구분되고 값이 없으면 빈 문자열이다', () => {
  assert.equal(storageKey('s-1001'), 'dars.eum.senior.s-1001');
  assert.notEqual(storageKey('s-1001'), storageKey('s-1002'));
  assert.equal(storageKey(''), '');
  assert.equal(storageKey(null), '');
});

// ── 보조 사본을 읽는다(쓰기만 하고 아무도 읽지 않던 것) ────────────────────
//
// 왜 중요한가: 소진 기록은 토큰 만료와 함께 사라지므로, 만료 뒤 새 링크를 받은 사람에게 서버는
// "전에 신청했는가" 를 답할 수 없다(「알려진 한계」). 그런데 그 기기는 답을 들고 있었다 —
// 어르신은 링크를 문자로 받고 새 링크도 같은 전화로 온다. 가장 흔한 중복은 "됐는지 몰라서
// 한 번 더" 이고, 전에 낸 내용을 보여 주면 그 이유가 사라진다.

test('parsePriorLocal: 제출 때 써 둔 사본을 그대로 다시 읽는다(왕복)', () => {
  const body = buildPreferences({ sid: 's-1001', activity: 'walk', timeslot: 'morning' });
  assert.deepEqual(parsePriorLocal(JSON.stringify(body)), { activity: 'walk', timeslot: 'morning' });
  // 사본에 들어 있던 다른 필드(sid·submittedAt)는 넘어오지 않는다 — 화면이 쓸 것만 남는다.
  assert.deepEqual(Object.keys(parsePriorLocal(JSON.stringify(body))).sort(), ['activity', 'timeslot']);
});

test('parsePriorLocal: 저장소는 누구나 고칠 수 있다 — 규격 밖은 전부 null(지어내지 않는다)', () => {
  for (const bad of [
    null, undefined, 42, '', '   ', '{', '[]', 'null', '"walk"',
    '{"activity":"walk"}',                         // 반쪽짜리 — 시간대가 없다
    '{"timeslot":"morning"}',
    '{"activity":"없는값","timeslot":"morning"}',   // 화이트리스트 밖
    '{"activity":"walk","timeslot":"새벽"}',
    '[{"activity":"walk","timeslot":"morning"}]',  // 배열은 기록이 아니다
  ]) {
    assert.equal(parsePriorLocal(bad), null, `입력: ${String(bad)}`);
  }
});

const PRIOR = { activity: 'walk', timeslot: 'morning' };

test('priorLocalNotice: 아는 것만 말하고, 모르면 한 글자도 그리지 않는다', () => {
  const msg = priorLocalNotice(PRIOR, 'confirm');
  assert.match(msg, /이 기기에서/, '어디까지 아는지를 분명히 말해야 한다(서버가 아니라 이 기기다)');
  assert.ok(msg.includes(summaryText(PRIOR)), '전에 낸 내용이 문장에 있어야 한다');
  assert.match(msg, /다시 신청하지 않으셔도 됩니다/, '중복을 내지 않아도 된다는 것이 이 문장의 목적이다');
  // 「이미 접수됐다」고 단정하지 않는다 — 이 기기의 사본은 서버 기록이 아니다.
  assert.ok(!/접수되었습니다|이미 신청하셨습니다/.test(msg), '서버만이 접수를 단정할 수 있다');
  for (const bad of [null, undefined, {}, { activity: 'walk' }, { activity: 'x', timeslot: 'morning' }]) {
    assert.equal(priorLocalNotice(bad, 'confirm'), '', `입력: ${JSON.stringify(bad)}`);
  }
});

// ── 같은 사실, 자리마다 다른 「다음에 할 일」 ──────────────────────────────
//
// 고친 결함: 끝 문장이 「다시 신청하지 않으셔도 됩니다」 하나로 박혀 있었고, 그 안내가 쓰이는
// 자리는 확인 화면 하나뿐이었다. 그런데 **만료 화면**에서도 같은 사실을 말해야 한다 —
// 신청을 마친 어르신이 링크가 죽은 뒤 다시 열면 소진 기록은 토큰과 함께 사라져 서버는 답할 수
// 없고, 그 화면은 만료 안내만 하고 끝나므로 어르신은 새 링크를 청해 처음부터 다시 고른다.
// 그 자리에서 「다시 신청하지 않으셔도」는 말이 되지 않는다 — 누를 것이 없다.
//
// (그리고 그 고침도 **절반**이었다 — 셋째 자리가 있었다. 「이미 신청하셨습니다」 화면은 접수가
//  끝난 화면이라 하지 않아도 되는 일이 또 다르다: 다시 신청하는 것도 새 링크를 청하는 것도
//  아니라 **담당자에게 전화해 무엇이 접수됐는지 묻는 것**이고, 그 화면의 안내가 바로 그것을
//  시키고 있었다(「접수된 내용은 담당자에게 확인해 주세요」 · 서버가 내용을 모를 때).)
//
// (자리 이름이 **다섯**이 된 이유는 lib/eumSenior 의 그 등록부 주석에 있다 — 쓰이는 자리가
//  다섯인데 이름이 셋이라 만료 둘과 「이미 접수됐다」 둘이 이름을 함께 썼고, 그 동안 양방향
//  대조도 다섯 자리를 셋으로만 보았다. 지금 **말이 갈리는 상황**은 여전히 셋이고, 같은 말을
//  해야 하는 쌍은 문장 한 벌을 공유한다 — 아래 두 가지를 함께 고정한다.)
test('priorLocalNotice: 상황마다 끝 문장이 다르고, 적지 않으면 아무 말도 하지 않는다', () => {
  const confirm = priorLocalNotice(PRIOR, 'confirm');
  const expired = priorLocalNotice(PRIOR, 'expiredEntry');
  const used = priorLocalNotice(PRIOR, 'usedEntry');
  // 세 **상황**이 서로 다른 말을 해야 한다 — 같은 문장이 두 상황에 붙으면 그중 하나는 그
  // 화면에 없는 일을 가리킨다(한 문장이 조건 없이 모든 자리에 붙던 것이 이 결함의 원인이다).
  assert.equal(new Set([confirm, expired, used]).size, 3, '상황마다 할 수 있는 말이 다르다');
  // 같은 말을 해야 하는 **쌍**은 한 벌을 공유한다(진입·작성 중 만료 · 진입 안내·완료 화면).
  // 글자를 두 벌로 적으면 한쪽만 고쳐지는 날이 오고, 그날 두 화면이 다른 말을 한다.
  assert.equal(priorLocalNotice(PRIOR, 'expiredFlow'), expired, '두 만료 화면이 갈라졌다');
  assert.equal(priorLocalNotice(PRIOR, 'usedDone'), used, '「이미 접수됐다」 두 화면이 갈라졌다');
  assert.match(expired, /새 링크를 청하지 않으셔도 됩니다/, '만료 화면에서 하지 않아도 되는 일은 새 링크 요청이다');
  assert.match(used, /따로 확인하지 않으셔도 됩니다/, '접수가 끝난 화면에서 하지 않아도 되는 일은 담당자 확인이다');
  // 접수가 끝난 화면에서 「다시 신청」·「새 링크」를 말하면 그 화면에 없는 일을 가리킨다.
  assert.ok(!/다시 신청|새 링크/.test(used), `접수가 끝난 화면에 없는 일을 가리킨다: ${used}`);
  // 앞부분(아는 사실)은 세 자리가 같아야 한다 — 사실이 자리마다 달라지면 안 된다.
  // 절을 가르는 자리는 줄표(' — ')가 아니라 마침표다: 줄표는 낭독되지 않아 세 토막이
  // "내용이 있습니다 산책 나들이 오전 9시 12시 그대로 괜찮으시면" 으로 들러붙었다.
  for (const msg of [confirm, expired, used]) {
    assert.ok(msg.startsWith(`이 기기에서 전에 신청하신 내용이 있습니다${EUM_PRIOR_JOIN}${summaryText(PRIOR)}.`));
    assert.ok(!msg.includes(' — '), `낭독되지 않는 줄표로 절을 가르고 있다: ${msg}`);
  }
  // 기본값을 두지 않는다: 자리를 적지 않으면 **아무 말도 하지 않는다**(틀린 말을 조용히 붙이는
  // 것보다 낫다 — EUM_NOTICE_FOOT 과 같은 계약). 프로토타입 이름도 통과하지 않는다.
  for (const bad of [undefined, '', 'nowhere', 'constructor', '__proto__', 'toString', 42, null]) {
    assert.equal(priorLocalNotice(PRIOR, bad), '', `자리: ${String(bad)}`);
  }
});

test('priorLocalNotice: 등록부의 모든 자리가 쓸 수 있는 문장을 들고 있다', () => {
  const keys = Object.keys(EUM_PRIOR_TAIL);
  // 이름은 **쓰이는 자리 수와 같다**(다섯) — 화면 쪽 양방향 대조는 tests/eumseniorui 가 한다.
  assert.deepEqual(keys.sort(),
    ['confirm', 'expiredEntry', 'expiredFlow', 'usedDone', 'usedEntry'],
    '자리가 늘면 화면 대조도 함께 갱신해야 한다');
  for (const [k, tail] of Object.entries(EUM_PRIOR_TAIL)) {
    assert.equal(typeof tail, 'string');
    assert.ok(tail.endsWith('.'), `${k}: 문장이 끊겨 있다`);
    assert.ok(!/접수되었습니다|이미 신청하셨습니다/.test(tail), `${k}: 서버만이 접수를 단정할 수 있다`);
    assert.ok(priorLocalNotice(PRIOR, k).includes(tail), `${k}: 등록한 문장이 쓰이지 않는다`);
  }
});
