// tests/sharelink.test.mjs — 조회 조건 공유 링크(lib/shareLink.js) 회귀 테스트
import test from 'node:test';
import assert from 'node:assert/strict';
import shareUrl, { copyText, normalizeOrigin, normalizePath, normalizeQuery } from '../lib/shareLink.js';

test('sharelink: normalizeQuery — 선행 ? 제거 · 공백 트림 · 빈 입력은 빈 문자열', () => {
  assert.equal(normalizeQuery('?q=a&range=7d'), 'q=a&range=7d');
  assert.equal(normalizeQuery('q=a'), 'q=a');
  assert.equal(normalizeQuery('  ?q=a  '), 'q=a');
  assert.equal(normalizeQuery(''), '');
  assert.equal(normalizeQuery(null), '');
  assert.equal(normalizeQuery(undefined), '');
  assert.equal(normalizeQuery(123), '');
});

test('sharelink: normalizeQuery — URLSearchParams/객체도 받는다', () => {
  assert.equal(normalizeQuery(new URLSearchParams({ q: 'a', dir: 'desc' })), 'q=a&dir=desc');
  assert.equal(normalizeQuery({ q: 'a', status: '실패' }), 'q=a&status=%EC%8B%A4%ED%8C%A8');
  assert.equal(normalizeQuery({ q: 'a', empty: null }), 'q=a'); // null 값은 제외
});

test('sharelink: normalizeOrigin — 후행 슬래시 제거 · http(s) 만 허용', () => {
  assert.equal(normalizeOrigin('https://d-ars.vercel.app/'), 'https://d-ars.vercel.app');
  assert.equal(normalizeOrigin('http://localhost:3000'), 'http://localhost:3000');
  assert.equal(normalizeOrigin('null'), '');        // 샌드박스 iframe origin
  assert.equal(normalizeOrigin('file:///C:/x'), ''); // 로컬 파일
  assert.equal(normalizeOrigin(''), '');
  assert.equal(normalizeOrigin(undefined), '');
});

test('sharelink: normalizePath — 선행 슬래시 보정 · 빈 값은 루트', () => {
  assert.equal(normalizePath('/ums'), '/ums');
  assert.equal(normalizePath('ums'), '/ums');
  assert.equal(normalizePath(''), '/');
  assert.equal(normalizePath(null), '/');
});

test('sharelink: shareUrl — origin 이 유효하면 절대 URL', () => {
  assert.equal(
    shareUrl('https://d-ars.vercel.app', '/ums', '?status=%EC%8B%A4%ED%8C%A8&range=7d'),
    'https://d-ars.vercel.app/ums?status=%EC%8B%A4%ED%8C%A8&range=7d',
  );
});

test('sharelink: shareUrl — 조건이 없으면 파라미터 없는 순수 경로(기본 화면 주소와 동일)', () => {
  assert.equal(shareUrl('https://d-ars.vercel.app', '/docs', ''), 'https://d-ars.vercel.app/docs');
  assert.equal(shareUrl('https://d-ars.vercel.app', '/docs', '?'), 'https://d-ars.vercel.app/docs');
});

test('sharelink: shareUrl — origin 이 없거나 이상하면 상대 링크로 폴백(화면 무붕괴)', () => {
  assert.equal(shareUrl('', '/history', 'q=a'), '/history?q=a');
  assert.equal(shareUrl('null', '/history', 'q=a'), '/history?q=a');
  assert.equal(shareUrl(undefined, '/history', ''), '/history');
});

test('sharelink: shareUrl — 정렬·기간·검색이 함께 담긴 실제 조건 링크', () => {
  const q = new URLSearchParams({ range: '7d', q: '반품', sort: 'sent_at', dir: 'desc' });
  assert.equal(
    shareUrl('https://d-ars.vercel.app', '/ums', q),
    'https://d-ars.vercel.app/ums?range=7d&q=%EB%B0%98%ED%92%88&sort=sent_at&dir=desc',
  );
});

test('sharelink: copyText — clipboard API 사용', async () => {
  let got = null;
  const ok = await copyText('https://x/y?q=1', { navigator: { clipboard: { writeText: async (s) => { got = s; } } } });
  assert.equal(ok, true);
  assert.equal(got, 'https://x/y?q=1');
});

test('sharelink: copyText — clipboard 실패 시 execCommand 폴백', async () => {
  const appended = [];
  const doc = {
    body: { appendChild: (el) => appended.push(el), removeChild: () => {} },
    createElement: () => ({ style: {}, setAttribute() {}, select() {}, value: '' }),
    execCommand: () => true,
  };
  const nav = { clipboard: { writeText: async () => { throw new Error('denied'); } } };
  const ok = await copyText('link', { navigator: nav, document: doc });
  assert.equal(ok, true);
  assert.equal(appended.length, 1);
  assert.equal(appended[0].value, 'link');
});

test('sharelink: copyText — 둘 다 불가하면 false(호출부가 prompt 폴백)', async () => {
  assert.equal(await copyText('link', { navigator: null, document: null }), false);
  assert.equal(await copyText('', {}), false); // 빈 문자열은 복사하지 않는다
});

test('sharelink: copyText — execCommand 가 false 를 반환하면 false', async () => {
  const doc = {
    body: { appendChild() {}, removeChild() {} },
    createElement: () => ({ style: {}, setAttribute() {}, select() {}, value: '' }),
    execCommand: () => false,
  };
  assert.equal(await copyText('link', { navigator: null, document: doc }), false);
});
