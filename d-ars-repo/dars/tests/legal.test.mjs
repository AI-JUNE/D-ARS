// tests/legal.test.mjs — 약관·개인정보처리방침 정본 데이터 계약(128회차)
// 문안 자체는 사람(법무)이 확정한다. 여기서는 **초안 상태가 조용히 정식으로 둔갑하지 않는 것**과
// 화면이 깨지지 않을 최소 형태를 지킨다.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LEGAL_META, TERMS_SECTIONS, PRIVACY_SECTIONS } from '../lib/legalContent.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const all = [...TERMS_SECTIONS, ...PRIVACY_SECTIONS];

test('약관·방침 모두 비어 있지 않다(빈 법적 고지 게시 방지)', () => {
  assert.ok(TERMS_SECTIONS.length >= 5);
  assert.ok(PRIVACY_SECTIONS.length >= 5);
});

test('모든 조항에 제목과 본문이 있다', () => {
  for (const s of all) {
    assert.equal(typeof s.h, 'string');
    assert.equal(typeof s.body, 'string');
    assert.ok(s.h.trim().length > 0);
    assert.ok(s.body.trim().length > 20, `본문이 너무 짧다: ${s.h}`);
  }
});

test('조항 제목이 중복되지 않는다(복사 붙여넣기 사고 방지)', () => {
  const t = TERMS_SECTIONS.map((s) => s.h);
  const p = PRIVACY_SECTIONS.map((s) => s.h);
  assert.equal(new Set(t).size, t.length);
  assert.equal(new Set(p).size, p.length);
});

test('상태는 draft 또는 published 둘 중 하나다', () => {
  assert.ok(['draft', 'published'].includes(LEGAL_META.status));
});

test('초안 상태에서는 [승인 필요] 표시가 본문에 남아 있다', () => {
  if (LEGAL_META.status !== 'draft') return;
  assert.ok(all.some((s) => s.body.includes('[승인 필요]')), '초안인데 승인 필요 표시가 없다');
});

test('시행일은 YYYY-MM-DD 형식이고 실제 날짜다', () => {
  assert.match(LEGAL_META.effectiveDate, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(Number.isFinite(Date.parse(LEGAL_META.effectiveDate)));
});

test('연락처는 형식이 갖춰진 이메일이다', () => {
  assert.match(LEGAL_META.contactEmail, /^[^@\s]+@[^@\s]+\.[^@\s]+$/);
});

test('운영주체·서비스명이 비어 있지 않다', () => {
  assert.ok(LEGAL_META.operator.trim().length > 0);
  assert.ok(LEGAL_META.service.trim().length > 0);
});

test('개인정보처리방침에 법정 필수 항목(수집항목·목적·보유기간·권리·책임자)이 있다', () => {
  const joined = PRIVACY_SECTIONS.map((s) => s.h).join(' ');
  for (const k of ['수집', '목적', '보유', '권리', '책임자']) {
    assert.ok(joined.includes(k), `방침에 '${k}' 관련 조항이 없다`);
  }
});

test('법적 고지에 임의 KPI·성능 수치를 넣지 않는다(§13-3)', () => {
  const body = all.map((s) => s.body).join('\n');
  assert.ok(!/99\.9\s*%/.test(body));
  assert.ok(!/\b\d+\s*ms\b/.test(body));
});

test('약관·방침 화면이 정본 데이터를 쓰고 문안을 따로 품지 않는다', () => {
  for (const rel of ['app/legal/terms/page.jsx', 'app/legal/privacy/page.jsx']) {
    const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    assert.ok(src.includes('legalContent'), `${rel} 가 정본 데이터를 참조하지 않는다`);
  }
});
