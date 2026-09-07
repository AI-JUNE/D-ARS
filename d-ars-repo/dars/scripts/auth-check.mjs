// scripts/auth-check.mjs — AUTH_ENFORCE 실인증 전환 준비도 점검 (읽기 전용)
//
// 하는 일: 현재 환경변수만 보고 "지금 AUTH_ENFORCE=1 을 켜도 되는가"를 판정해 출력한다.
//   **아무 것도 켜지 않고, 아무 것도 저장하지 않으며, 비밀값을 출력하지 않는다.**
//   실제 전환은 사람이 한다(docs/AUTH_ROLLOUT.md 4장) [승인 필요].
// 실행: npm run auth:check
// 종료코드: blocker 가 있으면 1, warning 만 있으면 0.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkAuthEnv, matrixFromDoc, matrixDrift } from '../lib/authReadiness.js';
import { routeRoleMatrix } from '../lib/auth.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const r = checkAuthEnv(process.env);

console.log(`AUTH_ENFORCE: ${r.enforced ? '1 (강제)' : '미설정 (데모 통과)'}`);
console.log(`계정: ${r.accounts.length ? r.accounts.map((a) => `${a.account}(${a.role})`).join(', ') : '없음 — 데모 계정 사용 중'}`);

for (const b of r.blockers) console.error(`  [차단] ${b.msg}${b.account ? ` — 계정 ${b.account}` : ''}`);
for (const w of r.warnings) console.log(`  [주의] ${w.msg}${w.account ? ` — 계정 ${w.account}` : ''}`);
if (!r.blockers.length) console.log('  차단 사유 없음 — 전환 준비 완료 (켜는 것은 사람의 승인 사항)');

// 문서 표 <-> 코드 매핑 대조(문서가 썩으면 잘못된 권한이 발급된다)
try {
  const doc = fs.readFileSync(path.join(root, 'docs', 'AUTH_ROLLOUT.md'), 'utf8');
  const d = matrixDrift(routeRoleMatrix(), matrixFromDoc(doc));
  if (d.ok) console.log('역할 매핑 문서: 코드와 일치');
  else {
    if (d.missingInDoc.length) console.error('  [문제] 문서에 빠진 경로:', d.missingInDoc.join(', '));
    if (d.ghostInDoc.length) console.error('  [문제] 코드에 없는 유령 경로:', d.ghostInDoc.join(', '));
    for (const m of d.mismatched) console.error(`  [문제] 역할 불일치 ${m.path}: 코드 ${m.code} / 문서 ${m.doc}`);
  }
} catch (e) {
  console.error('  [경고] docs/AUTH_ROLLOUT.md 를 읽지 못했다:', e && e.message);
}

process.exit(r.blockers.length ? 1 : 0);
