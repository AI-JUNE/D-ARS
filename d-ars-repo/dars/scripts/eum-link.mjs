// scripts/eum-link.mjs — 「이음 어르신 신청」 1회용 링크 발급(사람이 직접 돌리는 도구)
//
// 하는 일: sid 하나로 5분 링크 한 줄을 만들어 **표준출력에 한 번** 찍는다.
// 파일을 쓰지 않고, 네트워크·DB 에 접속하지 않고, 아무 설정도 바꾸지 않는다.
//
// 실행: npm run eum:link -- --sid=s-1001
//       npm run eum:link -- --sid=s-1001 --base=http://localhost:3000
//       npm run eum:link -- --sid=s-1001 --minutes=5
//
// 왜 CLI 인가: 발급은 그 자체가 **인증 수단을 찍어 내는 일**이다. 라이브는 AUTH_ENFORCE 가
// 꺼져 있어 관리 API 로 열면 누구나 임의 sid 로 링크를 만들 수 있다 — 판정을 켜기 전에 문을
// 내는 셈이라 발급 라우트는 실인증 전환과 함께 [승인 필요] 로 남겼다(lib/eumLink.js 참조).
//
// 출력 규칙
//   - 환경변수 **값을 출력하지 않는다**. 어느 출처로 서명했는지(이름/등급)만 말한다.
//   - 링크는 마지막 한 줄에만 온전히 찍는다. 그 외의 모든 문장에서는 토큰을 가린다(maskLink).
//   - 링크가 **시험용인지 실물인지**를 함께 말한다 — 데모 비밀값으로 서명된 링크는 위조 가능하다.
//
// 종료코드: 발급 실패면 1.
import { issueEumLink, linkReason, maskLink, EUM_LINK_DEFAULT_BASE } from '../lib/eumLink.js';
import { TOKEN_SPECS, effectiveSecret } from '../lib/tokenAudit.js';

function arg(name) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit === undefined ? undefined : hit.slice(name.length + 3);
}

const sid = arg('sid');
if (!sid) {
  console.error('사용법: npm run eum:link -- --sid=<이음 어르신 식별자> [--base=<주소>] [--minutes=<수명>]');
  process.exit(1);
}

// 서명 비밀의 **출처만** 받아 온다(값·길이는 받지도 출력하지도 않는다).
const spec = TOKEN_SPECS.find((s) => s.name === 'eum-link');
const secret = spec ? effectiveSecret(spec, process.env) : { source: 'none' };

const r = await issueEumLink({
  sid,
  base: arg('base') || EUM_LINK_DEFAULT_BASE,
  minutes: arg('minutes'),
  secretSource: secret.source,
});

if (!r.ok) {
  console.error(`발급하지 않았습니다 — ${linkReason(r.reason)}`);
  process.exit(1);
}

const iso = (ms) => new Date(ms).toISOString();
console.log('이음 어르신 신청 1회용 링크');
console.log(`  sid ${r.sid} · 주소 ${maskLink(r.link)}`);
console.log(`  수명 ${Math.round(r.ttlMs / 60000)}분${r.ttlDefaulted ? '(요건 기본값)' : '(지정)'}`);
console.log(`  발급 ${iso(r.issuedAt)} → 만료 ${iso(r.expiresAt)}`);
console.log(`  서명 비밀 출처 ${secret.source} (값 미출력)`);
for (const a of r.advisories) console.log(`  [알림:${a.code}] ${a.msg}`);
console.log('아래 한 줄만 당사자에게 보내 주세요:');
console.log(r.link);

process.exit(0);
