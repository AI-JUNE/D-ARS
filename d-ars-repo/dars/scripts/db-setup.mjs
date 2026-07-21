// DB 초기화: schema.sql + seed.sql 실행 (DATABASE_URL 필요)
// 실행: (해당 폴더에서) DATABASE_URL=... npm run db:setup
import { readFileSync } from 'node:fs';
import { neon } from '@neondatabase/serverless';

const url = process.env.DATABASE_URL;
if (!url) { console.error('DATABASE_URL 이 필요합니다.'); process.exit(1); }
const sql = neon(url);

// @neondatabase/serverless(0.10.x)의 neon()은 태그드 템플릿 전용(sql.query 없음).
// 원시 SQL 문자열을 태그드 템플릿 형태(strings 배열 + .raw)로 감싸 실행한다.
const raw = (s) => { const a = [s]; a.raw = [s]; return a; };

const run = async (file) => {
  const text = readFileSync(new URL('../db/' + file, import.meta.url), 'utf8');
  const stmts = text.split(/;\s*\n/).map((s) => s.trim()).filter(Boolean);
  for (const stmt of stmts) {
    try {
      await sql(raw(stmt));
    } catch (e) {
      console.error('실패한 문장:\n', stmt.slice(0, 120));
      throw e;
    }
  }
  console.log('applied', file, `(${stmts.length} statements)`);
};

await run('schema.sql');
await run('seed.sql');
console.log('DB setup 완료');
