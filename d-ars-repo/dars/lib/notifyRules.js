// lib/notifyRules.js — 알림 임계값 **설정화** 공통 유틸(순수 함수 · React/DB 비의존 → 단위 테스트 가능)
//
// 배경: 알림 도출 규칙의 임계값이 lib/notify.js 안에 **하드코딩 상수**로 박혀 있었다
//       (서류 완료율 60% · 요청 50건 · UMS 실패 3건 · 대기 3건 · 장기 세션 180초 · 이탈률 8%).
//       고객사마다 "주의"로 볼 기준이 다른데 코드를 고쳐 재배포해야만 바뀌었고, 그래서 알림 센터가
//       **너무 시끄럽거나 너무 조용해도** 운영자가 손댈 수 없었다.
//
// 설계: (1) 임계값은 요청 파라미터로 받는다(`?docPct=70&sessionSec=240`…). (2) **파라미터가 없으면
//       기존 상수와 동일한 기본값** → 완전 하위호환(기존 호출부·테스트 무영향). (3) 값은 스펙의
//       min/max 로 클램핑 + 정수화 → 쓰레기 입력이 알림을 폭주시키거나 침묵시키지 못한다.
//       (4) 저장은 **브라우저 localStorage**(운영자별 개인 설정) → **DB 스키마 변경 없음**(저위험).
//
// 보안/개인정보: 임계값은 숫자뿐이고 SQL 에 들어가지 않는다(라우트는 도출 로직에만 전달).
//               알림 본문은 기존대로 전화번호를 포함하지 않는다.

export const STORE_KEY = 'dars.notify.thresholds';
export const CHANGE_EVENT = 'dars:thresholds'; // 설정 저장 시 헤더 벨 배지도 같은 기준으로 재조회

// 단일 출처: 키·파라미터명·기본값·범위·화면 라벨.
// def 는 **기존 하드코딩 값과 동일**해야 한다(하위호환).
export const THRESHOLD_SPEC = [
  { key: 'docMinReq',  param: 'docMinReq',  def: 50,  min: 1,  max: 100000, label: '서류 최소 요청 건수', unit: '건',
    help: '요청이 이 건수 이상인 서류만 완료율 알림 대상' },
  { key: 'docPct',     param: 'docPct',     def: 60,  min: 1,  max: 100,    label: '서류 완료율 하한', unit: '%',
    help: '완료율이 이 값 미만이면 주의 알림' },
  { key: 'umsFailBad', param: 'umsFailBad', def: 3,   min: 1,  max: 100,    label: 'UMS 실패 긴급 기준', unit: '건',
    help: '실패가 이 건수 이상이면 긴급(그 미만·1건 이상은 주의)' },
  { key: 'umsWait',    param: 'umsWait',    def: 3,   min: 1,  max: 1000,   label: 'UMS 대기 알림 기준', unit: '건',
    help: '대기 건수가 이 값 이상이면 정보 알림' },
  { key: 'sessionSec', param: 'sessionSec', def: 180, min: 30, max: 3600,   label: '장기 세션 경과', unit: '초',
    help: '진행 세션 경과가 이 값 이상이면 주의 알림' },
  { key: 'dropPct',    param: 'dropPct',    def: 8,   min: 1,  max: 100,    label: '이탈률 상한', unit: '%',
    help: '최근일 이탈률이 이 값 이상이면 주의 알림' },
];

export const DEFAULT_THRESHOLDS = Object.freeze(
  THRESHOLD_SPEC.reduce((o, s) => { o[s.key] = s.def; return o; }, {})
);

const SPEC_BY_KEY = THRESHOLD_SPEC.reduce((o, s) => { o[s.key] = s; return o; }, {});

// 값 1건 정규화: 정수화 + [min,max] 클램핑. 숫자가 아니면 null(= 기본값 사용).
// 주의: 빈 값(null·undefined·공백 문자열)은 **반드시 null** 이어야 한다 —
//       Number('') 은 0 이라, 그대로 클램핑하면 미입력 항목이 조용히 **최솟값**으로 바뀌어
//       기본값이 사라진다(알림 폭주). 회귀 테스트로 고정(tests/notifyrules.test.mjs).
export function clampThreshold(key, v) {
  const spec = SPEC_BY_KEY[key];
  if (!spec) return null;
  if (v == null) return null;
  if (typeof v !== 'number' && String(v).trim() === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).trim());
  if (!Number.isFinite(n)) return null;
  return Math.min(spec.max, Math.max(spec.min, Math.trunc(n)));
}

// 임의의 객체(로컬스토리지·응답·사용자 입력)를 **항상 완전한 임계값 집합**으로 정규화.
// 알 수 없는 키는 버리고, 잘못된 값은 기본값으로 되돌린다 → 화면·도출 로직이 절대 undefined 를 보지 않는다.
export function normalizeThresholds(v) {
  const out = { ...DEFAULT_THRESHOLDS };
  if (v && typeof v === 'object') {
    for (const s of THRESHOLD_SPEC) {
      const c = clampThreshold(s.key, v[s.key]);
      if (c != null) out[s.key] = c;
    }
  }
  return out;
}

// 기본값과 다른 항목만 추림(요청 URL·저장을 최소화 → 파라미터 없으면 기존 URL·캐시 키 그대로).
export function diffFromDefaults(t) {
  const n = normalizeThresholds(t);
  const out = {};
  for (const s of THRESHOLD_SPEC) if (n[s.key] !== s.def) out[s.param] = n[s.key];
  return out;
}

export function isDefaults(t) {
  return Object.keys(diffFromDefaults(t)).length === 0;
}

// 서버(라우트)에서 요청 URL → 임계값. 없거나 잘못됐으면 기본값(= 기존 동작).
export function parseThresholdParams(url) {
  let sp;
  try {
    sp = (url instanceof URL ? url : new URL(String(url), 'http://local')).searchParams;
  } catch {
    return { ...DEFAULT_THRESHOLDS };
  }
  const raw = {};
  for (const s of THRESHOLD_SPEC) {
    const v = sp.get(s.param);
    if (v != null && v !== '') raw[s.key] = v;
  }
  return normalizeThresholds(raw);
}

// 클라이언트 → 요청 URL 조립. 기본값이면 base 그대로(하위호환·캐시 재사용).
export function notifyUrl(base, t) {
  const q = diffFromDefaults(t);
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) sp.set(k, String(v));
  const s = sp.toString();
  return s ? `${base}?${s}` : base;
}

// 브라우저 저장(SSR 안전 — window 없으면 기본값 · JSON 파싱 실패해도 절대 throw 하지 않음).
export function loadThresholds() {
  if (typeof window === 'undefined') return { ...DEFAULT_THRESHOLDS };
  try {
    return normalizeThresholds(JSON.parse(window.localStorage.getItem(STORE_KEY) || 'null'));
  } catch {
    return { ...DEFAULT_THRESHOLDS };
  }
}

export function saveThresholds(t) {
  const n = normalizeThresholds(t);
  if (typeof window === 'undefined') return n;
  try {
    if (isDefaults(n)) window.localStorage.removeItem(STORE_KEY);
    else window.localStorage.setItem(STORE_KEY, JSON.stringify(n));
    window.dispatchEvent(new Event(CHANGE_EVENT)); // 헤더 벨 배지 즉시 동기화
  } catch { /* 저장 실패(사생활 보호 모드 등)해도 화면은 그대로 동작 */ }
  return n;
}

export default normalizeThresholds;
