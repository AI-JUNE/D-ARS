// scripts/token-check.mjs — 발급 토큰 보안 요건 점검(읽기 전용 · DB 무접속)
//
// 하는 일: 세션·링크 토큰 3종의 만료·1회용·서명 비밀값 강도를 판정한다.
// **비밀값은 물론 그 길이·일부 문자도 출력하지 않는다** — 등급(ok/weak/demo/missing)만 보고한다.
// 아무 것도 바꾸지 않고, 토큰을 발급하지도 않는다.
// 실행: npm run token:check            (VERCEL_ENV 로 프로필 추정)
//       npm run token:check -- --profile=production
// 종료코드: 차단 사유가 있으면 1. 데모·스테이징에서는 약한 비밀값을 경고로만 본다.
import { auditTokens, TOKEN_SPECS, MIN_SECRET_LENGTH } from '../lib/tokenAudit.js';
import { PROFILES, profileOf } from '../lib/envMatrix.js';

const arg = (process.argv.find((a) => a.startsWith('--profile=')) || '').split('=')[1];
const profile = PROFILES.includes(arg) ? arg : profileOf(process.env);
const r = auditTokens(process.env, profile);

console.log(`판정 프로필: ${profile}${arg ? '(지정)' : '(VERCEL_ENV 추정)'}`);
console.log(`서명 비밀 권장 기준: ${MIN_SECRET_LENGTH}자 이상 · 반복 패턴 아님 (값·길이 미출력)`);
for (const spec of TOKEN_SPECS) {
  const row = r.rows.find((x) => x.name === spec.name);
  const ttlMin = Math.round(spec.ttlMs / 60000);
  const oneTime = spec.oneTimeRequired ? (spec.oneTimeImplemented ? '1회용' : '1회용 요건·미구현') : '재사용(설계상 정상)';
  console.log(`  ${spec.name} — ${spec.label}`);
  console.log(`    수명 ${ttlMin}분 · 전달 ${spec.transport} · ${oneTime}`);
  console.log(`    서명 비밀 출처 ${row.secretSource} · 강도 ${row.strength}`);
}
for (const b of r.blockers) console.error(`  [차단:${b.code}] ${b.msg}`);
for (const w of r.warnings) console.log(`  [경고:${w.code}] ${w.msg}`);
console.log(r.ok ? `토큰 판정: ${profile} 기준 차단 사유 없음` : `토큰 판정: ${profile} 기준 차단 ${r.blockers.length}건 — 실비밀값 주입은 사람이 한다. [승인 필요]`);

process.exit(r.ok ? 0 : 1);
