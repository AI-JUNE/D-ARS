// 헬스체크 응답 바디/상태코드 구성 (순수 함수 · DB 접근 없음 → 단위 테스트 가능)
// db 상태:
//   - 'connected'      : DB 프로브(select 1) 성공
//   - 'demo-fallback'  : DATABASE_URL 미설정(데모 모드) — 정상 동작으로 간주
//   - 'error'          : DB 설정되어 있으나 프로브 실패 → 503(모니터링/업타임 감지용)
//
// 성능 관측(2026-07-21 야간): 프로브가 성공하더라도 DB 지연이 임계값 이상이면
//   body.slow=true 를 실어 보낸다. 완전한 장애(503)가 되기 전에 업타임 모니터가
//   "성능 저하"를 선제 감지할 수 있게 하기 위함이다(ok/status 계약은 불변 — 느림 ≠ 다운).
//
// 의존성·버전 노출(2026-09-02 야간, COMMERCIAL_READINESS §공통-3):
//   운영자가 /health 한 번으로 "무엇이 배포돼 있고, 무엇이 붙어 있는가"를 확인할 수 있어야 한다.
//   - version : package.json 버전(배포 식별)
//   - commit  : 커밋 해시 단축(이미 있음)
//   - deps[]  : DB 외 외부 의존성의 **상태만** 노출한다.
//   보안: deps 에는 이름·상태·지연만 담는다. **엔드포인트 URL·키·자격증명은 어떤 경우에도 넣지 않는다**
//   (/health 는 인증 없이 열려 있으므로 여기 담기는 값은 곧 공개 정보다).
//   가용성 계약: 외부 의존성 장애로 503 을 내면 부가기능 하나가 전체 헬스체크를 죽인다.
//   따라서 dep 오류는 기본적으로 body.degraded=true 로만 알리고, required:true 인 의존성만 503 에 관여한다.
export const DEFAULT_SLOW_THRESHOLD_MS = 1500;


// 의존성 상태 어휘(자유 문자열 금지 — 대시보드 필터·알림 라우팅 가능성 확보)
//   ok             : 프로브 성공 / 설정되어 정상
//   degraded       : 동작하지만 성능 저하·부분 실패
//   error          : 사용 불가
//   not-configured : 환경변수 미설정(데모/미도입 — 장애가 아니다)
export const DEP_STATUSES = ['ok', 'degraded', 'error', 'not-configured'];

// 의존성 항목을 공개 가능한 형태로 정규화한다.
// 화이트리스트 방식 — name·status·latencyMs·required 만 통과시킨다.
// 알 수 없는 키(url·key·token 등)는 실수로 넘겨도 **응답에 실리지 않는다**.
export function normalizeDep(dep) {
  if (!dep || typeof dep !== 'object' || Array.isArray(dep)) return null;
  const name = typeof dep.name === 'string' ? dep.name.trim().slice(0, 40) : '';
  if (!name) return null;
  const status = DEP_STATUSES.includes(dep.status) ? dep.status : 'error';
  const out = { name, status };
  const ms = Number(dep.latencyMs);
  if (dep.latencyMs != null && Number.isFinite(ms) && ms >= 0) out.latencyMs = Math.round(ms);
  if (dep.required === true) out.required = true;
  return out;
}

// 의존성 배열 정규화. 최대 12개(응답 폭주 방어) · 잘못된 항목은 조용히 버린다.
export function normalizeDeps(deps) {
  if (!Array.isArray(deps)) return [];
  const out = [];
  for (const d of deps) {
    const n = normalizeDep(d);
    if (n) out.push(n);
    if (out.length >= 12) break;
  }
  return out;
}

export function buildHealth({
  dbStatus,
  latencyMs = null,
  commit = null,
  env = 'unknown',
  version = null,
  deps = null,
  now = new Date(),
  slowThresholdMs = DEFAULT_SLOW_THRESHOLD_MS,
} = {}) {
  const list = normalizeDeps(deps);
  // 필수(required) 의존성이 죽으면 서비스가 실제로 불가 → 503. 그 외 의존성은 degraded 로만 알린다.
  const requiredDown = list.some((d) => d.required && d.status === 'error');
  const ok = dbStatus !== 'error' && !requiredDown;
  const body = { ok, db: dbStatus };
  if (latencyMs != null) body.dbLatencyMs = latencyMs;
  // DB 프로브는 성공했지만 지연이 임계값 이상 → 성능 저하 신호(하위호환: 느리지 않으면 필드 자체를 넣지 않음)
  if (
    dbStatus === 'connected' &&
    latencyMs != null &&
    slowThresholdMs != null &&
    latencyMs >= slowThresholdMs
  ) {
    body.slow = true;
  }
  body.commit = commit;
  body.env = env;
  // 하위호환: version·deps 는 값이 있을 때만 실린다(기존 소비자의 키 개수 가정을 깨지 않음).
  if (typeof version === 'string' && version) body.version = version;
  if (list.length) {
    body.deps = list;
    // 필수 아닌 의존성의 문제는 200 을 유지하되 degraded 플래그로 드러낸다.
    if (!requiredDown && list.some((d) => d.status === 'error' || d.status === 'degraded')) {
      body.degraded = true;
    }
  }
  body.ts = now.toISOString();
  return { body, status: ok ? 200 : 503 };
}
