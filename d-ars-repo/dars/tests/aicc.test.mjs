// AICC-Core 채널 어댑터 소비 검증(D-ARS).
//
// 이 테스트가 지키는 한 문장: **D-ARS 는 Core가 시킨 것만, 승인된 경우에만 고객 화면으로 내보낸다.**
// 계약 적합성 자체는 Core 실행기(`npm run conformance:aicc`)가 CI에서 판정하고,
// 여기서는 이 저장소가 책임지는 부분(렌더·활성화·실패 전파)만 본다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import * as m from '../lib/aiccTransport.js';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const has = (p) => existsSync(new URL(`../${p}`, import.meta.url));
const env = { interactionId: 'i1', adapter: 'dars', channel: 'visual', kind: 'present' };

/* ── 배선 ───────────────────────────────────────────────────────────────────── */

test('적합성 검사 입력과 실행 스크립트가 저장소에 있다', () => {
  assert.equal(has('ci/aicc-port.mjs'), true);
  assert.equal(has('ci/aicc-flows.mjs'), true);
  const pkg = JSON.parse(read('package.json'));
  assert.ok(pkg.scripts['conformance:aicc'], '실행기가 없으면 계약 드리프트가 조용히 쌓인다');
  assert.equal(has('scripts/aicc-conformance.mjs'), true, 'Core 위치를 찾지 못하면 판정보류로 끝내는 호출부가 있어야 한다');
  const runner = read('scripts/aicc-conformance.mjs');
  assert.match(runner, /--flows/, '시나리오를 빼면 판정보류다 — 통과로 넘기지 않는다');
  assert.match(runner, /--timeout-ms/);
  assert.match(runner, /exit\(2\)/, '검사를 못 돌린 경우를 통과(0)로 끝내지 않는다');
  assert.equal(pkg.devDependencies['aicc-core'], undefined, 'file: 의존은 Core 없는 체크아웃에서 npm ci 를 통째로 실패시킨다');
});

test('CI 포트는 드라이런이고 시나리오에 개인정보가 없다', () => {
  const port = read('ci/aicc-port.mjs');
  assert.equal(/activation:\s*'live'/.test(port), false, 'CI 포트가 live 면 검사 자체가 발송 사고가 된다');
  assert.equal(/transport:/.test(port), false);
  const flows = read('ci/aicc-flows.mjs');
  assert.equal(/01[016789]-?\d{3,4}-?\d{4}/.test(flows), false);
  assert.equal(/\d{6}-\d{7}/.test(flows), false);
  assert.equal(/[\w.+-]+@[\w-]+\.[\w.]+/.test(flows), false);
});

/* ── 렌더(정상) ─────────────────────────────────────────────────────────────── */

test('말하기·버튼·폼 단계가 각각의 화면 카드로 렌더된다', () => {
  const out = m.renderEnvelope({
    ...env,
    steps: [
      { nodeId: 'n1', kind: 'Say', text: '보이는 ARS 입니다.' },
      { nodeId: 'n2', kind: 'Choice', text: '선택해 주세요.', ui: { type: 'buttons', items: [{ label: '조회', value: 'lookup' }] } },
      { nodeId: 'n3', kind: 'Collect', text: '항목을 입력해 주세요.', ui: { type: 'form', slot: 'purpose' } },
    ],
  });
  assert.deepEqual(out.map((c) => c.kind), ['say', 'choice', 'form']);
  assert.deepEqual(out[1].choices, [{ label: '조회', value: 'lookup' }]);
  assert.equal(out[2].slot, 'purpose');
  assert.equal(out[0].interactionId, 'i1');
});

test('이관·종료는 고객 안내 카드로 바뀐다', () => {
  const t = m.renderEnvelope({ ...env, kind: 'transfer', queue: 'q1' });
  assert.equal(t[0].kind, 'notice');
  assert.equal(t[0].queue, 'q1');
  assert.equal(m.renderEnvelope({ ...env, kind: 'end' })[0].text, m.AICC_SCREEN_KO.end);
});

/* ── 렌더(실패·경계) ────────────────────────────────────────────────────────── */

test('상담사용 요약은 고객 화면에 절대 실리지 않는다(§2·§10.3)', () => {
  const out = m.renderEnvelope({ ...env, kind: 'transfer', queue: 'q1', summaryMasked: '카드 분실 접수, 본인확인 완료' });
  assert.equal(JSON.stringify(out).includes('본인확인'), false);
});

test('빈 입력·silent·빈 텍스트는 빈 카드가 되지 않는다', () => {
  assert.deepEqual(m.renderEnvelope({ ...env, steps: [] }), []);
  assert.deepEqual(m.renderEnvelope({ ...env }), [], 'steps 자체가 없어도 죽지 않는다');
  assert.deepEqual(m.renderEnvelope({ ...env, steps: [null, { silent: true, text: 'x' }, { kind: 'Say', text: '' }] }), []);
  assert.deepEqual(m.renderEnvelope({ kind: 'present', steps: [{ kind: 'Say', text: 'x' }] }), [], 'interactionId 없는 지시는 렌더하지 않는다');
});

test('화면 채널이 못 하는 지시에는 엉뚱한 화면을 띄우지 않는다', () => {
  assert.deepEqual(m.renderEnvelope({ ...env, kind: 'routeToLegacyIvr', reasonKo: 'x' }), []);
  assert.deepEqual(m.renderEnvelope({ ...env, kind: 'invite', target: 'chat' }), []);
});

/* ── 전송기 ─────────────────────────────────────────────────────────────────── */

test('전송 실패는 위로 던진다 — 삼키면 고객은 멈춘 화면을 본다', async () => {
  const t = m.createAiccTransport({ sink: async () => { throw new Error('푸시 거부'); } });
  await assert.rejects(() => t.deliver({ ...env, steps: [{ kind: 'Say', text: '안내' }] }), /푸시 거부/);
});

test('내보낼 카드가 없으면 전송기를 부르지 않는다', async () => {
  let calls = 0;
  const t = m.createAiccTransport({ sink: async () => { calls += 1; } });
  await t.deliver({ ...env, steps: [{ kind: 'Api', text: '', silent: true }] });
  assert.equal(calls, 0);
  await t.deliver({ ...env, steps: [{ kind: 'Say', text: '안내' }] });
  assert.equal(calls, 1);
});

test('전송기 없이 transport 를 만들 수 없다', () => {
  assert.throws(() => m.createAiccTransport({}), /sink/);
  assert.throws(() => m.createAiccTransport(), /sink/);
});

/* ── 활성화: build now, activate on approval ────────────────────────────────── */

test('기본은 dry_run 이고, 플래그만으로는 열리지 않는다', () => {
  assert.equal(m.aiccActivation().activation, 'dry_run');
  const s = m.aiccActivation({ DARS_AICC_LIVE: 'true' });
  assert.equal(s.activation, 'dry_run');
  assert.match(s.reasonKo, /승인 필요/);
  assert.equal(m.aiccActivation({ DARS_AICC_LIVE: 'true', DARS_AICC_APPROVAL_REF: '  ' }).activation, 'dry_run', '공백은 근거가 아니다');
  assert.equal(m.aiccActivation({ DARS_AICC_APPROVAL_REF: 'TICKET-1' }).activation, 'dry_run');
  assert.equal(m.aiccActivation({ DARS_AICC_LIVE: 'true', DARS_AICC_APPROVAL_REF: 'TICKET-1' }).activation, 'live');
});

test('live 인데 전송기가 없으면 dry_run 으로 내리고 이유를 남긴다', () => {
  const o = m.aiccPortOptions({ DARS_AICC_LIVE: 'true', DARS_AICC_APPROVAL_REF: 'TICKET-1' });
  assert.equal(o.activation, 'dry_run');
  assert.match(o.reasonKo, /sink|전송기/);
  assert.equal(o.approvalRef, undefined, 'dry_run 인데 승인 근거를 달면 켜진 것처럼 보인다');
});

test('응답 예산은 설정값일 때만 채운다(§13-3)', () => {
  const sink = async () => {};
  assert.equal(m.aiccPortOptions({}, sink).timeoutMs, undefined);
  assert.equal(m.aiccPortOptions({ DARS_AICC_TIMEOUT_MS: '삼천' }, sink).timeoutMs, undefined);
  assert.equal(m.aiccPortOptions({ DARS_AICC_TIMEOUT_MS: '0' }, sink).timeoutMs, undefined);
  assert.equal(m.aiccPortOptions({ DARS_AICC_TIMEOUT_MS: '3000' }, sink).timeoutMs, 3000);
});

test('승인·전송기가 모두 갖춰지면 live 옵션이 만들어진다', () => {
  const o = m.aiccPortOptions({ DARS_AICC_LIVE: 'true', DARS_AICC_APPROVAL_REF: 'TICKET-1' }, async () => {});
  assert.equal(o.activation, 'live');
  assert.equal(o.approvalRef, 'TICKET-1');
  assert.equal(o.id, 'dars');
  assert.equal(typeof o.transport.deliver, 'function');
});
