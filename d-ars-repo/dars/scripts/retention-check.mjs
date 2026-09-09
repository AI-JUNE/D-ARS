// scripts/retention-check.mjs — 개인정보 보관·파기 정책 점검(읽기 전용)
//
// 하는 일: db/*.sql 을 읽어 (1) 개인정보로 보이는 컬럼을 모두 찾아내고, (2) 그중 파기 대상도
//   면제 판단도 없는 컬럼이 있으면 문제로 보고한다. (3) 현재 환경의 보관기간·파기 스위치 상태를
//   출력한다.
// **DB 에 접속하지 않고, 아무 것도 바꾸지 않는다.** 실제 파기는 scripts/retention-purge.mjs 를
//   운영자가 --commit 으로 실행할 때만 일어난다. [승인 필요]
// 실행: npm run retention:check
// 종료코드: 미보호 개인정보 컬럼·깨진 파기 대상이 있으면 1(=고쳐야 하는 코드 문제), 그 외 0.
//   RETENTION_ENABLE 이 꺼져 있는 것은 기본값이므로 실패로 보지 않는다(안내만).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scanSchemas } from '../lib/retentionScan.js';
import { retentionDays, retentionEnabled, cutoffISO, DEFAULT_RETENTION_DAYS } from '../lib/retention.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const dbDir = path.join(root, 'db');
const texts = fs.readdirSync(dbDir).filter((f) => f.endsWith('.sql'))
  .map((f) => fs.readFileSync(path.join(dbDir, f), 'utf8'));

const r = scanSchemas(texts);

console.log(`개인정보 후보 컬럼 ${r.candidates.length}개 (컬럼명 기준 탐지)`);
for (const c of r.candidates) {
  const k = `${c.table}.${c.column}`;
  const ex = r.exempt.find((e) => e.table === c.table && e.column === c.column);
  const state = r.protected.includes(k) ? '파기' : ex ? '면제' : '미판단';
  console.log(`  [${state}] ${k} — ${c.kind}${ex ? ` · ${ex.reason}` : ''}`);
}

const days = retentionDays(process.env);
const enabled = retentionEnabled(process.env);
console.log(`보관기간 ${days}일${days === DEFAULT_RETENTION_DAYS ? '(기본값)' : ''} · 경계 ${cutoffISO(new Date(), days)}`);
console.log(`파기 스위치 RETENTION_ENABLE: ${enabled ? 'ON' : 'OFF(기본 — 파기 미수행)'}`);
if (!enabled) console.log('  ※ 실제 파기는 운영자 승인 후 RETENTION_ENABLE=1 + --commit 으로만 수행된다. [승인 필요]');

for (const b of r.blockers) console.error(`  [문제:${b.code}] ${b.msg}`);
for (const w of r.warnings) console.log(`  [경고:${w.code}] ${w.msg}`);
if (r.ok && !r.warnings.length) console.log('정책 정합성: 이상 없음');

process.exit(r.ok ? 0 : 1);
