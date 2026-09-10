// scripts/audit-check.mjs — 감사로그 영속화 준비도 점검(읽기 전용 · DB 무접속)
//
// 하는 일: AUDIT_DB 플래그와 DATABASE_URL 설정만으로 현재 영속화 모드를 판정하고,
//   "켰는데 남지 않는" 상태(db-blind)를 차단 사유로 보고한다.
// **환경변수 값은 출력하지 않는다. DB 에 접속하지 않고 아무 것도 바꾸지 않는다.**
//   테이블 실제 적용 여부는 이 스크립트가 확인할 수 없다 — 아래 안내 SQL 을 운영자가 직접 돌린다.
// 실행: npm run audit:check
// 종료코드: 차단 사유가 있으면 1, 그 외 0(콘솔 모드는 기본값이므로 실패로 보지 않는다).
import { auditReadiness, auditDepStatus } from '../lib/auditReadiness.js';
import { AUDIT_EVENTS } from '../lib/audit.js';

const hasDB = typeof process.env.DATABASE_URL === 'string' && process.env.DATABASE_URL.trim() !== '';
const r = auditReadiness({ env: process.env, hasDB });

const label = { console: '콘솔 전용(기본)', db: 'DB 영속화', 'db-blind': '켜졌으나 남지 않음' }[r.mode];
console.log(`감사 영속화 모드: ${label}`);
console.log(`  AUDIT_DB: ${r.on ? 'ON' : 'OFF'} · DATABASE_URL: ${hasDB ? '설정됨' : '미설정'}(값 미출력)`);
console.log(`  /api/health deps 표기: audit-persist = ${auditDepStatus(r)}`);
console.log(`  이벤트 어휘 ${AUDIT_EVENTS.length}종: ${AUDIT_EVENTS.join(', ')}`);

for (const b of r.blockers) console.error(`  [차단:${b.code}] ${b.msg}`);
for (const w of r.warnings) console.log(`  [경고:${w.code}] ${w.msg}`);

if (r.on && hasDB) {
  console.log('  ※ 테이블 적용 여부는 이 스크립트가 확인하지 않는다. 운영자가 직접 확인할 것:');
  console.log("     psql \"$DATABASE_URL\" -c \"select to_regclass('public.audit_events');\"");
  console.log('     결과가 NULL 이면 db/audit.sql 을 적용해야 한다(멱등 · 재실행 안전).');
} else if (!r.on) {
  console.log('  ※ 영속화 전환은 db/audit.sql 선적용 + AUDIT_DB=1 이며, 운영 적용은 사람이 한다. [승인 필요]');
}
console.log(`  적재 관측: 이 프로세스에서는 기록이 일어나지 않으므로 항상 0 (실시간 값은 /api/health 참조)`);

process.exit(r.ok ? 0 : 1);
