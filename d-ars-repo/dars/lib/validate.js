// lib/validate.js — 쓰기 API 공통 입력 검증/정규화 (상용 하드닝)
//
// 목적: 잘못된/과대 페이로드로 인한 DB 오염·오류를 방지. 개인정보 처리 로직은 건드리지 않음.
// 설계: 하위호환 — 값이 없으면 기존 기본값 흐름을 그대로 유지, 있으면 길이/타입만 안전화.

import { badRequest as apiBadRequest } from './apiError.js';

// 문자열을 문자열로 강제하고 최대 길이로 자름(제어문자·양끝 공백 제거).
export function clampStr(v, max = 200) {
  if (v == null) return null;
  const s = String(v).replace(/[\x00-\x1f\x7f]/g, '').trim();
  return s.length > max ? s.slice(0, max) : s;
}

// 요청 body를 안전하게 파싱: 유효하지 않은 JSON이면 null 반환(호출부에서 400 처리).
export async function readJson(req) {
  try {
    const b = await req.json();
    return b && typeof b === 'object' && !Array.isArray(b) ? b : null;
  } catch {
    return null;
  }
}

// 400 응답 헬퍼 — 실제 응답 생성은 lib/apiError 에 위임(에러 봉투 단일 출처).
// 본문 형태 `{ ok:false, error }` 는 그대로이고 `Cache-Control: no-store` 만 추가된다(하위호환).
// 이 재export 를 남겨 두는 이유: 기존 라우트가 `@/lib/validate` 에서 readJson 과 함께 가져다 쓴다.
export function badRequest(error = 'invalid request') {
  return apiBadRequest(error);
}

// 시나리오 노드 배열 안전화: 배열이 아니면 null, 최대 개수 제한.
export function clampNodes(nodes, maxNodes = 100) {
  if (!Array.isArray(nodes)) return null;
  return nodes.slice(0, maxNodes).map((n) => ({
    id: n?.id,
    type: clampStr(n?.type, 40),
    label: clampStr(n?.label, 120),
  }));
}
