// scripts/retention-purge.mjs — 개인정보 보관기간 경과분 파기(익명화) 실행기
//
// ★ 기본은 DRY-RUN(미실행): 대상 건수만 조회해 보고한다.
// ★ 실제 익명화(비가역)는 아래 3가지가 모두 충족될 때만 수행한다. [사람 승인 필요]
//     1) 커맨드 인자에 --commit
//     2) 환경변수 RETENTION_ENABLE=1
//     3) DATABASE_URL 설정
//   이 스크립트는 스케줄러/자동배포에서 --commit 없이 호출해도 안전(조회만).
//
// 사용:
//   node scripts/retention-purge.mjs            # DRY-RUN: 파기 대상 건수만 출력
//   RETENTION_ENABLE=1 node scripts/retention-purge.mjs --commit   # 실제 익명화(운영자 승인)

import { neon } from '@neondatabase/serverless';
import { retentionDays, retentionEnabled, cutoffISO, purgePlan } from '../lib/retention.js';

const commit = process.argv.includes('--commit');
const url = process.env.DATABASE_URL;
const days = retentionDays(process.env);
const cutoff = cutoffISO(new Date(), days);
const plan = purgePlan(cutoff);

console.log(`[retention] 보관기간 ${days}일 · 경계 ${cutoff}`);
console.log(`[retention] 모드: ${commit ? 'COMMIT(실제 익명화)' : 'DRY-RUN(조회만)'}`);

if (!url) {
  console.log('[retention] DATABASE_URL 미설정 → 조회 생략(정책만 확인). 종료.');
  process.exit(0);
}
const sql = neon(url);

let total = 0;
for (const p of plan) {
  let n = 0;
  try {
    const rows = await sql.query(p.count, p.params);
    n = (rows && rows[0] && rows[0].n) || 0;
  } catch (e) {
    console.error(`[retention] ${p.table} 조회 실패: ${e?.message}`);
    continue;
  }
  total += n;
  console.log(`[retention] ${p.table}(${p.label}): 파기 대상 ${n}건`);

  if (commit && n > 0) {
    if (!retentionEnabled(process.env)) {
      console.log(`  → RETENTION_ENABLE=1 아님 → 익명화 건너뜀(안전). [사람 승인 필요]`);
      continue;
    }
    try {
      await sql.query(p.purge, p.params);
      console.log(`  → ${p.table} 전화번호 ${n}건 익명화 완료.`);
    } catch (e) {
      console.error(`  → ${p.table} 익명화 실패: ${e?.message}`);
    }
  }
}

console.log(`[retention] 총 파기 대상 ${total}건.` + (commit ? '' : ' (DRY-RUN — 변경 없음)'));
