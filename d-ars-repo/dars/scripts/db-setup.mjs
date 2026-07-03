// DB 초기화: schema.sql + seed.sql 실행 (DATABASE_URL 필요)
import { readFileSync } from 'node:fs';
import { neon } from '@neondatabase/serverless';

const url = process.env.DATABASE_URL;
if (!url) { console.error('DATABASE_URL 이 필요합니다.'); process.exit(1); }
const sql = neon(url);
const run = async (file) => {
  const text = readFileSync(new URL('../db/' + file, import.meta.url), 'utf8');
  for (const stmt of text.split(/;\s*\n/).map(s => s.trim()).filter(Boolean)) {
    await sql.query(stmt);
  }
  console.log('applied', file);
};
await run('schema.sql');
await run('seed.sql');
console.log('DB setup 완료');
