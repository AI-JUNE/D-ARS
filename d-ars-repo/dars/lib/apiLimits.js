// lib/apiLimits.js — 공개 API rate limit **정책 단일화** (상용 하드닝)
//
// 왜 이 파일이 필요한가: 이전에는 라우트마다 createRateLimiter 를 직접 만들고 429 응답도
// 손으로 조립했다. 정책(윈도우·한도)이 코드 여러 곳에 흩어져 있으면 "어디에 얼마가 걸려
// 있는지" 아무도 답할 수 없다. 정책은 여기 한 곳에서만 정의하고, 라우트는 이름으로 가져다 쓴다.
//
// ── 키 선택이 핵심 ────────────────────────────────────────────────────────
// 국내 이동통신망은 CGNAT 비중이 높아 **다수 고객이 같은 공인 IP 를 공유**한다. 고객 화면
// (/visual)처럼 정상 사용자가 폴링하는 엔드포인트를 IP 로 조이면 한 명의 과다요청이 같은
// 통신사 사용자 전체를 막을 수 있다(무고한 차단). 그래서 두 갈래로 나눈다.
//   - 토큰이 유효한 요청 → **세션 단위**로 제한. 다른 사용자에게 전이되지 않는다.
//   - 토큰 검증 실패 → **IP 단위**로 빡빡하게 제한. 실제 위협(서명토큰 브루트포스)만 겨냥한다.
//
// ── 한도 산정 근거(실측 KPI 아님 · 클라이언트 폴링 주기에서 역산) ────────
//   visual 화면 폴링 2.5초(app/visual/page.jsx) → 세션당 약 24회/분 → 한도 120회/분은 5배 여유.
//   포털 화면들은 5~30초 주기 폴링 → 사용자당 1회/초 미만 → 공유 사무실 IP 를 감안해 넉넉히.
//   즉 한도는 "정상 사용의 몇 배"로 잡은 것이고, 성능·가용성 수치를 주장하는 값이 아니다.
//
// ── 운영 스위치 ───────────────────────────────────────────────────────────
//   RATE_LIMIT_DISABLED=1 이면 전 리미터가 무조건 통과한다. 오탐으로 라이브가 막혔을 때
//   재배포 없이 즉시 해제하기 위한 비상구다(기본값은 **적용됨** — 보호가 기본이어야 한다).
//
// 한계(기존과 동일): 인메모리·인스턴스 로컬. 서버리스에서 인스턴스가 여러 개면 실효 한도가
// 인스턴스 수만큼 늘어난다. **[승인 필요]** 멀티노드 정합이 필요해지면 Redis 등 공유 스토어로 교체.

import { createRateLimiter, clientIp } from './rateLimit.js';
import { rateLimited } from './apiError.js';

// 정책표 — 모든 한도는 여기에서만 바뀐다(라우트에 숫자를 흩뿌리지 않는다).
export const LIMIT_POLICY = {
  // 서명토큰 스코프 공개 API: 세션 단위(키 = sessionId)
  visualState:  { windowMs: 60_000, max: 120 },  // 2.5초 폴링(≈24회/분) 대비 5배
  visualAction: { windowMs: 60_000, max: 60 },   // 화면 버튼 조작 — 사람 손 속도 대비 충분
  // 토큰 검증 실패 전용: IP 단위(키 = ip). 브루트포스만 겨냥해 빡빡하게.
  tokenFail:    { windowMs: 60_000, max: 20 },
  // 머신 수집(콜봇 → /api/sessions POST): IP 단위. 통화당 이벤트가 잦아 넉넉히.
  ingest:       { windowMs: 60_000, max: 300 },
  // 읽기 목록/통계: IP 단위. 사무실 공유 IP 를 감안(정상 사용의 수십 배).
  read:         { windowMs: 60_000, max: 1200 },
  // 시뮬레이터: DB 행 생성 + SMS 발송 경로라 부작용이 있다 → 가장 빡빡하게.
  simulate:     { windowMs: 60_000, max: 10 },
  // ── 기존에 라우트 안에 흩어져 있던 정책을 그대로 옮겨온 것(값 변경 없음) ──
  login:        { windowMs: 5 * 60_000, max: 10 },  // 로그인 브루트포스 완화
  cpaasEvents:  { windowMs: 60_000, max: 120 },     // 통화 중 STT·TTS·node 이벤트는 잦다
  cpaasVoice:   { windowMs: 60_000, max: 30 },      // 인입콜 웹훅 — SMS 발송 남용 방어
};

const limiters = new Map();

// 이름으로 리미터를 얻는다(최초 호출 시 생성 · 이후 동일 인스턴스 재사용).
// 라우트가 모듈 최상단에서 부르든 핸들러 안에서 부르든 같은 상태를 공유한다.
export function limiter(name) {
  const policy = LIMIT_POLICY[name];
  if (!policy) throw new Error(`unknown rate limit policy: ${name}`);
  if (!limiters.has(name)) limiters.set(name, createRateLimiter(policy));
  return limiters.get(name);
}

// 비상 해제 스위치. 기본은 적용(보호가 기본).
export function limitsDisabled() {
  return process.env.RATE_LIMIT_DISABLED === '1';
}

// 정책 이름 + 키로 1회 소비하고, 초과면 **429 Response**, 통과면 null 을 돌려준다.
// 라우트는 `const over = consume('read', ipKey(req)); if (over) return over;` 한 줄이면 된다.
// key 가 비어 있으면(추정 실패) 'unknown' 으로 묶인다 — 정상 사용자와 섞이지 않도록
// 호출부에서 되도록 의미 있는 키(sessionId 등)를 준다.
export function consume(name, key, error = 'rate limited') {
  if (limitsDisabled()) return null;
  const gate = limiter(name).check(key || 'unknown');
  return gate.allowed ? null : rateLimited(gate.retryAfterSec, error);
}

// IP 키(프록시/Vercel 헤더 대응은 lib/rateLimit.clientIp 에 위임).
export function ipKey(req) { return clientIp(req); }

// 테스트·운영 점검용: 특정 정책의 상태를 비운다(응답 형태에 영향 없음).
export function resetLimits(name) {
  if (name) limiters.delete(name);
  else limiters.clear();
}
