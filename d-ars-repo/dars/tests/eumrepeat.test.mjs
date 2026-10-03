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
  assert.match(UI, /export function Notice\(\{ title, body, detail = '', hint = '', foot = '' \}\)/);
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

test('완료 화면: 이미 접수된 경우와 방금 접수된 경우의 문장이 다르다', () => {
  assert.match(FLOW, /이미 접수된 신청이 있습니다/);
  assert.match(FLOW, /신청이 접수되었습니다/);
  assert.match(FLOW, /\{EUM_CONSUME_CHANGE_HINT\}/, '바꾸는 길을 알려 준다(문구는 단일 출처)');
});

test('완료 화면: 접수 내용을 모르면 요약을 아예 그리지 않는다', () => {
  assert.match(FLOW, /\{EUM_CONSUME_UNKNOWN_HINT\}/);
  assert.match(FLOW, /accepted \?/, 'accepted 가 null 인 경우를 나눠야 한다');
  assert.match(FLOW, /labelOf\(ACTIVITIES, accepted\.activity\)/);
});

test('완료 화면: 내용을 모르면 보조 사본도 쓰지 않는다(단말 기록까지 어긋나지 않게)', () => {
  assert.match(FLOW, /finishSubmitted\(prior \? \{ \.\.\.body, \.\.\.prior \} : null\)/);
  assert.match(FLOW, /if \(key && record\) window\.localStorage\.setItem/);
});

// ── 제출 중 만료 ───────────────────────────────────────────────────────────
test('제출 중에는 화면이 스스로 만료를 선언하지 않는다(서버 응답을 기다린다)', () => {
  assert.match(FLOW, /if \(!done && !busy && \(expiredByServer \|\| isExpired\(left\)\)\)/,
    '응답을 기다리는 동안 만료 화면으로 덮으면 방금 접수된 신청이 실패로 보인다');
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
