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
import { EUM_TOKEN_MESSAGE, tokenMessage } from '../lib/eumMessage.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(resolve(root, rel), 'utf8');

const MESSAGE_SRC = read('lib/eumMessage.js');
const TOKEN_SRC = read('lib/eumToken.js');
const CONSUME_SRC = read('lib/eumConsume.js');

// 「링크 상태」를 말하는 화면 전부. 이 넷 중 하나라도 표를 가리키지 않으면 그 화면만 갈라진다.
const SCREENS = {
  'app/eum/page.jsx': read('app/eum/page.jsx'),
  'app/eum/senior/page.jsx': read('app/eum/senior/page.jsx'),
  'app/eum/senior/[token]/page.jsx': read('app/eum/senior/[token]/page.jsx'),
  'app/eum/senior/[token]/SeniorFlow.jsx': read('app/eum/senior/[token]/SeniorFlow.jsx'),
};

// 금지 사본 검사는 **주석을 걷어낸 코드**에만 적용한다 — 왜 그런지를 적은 주석까지 막으면
// 다음 사람이 이유를 모른 채 되돌리는 쪽이 더 위험하다(tests/eumseniorui.test.mjs 와 같은 계약).
function stripComments(src) {
  return String(src)
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n')
    .map((line) => line.replace(/(^|[^:\w])\/\/.*$/, '$1'))
    .join('\n');
}

test('사유별로 무엇이 잘못됐는지 다르게 말한다(만료 vs 잘못된 링크)', () => {
  assert.equal(tokenMessage('expired'), '링크가 만료되었습니다. 담당자에게 다시 요청해 주세요');
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
    assert.match(src, /tokenMessage\(/, `${name}: 문구를 표에서 가져오지 않는다`);
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

test('소진 안내는 같은 문장을 다시 적지 않고 표를 가리킨다', () => {
  assert.match(CONSUME_SRC, /from '\.\/eumMessage\.js'/, 'lib/eumConsume 이 문구 표를 쓰지 않는다');
  assert.match(CONSUME_SRC, /expired:\s*EUM_TOKEN_MESSAGE\.expired/);
  assert.match(CONSUME_SRC, /unusable:\s*EUM_TOKEN_MESSAGE\.malformed/);
});
