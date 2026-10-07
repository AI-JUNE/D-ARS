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
import { EUM_DONE_MESSAGE } from '../lib/eumMessage.js';
import { parseAccepted } from '../lib/eumSenior.js';
import { issueEumToken } from '../lib/eumToken.js';

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
  assert.match(PAGE, /consumeMessage\('used'\)/, '문구는 단일 출처에서 가져온다');
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
    assert.match(CONSUME, new RegExp(`export const ${c} = '`), `${c} 가 lib/eumConsume 에 없다`);
    assert.match(PAGE, new RegExp(c), `진입 화면이 ${c} 를 쓰지 않는다`);
    assert.match(FLOW, new RegExp(c), `완료 화면이 ${c} 를 쓰지 않는다`);
  }
  // 리터럴로 되돌아가면 두 화면이 다시 갈라진다.
  assert.equal(/'바꾸고 싶으시면/.test(FLOW) || />바꾸고 싶으시면/.test(FLOW), false);
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
  // 진입 안내는 그 표를 거쳐 온 문장을 쓴다(consumeMessage('used')).
  assert.match(PAGE, /body=\{consumeMessage\('used'\)\}/, '진입 안내가 본문을 손으로 적는다');
  // 접수가 끝난 사람에게 **할 일을 만들지 않는다.** 바꾸고 싶은 경우만이고 그것은 힌트가
  // 조건부로 말한다 — 본문이 무조건 담당자를 부르면 그 전화가 새 링크를 부른다.
  assert.equal(/문의해 주세요/.test(EUM_DONE_MESSAGE.already), false,
    '접수가 끝난 어르신에게 문의할 것은 없다 — 그 전화가 명단의 두 번째 건을 만든다');
  for (const [k, v] of Object.entries(EUM_DONE_MESSAGE)) {
    assert.match(v, /접수되었습니다/, `${k}: 접수된 사실을 말하지 않는다`);
    assert.match(v, /담당자가 곧/, `${k}: 다음에 일어날 일을 말하지 않는다`);
  }
  // 사본이 되살아나면 두 화면이 다시 갈라진다(주석은 왜 그런지를 적는 자리라 걷어낸다).
  const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n').map((l) => l.replace(/(^|[^:\w])\/\/.*$/, '$1')).join('\n');
  for (const [name, src] of Object.entries({ 'SeniorFlow.jsx': FLOW, 'page.jsx': PAGE, 'lib/eumConsume.js': CONSUME })) {
    for (const v of Object.values(EUM_DONE_MESSAGE)) {
      assert.ok(!strip(src).includes(v), `${name}: 접수 문구를 손으로 적었다 — ${v}`);
    }
  }
});

test('클라이언트 화면은 eumConsume 에서 **문구만** 가져온다(소진 판정은 서버의 일이다)', () => {
  const line = (FLOW.match(/import \{[^}]*\} from '@\/lib\/eumConsume';/) || [''])[0];
  assert.ok(line, '완료 화면이 문구 단일 출처를 쓰지 않는다');
  assert.equal(/consumeStore|createConsumeStore|claim|recordOf/.test(line), false,
    '브라우저가 1회용을 판정한다고 믿게 하면 안 된다 — 판정은 라우트 한 곳뿐이다');
});

// ── 완료 화면: 실제로 접수된 것만 말한다 ───────────────────────────────────
test('완료 화면: 409 면 서버가 알려 준 「먼저 접수된 선택」을 읽는다', () => {
  assert.match(FLOW, /parseAccepted\(data && data\.accepted\)/);
  const branch = FLOW.slice(FLOW.indexOf('res.status === 409'), FLOW.indexOf('res.status === 410'));
  assert.match(branch, /await acceptedFrom\(res\)/);
  assert.match(branch, /setAlready\(true\)/);
  assert.equal(/finishSubmitted\(body\)/.test(branch), false,
    '방금 고른 것을 접수된 것처럼 그리면 안 된다');
});

// 정정: 이 테스트는 두 문장이 **화면 안에 적혀 있는지**를 보며 통과했다 — 즉 사본을 고정하는
// 테스트였다(9회차에 없앤 것과 같은 모양). 그 사이 같은 사실을 말하는 진입 안내는 「담당자에게
// 문의해 주세요」라고 말하고 있었고, 아무 대조도 그것을 보지 않았다. 지금은 두 화면이 같은
// 표(lib/eumMessage.EUM_DONE_MESSAGE)를 가리키는지 본다.
test('완료 화면: 이미 접수된 경우와 방금 접수된 경우의 문장이 다르다', () => {
  assert.notEqual(EUM_DONE_MESSAGE.already, EUM_DONE_MESSAGE.accepted, '두 경우를 같은 말로 덮으면 안 된다');
  assert.match(FLOW, /\{already \? EUM_DONE_MESSAGE\.already : EUM_DONE_MESSAGE\.accepted\}/,
    '완료 화면이 접수 문구 단일 출처를 쓰지 않는다');
  assert.match(FLOW, /EUM_CONSUME_CHANGE_HINT/, '바꾸는 길을 알려 준다(문구는 단일 출처)');
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
  const submitBody = FLOW.slice(FLOW.indexOf('async function submit'));
  assert.ok(submitBody.indexOf('setBusy(false)') < submitBody.indexOf('res.status === 410'),
    '응답 판정 전에 busy 를 풀어야 만료 보류가 끝난다');
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
