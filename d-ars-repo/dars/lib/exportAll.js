// lib/exportAll.js — 내보내기 "서버 전체 기준" 수집 유틸 (React 비의존 → 단위 테스트 가능)
//
// 배경: docs·ums·history·sessions 의 CSV/Excel/PDF 내보내기가 **화면에 로드된 행**(첫 50건 + "더 보기"로
//       추가한 만큼)만 담아, 사용자가 "더 보기"를 몇 번 눌렀는지에 따라 결과 파일의 내용이 달라졌다.
//       → 감사·정산용 파일로 쓰기 위험(누락된 행을 사용자가 인지하지 못함).
// 여기서는 현재 **검색·필터 조건 전체**를 서버에서 페이지 단위로 모두 받아온다(limit/offset 순회).
// 조회 파라미터만 다루므로 개인정보·인증·과금 로직과 무관하며, 서버 응답 스키마도 변경하지 않는다.

import { buildListUrl, readPage, mergePage } from './listUrl.js';

export const EXPORT_PAGE_SIZE = 200;  // 수집 1회 요청 건수(API limit 상한 500 이내)
export const EXPORT_MAX_ROWS = 5000;  // 안전 상한 — 브라우저 메모리·인쇄 폭주 방지
const HARD_PAGE_CAP = 500;            // lib/paginate.js 의 limit 클램프와 동일

// 현재 조건의 모든 행을 수집한다. 절대 throw 하지 않고 { rows, total, truncated, error } 를 반환한다.
//  - get: (url) => Promise<{data,error}>  ← 화면에서 lib/fetchJson 의 getJSON 을 주입(테스트에선 스텁)
//  - truncated: 상한(maxRows)에 걸려 일부만 수집됐는지 여부 → 화면이 사용자에게 고지한다.
export async function fetchAllRows(base, {
  q = '', params = {}, pageSize = EXPORT_PAGE_SIZE, maxRows = EXPORT_MAX_ROWS, get, onProgress,
} = {}) {
  if (typeof get !== 'function') {
    return { rows: [], total: 0, truncated: false, error: '내보내기 요청 함수가 없습니다' };
  }
  const cap = Math.max(1, Math.floor(Number(maxRows) > 0 ? Number(maxRows) : EXPORT_MAX_ROWS));
  const size = Math.max(1, Math.min(Math.floor(Number(pageSize) > 0 ? Number(pageSize) : EXPORT_PAGE_SIZE), HARD_PAGE_CAP));

  let rows = [];
  let offset = 0;
  let total = 0;
  let truncated = false;

  // 상한이 있으므로 루프는 유한하지만, 서버가 hasMore=true 로 빈 페이지를 계속 주는 병리적 경우까지 방어한다.
  for (let guard = 0; guard < 1000; guard++) {
    const limit = Math.min(size, cap - rows.length);
    if (limit <= 0) { truncated = true; break; }

    const { data, error } = await get(buildListUrl(base, { q, limit, offset, params }));
    if (error) return { rows, total: total || rows.length, truncated, error };

    const page = readPage(data, { limit, offset });
    rows = mergePage(rows, page.rows, offset);
    total = page.total;
    offset += page.rows.length;
    if (typeof onProgress === 'function') onProgress(rows.length, total);

    if (page.rows.length === 0 || !page.hasMore) break;   // 마지막 페이지
    if (rows.length >= cap) { truncated = true; break; }  // 안전 상한
  }

  return { rows, total: total || rows.length, truncated, error: null };
}

// 상한에 걸렸을 때 화면에 띄울 안내 문구(레이아웃 무붕괴용 짧은 문장).
export function truncationNote(truncated, maxRows = EXPORT_MAX_ROWS) {
  if (!truncated) return '';
  return `최대 ${Number(maxRows).toLocaleString()}건까지만 내보냈습니다`;
}

export default fetchAllRows;
