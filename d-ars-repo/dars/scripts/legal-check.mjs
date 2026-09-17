// scripts/legal-check.mjs — 약관·개인정보처리방침 확정본 준비도 점검(읽기 전용 · 네트워크·DB 무접속)
//
// 하는 일: 정본 데이터(lib/legalContent.js)만 읽어 "지금 게시해도 되는가"를 판정한다.
//   문안을 만들거나 고치지 않는다. 환경변수 **값은 출력하지 않는다**(설정 여부만).
// 실행: npm run legal:check
// 종료코드: 게시본(status='published')인데 차단 사유가 있으면 1. 초안은 0 —
//   빈 칸은 아직 사람의 차례이지 CI 의 실패가 아니다(다만 무엇이 남았는지 매번 출력한다).
import { LEGAL_META, TERMS_SECTIONS, PRIVACY_SECTIONS, SUBPROCESSORS } from '../lib/legalContent.js';
import { legalReadiness, pendingSummary, REQUIRED_META } from '../lib/legalReadiness.js';

const r = legalReadiness({
  meta: LEGAL_META,
  terms: TERMS_SECTIONS,
  privacy: PRIVACY_SECTIONS,
  subprocessors: SUBPROCESSORS,
  env: process.env,
});

console.log(`법적 고지 상태: ${r.published ? '게시본(published)' : '초안(draft)'}`);
console.log(`  조항 수: 약관 ${TERMS_SECTIONS.length} · 방침 ${PRIVACY_SECTIONS.length} · 수탁자 공개 ${SUBPROCESSORS.length}건`);
console.log(`  확정 항목 ${r.filled.length}/${Object.keys(REQUIRED_META).length} — ${pendingSummary(r)}`);

for (const b of r.blockers) console.error(`  [차단:${b.code}] ${b.msg}`);
for (const w of r.warnings) console.log(`  [경고:${w.code}] ${w.msg}`);

if (!r.published) {
  console.log('  ※ 문안 확정·법무 검토는 자동화가 하지 않는다. 채울 항목과 절차는 docs/LEGAL_READINESS.md. [승인 필요]');
  console.log("  ※ 위 차단 사유가 모두 해소된 뒤에만 LEGAL_META.status 를 'published' 로 바꾼다.");
}

process.exit(r.ok ? 0 : 1);
