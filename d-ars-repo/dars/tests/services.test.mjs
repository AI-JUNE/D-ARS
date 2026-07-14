import test from 'node:test';
import assert from 'node:assert/strict';
import {
  aggregateServiceRows,
  foldServiceGroups,
  readServices,
  servicesTotal,
  LAUNCH_NODE,
  SMS_CHANNEL,
} from '../lib/services.js';

const mm = (o) => ({ service: 'A', channel: '화면 표출', node: 'SHOW_CARD', result: '완료', ...o });

test('aggregateServiceRows: 서비스별 건수·런칭·이탈·완료 집계', () => {
  const rows = [
    mm({ service: 'A', node: LAUNCH_NODE }),
    mm({ service: 'A', result: '이탈' }),
    mm({ service: 'A', result: '완료' }),
    mm({ service: 'B', result: '상담원 전환' }),
  ];
  const out = aggregateServiceRows(rows, []);
  const a = out.find((r) => r.name === 'A');
  const b = out.find((r) => r.name === 'B');
  assert.equal(a.sent, 3);
  assert.equal(a.launch, 1);
  assert.equal(a.drop, 1);
  assert.equal(a.done, 2); // 런칭 행도 result='완료'
  assert.equal(b.sent, 1);
  assert.equal(b.done, 0);
  assert.equal(b.drop, 0);
});

test('aggregateServiceRows: 문자발송은 UMS 실발송(발송완료)이 있으면 실측치 우선', () => {
  const rows = [mm({ service: 'A', channel: SMS_CHANNEL }), mm({ service: 'A' })];
  const noUms = aggregateServiceRows(rows, []);
  assert.equal(noUms[0].sms, 1); // 폴백: 멀티모달 채널 로그

  const ums = [
    { service: 'A', status: '발송완료' },
    { service: 'A', status: '발송완료' },
    { service: 'A', status: '실패' },
    { service: 'A', status: '대기' },
  ];
  const withUms = aggregateServiceRows(rows, ums);
  assert.equal(withUms[0].sms, 2); // 발송완료만 계수, 채널 폴백 대체
});

test('aggregateServiceRows: 건수 내림차순 정렬 · 동수는 이름 오름차순', () => {
  const rows = [mm({ service: '나' }), mm({ service: '가' }), mm({ service: '다' }), mm({ service: '다' })];
  const out = aggregateServiceRows(rows, []);
  assert.deepEqual(out.map((r) => r.name), ['다', '가', '나']);
});

test('aggregateServiceRows: 서비스명 없으면 "기타" 버킷 · 비배열 입력 방어', () => {
  const out = aggregateServiceRows([mm({ service: null }), mm({ service: '' })], null);
  assert.equal(out.length, 1);
  assert.equal(out[0].name, '기타');
  assert.equal(out[0].sent, 2);
  assert.deepEqual(aggregateServiceRows(undefined, undefined), []);
});

test('foldServiceGroups: DB group-by 행 병합(dropped→drop)', () => {
  const out = foldServiceGroups(
    [{ service: 'A', sent: 10, launch: 4, sms: 3, dropped: 2, done: 7 }],
    [{ service: 'A', sms: 5 }]
  );
  assert.deepEqual(out, [{ name: 'A', sent: 10, launch: 4, sms: 5, drop: 2, done: 7 }]);
});

test('foldServiceGroups: UMS 만 있는 서비스도 행으로 노출(발송 0)', () => {
  const out = foldServiceGroups([{ service: 'A', sent: 2, done: 1 }], [{ service: 'Z', sms: 9 }]);
  const z = out.find((r) => r.name === 'Z');
  assert.equal(z.sent, 0);
  assert.equal(z.sms, 9);
});

test('foldServiceGroups: 숫자 문자열·음수·null 방어', () => {
  const out = foldServiceGroups([{ service: 'A', sent: '12', launch: -3, done: null, dropped: '2' }], []);
  assert.deepEqual(out, [{ name: 'A', sent: 12, launch: 0, sms: 0, drop: 2, done: 0 }]);
});

test('foldServiceGroups: UMS 그룹 없으면 멀티모달 채널 sms 사용', () => {
  const out = foldServiceGroups([{ service: 'A', sent: 5, sms: 4 }], null);
  assert.equal(out[0].sms, 4);
});

test('readServices: 응답 정규화(비배열·결측 필드·이름 없음 제거)', () => {
  assert.deepEqual(readServices(null), []);
  assert.deepEqual(readServices({ a: 1 }), []);
  const out = readServices([{ name: 'A', sent: '5' }, { sent: 3 }, null]);
  assert.deepEqual(out, [{ name: 'A', sent: 5, launch: 0, sms: 0, drop: 0, done: 0 }]);
});

test('servicesTotal: 합계 계산 · 빈 입력 0', () => {
  assert.deepEqual(servicesTotal([]), { sent: 0, launch: 0, sms: 0, drop: 0, done: 0 });
  const t = servicesTotal([
    { sent: 3, launch: 1, sms: 2, drop: 1, done: 2 },
    { sent: 4, launch: 2, sms: 0, drop: 0, done: 4 },
  ]);
  assert.deepEqual(t, { sent: 7, launch: 3, sms: 2, drop: 1, done: 6 });
});

test('집계 불변식: done+drop <= sent (동일 로그 소스)', () => {
  const rows = [
    mm({ service: 'A', result: '완료' }),
    mm({ service: 'A', result: '이탈' }),
    mm({ service: 'A', result: '상담원 전환' }),
  ];
  const [a] = aggregateServiceRows(rows, []);
  assert.ok(a.done + a.drop <= a.sent);
  assert.equal(a.sent, 3);
});
