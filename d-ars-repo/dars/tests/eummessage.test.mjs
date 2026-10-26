// tests/eummessage.test.mjs — 「링크 상태」 안내 문구의 단일 출처(lib/eumMessage.js)
//
// 고친 결함: 이 표는 `lib/eumToken.js` 안에 있었다. 그 파일은 서명 비밀을 읽고 HMAC 을 계산하므로
// **클라이언트 번들에 들어갈 수 없다** — 그래서 브라우저에서 도는 화면(SeniorFlow)은 같은 문장을
// **손으로 적어** 쓰고 있었고, 401 안내는 마침표가 하나 더 붙은 **두 번째 판본**이었다.
// 어르신이 어느 경로를 밟느냐에 따라 같은 사실을 설명하는 문장의 끝이 달랐다.
// EUM_INTEGRATION.md 는 줄곧 "문구는 `EUM_TOKEN_MESSAGE` 단일 출처" 라고 적었지만 그것은
// **서버 쪽 세 화면에서만** 참이었다 — 또 하나의 "코드보다 앞선 서술"이다.
//
// 이 파일이 지키는 것: (1) 문장은 한 자리에만 있다 (2) 그 자리는 **비밀을 모른다**(클라이언트
// 안전) (3) 화면은 전부 그 자리를 가리킨다 (4) 손으로 적은 사본이 되살아나면 실패한다.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  EUM_TOKEN_MESSAGE,
  tokenMessage,
  EUM_SUBMIT_MESSAGE,
  submitMessage,
  EUM_DONE_MESSAGE,
  EUM_DONE_STATE,
  EUM_DONE_NEXT,
  EUM_ACTION,
  EUM_BOUNDARY_MESSAGE,
  EUM_KICKER,
  EUM_PANEL_ASK,
  EUM_PANEL_ASK_EXPIRED,
  EUM_PANEL_TITLE,
  panelTitle,
  panelAsk,
  EUM_CONSUME_CHANGE_HINT,
  EUM_CONSUME_UNKNOWN_HINT,
  EUM_SOON_LEAD,
  EUM_SOON_NEXT,
  EUM_SOON_BUSY,
  soonMessage,
} from '../lib/eumMessage.js';
import {
  muteSeparatorsIn, EUM_PRIOR_TAIL, EUM_STEP_MIN, EUM_STEP_MAX, EUM_FLOW_STEPS, stepProgress,
} from '../lib/eumSenior.js';
import { importedModules, stripSourceComments } from '../lib/sourceLint.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(resolve(root, rel), 'utf8');

const MESSAGE_SRC = read('lib/eumMessage.js');
const TOKEN_SRC = read('lib/eumToken.js');
const CONSUME_SRC = read('lib/eumConsume.js');

// 깨졌을 때·기다릴 때 보이는 화면. 문구가 여기 손으로 적혀 있었다.
const BOUNDARY = {
  'app/eum/error.jsx': read('app/eum/error.jsx'),
  'app/eum/loading.jsx': read('app/eum/loading.jsx'),
};

// 「링크 상태」를 말하는 화면 전부. 이 넷 중 하나라도 표를 가리키지 않으면 그 화면만 갈라진다.
const SCREENS = {
  'app/eum/page.jsx': read('app/eum/page.jsx'),
  'app/eum/senior/page.jsx': read('app/eum/senior/page.jsx'),
  'app/eum/senior/[token]/page.jsx': read('app/eum/senior/[token]/page.jsx'),
  'app/eum/senior/[token]/SeniorFlow.jsx': read('app/eum/senior/[token]/SeniorFlow.jsx'),
  // 「senior」 안에서 잘린 링크(`/eum/sen` 꼴)를 받는 캐치올. 같은 말을 해야 하는 다섯 번째 자리다.
  'app/eum/[...rest]/page.jsx': read('app/eum/[...rest]/page.jsx'),
};

// 금지 사본 검사는 **주석을 걷어낸 코드**에만 적용한다 — 왜 그런지를 적은 주석까지 막으면
// 다음 사람이 이유를 모른 채 되돌리는 쪽이 더 위험하다(tests/eumseniorui.test.mjs 와 같은 계약).
// 걷어내기 자체는 **한 곳**에서 가져온다(lib/sourceLint) — 같은 함수가 테스트 파일 여섯 자리에
// 각자 적혀 판본이 셋으로 갈려 있었고, 이 파일의 판본이 그중 의도한 것이었다.
const stripComments = stripSourceComments;

test('사유별로 무엇이 잘못됐는지 다르게 말한다(만료 vs 잘못된 링크)', () => {
  // 글자를 손으로 다시 적지 않는다 — 그러면 이 테스트가 **사본을 고정**하는 테스트가 되고,
  // 문구를 고치는 날 「왜 바뀌면 안 되는가」가 아니라 「무엇이 적혀 있었는가」만 지킨다.
  // 지키려는 것은 두 사유가 **다르게** 말한다는 사실이다(아래 두 줄).
  assert.match(tokenMessage('expired'), /^링크가 만료되었습니다\. /);
  assert.notEqual(tokenMessage('expired'), tokenMessage('malformed'));
  assert.equal(tokenMessage('signature'), tokenMessage('malformed'));
  assert.equal(tokenMessage('missing'), tokenMessage('malformed'));
});

test('모르는 사유는 가장 보수적인 안내로 떨어진다(빈 문장 금지)', () => {
  for (const bad of ['알 수 없는 사유', '', null, undefined, 42]) {
    assert.equal(tokenMessage(bad), EUM_TOKEN_MESSAGE.malformed, `입력: ${String(bad)}`);
  }
  // 프로토타입 이름이 표의 값처럼 통과하면 함수 본문이 그대로 화면에 그려진다.
  for (const key of ['constructor', '__proto__', 'toString', 'hasOwnProperty']) {
    assert.equal(tokenMessage(key), EUM_TOKEN_MESSAGE.malformed, `키: ${key}`);
  }
});

test('문장 끝이 한 가지다 — 마침표가 붙은 판본이 섞이지 않는다', () => {
  for (const [key, msg] of Object.entries(EUM_TOKEN_MESSAGE)) {
    assert.ok(msg.length > 10, `${key}: 문장이 비었다`);
    assert.ok(!msg.endsWith('.'), `${key}: 마침표로 끝나는 두 번째 판본이다 — ${msg}`);
    assert.match(msg, /담당자/, `${key}: 어르신이 연락할 상대는 담당자다`);
    assert.ok(!/관리자/.test(msg), `${key}: 어르신에게 「관리자」는 누구인지 알 수 없는 사람이다`);
  }
});

// ── 왜 떼어 냈는가: 이 자리는 비밀을 몰라야 한다 ────────────────────────────
test('문구 표는 비밀·암호·입출력을 한 줄도 쓰지 않는다(클라이언트 안전)', () => {
  for (const banned of ['process.env', 'crypto', 'SECRET', 'secret', 'require(', 'node:']) {
    assert.ok(!MESSAGE_SRC.includes(banned),
      `lib/eumMessage.js 에 ${banned} 가 들어왔다 — 브라우저 번들에 실릴 수 없게 된다`);
  }
  assert.equal(/^import\b/m.test(MESSAGE_SRC), false, '문구 표는 아무것도 import 하지 않는다');
  // 떼어 낸 이유가 유효한지 함께 고정한다 — eumToken 이 비밀을 읽는 동안에만 이 분리가 필요하다.
  assert.match(TOKEN_SRC, /process\.env\.EUM_TOKEN_SECRET/, 'lib/eumToken 이 비밀을 읽지 않는다 — 분리 이유를 다시 보라');
});

test('문장은 lib/eumMessage.js 한 곳에만 적혀 있다(사본 되살아남 금지)', () => {
  const sentences = Object.values(EUM_TOKEN_MESSAGE);
  for (const [name, src] of Object.entries({ ...SCREENS, 'lib/eumToken.js': TOKEN_SRC, 'lib/eumConsume.js': CONSUME_SRC })) {
    const code = stripComments(src);
    for (const s of sentences) {
      assert.ok(!code.includes(s), `${name}: 문장을 손으로 적었다 — ${s}`);
    }
  }
  // 재수출도 두지 않는다 — import 경로가 둘이면 「단일 출처」가 다시 말뿐이 된다.
  assert.equal(/EUM_TOKEN_MESSAGE|tokenMessage/.test(stripComments(TOKEN_SRC)), false,
    'lib/eumToken 이 문구를 다시 export 한다 — 가리키는 길이 둘이 된다');
});

test('링크 상태를 말하는 화면 전부가 같은 표를 가리킨다', () => {
  for (const [name, src] of Object.entries(SCREENS)) {
    assert.match(src, /from '@\/lib\/eumMessage'/, `${name}: 문구 단일 출처를 import 하지 않는다`);
    // 제목이 있는 패널은 `panelTitle`·`EUM_PANEL_*`, 제목이 없는 알림 한 줄은 `tokenMessage` —
    // 어느 쪽이든 **이 표**를 거쳐야 한다(손으로 적은 판본 금지).
    assert.match(src, /tokenMessage\(|panelTitle\(|EUM_PANEL_/, `${name}: 문구를 표에서 가져오지 않는다`);
    // 비밀을 읽는 모듈에서 문구를 끌어오면 그 모듈이 화면 번들에 따라 들어온다.
    assert.equal(/tokenMessage[^\n]*from '@\/lib\/eumToken'/.test(src), false,
      `${name}: 문구를 lib/eumToken 에서 가져온다`);
  }
  // 브라우저에서 도는 화면은 eumToken 을 아예 import 하지 않는다(서명 비밀·HMAC 유출 방지).
  const flow = SCREENS['app/eum/senior/[token]/SeniorFlow.jsx'];
  assert.equal(/from '@\/lib\/eumToken'/.test(flow), false, '클라이언트 번들에 서명 비밀이 따라 들어온다');
});

test('호출 자리가 쓰는 사유 이름이 전부 표에 있다(없는 이름은 조용히 공통 안내가 된다)', () => {
  const used = new Set();
  for (const src of Object.values(SCREENS)) {
    for (const m of stripComments(src).matchAll(/tokenMessage\(\s*'([^']*)'\s*\)/g)) used.add(m[1]);
  }
  assert.ok(used.size >= 2, `호출 자리를 읽지 못했다 — 대조가 무의미해지기 전에 고쳐라: ${used.size}`);
  const unknown = [...used].filter((k) => !(k in EUM_TOKEN_MESSAGE));
  assert.deepEqual(unknown, [], `표에 없는 사유 이름: ${unknown.join(',')}`);
  // 직접 불리지 않는 이름(malformed)은 **공통 안내의 기본값**이라 죽은 항목이 아니다.
  // 사유 이름은 verifyEumToken 의 reason 과 같아야 한다 — 어긋나면 사유별 안내가 무력해진다.
  for (const key of Object.keys(EUM_TOKEN_MESSAGE)) {
    assert.ok(TOKEN_SRC.includes(`'${key}'`), `lib/eumToken 이 내지 않는 사유가 표에 있다: ${key}`);
  }
});

// ── 고친 결함: 제목이 본문과 **같은 말을 두 번** 했다 ──────────────────────
//
// 안내 패널의 제목은 화면 파일마다 손으로 적혀 있었다(네 벌). 본문만 이 표에서 왔으므로
// 아무도 그 둘을 서로 대조하지 않았고, 그 사이 만료 패널은 제목과 본문의 첫 문장이
// **글자까지 같았다** — 그 패널은 전환과 함께 제목으로 포커스를 옮기므로(11회차), 듣는
// 어르신은 제목을 듣고 이어 읽는 본문에서 방금 들은 문장을 한 번 더 듣는다(✓ 표시를
// aria-hidden 으로 가린 것과 같은 이유로 피해야 하는 중복이다). 보는 어르신에게는 24px 넘는
// 글자 두 줄이 같은 말을 하는 화면이고, 되돌릴 단추가 없는 화면에서 둘 중 하나는 쓸모가 없었다.
// 지금은 제목이 **무엇이 잘못됐는가**, 본문이 **무엇을 하면 되는가**이고 둘은 같은 토막에서
// 나온다 — 한쪽만 고쳐져 갈라지는 길이 없다.
test('패널 제목: 사유별 알림 문장과 같은 토막에서 나온다(양방향)', () => {
  const keys = Object.keys(EUM_TOKEN_MESSAGE);
  assert.ok(keys.length >= 4, `표가 줄었다: ${keys.length}`);
  for (const reason of keys) {
    const title = panelTitle(reason);
    assert.ok(title && Object.values(EUM_PANEL_TITLE).includes(title), `${reason}: 제목이 등록부 밖이다`);
    // 알림 한 줄(제목 없는 자리)은 「무엇이 잘못됐는가 + 무엇을 하면 되는가」를 이어 쓴다.
    // 뒤 토막도 **사유로** 고른다(panelAsk) — 만료만 조건절을 들기 때문이고, 그 갈림이
    // 제목과 다른 자리에서 정해지면 한 화면이 「만료되었습니다」 아래에 잘린 링크용 본문을
    // 붙이게 된다(두 함수가 같은 자리 이름을 쓴다 · lib/eumMessage 의 panelSlot).
    assert.equal(tokenMessage(reason), `${title}. ${panelAsk(reason)}`,
      `${reason}: 제목과 알림 문장이 다른 토막에서 나온다 — 한쪽만 고쳐지면 갈라진다`);
    assert.ok(Object.values(PANEL_ASKS).includes(panelAsk(reason)), `${reason}: 본문이 등록부 밖이다`);
  }
  // 만료만 다른 본문을 쓴다 — 그 화면에만 보조 사본 줄이 붙고, 무조건 청하라는 말이 그 줄과
  // 정면으로 어긋났다(아래 「만료 패널의 본문은 …」 테스트가 그 사실을 따로 고정한다).
  assert.notEqual(panelAsk('expired'), panelAsk('malformed'), '만료 본문이 다시 한 벌로 합쳐졌다');
  for (const r of ['signature', 'malformed', 'missing', 'lifetime']) {
    assert.equal(panelAsk(r), EUM_PANEL_ASK, `${r}: 잘못된 링크 쪽 본문이 갈라졌다`);
  }
  // 모르는 사유는 두 함수가 **같은 쪽**으로 떨어져야 한다(안내가 서로 다른 상태를 말하지 않게).
  for (const bad of ['알 수 없는 사유', '', null, undefined, 42, 'constructor', '__proto__']) {
    assert.equal(panelTitle(bad), EUM_PANEL_TITLE.link, `입력: ${String(bad)}`);
    assert.equal(panelAsk(bad), EUM_PANEL_ASK, `입력: ${String(bad)}`);
    assert.match(tokenMessage(bad), new RegExp(`^${EUM_PANEL_TITLE.link}`), `입력: ${String(bad)}`);
  }
});

// ── 고친 결함: 만료 패널이 **한 화면에서 서로 반대되는 말**을 했다 ────────────
//
// 그 화면은 세 줄을 이어서 말한다 — 본문 「담당자에게 다시 요청해 주세요」(무조건) · 보조
// 사본 한 줄 「… 그대로 괜찮으시면 담당자에게 **새 링크를 청하지 않으셔도** 됩니다」(조건부) ·
// 마무리 「… 새 링크를 받으시면 바로 열어 주세요」. 신청을 이미 마친 어르신이 만료 링크를
// 다시 열면 **첫 줄**이 담당자에게 전화를 걸게 하고, 그 전화가 새 링크를 부르고, 새 링크는
// 소진 키가 달라 재신청이 통한다 → 담당자 명단에 같은 어르신 두 건. 보조 사본 줄은 바로 그
// 중복을 막으려고 18회차에 넣은 것인데, 본문이 그것을 **미리 뒤집고** 있었다(그리고 본문이
// 위라 먼저 읽힌다). 21·22·25회차가 「이미 접수됐다」 쪽에서 세 번 없앤 것과 같은 모양이다.
// 25회차는 이 자리를 「본문을 그 조각이 바꾸게 해야 하므로 디자인 결정」으로 남겼는데, 고칠
// 길이 하나 더 있었다 — 21회차가 쓴 그 수단, **본문을 무조건 참인 문장으로 바꾸는 것**이다.
// 조건은 서버가 아니라 **어르신이** 가린다(신청을 마쳤는지 아는 사람은 어르신이다).
const PANEL_ASKS = { link: EUM_PANEL_ASK, expired: EUM_PANEL_ASK_EXPIRED };

test('만료 패널의 본문은 보조 사본 줄과 어긋나지 않는다(무조건 청하라고 하지 않는다)', () => {
  const ask = panelAsk('expired');
  // 조건절을 든다 — 「…(하)면」 꼴 하나는 있어야 한다. 무조건 청하라는 말로 되돌아가면 실패.
  assert.match(ask, /면 /, '만료 본문이 다시 무조건적인 말이 됐다');
  assert.notEqual(ask, EUM_PANEL_ASK, '만료 본문이 잘린 링크 쪽과 같은 한 벌로 돌아갔다');
  // 그래도 **할 일을 말한다** — 조건절만 남기고 다음 행동이 사라지면 막다른 화면이 된다.
  assert.match(ask, /담당자/, '어르신이 연락할 상대를 말하지 않는다');
  assert.match(ask, /주세요$/, '패널 본문 한 줄의 규약(마침표 없음·하라는 말)이 깨졌다');
  // 바로 아래 줄과 **같은 조건**을 가리켜야 한다(그 줄이 「그대로 괜찮으시면」이다).
  assert.match(EUM_PRIOR_TAIL.expiredEntry, /그대로 괜찮으시면/, '보조 사본 줄의 조건절이 사라졌다');
  assert.equal(EUM_PRIOR_TAIL.expiredEntry, EUM_PRIOR_TAIL.expiredFlow, '두 만료 화면이 갈라졌다');
  // 두 만료 화면(진입·작성 중)이 **같은 한 자리**에서 본문을 가져온다.
  assert.match(SCREENS['app/eum/senior/[token]/page.jsx'], /body=\{panelAsk\(result\.reason\)\}/,
    '진입 화면이 본문을 사유에서 고르지 않는다');
  assert.match(SCREENS['app/eum/senior/[token]/SeniorFlow.jsx'], /body=\{panelAsk\('expired'\)\}/,
    '작성 중 만료 화면이 본문을 사유에서 고르지 않는다');
  // 잘린·잘못된 링크 화면은 종전 그대로다 — 그쪽에는 보조 사본 줄이 애초에 없다(sid 가 없다).
  for (const name of ['app/eum/page.jsx', 'app/eum/senior/page.jsx', 'app/eum/[...rest]/page.jsx']) {
    assert.match(SCREENS[name], /body=\{panelAsk\('missing'\)\}/, `${name}: 본문이 사유에서 오지 않는다`);
    assert.ok(!/PriorLocal/.test(SCREENS[name]), `${name}: 보조 사본 줄이 생겼다 — 본문 판정을 다시 정해야 한다`);
  }
  // 사본이 되살아나면 화면마다 본문이 갈라진다(9회차의 「두 번째 판본」과 같은 모양).
  for (const [name, src] of Object.entries(SCREENS)) {
    for (const [key, msg] of Object.entries(PANEL_ASKS)) {
      assert.ok(!stripComments(src).includes(msg), `${name}: 본문을 손으로 적었다 — ${key}`);
    }
  }
});

test('패널 제목: 본문이 제목을 되풀이하지 않고, 등록부와 화면이 양방향으로 맞는다', () => {
  // 패널 본문은 제목이 말한 문장을 **담지 않는다**(같은 말을 두 번 하지 않는다).
  // 본문은 이제 **두 벌**이다(만료만 조건절을 든다) — 규약은 둘 다 지켜야 한다.
  for (const [key, ask] of Object.entries(PANEL_ASKS)) {
    for (const title of Object.values(EUM_PANEL_TITLE)) {
      assert.ok(!ask.includes(title), `${key}: 본문이 제목을 되풀이한다 — ${title}`);
    }
    assert.ok(ask.length > 5 && !ask.endsWith('.'), `${key}: 본문 한 줄의 규약이 깨졌다`);
  }
  // 등록부 ↔ 화면 양방향: 쓰이지 않는 제목이 남으면 표가 썩고, 손으로 적은 사본이 생기면
  // 화면마다 제목이 갈라진다(9회차의 「두 번째 판본」과 같은 모양).
  const text = Object.values(SCREENS).map(stripComments).join('\n');
  const used = new Set([...text.matchAll(/EUM_PANEL_TITLE\.(\w+)/g)].map((m) => m[1]));
  // panelTitle() 로 오는 둘(expired·link)은 이름을 적지 않고 사유로 고른다 — 그 둘은
  // 위 테스트가 사유별로 대조하므로 여기서는 직접 쓰이는 이름만 더해 비교한다.
  for (const name of ['expired', 'link']) used.add(name);
  assert.deepEqual([...used].sort(), Object.keys(EUM_PANEL_TITLE).sort(), '등록부와 화면이 어긋난다');
  for (const [key, title] of Object.entries(EUM_PANEL_TITLE)) {
    assert.ok(!text.includes(`"${title}"`) && !text.includes(`'${title}'`),
      `${key}: 제목을 손으로 적은 화면이 있다 — ${title}`);
  }
  // 머리말도 한 줄만 있어야 한다 — 화면 쪽 대조는 tests/eumseniorui 가 한다.
  assert.ok(EUM_KICKER.length > 3 && !/[.。]$/.test(EUM_KICKER), '머리말 규약이 깨졌다');
});

// ── 제출이 되지 않았을 때의 안내(알림 자리) ────────────────────────────────
//
// 고친 결함: 이 다섯 문장은 `SeniorFlow` 안에 손으로 적혀 있었고, 아무 테스트도 보지 않는
// 사이 두 가지가 들어와 있었다. ① 둘이 「**아래** 단추를 한 번 더 눌러 주세요」로 자리를
// 가리켰다 — 그 안내는 주버튼보다 **위**에 그려졌으므로, 생기는 순간 가리킨 단추를 자기가
// 아래로 밀어냈고, 「아래」는 애초에 눈에만 뜻이 있는 말이다(그 순간 포커스는 이미 그 단추에
// 있다). ② 끝이 전부 마침표였다 — 같은 알림 자리에 오는 401 안내(tokenMessage)는 마침표로
// 끝나지 않으므로, 어르신이 어느 실패를 만나느냐에 따라 문장의 끝이 달랐다. 9회차가 없앤
// 「마침표가 하나 더 붙은 두 번째 판본」이 **같은 자리에 네 벌** 남아 있었던 셈이다.
test('제출 실패 안내: 자리를 가리키는 낱말이 없다(눈에만 뜻이 있는 말이 아니다)', () => {
  const positional = ['아래', '위에', '위의', '왼쪽', '오른쪽', '아래쪽', '위쪽', '맨 끝'];
  for (const [key, msg] of Object.entries(EUM_SUBMIT_MESSAGE)) {
    for (const word of positional) {
      assert.ok(!msg.includes(word), `${key}: 자리를 가리키는 말이 들어왔다(${word}) — ${msg}`);
    }
  }
});

test('제출 실패 안내: 문장 끝이 같은 알림 자리의 다른 문장과 한 가지다', () => {
  const keys = Object.keys(EUM_SUBMIT_MESSAGE);
  assert.ok(keys.length >= 5, `표가 줄었다: ${keys.length}`);
  for (const [key, msg] of Object.entries(EUM_SUBMIT_MESSAGE)) {
    assert.ok(msg.length > 8, `${key}: 문장이 비었다`);
    // 같은 자리에 오는 401 안내(EUM_TOKEN_MESSAGE)와 끝이 달라지면 안 된다.
    assert.ok(!msg.endsWith('.'), `${key}: 마침표로 끝나는 판본이다 — ${msg}`);
    assert.ok(!/관리자/.test(msg), `${key}: 어르신에게 「관리자」는 누구인지 알 수 없는 사람이다`);
  }
  // 무엇을 하면 되는지 한 줄은 말한다 — 실패만 알리고 끝나면 어르신은 멈춘다(QUALITY_BAR §3).
  for (const [key, msg] of Object.entries(EUM_SUBMIT_MESSAGE)) {
    assert.match(msg, /주세요/, `${key}: 다음에 할 일을 말하지 않는다 — ${msg}`);
  }
});

test('제출 실패 안내: 모르는 사유는 접수되지 않았다는 사실로 떨어진다(빈 문장 금지)', () => {
  for (const bad of ['알 수 없는 사유', '', null, undefined, 42]) {
    assert.equal(submitMessage(bad), EUM_SUBMIT_MESSAGE.rejected, `입력: ${String(bad)}`);
  }
  for (const key of ['constructor', '__proto__', 'toString', 'hasOwnProperty']) {
    assert.equal(submitMessage(key), EUM_SUBMIT_MESSAGE.rejected, `키: ${key}`);
  }
  assert.equal(submitMessage('offline'), EUM_SUBMIT_MESSAGE.offline);
});

test('제출 실패 안내: 사유 이름 ↔ 호출 자리가 양방향으로 맞는다', () => {
  const flow = stripComments(SCREENS['app/eum/senior/[token]/SeniorFlow.jsx']);
  const used = new Set([...flow.matchAll(/submitMessage\(\s*'([^']*)'\s*\)/g)].map((m) => m[1]));
  // 모르는 이름을 적으면 조용히 `rejected` 가 되어(무엇이 잘못됐는지 알 수 없는 안내)
  // 아무 신호도 나지 않고, 쓰이지 않는 이름이 남으면 표가 썩는다.
  assert.deepEqual([...used].sort(), Object.keys(EUM_SUBMIT_MESSAGE).sort(), '표와 화면이 어긋난다');
  // 문장을 손으로 다시 적으면 판본이 둘이 된다(9회차와 같은 모양).
  for (const [name, src] of Object.entries(SCREENS)) {
    for (const msg of Object.values(EUM_SUBMIT_MESSAGE)) {
      assert.ok(!stripComments(src).includes(msg), `${name}: 문장을 손으로 적었다 — ${msg}`);
    }
  }
});

// ── 클라이언트에서 닿아도 되는 자리 ──────────────────────────────────────────
//
// 고친 결함: 브라우저에서 도는 화면(`SeniorFlow`)이 **문장 두 줄**을 얻으려고
// `lib/eumConsume` 를 import 하고 있었다. 그 파일은 소진 스토어(프로세스 전역에 매달린 Map)·
// 상한 축출·헬스 판정을 든 **서버 쪽 판정 모듈**이다. 9회차가 문구 표를 `lib/eumToken`
// (서명 비밀·HMAC)에서 떼어 낸 이유가 글자 그대로 적용되는 자리인데, 그때 세운 가드는
// **그 파일 이름 하나**만 보고 있었다 — 15·16·18회차가 세 번 만난 「가드가 자기 이유보다
// 좁았다」의 다음 모양이다.
// 당장 새는 것은 없었다(번들 산출물에는 전역 앵커 호출 한 줄과 문자열 몇 개만 남는다).
// 위험한 쪽은 **다음**이다: 그 파일에 공유 저장소 어댑터를 끼우는 일이 「남은 승인 사항」에
// 예약돼 있고, 그날 저장소 클라이언트가 어르신 화면 번들을 따라 들어간다.
//
// 그래서 파일 이름 하나가 아니라 **닿아도 되는 자리 전부**를 사유와 함께 등록한다.
const CLIENT_FILES = {
  'app/eum/senior/[token]/SeniorFlow.jsx': read('app/eum/senior/[token]/SeniorFlow.jsx'),
  'app/eum/senior/[token]/PriorLocal.jsx': read('app/eum/senior/[token]/PriorLocal.jsx'),
  'app/eum/error.jsx': read('app/eum/error.jsx'),
};

// 클라이언트 파일이 import 해도 되는 `@/lib/*` 모듈 ↔ 사유.
// `env` 가 붙은 항목만 환경변수를 읽을 수 있다(그 사유도 함께 적는다).
const CLIENT_SAFE_LIB = {
  '@/lib/eumSenior': { why: '흐름 규칙의 순수 로직(단계·주소·히스토리·보조 사본 판정) — 저장소도 통신도 없다' },
  // (사유 정정: 「단조 눈금」이라고 적어 두었는데 `performance.now()` 가 없는 환경에서는
  //  기기 시계로 물러선다 — 그래서 이 모듈은 눈금의 **출처**를 값과 함께 들고, 되돌릴 수
  //  없는 선언만 그것을 가린다. 어느 쪽이든 순수 계산이고 통신·저장소는 없다.)
  '@/lib/eumCountdown': { why: '남은 시간 계산(순수 · 눈금 출처를 함께 든다) — 문서 속성 한 칸만 읽고 쓴다' },
  '@/lib/eumMessage': { why: '화면 문구의 단일 출처 — 문자열뿐이고 import 한 줄도 없다' },
  '@/lib/fetchJson': { why: '제출 한 번을 보내는 자리 — 상한·오프라인 판정은 브라우저 쪽 사실이다' },
  '@/lib/monitor': {
    why: '오류 경계가 쓰는 것은 봉투 포맷터 둘(buildEvent·monitorLine)이고, 화면은 콘솔에만 적는다',
    // 환경변수를 읽는 줄은 **전송 쪽**(isMonitorEnabled·deliver)이고 화면은 그 길을 부르지
    // 않는다. 공개 접두어가 아닌 값은 클라이언트 번들에 끼워 넣어지지도 않는다.
    env: '전송 쪽에서만 읽는다 — 화면이 부르는 포맷터 둘은 환경을 모른다',
  },
};

// 서버 쪽에만 있어야 하는 것들. 이름이 아니라 **성질**로 판정한다 —
// 프로세스 전역 상태(전역 앵커)·노드 전용 API·서명 계산·데이터베이스.
const SERVER_ONLY_MARKS = [
  { mark: 'globalThis', why: '프로세스 전역에 매단 상태는 서버 것이다' },
  { mark: 'Symbol.for(', why: '전역 심볼 앵커 — 같은 이유' },
  { mark: 'node:', why: '노드 전용 모듈' },
  { mark: 'require(', why: '노드 전용 적재' },
  { mark: 'crypto.subtle', why: '서명 계산 — 비밀값이 따라온다' },
  { mark: "from '@/lib/db'", why: '데이터베이스 클라이언트' },
];

test('클라이언트 화면이 끌고 들어오는 lib 가 전부 등록돼 있다(양방향)', () => {
  assert.ok(Object.keys(CLIENT_FILES).length === 3, '클라이언트 파일 목록이 바뀌었다 — 등록부를 다시 보라');
  const used = new Set();
  for (const [name, src] of Object.entries(CLIENT_FILES)) {
    assert.match(src, /^\s*["']use client["']/m, `${name}: 클라이언트 파일이 아니다 — 목록을 다시 보라`);
    for (const spec of importedModules(stripComments(src))) {
      if (!spec.startsWith('@/lib/')) continue; // 상대 경로(같은 화면군)·react 는 대조 대상이 아니다
      used.add(spec);
      assert.ok(spec in CLIENT_SAFE_LIB,
        `${name}: 등록되지 않은 모듈을 브라우저로 끌고 들어온다 — ${spec}`);
    }
  }
  // 쓰이지 않는 등록은 표를 썩힌다(다음 사람이 "닿아도 된다" 는 판정을 근거 없이 물려받는다).
  assert.deepEqual([...used].sort(), Object.keys(CLIENT_SAFE_LIB).sort(), '등록부와 실제 import 가 어긋난다');
});

test('등록된 모듈은 서버 쪽 성질(전역 상태·노드 API·서명·DB)을 들고 있지 않다', () => {
  for (const [spec, entry] of Object.entries(CLIENT_SAFE_LIB)) {
    assert.ok(entry && typeof entry.why === 'string' && entry.why.length > 10, `${spec}: 사유가 없다`);
    const code = stripComments(read(`lib/${spec.replace('@/lib/', '')}.js`));
    for (const { mark, why } of SERVER_ONLY_MARKS) {
      assert.ok(!code.includes(mark), `${spec}: ${mark} 가 들어왔다(${why}) — 브라우저로 따라 들어간다`);
    }
    if (!entry.env) {
      assert.ok(!code.includes('process.env'), `${spec}: 환경변수를 읽는다 — 사유를 등록하거나 떼어 내라`);
    }
  }
  // 떼어 낸 **이유가 유효한지** 함께 고정한다(eumToken 쪽 대조와 같은 계약) — 소진 판정
  // 모듈이 지금도 프로세스 전역 상태를 들고 있을 때에만 이 분리가 필요하다.
  const consume = stripComments(CONSUME_SRC);
  assert.ok(SERVER_ONLY_MARKS.some(({ mark }) => consume.includes(mark)),
    'lib/eumConsume 이 서버 쪽 성질을 잃었다 — 분리 이유를 다시 보라');
});

test('소진 안내는 같은 문장을 다시 적지 않고 표를 가리킨다', () => {
  assert.match(CONSUME_SRC, /from '\.\/eumMessage\.js'/, 'lib/eumConsume 이 문구 표를 쓰지 않는다');
  assert.match(CONSUME_SRC, /expired:\s*EUM_TOKEN_MESSAGE\.expired/);
  assert.match(CONSUME_SRC, /unusable:\s*EUM_TOKEN_MESSAGE\.malformed/);
  // `used` 만 이 파일이 손으로 적고 있었고, 그 문장이 접수가 끝난 사람에게 할 일을 만들었다
  // (「담당자에게 문의해 주세요」 → 새 링크 → 명단에 두 건). 자세한 대조는 tests/eumrepeat.
  assert.match(CONSUME_SRC, /used:\s*EUM_DONE_MESSAGE\.already/);
});

// ── 고친 결함: 「이미 접수됐다」 패널도 제목이 본문을 되풀이했다 ──────────────
//
// 위 「패널 제목」 두 테스트가 만료·잘린 링크에서 없앤 중복이 한 자리 더 남아 있었다 —
// 제목 `EUM_PANEL_TITLE.used`(「이미 신청하셨습니다」) / 본문 「**이미 신청이 접수되었습니다**.
// 담당자가 곧 전화로 안내해 드립니다」. 그 자리를 남긴 이유는 「본문은 완료 화면과 **같은
// 문장**이어야 한다」는 13회차의 계약이 먼저였기 때문인데, 그 계약을 깨지 않는 길은 이 파일에
// 이미 두 번 쓰여 있었다(EUM_PANEL_TITLE/EUM_PANEL_ASK · EUM_SOON_LEAD/EUM_SOON_NEXT):
// **한 토막을 둘로 나누고**, 제목이 없는 자리에서는 이어 쓰고 패널에서는 나눠 쓴다.
test('접수 문구: 제목·본문 두 토막으로 나뉘고, 이어 쓴 문장이 그 둘의 합이다', () => {
  // 이어 쓴 문장은 **여기서 조립한다** — 글자가 한 자라도 다르면 진입 패널(제목+본문)과
  // 409 응답·완료 화면이 서로 다른 말을 하게 된다.
  for (const kind of Object.keys(EUM_DONE_STATE)) {
    assert.equal(EUM_DONE_MESSAGE[kind], `${EUM_DONE_STATE[kind]}. ${EUM_DONE_NEXT}`,
      `${kind}: 이어 쓴 문장이 두 토막에서 나오지 않는다`);
  }
  assert.deepEqual(Object.keys(EUM_DONE_MESSAGE).sort(), Object.keys(EUM_DONE_STATE).sort(),
    '두 표의 경우가 어긋난다(한쪽에만 있는 경우는 조용히 undefined 가 된다)');
  // 제목 자리와 본문 자리는 **서로 다른 사실**을 말한다(그 중복이 이 고침의 이유다).
  for (const [kind, state] of Object.entries(EUM_DONE_STATE)) {
    assert.ok(!EUM_DONE_NEXT.includes(state), `${kind}: 본문이 제목을 그대로 담고 있다`);
    assert.ok(!state.includes(EUM_DONE_NEXT), `${kind}: 제목이 본문을 그대로 담고 있다`);
    assert.ok(!state.endsWith('.'), `${kind}: 제목 자리의 문장 끝 규약이 깨졌다`);
    assert.match(state, /접수되었습니다/, `${kind}: 무엇이 이미 되어 있는지를 말하지 않는다`);
  }
  // 본문 자리의 규약은 EUM_PANEL_ASK 와 같다(마침표 없음) — 섞이면 패널마다 끝이 달라진다.
  assert.ok(!EUM_DONE_NEXT.endsWith('.') && EUM_DONE_NEXT.length > 8, '본문 한 줄의 규약이 깨졌다');
  assert.match(EUM_DONE_NEXT, /담당자/, '다음에 무슨 일이 일어나는지를 말하지 않는다');
  // 접수가 끝난 사람에게 **할 일을 만들지 않는다**(그 전화가 새 링크를 부르고 명단에 두 건).
  assert.equal(/문의해 주세요|확인해 주세요/.test(EUM_DONE_NEXT), false, '할 일이 없는 사람에게 할 일을 준다');
  // 「잘못됐는가」를 말하는 표에는 이 제목이 없다 — 접수는 잘못된 상태가 아니다.
  assert.equal('used' in EUM_PANEL_TITLE, false, '접수 사실이 「무엇이 잘못됐는가」 표로 되돌아갔다');
  assert.deepEqual(Object.keys(EUM_PANEL_TITLE).sort(), ['expired', 'link']);
});

test('이미 접수된 링크의 힌트 두 줄이 판정 모듈이 아니라 문구 표에 있다', () => {
  for (const [key, msg] of Object.entries({
    change: EUM_CONSUME_CHANGE_HINT, unknown: EUM_CONSUME_UNKNOWN_HINT,
  })) {
    assert.ok(msg.length > 10, `${key}: 문장이 비었다`);
    assert.match(msg, /담당자/, `${key}: 어르신이 연락할 상대는 담당자다`);
    assert.ok(!/관리자/.test(msg), `${key}: 어르신에게 「관리자」는 누구인지 알 수 없는 사람이다`);
    // 이 두 줄은 알림 한 줄이 아니라 패널의 힌트 자리에 온다(EUM_NOTICE_FOOT 과 같은 자리).
    assert.ok(msg.endsWith('.'), `${key}: 힌트 자리의 문장 끝이 그 자리의 다른 표와 달라졌다`);
  }
  // 판정 모듈에 사본도, **재수출도** 남지 않았다 — 가리키는 길이 둘이면 단일 출처가 말뿐이다.
  const consume = stripComments(CONSUME_SRC);
  for (const msg of [EUM_CONSUME_CHANGE_HINT, EUM_CONSUME_UNKNOWN_HINT]) {
    assert.ok(!consume.includes(msg), `lib/eumConsume 에 문장이 남아 있다 — ${msg}`);
  }
  assert.equal(/export\s+(?:const|\{)[^\n]*EUM_CONSUME_(?:CHANGE|UNKNOWN)_HINT/.test(consume), false,
    'lib/eumConsume 이 힌트를 다시 내보낸다 — 가리키는 길이 둘이 된다');
  // 같은 사실을 보여 주는 두 화면이 같은 표를 가리킨다(한쪽만 고쳐지는 길을 없앤다).
  for (const name of ['app/eum/senior/[token]/page.jsx', 'app/eum/senior/[token]/SeniorFlow.jsx']) {
    const code = stripComments(SCREENS[name]);
    assert.match(code, /EUM_CONSUME_CHANGE_HINT[\s\S]*from '@\/lib\/eumMessage'|from '@\/lib\/eumMessage'[\s\S]*EUM_CONSUME_CHANGE_HINT/,
      `${name}: 힌트를 문구 표에서 가져오지 않는다`);
    assert.equal(/EUM_CONSUME_(?:CHANGE|UNKNOWN)_HINT[^\n]*from '@\/lib\/eumConsume'/.test(code), false,
      `${name}: 판정 모듈에서 문구를 끌어온다`);
  }
});

// ── 고친 결함: 만료 임박 경고가 **모든 단계에서 같은 말**을 했다 ─────────────
//
// 그 문장은 「잠시 후 링크가 만료됩니다. **지금 고르신 것을 신청해 주세요**」 한 벌이었고,
// 뒤 토막이 맞는 자리는 확인 화면(3단계) 하나뿐이다. 1단계에는 고른 것도 신청 단추도 없고,
// 2단계에는 활동만 있다 — 되돌릴 길을 가리키는 문장이 **그 화면에 없는 것**을 가리켰다
// (11회차의 「아래 단추」·8회차의 「5분이 지나면 닫힙니다」와 같은 모양이고, 원인도 같다:
//  한 문장이 아무 조건 없이 모든 자리에 붙는다). 하필 이 경고는 들리는 것이 존재 이유 전부다.
test('만료 임박 경고: 단계마다 그 화면에서 할 수 있는 일을 말한다(등록부 ↔ 단계 양방향)', () => {
  // 경고가 그려지는 단계는 1~3 이다(4단계는 제출이 끝난 화면이라 경고가 뜨지 않는다).
  const steps = [];
  for (let s = EUM_STEP_MIN; s < EUM_STEP_MAX; s += 1) steps.push(String(s));
  assert.deepEqual(Object.keys(EUM_SOON_NEXT).sort(), steps.sort(),
    '등록부가 경고가 그려지는 단계와 어긋난다(없는 단계는 앞 토막만 남고, 남는 이름은 표를 썩힌다)');

  assert.match(EUM_SOON_LEAD, /링크/, '무엇의 수명이 다하는지를 말하지 않는다');
  assert.match(EUM_SOON_LEAD, /만료/, '바로 다음에 보게 되는 화면의 제목과 다른 낱말로 말한다');
  assert.equal(/닫힙니다/.test(EUM_SOON_LEAD), false, '닫히지 않는 화면에 닫힌다고 적은 문장이 되살아났다');
  // 다음 화면의 제목과 **낱말이 겹치는지** 양쪽에서 본다(시제만 다르다).
  for (const word of ['링크', '만료']) {
    assert.ok(EUM_PANEL_TITLE.expired.includes(word), `다음 화면 제목이 「${word}」를 잃었다`);
  }

  for (const s of [1, 2, 3]) {
    const msg = soonMessage(s);
    assert.ok(msg.startsWith(`${EUM_SOON_LEAD}. `), `${s}단계: 앞 토막이 한 벌이 아니다 — ${msg}`);
    // 뒤 토막은 **하라는 말**로 끝난다. 예전 대조는 글자 「신청해 주세요」를 찾았는데, 그러면
    // 3단계 토막이 눌러야 하는 단추를 **이름**으로 가리키는 쪽으로 바뀔 길이 막힌다(25회차 ·
    // 아래 참조). 지키려는 것은 낱말이 아니라 「남은 1분 안에 할 일을 말한다」다.
    assert.match(msg, /주세요\.$/, `${s}단계: 남은 1분 안에 할 일을 말하지 않는다 — ${msg}`);
    // 매초 바뀌는 숫자를 섞으면 낭독이 1초마다 끊기고 처음부터 다시 읽힌다(초 숫자는
    // 화면이 aria-hidden 으로 따로 붙인다).
    assert.equal(/\d/.test(msg), false, `${s}단계: 문장에 숫자가 있다 — ${msg}`);
    assert.ok(!msg.includes('초'), `${s}단계: 초 단위를 문장에 넣었다`);
  }
  // 고친 결함 그 자체: 고른 것이 없는 화면에서 「지금 고르신 것」을 가리키지 않는다.
  // (정정: 이제 **어느 단계도** 그 말을 하지 않는다 — 3단계 토막은 고른 것 대신 눌러야 하는
  //  단추를 이름으로 가리킨다. 고른 것은 바로 위 요약이 이미 말하고, 그 요약은 주버튼의
  //  설명으로도 연결돼 있다 · 25회차.)
  for (const s of [1, 2, 3]) {
    assert.ok(!soonMessage(s).includes('고르신 것'), `${s}단계: 화면에 없는 것을 가리키는 말이 되살아났다`);
  }
  assert.notEqual(soonMessage(1), soonMessage(2), '두 고르는 화면의 남은 일이 다르다');

  // ── 고친 결함: 3단계 토막이 **무엇을 눌러야 하는지를 말하지 않았다** ──────────
  // 그 문장은 「지금 고르신 것을 신청해 주세요」였다. 그런데 이 경고는 화면 **맨 위**(제목
  // 바로 아래의 낭독 영역)에 뜨고 눌러야 하는 주버튼은 화면 **맨 아래**에 있으며, 그 순간
  // 포커스는 선택지나 제목에 얹혀 있다 — 11·12회차가 「아래 단추」에서 세운 규칙(단추는
  // 자리가 아니라 **이름**으로 가리켜야 찾을 수 있다)이 필요한 자리인데, 가리키는 말이
  // 아예 없었다. 경계 화면은 이미 그 규칙을 지키고 있었다(errorBody ← errorRetry).
  assert.ok(soonMessage(3).includes(EUM_ACTION.submit),
    '눌러야 하는 단추를 이름으로 가리키지 않는다 — 포커스가 멀리 있을 때 찾을 단서가 없다');
  for (const s of [1, 2]) {
    assert.ok(!soonMessage(s).includes(EUM_ACTION.submit), `${s}단계에는 그 단추가 화면에 없다`);
  }
  assert.match(MESSAGE_SRC, /3: `\$\{EUM_ACTION\.submit\}/, '단추 이름을 손으로 또 적었다');

  // ── 고친 결함: 그 갈림이 **단계까지**였다 ─────────────────────────────────
  // 바로 위 두 줄의 사유는 「그 단추가 화면에 없다」다. 그런데 그 단추의 글자는 상태에 따라
  // 바뀐다 — 제출이 떠 있는 동안 그 자리는 `EUM_ACTION.submitting`(「신청하는 중…」)이고
  // 「이대로 신청하기」는 **화면에 없다**. 남은 시간이 1분을 막 넘긴 상태에서 누른 제출은
  // 응답을 기다리는 사이(상한 8초) 눈금이 1분 아래로 내려가므로, 경고가 **처음 뜨는 시점이
  // 제출 중**인 경우가 드물지 않다. 그때 들리는 말은 없는 이름이고, 찾을 수 있는 단추를
  // 눌러도 아무 일도 일어나지 않는다(중복 전송은 우리가 막는다) — 14회차가 가장 나쁜
  // 결과로 꼽은 「눌러도 꼼짝하지 않는 단추」다.
  // 지금은 기다리는 동안의 할 일을 따로 말한다 — 화면이 그 동안 만료를 선언하지 않는 것과
  // **같은 결정**이다(22회차의 `!busy`).
  const busyMsg = soonMessage(3, true);
  assert.ok(busyMsg.startsWith(`${EUM_SOON_LEAD}. `), `제출 중: 앞 토막이 한 벌이 아니다 — ${busyMsg}`);
  assert.match(busyMsg, /주세요\.$/, `제출 중: 할 일을 말하지 않는다 — ${busyMsg}`);
  assert.equal(/\d/.test(busyMsg), false, '제출 중 문장에 숫자가 있다');
  assert.ok(!busyMsg.includes('초'), '제출 중 문장에 초 단위를 넣었다');
  // 핵심: 화면에 **없는 이름**을 가리키지 않는다. 어느 단계에서 눌렸든 같다.
  for (const s of [1, 2, 3]) {
    assert.ok(!soonMessage(s, true).includes(EUM_ACTION.submit),
      `제출 중(${s}단계): 그 이름의 단추는 화면에 없다 — 글자는 「${EUM_ACTION.submitting}」이다`);
    assert.equal(soonMessage(s, true), busyMsg, '제출 중에는 단계를 보지 않는다(기다리는 것이 할 일이다)');
  }
  // 그 자리에 적힌 글자를 **대신 가리키지도** 않는다 — 누르라고 할 단추가 아니다.
  assert.ok(!busyMsg.includes(EUM_ACTION.submitting), '진행 중인 단추를 누르라고 가리킨다');
  assert.notEqual(busyMsg, soonMessage(3), '제출 중에도 같은 말을 한다');
  // 등록부에 끼워 넣지 않는다 — 그 표는 **단계 ↔ 이름** 양방향 대조의 자리다(위 참조).
  assert.equal(Object.values(EUM_SOON_NEXT).includes(EUM_SOON_BUSY), false,
    '단계 등록부에 단계가 아닌 이름이 끼면 위 양방향 대조가 무의미해진다');
  // 토막을 고르는 자리는 **한 줄**이다 — 상태별 분기가 둘로 갈리면 바닥 쪽(아래 atFloor)과
  // 임박 쪽이 서로 다른 토막을 쓰게 된다.
  assert.match(MESSAGE_SRC, /const tail = busy \? EUM_SOON_BUSY : EUM_SOON_NEXT\[step\];/,
    '제출 중 토막을 손으로 또 짓는다');
  assert.match(MESSAGE_SRC, /return next \? `\$\{EUM_SOON_LEAD\}\. \$\{next\}\.` : `\$\{EUM_SOON_LEAD\}\.`;/,
    '앞 토막을 두 자리에서 이어 붙이고 있다');

  // 모르는 단계는 **앞 토막만** 돌려준다 — 침묵은 이 경고에서 가장 비싼 결과다(15회차).
  for (const bad of ['알 수 없음', '', null, undefined, 0, 4, 42, 'constructor', '__proto__']) {
    assert.equal(soonMessage(bad), `${EUM_SOON_LEAD}.`, `입력: ${String(bad)}`);
  }
  // 문장이 눈금 모듈에 남아 있지 않다(가드가 문구를 따라오지 않던 자리 · 11회차와 같은 모양).
  const countdown = stripComments(read('lib/eumCountdown.js'));
  assert.ok(!countdown.includes('신청해 주세요'), 'lib/eumCountdown 에 문장이 남아 있다');
  assert.equal(/EUM_SOON_MESSAGE/.test(countdown), false, '옛 단일 문장이 되살아났다');
});

// ── 깨졌을 때·기다릴 때 보이는 화면의 문구 ─────────────────────────────────
//
// 고친 결함: 11회차는 제출 실패 다섯 문장을 이 표로 옮기면서 경계 화면 둘은 「회당 2~3건」
// 때문에 남겨 두었고, 그 회차 메모가 그 자리를 그대로 지목했다 — "`error.jsx` 의 본문이 하필
// 「잠시 뒤 **아래** 단추를 눌러 주세요」다 — 이번에 없앤 것과 같은 낱말이다".
// 그 화면은 이제 제목으로 포커스를 옮기므로(app/eum/error.jsx) 단추는 자리가 아니라 **이름**
// 으로 가리켜야 찾을 수 있다. 끝의 마침표도 이 화면군의 본문 규약과 달랐다.
test('경계 화면 문구: 자리를 가리키는 낱말이 없고 문장 끝이 한 가지다', () => {
  const positional = ['아래', '위에', '위의', '왼쪽', '오른쪽', '아래쪽', '위쪽', '맨 끝'];
  const keys = Object.keys(EUM_BOUNDARY_MESSAGE);
  assert.ok(keys.length >= 6, `표가 줄었다: ${keys.length}`);
  for (const [key, msg] of Object.entries(EUM_BOUNDARY_MESSAGE)) {
    assert.ok(typeof msg === 'string' && msg.length > 3, `${key}: 문구가 비었다`);
    for (const word of positional) {
      assert.ok(!msg.includes(word), `${key}: 자리를 가리키는 말이 들어왔다(${word}) — ${msg}`);
    }
    assert.ok(!msg.endsWith('.'), `${key}: 마침표로 끝나는 판본이다 — ${msg}`);
    assert.ok(!/관리자/.test(msg), `${key}: 어르신에게 「관리자」는 누구인지 알 수 없는 사람이다`);
  }
  // 오류 화면의 본문은 **단추 이름**으로 되돌릴 길을 가리킨다. 이름을 문장에 따로 적으면
  // 단추와 안내가 갈라질 수 있으므로 끼워서 짓는다(두 벌 금지).
  assert.ok(EUM_BOUNDARY_MESSAGE.errorBody.includes(EUM_BOUNDARY_MESSAGE.errorRetry),
    '본문이 단추 이름을 가리키지 않는다 — 포커스가 제목에 있을 때 찾을 단서가 없다');
  // 이름은 조작 요소 등록부에서 온다 — 25회차에 흐름 화면의 이름 넷을 같은 표로 올리면서
  // 이 단추도 그 표로 모았다(이름의 집이 둘이면 「단일 출처」가 다시 말뿐이 된다).
  assert.match(MESSAGE_SRC, /errorBody: `[^`]*\$\{EUM_ACTION\.retry\}/, '단추 이름을 손으로 또 적었다');
  assert.equal(EUM_BOUNDARY_MESSAGE.errorRetry, EUM_ACTION.retry, '단추 이름이 두 자리에서 정해진다');
  // 실패가 이어질 때 할 수 있는 일은 담당자에게 말하는 것뿐이다 — 그 한 줄이 사라지면
  // 어르신은 스스로 재발급할 수단이 없는 채 멈춘다(QUALITY_BAR §3).
  assert.match(EUM_BOUNDARY_MESSAGE.errorHint, /담당자/);
});

test('경계 화면 문구: 등록부와 화면이 양방향으로 맞는다(손으로 적은 사본 금지)', () => {
  const used = new Set();
  for (const [name, src] of Object.entries(BOUNDARY)) {
    const code = stripComments(src);
    assert.match(src, /EUM_BOUNDARY_MESSAGE/, `${name}: 문구 단일 출처를 import 하지 않는다`);
    for (const m of code.matchAll(/\bM\.(\w+)/g)) used.add(m[1]);
    // 사본이 되살아나면 같은 문장이 두 벌이 된다(9·11회차와 같은 모양).
    for (const msg of Object.values(EUM_BOUNDARY_MESSAGE)) {
      assert.ok(!code.includes(msg), `${name}: 문구를 손으로 적었다 — ${msg}`);
    }
    // 11회차가 없앤 낱말이 이 화면에서 되살아나면 실패한다.
    assert.equal(/아래 단추/.test(code), false, `${name}: 자리를 가리키는 안내가 되살아났다`);
  }
  // 등록만 하고 안 쓰면 표가 썩고, 없는 이름을 가리키면 그 자리가 **빈 칸**이 된다
  // (undefined → 아무 말도 하지 않는다 · EUM_NOTICE_FOOT 과 같은 계약).
  assert.deepEqual([...used].sort(), Object.keys(EUM_BOUNDARY_MESSAGE).sort(), '표와 화면이 어긋난다');
});

// ── 고친 결함: **조작 요소의 이름**만 문구 단일 출처 밖에 있었다 ─────────────
//
// 이 파일이 지키는 것 (3)은 「화면은 전부 그 자리를 가리킨다」인데, 화면에서 **누르는 것들의
// 이름**은 그 대조 밖에 있었다 — 신청 흐름이 넷을 손으로 적었다. 경계 화면 쪽은 이미 그렇지
// 않았다(`errorRetry` 가 이 표에 있고 본문이 그것을 끼워서 짓는다). 그래서 흐름 화면에서
// 그 규칙이 필요한 문장 하나가 **아무것도 가리키지 못했다** — 만료 임박 경고의 3단계 토막이고,
// 그 자리 대조는 바로 위 테스트가 한다. 여기서는 이름이 **한 벌로 남는지**를 양방향으로 본다.
test('조작 요소 이름: 등록부와 화면이 양방향으로 맞는다(손으로 적은 사본 금지)', () => {
  // 이름을 쓰는 자리는 둘이다 — 흐름 화면(직접)과 경계 화면 문구표(이 파일 안에서 끼워 쓴다).
  const where = {
    'app/eum/senior/[token]/SeniorFlow.jsx': SCREENS['app/eum/senior/[token]/SeniorFlow.jsx'],
    'lib/eumMessage.js': MESSAGE_SRC,
  };
  const used = new Set();
  for (const src of Object.values(where)) {
    for (const m of stripComments(src).matchAll(/\bEUM_ACTION\.(\w+)/g)) used.add(m[1]);
  }
  // 등록만 하고 안 쓰면 표가 썩고, 없는 이름을 가리키면 그 자리가 **빈 칸**이 된다
  // (undefined → 단추에 글자가 없다 · EUM_NOTICE_FOOT 과 같은 계약).
  assert.deepEqual([...used].sort(), Object.keys(EUM_ACTION).sort(), '등록부와 쓰이는 곳이 어긋난다');

  // 사본이 되살아나면 이름이 두 자리에서 정해지고, 그날 가리키는 문장만 옛 이름을 말한다.
  for (const [name, src] of Object.entries({ ...where, ...BOUNDARY, ...SCREENS })) {
    if (name === 'lib/eumMessage.js') continue; // 집
    const code = stripComments(src);
    for (const [key, label] of Object.entries(EUM_ACTION)) {
      assert.ok(!code.includes(label), `${name}: 조작 요소 이름을 손으로 적었다 — ${key}: ${label}`);
    }
  }
  // 이름은 글자뿐이어야 한다(값을 받는 자리가 되면 등록부가 아니게 된다).
  for (const [key, label] of Object.entries(EUM_ACTION)) {
    assert.ok(typeof label === 'string' && label.length >= 2, `${key}: 이름이 비었다`);
    assert.ok(!label.endsWith('.'), `${key}: 단추 이름에 마침표를 붙였다 — ${label}`);
  }
});

// ── 문구를 화면에서 떼어 낼 때 함께 떨어져 나간 검사 ───────────────────────
//
// 10회차는 「귀로 들을 때 사라지는 글자」를 고치고, 화면이 손으로 적는 문구를 전부 긁어
// `muteSeparatorsIn` 으로 대조하게 했다(tests/eumseniorui.test.mjs). 그런데 11회차가 제출 실패
// 다섯 문장을 화면에서 **이 파일로 옮기면서** 그 문장들은 더 이상 그 대조에 걸리지 않게 됐다 —
// 가드가 문구를 따라오지 않은 것이다. 이번에 경계 화면 문구와 접수 문구까지 옮기므로
// 네 표 전부를 여기서 같은 판정으로 본다.
test('모든 문구 표에 낭독되지 않는 경계가 없다', () => {
  const tables = {
    EUM_TOKEN_MESSAGE,
    EUM_SUBMIT_MESSAGE,
    EUM_DONE_MESSAGE,
    // 나눈 두 토막도 **화면에 그려지는 글자**다(진입 패널의 제목·본문) — 이어 쓴 문장만
    // 보면 토막 쪽에 들어온 기호를 이 대조가 놓친다.
    EUM_DONE_SPLIT: { ...EUM_DONE_STATE, next: EUM_DONE_NEXT },
    EUM_BOUNDARY_MESSAGE,
    // 제목·머리말·할 일 한 줄도 **화면에 그려지는 글자**다. 이 표로 옮겨 오면서 화면 쪽
    // 대조(tests/eumseniorui)에서 빠졌으므로 여기서 같은 판정으로 받는다 — 11회차가 겪은
    // "가드가 문구를 따라오지 않은 것" 을 되풀이하지 않게.
    EUM_PANEL_TITLE,
    EUM_PANEL_TEXT: { ask: EUM_PANEL_ASK, askExpired: EUM_PANEL_ASK_EXPIRED, kicker: EUM_KICKER },
    // 이번에 옮겨 온 넷도 같은 판정으로 받는다 — 판정 모듈(eumConsume)·눈금 모듈
    // (eumCountdown)에 있던 동안 이 대조를 비껴가고 있었다(가드가 문구를 따라오지 않은 자리).
    EUM_CONSUME_HINT: { change: EUM_CONSUME_CHANGE_HINT, unknown: EUM_CONSUME_UNKNOWN_HINT },
    EUM_SOON: { lead: EUM_SOON_LEAD, busy: EUM_SOON_BUSY, ...EUM_SOON_NEXT },
    // 단계 표시도 **화면에 그려지는 글자**다 — 하필 낭독 영역에 들어가 단계마다 다시 읽히는
    // 자리이고, 29회차까지 화면이 손으로 적어 이 대조 밖에 있었다(「1단계 / 3단계」의 슬래시가
    // 묵음이라는 사실이 이 과제의 첫 묵음 결함이었는데, 그 문장만 표 밖에 남아 있었다).
    // 등록부가 아니라 함수라 **그려지는 값 전부**를 넣는다.
    EUM_STEP_PROGRESS: Object.fromEntries(
      Array.from({ length: EUM_FLOW_STEPS }, (_, i) => [String(i + 1), stepProgress(i + 1)]),
    ),
    // 조작 요소의 이름도 **화면에 그려지는 글자**다(25회차에 이 표로 옮겨 왔다) — 화면 쪽
    // 대조에서 빠졌으므로 여기서 같은 판정으로 받는다. 끝에 붙은 줄임표(「신청하는 중…」)는
    // 무엇과 무엇을 가르지 않으므로 경계가 아니다(muteSeparatorsIn 의 계약).
    EUM_ACTION,
  };
  const bad = [];
  let seen = 0;
  for (const [table, entries] of Object.entries(tables)) {
    for (const [key, msg] of Object.entries(entries)) {
      seen += 1;
      const marks = muteSeparatorsIn(msg);
      if (marks.length) bad.push(`${table}.${key}: "${msg}" → ${marks.join('')}`);
    }
  }
  assert.ok(seen >= 15, `문구를 찾지 못했다(검사가 비어 통과하면 안 된다): ${seen}건`);
  assert.deepEqual(bad, [], `낭독되지 않는 기호로 문구를 가르고 있다\n${bad.join('\n')}`);
});
