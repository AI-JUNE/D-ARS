// tests/eumrepeat.test.mjs — 「이미 접수된 링크」를 화면이 **정직하게** 다루는지 고정한다.
//
// 배경: 1회용 판정(lib/eumConsume)은 중복 접수를 막았지만, 막은 **뒤**의 화면이 거짓말을 했다.
//   ① 연결이 끊겨 재시도하는 사이에 다른 활동을 고른 어르신은, 접수되지 않은 새 선택을
//      "접수되었습니다" 라는 문장과 함께 보았다(담당자에게 간 것은 첫 선택이다).
//   ② 이미 신청을 마친 링크를 다시 열면 멀쩡한 첫 화면이 나와, 세 화면을 다 지난 **뒤에야**
//      409 를 만났다. 헛걸음이고, 그 사이 어르신은 신청이 바뀌고 있다고 믿는다.
//   ③ 남은 시간이 얼마 없을 때 누른 제출은 응답을 기다리는 동안 눈금이 0 에 닿아, 방금 접수된
//      신청이 화면에서는 「링크가 만료되었습니다」가 되었다.
// 이 파일은 그 셋이 되돌아오지 않게 막는다.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  CONSUME_NOTE_FIELDS,
  consumeKey,
  createConsumeStore,
  sanitizeNote,
} from '../lib/eumConsume.js';
import { EUM_DONE_MESSAGE, EUM_DONE_NEXT, EUM_DONE_STATE } from '../lib/eumMessage.js';
import { parseAccepted } from '../lib/eumSenior.js';
import { issueEumToken } from '../lib/eumToken.js';
// 주석 걷어내기는 **한 곳**에서 가져온다(lib/sourceLint) — 이 파일도 두 자리에서 손으로
// 짓고 있었고, 같은 함수가 테스트 파일 여섯 자리에 판본 셋으로 갈려 있었다.
import { stripSourceComments } from '../lib/sourceLint.js';

const T0 = 1_760_000_000_000;
const EXP = T0 + 5 * 60 * 1000;
const KEY = 'sig-aaaaaaaaaaaaaaaaaa';
const PICK = { activity: 'walk', timeslot: 'morning' };

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const ROUTE = read('../app/api/eum/senior/preferences/route.js');
const PAGE = read('../app/eum/senior/[token]/page.jsx');
const FLOW = read('../app/eum/senior/[token]/SeniorFlow.jsx');
const UI = read('../app/eum/senior/[token]/ui.jsx');
const CONSUME = read('../lib/eumConsume.js');
// 힌트 두 줄의 집. 예전에는 소진 판정 모듈(위 CONSUME)이 들고 있었고, 그래서 브라우저에서
// 도는 완료 화면이 **문장 두 줄을 얻으려고** 서버 쪽 판정 모듈을 import 했다.
const MESSAGE = read('../lib/eumMessage.js');

// ── 기록: 무엇이 접수됐는지 ────────────────────────────────────────────────
test('소진 기록이 접수된 선택을 함께 들고 있다', () => {
  const s = createConsumeStore();
  assert.equal(s.claim(KEY, EXP, T0, PICK).ok, true);
  assert.deepEqual(s.recordOf(KEY, T0 + 1000), { used: true, note: PICK });
});

test('claim 의 반환 모양은 그대로다(기존 계약 불변)', () => {
  const s = createConsumeStore();
  assert.deepEqual(s.claim(KEY, EXP, T0, PICK), { ok: true });
  assert.deepEqual(s.claim(KEY, EXP, T0 + 1, PICK), { ok: false, reason: 'used' });
});

test('쓰이지 않은 링크는 used:false · note:null(있지도 않은 접수를 말하지 않는다)', () => {
  const s = createConsumeStore();
  assert.deepEqual(s.recordOf(KEY, T0), { used: false, note: null });
  assert.deepEqual(s.recordOf('', T0), { used: false, note: null });
  assert.deepEqual(s.recordOf(null, T0), { used: false, note: null });
});

test('기록은 토큰 만료와 함께 사라진다 — 만료 뒤 조회는 used:false', () => {
  const s = createConsumeStore();
  s.claim(KEY, EXP, T0, PICK);
  assert.equal(s.recordOf(KEY, EXP - 1).used, true);
  assert.deepEqual(s.recordOf(KEY, EXP), { used: false, note: null });
});

test('note 를 주지 않은 접수는 note:null — 모른다고 말한다(빈 객체로 뭉개지 않는다)', () => {
  const s = createConsumeStore();
  s.claim(KEY, EXP, T0);
  assert.deepEqual(s.recordOf(KEY, T0 + 1), { used: true, note: null });
});

test('기록을 돌려줄 때 복사본을 준다(바깥에서 고쳐도 기록이 바뀌지 않는다)', () => {
  const s = createConsumeStore();
  s.claim(KEY, EXP, T0, PICK);
  const got = s.recordOf(KEY, T0 + 1).note;
  got.activity = 'tampered';
  assert.equal(s.recordOf(KEY, T0 + 2).note.activity, 'walk');
});

// ── 화이트리스트: 이 기록은 409 응답으로 밖으로 나간다 ──────────────────────
test('sanitizeNote: 화이트리스트 밖 필드는 기록되지 않는다(개인정보 유입 차단)', () => {
  const dirty = { ...PICK, name: '홍길동', phone: '010-0000-0000', sid: 's-1001' };
  assert.deepEqual(sanitizeNote(dirty), PICK);
  const s = createConsumeStore();
  s.claim(KEY, EXP, T0, dirty);
  assert.deepEqual(Object.keys(s.recordOf(KEY, T0 + 1).note).sort(), [...CONSUME_NOTE_FIELDS].sort());
});

test('sanitizeNote: 남길 것이 없으면 null(빈 객체를 만들지 않는다)', () => {
  for (const bad of [null, undefined, 'walk', 42, [], {}, { name: '홍길동' }, { activity: 42 }]) {
    assert.equal(sanitizeNote(bad), null, `허용되면 안 되는 입력: ${JSON.stringify(bad)}`);
  }
});

test('sanitizeNote: 지나치게 긴 값은 기록하지 않는다(자유 서술 유입 방지)', () => {
  assert.equal(sanitizeNote({ activity: 'a'.repeat(33), timeslot: 'morning' }).activity, undefined);
});

test('sanitizeNote 는 던지지 않는다 — 접수 경로가 기록 때문에 죽으면 안 된다', () => {
  assert.doesNotThrow(() => sanitizeNote(Object.create(null)));
  assert.doesNotThrow(() => sanitizeNote({ get activity() { return 'walk'; } }));
});

// ── parseAccepted: 화면이 믿어도 되는 값으로 좁힌다 ────────────────────────
test('parseAccepted: 아는 코드 두 개가 다 맞을 때만 값을 돌려준다', () => {
  assert.deepEqual(parseAccepted({ activity: 'talk', timeslot: 'any' }), { activity: 'talk', timeslot: 'any' });
  assert.deepEqual(parseAccepted({ activity: 'talk', timeslot: 'any', sid: 's-1' }), { activity: 'talk', timeslot: 'any' });
});

test('parseAccepted: 모르는 값이면 null — 화면이 지어내지 않게 한다', () => {
  for (const bad of [
    null, undefined, 'walk', 0, [], {},
    { activity: 'walk' }, { timeslot: 'morning' },
    { activity: 'nope', timeslot: 'morning' }, { activity: 'walk', timeslot: 'nope' },
  ]) {
    assert.equal(parseAccepted(bad), null, `허용되면 안 되는 입력: ${JSON.stringify(bad)}`);
  }
});

// ── 라우트: 409 가 먼저 접수된 내용을 돌려준다 ──────────────────────────────
test('라우트: 접수 시 선택을 기록에 남기고, 409 는 그것을 돌려준다', () => {
  assert.match(ROUTE, /consumeStore\(\)\.claim\([\s\S]{0,200}activity: prefs\.activity/,
    '무엇이 접수됐는지 남기지 않으면 409 가 말해 줄 것이 없다');
  assert.match(ROUTE, /recordOf\(linkKey\)/);
  assert.match(ROUTE, /\.\.\.\(prior\.note \? \{ accepted: prior\.note \} : \{\}\)/,
    '모를 때는 accepted 를 아예 싣지 않아야 한다(빈 값·대체값 금지)');
});

test('라우트: 409 본문에 이번 요청의 선택을 대신 싣지 않는다', () => {
  const used = ROUTE.slice(ROUTE.indexOf("claim.reason === 'used'"), ROUTE.indexOf('claim.reason === \'expired\''));
  assert.equal(/accepted:\s*prefs/.test(used), false, '접수된 것은 먼저 제출된 선택이지 이번 선택이 아니다');
  assert.equal(/body\.activity/.test(used), false);
});

test('라우트: HTTP 메서드·설정 외 export 를 두지 않는다(빌드 실패 예방)', () => {
  const names = [...ROUTE.matchAll(/^export\s+(?:async\s+)?(?:function|const|let|var|class)\s+(\w+)/gm)]
    .map((m) => m[1]);
  assert.deepEqual(names.sort(), ['POST', 'dynamic', 'runtime']);
});

// ── 진입 화면: 헛걸음을 시키지 않는다 ──────────────────────────────────────
test('진입 화면: 이미 접수된 링크면 첫 화면에서 알려 준다(4단계를 걷게 하지 않는다)', () => {
  assert.match(PAGE, /consumeStore\(\)\.recordOf\(/, '진입 시 소진 확인이 없으면 헛걸음이 남는다');
  assert.match(PAGE, /record\.used/);
  // 문구는 단일 출처에서 가져온다. 이 패널은 제목이 있는 자리라 한 토막을 **나눠** 쓴다
  // (제목 = 무엇이 이미 되어 있는가 · 본문 = 다음에 무슨 일이 일어나는가) — 이어 쓴 문장은
  // 409 응답과 완료 화면이 쓴다. 아래 「본문도 한 벌이다」 테스트가 그 둘을 대조한다.
  assert.match(PAGE, /EUM_DONE_STATE|EUM_DONE_NEXT/, '문구는 단일 출처에서 가져온다');
  const notice = PAGE.slice(PAGE.indexOf('record.used'));
  assert.match(notice, /summaryText\(record\.note\)/, '무엇이 접수됐는지 보여 준다');
});

test('진입 화면: 소진 확인이 토큰 검증보다 뒤에 온다(위조 링크에 기록을 묻지 않는다)', () => {
  assert.ok(PAGE.indexOf('verifyEumToken') < PAGE.indexOf('recordOf('));
  assert.ok(PAGE.indexOf('if (!result.ok)') < PAGE.indexOf('recordOf('));
});

test('진입 화면: 소진 판정은 서버 라우트가 최종이라는 사실을 소스가 밝힌다', () => {
  assert.match(PAGE, /인스턴스 로컬/, '인메모리 한계를 숨기지 않는다');
});

// 정정: 예전 제목은 "…기본은 그대로다" 였다. 그 기본값이 **나오는 모든 자리에서 거짓**이었으므로
// (만료된 사람에게 "5분이 지나면 닫힙니다" · 닫히지 않는 정적 페이지에 같은 말) 기본값을 없앴다.
// 빠뜨리면 아무 말도 하지 않는다 — 틀린 말을 조용히 붙이는 것보다 낫다. 자세한 대조는
// tests/eumseniorui.test.mjs 의 「마무리 문구」 테스트가 한다.
test('안내 패널: 상세·다음 행동·마무리 문구를 선택적으로 받고 기본값은 두지 않는다', () => {
  // headingRef 는 제목으로 포커스를 옮길 수 있게 내준 자리다(기본은 없음 — 서버 컴포넌트는
  // ref 를 넘길 수 없다). 흐름에서 이 패널로 뒤집히는 전환에서 포커스가 body 로 떨어지던
  // 결함을 그것으로 막는다(tests/eumseniorui.test.mjs 의 「만료로 화면이 뒤집히는 순간」).
  assert.match(UI, /export function Notice\(\{ title, body, detail = '', hint = '', foot = '', children = null, headingRef = null \}\)/);
  // children: 서버가 지을 수 없는 한 줄(이 기기의 보조 사본)을 끼우는 자리. 자리는 hint 다음·
  // foot 앞이어야 말이 이어진다 — 「무엇을 하면 된다」 뒤에 「하지 않아도 된다」가 온다.
  const panel = UI.slice(UI.indexOf('export function Notice'));
  assert.ok(panel.indexOf('{hint ?') < panel.indexOf('{children}'), 'children 이 hint 보다 앞에 있다');
  assert.ok(panel.indexOf('{children}') < panel.indexOf('{foot ?'), 'children 이 foot 보다 뒤에 있다');
  assert.match(UI, /\{detail \? <p style=\{S\.summary\}>\{detail\}<\/p> : null\}/,
    '모를 때는 빈 칸을 그리지 않는다');
  assert.match(UI, /\{hint \? <p style=\{S\.body\}>\{hint\}<\/p> : null\}/,
    '다음 행동이 없으면 되돌릴 단추가 없는 화면이 막다른 길이 된다');
});

// ── 진입 안내와 완료 화면이 같은 말을 한다 ─────────────────────────────────
//
// 왜 이것이 중요한가: 「이미 접수됐다」는 사실을 두 화면이 보여 준다(링크를 다시 열었을 때 ·
// 제출이 409 로 돌아왔을 때). 그런데 「바꾸려면 담당자에게」는 완료 화면에만 있었고, 진입
// 화면은 사실만 알리고 끝났다. 마음을 바꾼 어르신에게 그 화면은 단추가 없는 막다른 길이라
// 담당자에게 **새 링크**를 청하게 되고, 새 링크는 소진 키가 달라 재신청이 실제로 통한다
// (설계상 정상 — 막아야 하는 것은 같은 링크의 재사용이지 그 어르신의 재신청이 아니다).
// 결과는 담당자 명단의 중복 두 건이다. 중복을 막으려고 만든 화면이 문장 하나가 없어서
// 중복을 만든다.
test('진입 안내: 다음에 무엇을 하면 되는지 알려 준다(막다른 길을 만들지 않는다)', () => {
  const notice = PAGE.slice(PAGE.indexOf('record.used'));
  assert.match(notice, /hint=\{summary \? EUM_CONSUME_CHANGE_HINT : EUM_CONSUME_UNKNOWN_HINT\}/,
    '접수 내용을 아는지에 따라 할 말이 다르다');
  assert.match(PAGE, /EUM_CONSUME_CHANGE_HINT/);
});

test('진입 안내와 완료 화면의 문구는 단일 출처다(한쪽만 고쳐지는 일을 없앤다)', () => {
  for (const c of ['EUM_CONSUME_CHANGE_HINT', 'EUM_CONSUME_UNKNOWN_HINT']) {
    // 집은 **문구 표**다(예전에는 소진 판정 모듈이었다 — 그 자리는 프로세스 전역 스토어·
    // 축출·헬스 판정을 들고 있고, 공유 저장소 어댑터가 예약돼 있다).
    assert.match(MESSAGE, new RegExp(`export const ${c} = '`), `${c} 가 lib/eumMessage 에 없다`);
    assert.equal(new RegExp(`export const ${c}`).test(CONSUME), false, `${c} 가 판정 모듈에 남아 있다`);
    assert.match(PAGE, new RegExp(c), `진입 화면이 ${c} 를 쓰지 않는다`);
    assert.match(FLOW, new RegExp(c), `완료 화면이 ${c} 를 쓰지 않는다`);
  }
  // 리터럴로 되돌아가면 두 화면이 다시 갈라진다.
  assert.equal(/'바꾸고 싶으시면/.test(FLOW) || />바꾸고 싶으시면/.test(FLOW), false);
});

// ── 고친 결함: **방금 접수된 어르신에게만** 바꾸는 길을 말하지 않았다 ──────────
//
// 「접수됐다」는 사실을 보여 주는 자리는 셋이다 — 링크를 다시 열었을 때(진입 안내) · 제출이
// 409 로 돌아왔을 때 · **방금 접수됐을 때**. 그런데 「바꾸고 싶으시면 담당자에게 말씀해
// 주세요」는 앞의 둘에만 있었다: 완료 화면이 그 줄을 `already` 안에 두고 있었기 때문이다.
// 하필 바꿀 일이 가장 자주 생기는 자리가 셋째다 — 이 과제가 20·21회차에 가드를 둔 사고
// (「떨리는 손의 두 번째 탭이 「이대로 신청하기」에 떨어져 **확인 화면을 한 번도 읽지 않은**
// 신청이 접수된다」)가 실제로 일어나면, 어르신이 보는 것은 「신청이 접수되었습니다」 ·
// 고르지 않은 내용의 요약 · 「이제 이 화면을 닫으셔도 됩니다」뿐이었다. 되돌릴 길은 있는데
// (담당자에게 말하면 된다) 그 길을 말하는 줄만 그 화면에서 빠져 있었다. `tapSettled` 는
// 400ms 어림이고 판정할 수 없으면 통과시키므로 절대 가드가 아니다.
// 갈림의 기준은 **「접수 내용을 아는가」**이지 409 인지가 아니다 — 진입 패널은 처음부터 그
// 기준(`summary ? … : …`)이었고, 바로 위 테스트의 이름(「같은 갈림」)이 코드보다 앞서 있었다.
test('완료 화면: 방금 접수된 어르신에게도 바꾸는 길을 말한다(진입 화면과 같은 갈림)', () => {
  const code = stripSourceComments(FLOW);
  const done = code.slice(code.indexOf('{step === 4 ?'));
  assert.ok(done.length > 100, '완료 화면 블록을 찾지 못했다');
  // 갈림은 **요약을 아는지** 하나뿐이다 — `already` 가 다시 끼면 셋째 자리가 조용히 빠진다.
  assert.match(done, /\n\s*<p style=\{S\.body\}>\{doneSummary \? EUM_CONSUME_CHANGE_HINT : EUM_CONSUME_UNKNOWN_HINT\}<\/p>/,
    '접수 내용을 아는지가 아니라 409 인지로 갈리고 있다');
  assert.equal(/already \? \(\s*<p style=\{S\.body\}>\{doneSummary/.test(done), false,
    '바꾸는 길을 말하는 줄이 다시 409 안으로 들어갔다');
  // 진입 패널과 **같은 기준**이라는 사실을 양쪽에서 고정한다(한쪽만 고쳐지는 날을 막는다).
  assert.match(PAGE, /hint=\{summary \? EUM_CONSUME_CHANGE_HINT : EUM_CONSUME_UNKNOWN_HINT\}/,
    '진입 패널의 갈림이 바뀌었다 — 두 화면이 다시 다른 기준을 쓴다');
  // 보조 사본 한 줄은 그대로 `already` 쪽에 남는다 — 이유가 다르다(방금 쓴 사본을
  // 「전에 신청하신 내용」이라고 하면 거짓이다).
  assert.match(done, /\{already && !doneSummary \? \(/,
    '보조 사본 안내가 방금 접수된 화면에도 그려진다(그 사본은 조금 전 이 화면이 쓴 것이다)');
});

// 고친 결함: 바로 위 테스트의 **이름**은 「진입 안내와 완료 화면의 문구는 단일 출처다」인데
// 실제로 대조한 것은 **뒤에 붙는 두 힌트**뿐이었다. 정작 두 화면의 **본문**은 각자 적혀 있었고,
// 그래서 같은 사실을 두고 서로 **반대되는 다음 행동**을 말했다 —
//   · 완료 화면 「담당자가 곧 전화로 안내해 드립니다」(할 일이 없다)
//   · 진입 안내 「담당자에게 문의해 주세요」(할 일이 있다)
// 접수가 끝난 어르신이 그 말대로 전화하면 담당자는 새 링크를 보내고, 새 링크는 소진 키가 달라
// 재신청이 통한다 → 담당자 명단에 두 건. 중복을 막으려고 만든 화면의 첫 문장이 중복을 만들던
// 셈이고, 그 화면은 바로 다음 줄에서 「이제 이 화면을 닫으셔도 됩니다」로 끝났다.
// 이름이 코드보다 앞서 있던 또 한 자리다(「1회용」·「단일 출처」·「글자 크기」와 같은 모양).
test('진입 안내와 완료 화면의 **본문**도 한 벌이다(서로 반대되는 다음 행동 금지)', () => {
  // 사실을 말하는 문장은 비밀을 모르는 자리 한 곳에만 있고, 소진 안내가 그것을 가리킨다.
  assert.match(CONSUME, /used:\s*EUM_DONE_MESSAGE\.already/, '소진 안내가 접수 문구 표를 가리키지 않는다');
  assert.match(CONSUME, /EUM_DONE_MESSAGE[^\n]*from '\.\/eumMessage\.js'/, '표를 import 하지 않는다');
  // 진입 안내는 그 표의 **두 토막**을 제목·본문으로 나눠 쓴다. 한 토막을 그대로 본문에 넣던
  // 동안 제목(「이미 신청하셨습니다」)과 본문의 첫 문장(「이미 신청이 접수되었습니다」)이 같은
  // 사실을 두 번 말했다 — 그 패널은 제목으로 포커스를 옮기므로(11회차) 듣는 어르신은 방금
  // 들은 말을 한 번 더 듣는다. 9회차가 만료·잘린 링크 패널에서 없앤 중복의 마지막 자리다.
  assert.match(PAGE, /title=\{EUM_DONE_STATE\.already\}/, '진입 안내의 제목이 접수 문구 표에서 오지 않는다');
  assert.match(PAGE, /body=\{EUM_DONE_NEXT\}/, '진입 안내가 본문을 손으로 적는다');
  // 나눠 쓴 둘을 이어 붙이면 **409 응답·완료 화면의 그 문장**이다 — 두 화면이 갈라질 수 없다
  // (13회차의 계약은 그대로이고, 바뀐 것은 한 자리에서 나눠 쓴다는 것뿐이다).
  assert.equal(`${EUM_DONE_STATE.already}. ${EUM_DONE_NEXT}`, EUM_DONE_MESSAGE.already,
    '제목+본문이 이어 쓴 문장과 다르다 — 두 화면이 서로 다른 말을 하게 된다');
  assert.equal(`${EUM_DONE_STATE.accepted}. ${EUM_DONE_NEXT}`, EUM_DONE_MESSAGE.accepted);
  // 제목이 본문을 되풀이하지 않는다(그 중복이 이 고침의 이유다).
  assert.ok(!EUM_DONE_NEXT.includes(EUM_DONE_STATE.already), '본문이 제목을 그대로 담고 있다');
  assert.ok(!EUM_DONE_NEXT.endsWith('.'), '패널 본문 한 줄의 규약이 깨졌다(EUM_PANEL_ASK 와 같은 자리)');
  // 이어 쓴 문장이 필요한 자리(제목이 없거나 제목이 다른 사실을 말하는 자리)는 그대로 쓴다.
  assert.match(ROUTE, /consumeMessage\('used'\)/, '409 응답이 접수 문구 표를 거치지 않는다');
  // 접수가 끝난 사람에게 **할 일을 만들지 않는다.** 바꾸고 싶은 경우만이고 그것은 힌트가
  // 조건부로 말한다 — 본문이 무조건 담당자를 부르면 그 전화가 새 링크를 부른다.
  assert.equal(/문의해 주세요/.test(EUM_DONE_MESSAGE.already), false,
    '접수가 끝난 어르신에게 문의할 것은 없다 — 그 전화가 명단의 두 번째 건을 만든다');
  for (const [k, v] of Object.entries(EUM_DONE_MESSAGE)) {
    assert.match(v, /접수되었습니다/, `${k}: 접수된 사실을 말하지 않는다`);
    assert.match(v, /담당자가 곧/, `${k}: 다음에 일어날 일을 말하지 않는다`);
  }
  // 사본이 되살아나면 두 화면이 다시 갈라진다(주석은 왜 그런지를 적는 자리라 걷어낸다).
  const strip = stripSourceComments;
  for (const [name, src] of Object.entries({ 'SeniorFlow.jsx': FLOW, 'page.jsx': PAGE, 'lib/eumConsume.js': CONSUME })) {
    // 이어 쓴 문장도, **나눈 두 토막**도 손으로 적혀 있으면 안 된다(토막이 생긴 뒤에는
    // 사본이 그 모양으로도 되살아날 수 있다).
    for (const v of [...Object.values(EUM_DONE_MESSAGE), ...Object.values(EUM_DONE_STATE), EUM_DONE_NEXT]) {
      assert.ok(!strip(src).includes(v), `${name}: 접수 문구를 손으로 적었다 — ${v}`);
    }
  }
});

// 정정: 이 테스트의 예전 이름은 「클라이언트 화면은 eumConsume 에서 **문구만** 가져온다」였고,
// 그 import 줄에 판정 함수가 섞이지 않았는지만 보았다. 그 대조는 「문구를 그 파일에서 가져오는
// 것 자체」를 정상으로 못박고 있었다 — 소진 스토어(프로세스 전역 Map)·축출·헬스 판정을 든
// 모듈을 브라우저가 import 하는 것이고, 그 파일에는 공유 저장소 어댑터가 예약돼 있다
// (그날 저장소 클라이언트가 어르신 화면 번들을 따라 들어간다). 결함을 고정하는 테스트였다.
test('클라이언트 화면은 소진 판정 모듈을 아예 import 하지 않는다(판정은 서버의 일이다)', () => {
  assert.equal(/from '@\/lib\/eumConsume'/.test(FLOW), false,
    '브라우저가 소진 판정 모듈을 끌고 들어온다 — 문구는 lib/eumMessage 에 있다');
  assert.equal(/consumeStore|createConsumeStore|claim\(|recordOf/.test(FLOW), false,
    '브라우저가 1회용을 판정한다고 믿게 하면 안 된다 — 판정은 라우트 한 곳뿐이다');
  // 서버 쪽 진입 화면은 그대로 판정을 쓴다(그 자리가 판정이 사는 곳이다).
  assert.match(PAGE, /from '@\/lib\/eumConsume'/, '진입 화면이 소진 판정을 쓰지 않는다');
  assert.match(PAGE, /consumeStore\(\)\.recordOf/, '진입 화면이 기록을 읽지 않는다');
});

// ── 완료 화면: 실제로 접수된 것만 말한다 ───────────────────────────────────
test('완료 화면: 409 면 서버가 알려 준 「먼저 접수된 선택」을 읽는다', () => {
  assert.match(FLOW, /parseAccepted\(data && data\.accepted\)/);
  // 본문 읽기는 이제 **busy 를 푸는 앞**에 있다(바로 아래 「busy 를 푼 뒤에는 await 가 없다」
  // 테스트의 이유). 그래서 이 갈림에는 `await` 가 없고 미리 읽어 둔 `prior` 를 쓴다 —
  // 읽는 자리가 하나라는 사실은 그 테스트가 함께 고정한다.
  assert.match(FLOW, /const prior = await acceptedFrom\(res\);/,
    '409 본문을 응답 직후 한 자리에서 읽지 않는다');
  const branch = FLOW.slice(FLOW.indexOf('res.status === 409'), FLOW.indexOf('res.status === 410'));
  assert.ok(branch.length > 20, '409 갈림을 찾지 못했다');
  assert.equal(/await/.test(branch), false, '409 갈림이 다시 응답을 기다린다');
  assert.match(branch, /setAccepted\(prior\)/);
  assert.match(branch, /setAlready\(true\)/);
  assert.equal(/finishSubmitted\(body\)/.test(branch), false,
    '방금 고른 것을 접수된 것처럼 그리면 안 된다');
  // 409 가 아니면 곧바로 null 이어야 한다 — 그래야 다른 경로의 대기가 늘지 않는다.
  assert.match(FLOW, /if \(!res \|\| res\.status !== 409\) return null;/,
    '409 가 아닌 응답에서도 본문을 읽으려 기다린다');
});

// 정정: 이 테스트는 두 문장이 **화면 안에 적혀 있는지**를 보며 통과했다 — 즉 사본을 고정하는
// 테스트였다(9회차에 없앤 것과 같은 모양). 그 사이 같은 사실을 말하는 진입 안내는 「담당자에게
// 문의해 주세요」라고 말하고 있었고, 아무 대조도 그것을 보지 않았다. 지금은 두 화면이 같은
// 표(lib/eumMessage.EUM_DONE_MESSAGE)를 가리키는지 본다.
// 정정: 이 테스트는 완료 화면이 **이어 쓴 한 문장**(EUM_DONE_MESSAGE)을 본문에 쓰는지를
// 보았다. 그 자리는 제목이 있는 자리이므로(h1) 이어 쓴 문장은 **제목과 같은 사실을 두 번**
// 말한다 — 22회차가 진입 패널에서 없앤 중복이 이 화면에 그대로 남아 있었다. 이제 제목은
// 「무엇이 되어 있는가」(stepTitle → EUM_DONE_STATE), 본문은 「다음에 무슨 일이 일어나는가」
// (EUM_DONE_NEXT)이고, 두 경우의 갈림은 **제목**이 든다.
test('완료 화면: 이미 접수된 경우와 방금 접수된 경우의 제목이 다르다', () => {
  assert.notEqual(EUM_DONE_STATE.already, EUM_DONE_STATE.accepted, '두 경우를 같은 말로 덮으면 안 된다');
  assert.match(FLOW, /\{stepTitle\(step, \{ already \}\)\}/,
    '완료 화면의 제목이 접수 문구 단일 출처를 거치지 않는다');
  assert.match(FLOW, /<p style=\{S\.body\} role="status">\{EUM_DONE_NEXT\}<\/p>/,
    '본문이 제목과 같은 사실을 되풀이한다(이어 쓴 문장은 제목이 없는 자리의 것이다)');
  // 이어 쓴 문장은 이제 **제목이 없는 자리**만 쓴다 — 화면이 그것을 다시 들면 중복이 돌아온다.
  // (주석은 왜 그런지를 적는 자리라 걷어낸 코드만 본다 — 이 파일의 다른 대조와 같은 계약.)
  const flowCode = stripSourceComments(FLOW);
  assert.equal(/EUM_DONE_MESSAGE/.test(flowCode), false, '제목이 있는 자리가 이어 쓴 문장을 쓴다');
  assert.match(FLOW, /EUM_CONSUME_CHANGE_HINT/, '바꾸는 길을 알려 준다(문구는 단일 출처)');
  // 단계 표시도 같은 사실을 말하지 않는다 — 예전에는 그 자리가 「완료」였다(셋째 줄).
  assert.match(FLOW, /const stepLabel = step <= 3 \? `3단계 중 \$\{step\}단계` : '';/,
    '완료 화면의 단계 표시가 끝났다는 사실을 한 번 더 말한다');
});

// 고친 결함: 완료 화면은 요약을 `labelOf(…) · labelOf(…)` 로 **손으로 조립**했다(두 자리).
// 확인 화면은 `summaryText` 를 쓰므로 같은 형식이 두 벌 돌아다녔고, 손으로 조립한 쪽은 한쪽
// 라벨을 모를 때 「 · 」만 남은 **반쪽 요약**을 그린다 — 지금은 두 경로 모두 화이트리스트를
// 통과한 값만 와서 발동하지 않는 **잠복**이었다. 조립을 한 곳(lib/eumSenior)으로 되돌린다.
test('완료 화면: 접수 내용을 모르면 요약을 아예 그리지 않는다', () => {
  assert.match(FLOW, /EUM_CONSUME_UNKNOWN_HINT/);
  assert.match(FLOW, /const doneSummary = already \? summaryText\(accepted\) : summaryText\(\{ activity, timeslot \}\)/,
    '모를 때 빈 요약이 그려지지 않게 요약 문장 자체로 판정해야 한다');
  assert.match(FLOW, /\{doneSummary \? <p style=\{S\.summary\}>/, '요약이 없으면 빈 칸을 그리지 않는다');
  assert.match(FLOW, /doneSummary \? EUM_CONSUME_CHANGE_HINT : EUM_CONSUME_UNKNOWN_HINT/,
    '접수 내용을 아는지에 따라 할 말이 다르다(진입 화면과 같은 갈림)');
  // 손 조립이 되살아나면 형식이 다시 두 벌이 되고 반쪽 요약이 돌아온다.
  assert.equal(/labelOf\((?:ACTIVITIES|TIMESLOTS)/.test(FLOW), false,
    '요약 조립은 lib/eumSenior.summaryText 한 곳뿐이다');
  assert.equal(/\} · \{/.test(FLOW), false, '구분자를 화면에서 손으로 적으면 안 된다');
});

test('완료 화면: 내용을 모르면 보조 사본도 쓰지 않는다(단말 기록까지 어긋나지 않게)', () => {
  assert.match(FLOW, /finishSubmitted\(prior \? \{ \.\.\.body, \.\.\.prior \} : null\)/);
  assert.match(FLOW, /if \(key && record\) window\.localStorage\.setItem/);
});

// ── 제출 중 만료 ───────────────────────────────────────────────────────────
test('제출 중에는 화면이 스스로 만료를 선언하지 않는다(서버 응답을 기다린다)', () => {
  // 판정은 이제 이름을 가진다(expiredNow) — 그 전환에서 제목으로 포커스를 옮기는 효과가
  // 훅이라, 이른 return 뒤에 둘 수 없어 조건을 먼저 구해야 했다. `!busy` 는 그대로다.
  assert.match(FLOW, /const expiredNow = !done && !busy && \(expiredByServer \|\| isExpired\(left\)\);/,
    '응답을 기다리는 동안 만료 화면으로 덮으면 방금 접수된 신청이 실패로 보인다');
  assert.match(FLOW, /if \(expiredNow\) \{/, '만료 화면으로 가는 갈림이 그 판정을 쓰지 않는다');
});

test('제출 중 만료 보류가 서버 판정을 무르게 하지 않는다(410 은 그대로 만료 화면)', () => {
  assert.match(FLOW, /setExpiredByServer\(true\)/);
  // busy 는 응답이 도착하면 반드시 풀린다 — 풀리지 않으면 만료 화면이 영영 뜨지 않는다.
  // 주석이 아니라 **코드**에서 순서를 본다(주석에 적힌 이름으로 통과하지 않게).
  const code410 = stripSourceComments(FLOW);
  const submitBody = code410.slice(code410.indexOf('async function submit'));
  assert.ok(submitBody.indexOf('setBusy(false)') < submitBody.indexOf('res.status === 410'),
    '응답 판정 전에 busy 를 풀어야 만료 보류가 끝난다');
});

// ── 고친 결함: 그 보류가 **본문을 읽는 사이**에 끊겼다 ──────────────────────
//
// 위 `!busy` 가 지키려는 것은 「응답을 기다리는 동안 화면이 스스로 만료를 선언하지 않는다」다.
// 그런데 `setBusy(false)` 와 「이 화면이 무엇이 되는가」를 정하는 상태 변경 사이에 `await` 가
// 하나 있었다 — 409 본문 읽기(`acceptedFrom`). 그러면 busy 가 풀리고 done 은 아직 false 인
// 커밋이 한 번 생기고, 그때 눈금이 0 에 닿아 있으면 화면은 **서버가 방금 「이미 접수됐다」고
// 답한 신청** 위에 「링크가 만료되었습니다」를 그린다(그 전환은 제목으로 포커스를 옮기므로
// 듣는 어르신의 첫 마디가 거짓이고, 그 패널에는 되돌릴 단추가 없다).
// 하필 409 의 전제가 **나쁜 연결**이다(첫 요청이 서버에 닿았는데 응답이 늦어 다시 누른
// 경우다 — 바로 위 테스트들이 적어 둔 그 경로). 그 연결에서 본문 스트림 읽기가 짧다는
// 보장은 없다. 그래서 자리 하나를 옮기는 대신 **불변식**으로 고정한다 — 다음에 응답을
// 한 번 더 읽는 코드가 생기는 날 여기서 실패한다.
test('busy 를 푼 뒤에는 await 가 없다(만료 보류가 응답을 읽는 사이에 끊기지 않는다)', () => {
  const code = stripSourceComments(FLOW);
  const submitAt = code.indexOf('async function submit');
  assert.ok(submitAt > 0, 'submit 을 찾지 못했다');
  const submitBody = code.slice(submitAt);
  const at = submitBody.indexOf('setBusy(false)');
  assert.ok(at > 0, 'submit 안에서 busy 를 푸는 자리를 찾지 못했다');
  assert.equal(/await/.test(submitBody.slice(at)), false,
    'busy 를 푼 뒤에 기다리는 자리가 있으면 done 이 아직 false 인 커밋이 생긴다 — 화면이 방금 접수된 신청 위에 만료를 선언할 수 있다');
  // 본문 읽기는 그 **앞**에 있어야 한다(없으면 409 가 먼저 접수된 선택을 말할 수 없다).
  const readAt = submitBody.indexOf('await acceptedFrom(res)');
  assert.ok(readAt > 0 && readAt < at, '409 본문을 busy 를 푼 뒤에 읽는다');
});

// ── 토큰 왕복(실제 값으로) ─────────────────────────────────────────────────
test('실제 토큰으로 왕복: 두 번째 제출은 첫 번째 선택을 돌려받는다', async () => {
  const token = await issueEumToken('s-2002', { now: T0 });
  const key = consumeKey(token);
  const s = createConsumeStore();
  assert.equal(s.claim(key, EXP, T0, { activity: 'health', timeslot: 'evening' }).ok, true);
  const again = s.claim(key, EXP, T0 + 2000, { activity: 'learn', timeslot: 'morning' });
  assert.deepEqual(again, { ok: false, reason: 'used' });
  assert.deepEqual(s.recordOf(key, T0 + 2000).note, { activity: 'health', timeslot: 'evening' },
    '나중 선택이 기록을 덮어쓰면 화면이 접수되지 않은 것을 접수됐다고 말하게 된다');
});
