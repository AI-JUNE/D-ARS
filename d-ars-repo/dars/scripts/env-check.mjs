// scripts/env-check.mjs — 환경(데모·스테이징·운영) 구성 점검(읽기 전용)
//
// 하는 일: (1) 소스가 실제로 읽는 환경변수와 등록부(lib/envMatrix.ENV_VARS)의 어긋남,
//   (2) 지정한 프로필 기준으로 현재 환경의 구성 상태를 보고한다.
// **환경변수 값은 출력하지 않는다** — 이름과 상태(set/unset/mismatch)만 다룬다.
// **아무 것도 바꾸지 않는다.** 게이트 변수(실인증·실발신·실과금)를 켜지 않는다. [승인 필요]
//
// 실행: npm run env:check                 (VERCEL_ENV 로 프로필 자동 판별)
//       npm run env:check -- --profile=production
// 종료코드: 등록부 어긋남이 있으면 1(=고쳐야 하는 코드 문제).
//   구성 미비(운영 값 미주입)는 사람이 승인 후 넣을 일이라 CI 를 빨갛게 만들지 않는다(보고만).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ENV_VARS, PROFILES, profileOf, evaluateEnv, unregisteredEnvNames, unusedEnvNames } from '../lib/envMatrix.js';

const root = fileURLToPath(new URL('..', import.meta.url));

// 소스 수집(코드가 읽는 변수 파악용). node_modules·.next 는 제외.
const SKIP = new Set(['node_modules', '.next', '.git', 'public']);
const EXT = /\.(js|jsx|mjs)$/;
function collect(dir, out = []) {
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    if (SKIP.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) collect(p, out);
    else if (EXT.test(e.name)) out.push(fs.readFileSync(p, 'utf8'));
  }
  return out;
}
const sources = [
  ...collect(path.join(root, 'app')),
  ...collect(path.join(root, 'lib')),
  ...collect(path.join(root, 'scripts')),
  fs.readFileSync(path.join(root, 'middleware.js'), 'utf8'),
];

const missing = unregisteredEnvNames(sources);
const ghost = unusedEnvNames(sources);
console.log(`등록부 ${ENV_VARS.length}개 변수`);
if (missing.length) console.error('  [문제] 코드는 읽는데 등록부에 없는 변수:', missing.join(', '), '→ lib/envMatrix.ENV_VARS 와 docs/STAGING_OPERATIONS.md 갱신');
if (ghost.length) console.error('  [문제] 등록부에만 있는 유령 변수:', ghost.join(', '));
if (!missing.length && !ghost.length) console.log('  등록부 일치');

const argProfile = (process.argv.find((a) => a.startsWith('--profile=')) || '').split('=')[1];
const profile = PROFILES.includes(argProfile) ? argProfile : profileOf(process.env);
const r = evaluateEnv(process.env, profile);
console.log(`판정 프로필: ${profile}${argProfile ? '(지정)' : `(VERCEL_ENV 추정: ${process.env.VERCEL_ENV || '없음'})`}`);
for (const row of r.rows) {
  const mark = { ok: ' ', missing: '!', unexpected: '?', mismatch: '!' }[row.state];
  console.log(`  [${mark}] ${row.name} — 기대 ${row.expect} · 현재 ${row.set ? '설정됨' : '미설정'}${row.secret ? '(비밀값 · 내용 미출력)' : ''}`);
}
if (r.gatesOn.length) console.log('  게이트 ON:', r.gatesOn.join(', '), '— 실동작 변수다. 승인 근거를 확인할 것');
for (const b of r.blockers) console.error(`  [차단:${b.code}] ${b.msg}`);
for (const w of r.warnings) console.log(`  [경고:${w.code}] ${w.msg}`);
if (r.ok) console.log(`구성 판정: ${profile} 기준 차단 사유 없음`);
else console.log(`구성 판정: ${profile} 기준 차단 ${r.blockers.length}건 — 값 주입은 사람이 한다. [승인 필요]`);

process.exit(missing.length || ghost.length ? 1 : 0);
