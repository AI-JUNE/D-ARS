// lib/notify.js — 알림 자동 도출(순수 로직, 무의존성 · 회귀 테스트 가능)
// 운영 지표(서류 완료율·UMS 실패/대기·장기 세션·이탈률)에서 규칙 기반 알림을 생성한다.
// 라우트(app/api/notifications)는 DB 로드 후 이 함수만 호출 → 네트워크/DB 비의존, 로직 회귀 테스트 용이.
// 개인정보(전화번호 등)는 알림 본문에 포함하지 않는다(세션ID·서류명·통계 수치만 노출).
import { pct, fmtDur } from './ui.js';
import { normalizeThresholds } from './notifyRules.js';

// 심각도 우선순위(bad > warn > info > ok)
const RANK = { bad: 0, warn: 1, info: 2, ok: 3 };

// data: { docs, ums, sessions, daily } — 이미 폴백까지 반영된 배열들
// now: 알림 타임스탬프(테스트 결정성을 위해 주입 가능, 기본 Date.now())
// thr: 임계값(lib/notifyRules) — 미지정·잘못된 값은 기본값으로 정규화되므로 **기존 동작과 동일**(하위호환).
export function deriveNotifications(data = {}, now = Date.now(), thr = undefined) {
  const T = normalizeThresholds(thr);
  const docs = Array.isArray(data.docs) ? data.docs : [];
  const ums = Array.isArray(data.ums) ? data.ums : [];
  const sessions = Array.isArray(data.sessions) ? data.sessions : [];
  const daily = Array.isArray(data.daily) ? data.daily : [];

  const notes = [];
  const push = (level, cat, icon, title, body, href) =>
    notes.push({ id: `${cat}-${notes.length}`, level, cat, icon, title, body, href, ts: now });

  // 1) 서류 완료율 저조 (운영 중 · 요청 docMinReq 건 이상 · 완료율 docPct% 미만)
  docs.filter(d => d.in_use).forEach(d => {
    const p = pct(d.done, d.req);
    if (d.req >= T.docMinReq && p < T.docPct) push('warn', '서류', '📋', `${d.name} 완료율 ${p}%`,
      `요청 ${d.req}건 대비 완료 ${d.done}건. 안내 문구·발송 흐름 점검이 필요합니다.`, '/docs');
  });

  // 2) UMS 발송 실패/대기 집계 (실패 umsFailBad 건 이상 = 긴급 · 대기 umsWait 건 이상 = 정보)
  const fail = ums.filter(x => x.status === '실패').length;
  const wait = ums.filter(x => x.status === '대기').length;
  if (fail > 0) push(fail >= T.umsFailBad ? 'bad' : 'warn', 'UMS', '✉️', `UMS 발송 실패 ${fail}건`,
    `최근 발송 100건 중 실패 ${fail}건. 수신 거부·번호 오류 여부를 확인하세요.`, '/ums');
  if (wait >= T.umsWait) push('info', 'UMS', '✉️', `UMS 발송 대기 ${wait}건`,
    `대기 상태 발송 건이 누적되었습니다. 발송 큐 상태를 확인하세요.`, '/ums');

  // 3) 장기 진행 세션(경과 sessionSec 초 이상)
  sessions.filter(s => s.elapsed >= T.sessionSec).forEach(s => push('warn', '세션', '📡', `장기 진행 세션 ${s.id}`,
    `${s.scenario} · 경과 ${fmtDur(s.elapsed)}. 상담원 전환 필요 여부를 확인하세요.`, '/sessions'));

  // 4) 이탈률 상승(최근일 이탈/인입 비율 dropPct% 이상)
  const last = daily[daily.length - 1];
  if (last) {
    const dropRate = pct(last.dropped, last.inbound);
    if (dropRate >= T.dropPct) push('warn', '통계', '📈', `이탈률 ${dropRate}%`,
      `${last.day} 인입 ${last.inbound.toLocaleString()}건 중 이탈 ${last.dropped.toLocaleString()}건. 시나리오 초반 이탈 지점을 점검하세요.`, '/stats');
  }

  // 5) 정상 운영 요약(항상 1건 · 최신 상태 안내)
  push('ok', '시스템', '✅', '콜봇 연동 정상',
    `보이는 ARS·UMS·Neon 연결이 정상입니다. 진행 세션 ${sessions.length}건 모니터링 중.`, '/dashboard');

  // 심각도 우선 정렬(동률 시 삽입 순서 유지 — Array.sort 안정성)
  notes.sort((a, b) => RANK[a.level] - RANK[b.level]);

  const summary = {
    total: notes.length,
    bad: notes.filter(n => n.level === 'bad').length,
    warn: notes.filter(n => n.level === 'warn').length,
    info: notes.filter(n => n.level === 'info').length,
  };
  // thresholds: 서버가 **실제 적용한** 임계값(클램핑 후) → 화면이 설정값-결과 불일치를 표시하지 않게 한다.
  return { notes, summary, thresholds: T };
}
