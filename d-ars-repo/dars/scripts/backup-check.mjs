// scripts/backup-check.mjs — 백업·복구 준비도 점검(읽기 전용 · 126회차)
//
// 하는 일: (1) db/*.sql 선언과 RUNBOOK 복구 확인 대상 목록의 어긋남, (2) 복구 리허설 기록의 상태를
//   출력한다. **DB 에 접속하지 않고, 아무 것도 바꾸지 않는다.** 실제 복구·리허설은 사람이 한다.
// 실행: npm run backup:check
// 종료코드: 커버리지 어긋남이 있으면 1(=고쳐야 하는 코드 문제), 리허설 미실시/만료는 경고만 하고 0.
//   (리허설은 사람이 수행할 일이라 CI 를 빨갛게 만들지 않는다.)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { tablesInSql, uncoveredTables, staleCoverage, COVERED_TABLES, rehearsalStatus, REHEARSAL_STEPS } from '../lib/backupCheck.js';

// fileURLToPath: 경로에 공백·한글이 있으면 URL.pathname 은 %20 인코딩된 문자열이라 fs 가 못 연다.
const root = fileURLToPath(new URL('..', import.meta.url));
const dbDir = path.join(root, 'db');
const sql = fs.readdirSync(dbDir).filter((f) => f.endsWith('.sql'))
  .map((f) => fs.readFileSync(path.join(dbDir, f), 'utf8')).join('\n');

const declared = tablesInSql(sql);
const missing = uncoveredTables(declared);
const ghost = staleCoverage(declared);

console.log('선언된 표:', declared.join(', '));
console.log('복구 확인 대상:', COVERED_TABLES.join(', '));
if (missing.length) console.error('  [문제] 복구 검증에서 빠진 표:', missing.join(', '), '→ lib/backupCheck.COVERED_TABLES 와 RUNBOOK.md 갱신');
if (ghost.length) console.error('  [문제] 스키마에 없는 유령 항목:', ghost.join(', '));
if (!missing.length && !ghost.length) console.log('  커버리지 일치');

let records = [];
try {
  records = JSON.parse(fs.readFileSync(path.join(root, 'docs', 'restore-rehearsal.json'), 'utf8')).rehearsals || [];
} catch (e) {
  console.error('  [경고] 리허설 기록 파일을 읽지 못했다:', e && e.message);
}
const st = rehearsalStatus(records, Date.now());
const label = { none: '미실시', incomplete: '단계 누락', stale: '기간 만료', ok: '유효' }[st.state];
console.log(`복구 리허설: ${label}${st.ageDays === null ? '' : ` (${st.ageDays}일 전)`}`);
if (st.missing.length) console.log('  남은 단계:', st.missing.join(', '), `(전체 ${REHEARSAL_STEPS.length}단계 — RUNBOOK.md 5장)`);
if (st.state !== 'ok') console.log('  ※ 리허설은 실제 복구 수행이 필요하다 — 사람이 수행 후 docs/restore-rehearsal.json 에 기록 [승인 필요]');

process.exit(missing.length || ghost.length ? 1 : 0);
