// lib/viewsIO.js — **저장된 뷰 가져오기/내보내기**(백로그 (u)) 순수 유틸 (React/DOM 비의존 → 단위 테스트 가능)
//
// 배경: 19회차의 저장된 뷰(조회 조건 프리셋)는 **브라우저 localStorage 전용**이다.
//   → (1) 브라우저를 바꾸거나 캐시를 지우면 **그동안 쌓은 프리셋이 통째로 사라진다**(백업 수단 없음),
//     (2) 팀에 배포할 수단이 없다 — 21회차의 🔗 링크 복사는 **조건 1개**만 건넬 수 있고,
//         "감사 담당자가 쓰는 프리셋 8개 세트"를 통째로 넘기려면 링크를 8번 보내고 8번 저장해야 했다.
//   → 프리셋 묶음을 **JSON 파일 1개**로 내보내고, 그 파일을 받아 **가져오기**로 합친다(팀 공유·백업·기기 이전).
//
// 설계:
//   - 파일은 **자기 서술적 봉투**(kind·version·screen·exportedAt·views)다. 훗날 서버 저장으로 승격해도
//     같은 자료구조를 그대로 쓴다(`savedViews.js` 의 {name,q} 를 재사용 — 이 모듈은 자체 스키마를 만들지 않는다).
//   - 가져오기는 **절대 throw 하지 않는다** — 손상된 JSON·남의 앱 파일·배열만 든 파일 어느 쪽이든
//     `{ views, error }` 로 조용히 돌려준다(화면이 깨지지 않는다). 유효성 검사는 `parseViews` 단일 경로를 재사용.
//   - 병합은 **이름 기준 덮어쓰기**(같은 이름 = 조건 갱신, 중복 생성 아님 — addView 와 동일 의미).
//     상한(MAX_VIEWS)을 넘으면 넘친 항목은 **버리고 그 수를 보고**한다(조용히 밀어내지 않는다 —
//     가져오기는 사용자가 결과를 확인해야 하는 조작이므로 "몇 개가 안 들어갔는지"를 말해 줘야 한다).
//   - 개인정보(전화번호)는 애초에 URL 쿼리에 실리지 않는다(PII 정책) → **내보낸 파일에 PII 가 새어 나갈 경로가 없다**.

import { MAX_VIEWS, normalizeName, normalizeQuery, parseViews } from './savedViews.js';

export const FILE_KIND = 'dars.savedViews';
export const FILE_VERSION = 1;

// 유효한 뷰만 추린다 — **상한을 적용하지 않는다**(회귀 테스트가 잡아낸 실제 버그:
//   `parseViews` 는 MAX_VIEWS 에서 잘라 버리므로, 13개짜리 파일을 가져와도 넘친 항목 수가
//   0으로 보였다 → 사용자에게 "몇 개가 안 들어갔는지"를 말해 줄 수 없었다).
//   상한 적용과 그 보고는 **`mergeViews` 한 곳에서만** 한다(단일 책임).
export function validViews(raw) {
  let arr = raw;
  if (typeof raw === 'string') {
    try { arr = JSON.parse(raw); } catch { return []; }
  }
  if (!Array.isArray(arr)) return [];
  const out = [];
  const seen = new Set();
  for (const v of arr) {
    if (!v || typeof v !== 'object' || typeof v.name !== 'string' || typeof v.q !== 'string') continue;
    const name = normalizeName(v.name);
    if (!name || seen.has(name)) continue;
    seen.add(name);
    out.push({ name, q: normalizeQuery(v.q) });
  }
  return out;
}

// 파일명: dars-views_ums_2026-07-14.json — 화면·날짜가 드러나야 여러 파일을 열지 않고 구분한다.
export function exportFileName(screen, date = new Date()) {
  const d = date instanceof Date && !Number.isNaN(date.getTime()) ? date : new Date();
  const z = (n) => String(n).padStart(2, '0');
  const tag = `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
  const s = String(screen || '').trim().replace(/[\\/:*?"<>|\s]+/g, '-').slice(0, 24) || 'default';
  return `dars-views_${s}_${tag}.json`;
}

// 내보낼 봉투(순수 객체). views 는 parseViews 를 통과한 것만 담긴다(손상 항목은 애초에 나가지 않는다).
export function buildExport(screen, views, date = new Date()) {
  const d = date instanceof Date && !Number.isNaN(date.getTime()) ? date : new Date();
  return {
    kind: FILE_KIND,
    version: FILE_VERSION,
    screen: String(screen || '').trim() || 'default',
    exportedAt: d.toISOString(),
    views: parseViews(views),
  };
}

// 사람이 열어 볼 수도 있는 파일이므로 들여쓰기 2칸 + 말미 개행(diff·에디터 친화).
export function serializeExport(screen, views, date = new Date()) {
  return JSON.stringify(buildExport(screen, views, date), null, 2) + '\n';
}

// 파일 텍스트 → { views, screen, error }. **절대 throw 하지 않는다.**
// 수용 형식: (a) 우리 봉투 {kind,version,screen,views}, (b) {views:[...]} 만 있는 객체, (c) 배열 그 자체(레거시·수기 작성).
export function parseImport(text) {
  const fail = (error) => ({ views: [], screen: null, error });
  if (typeof text !== 'string' || !text.trim()) return fail('빈 파일입니다.');

  let data;
  try { data = JSON.parse(text); } catch { return fail('JSON 형식이 아닙니다(파일이 손상되었거나 다른 형식입니다).'); }

  let rawViews = null;
  let screen = null;
  if (Array.isArray(data)) {
    rawViews = data;
  } else if (data && typeof data === 'object') {
    if (data.kind && data.kind !== FILE_KIND) return fail('D-ARS 저장된 뷰 파일이 아닙니다.');
    if (data.version != null && Number(data.version) > FILE_VERSION) {
      return fail('더 새로운 버전의 파일입니다(앱을 업데이트한 뒤 다시 시도하세요).');
    }
    if (!Array.isArray(data.views)) return fail('뷰 목록(views)이 없습니다.');
    rawViews = data.views;
    screen = typeof data.screen === 'string' && data.screen.trim() ? data.screen.trim() : null;
  } else {
    return fail('알 수 없는 파일 형식입니다.');
  }

  const views = validViews(rawViews);   // 상한 미적용 — 넘친 항목은 mergeViews 가 세어 보고한다
  if (!views.length) return fail('가져올 수 있는 뷰가 없습니다(모든 항목이 비어 있거나 형식이 어긋납니다).');
  return { views, screen, error: null };
}

// 병합(원본 불변) — mode: 'merge'(기본, 같은 이름은 덮어쓰기) | 'replace'(현재 목록을 파일로 대체)
// 반환: { list, added, updated, skipped } — skipped 는 상한(MAX_VIEWS) 때문에 **들어가지 못한** 항목 수.
export function mergeViews(current, incoming, mode = 'merge') {
  const inc = validViews(incoming);   // 상한은 여기서만 적용·보고한다(위 validViews 주석 참조)
  if (mode === 'replace') {
    const list = inc.slice(0, MAX_VIEWS);
    return { list, added: list.length, updated: 0, skipped: Math.max(0, inc.length - list.length) };
  }
  const list = parseViews(current);
  let added = 0, updated = 0, skipped = 0;
  for (const v of inc) {
    const i = list.findIndex((x) => x.name === v.name);
    if (i >= 0) {
      if (list[i].q !== v.q) updated += 1;   // 조건이 같으면 갱신이 아니다(사용자에게 거짓 보고하지 않는다)
      list[i] = { name: v.name, q: v.q };
      continue;
    }
    if (list.length >= MAX_VIEWS) { skipped += 1; continue; }  // 상한 초과분은 **조용히 밀어내지 않고** 보고한다
    list.push({ name: v.name, q: v.q });
    added += 1;
  }
  return { list, added, updated, skipped };
}

// 가져오기 결과 안내문(사용자에게 그대로 보여 준다 — 무엇이 바뀌었는지 침묵하지 않는다).
export function importSummary({ added = 0, updated = 0, skipped = 0 } = {}) {
  const parts = [];
  if (added) parts.push(`${added}개 추가`);
  if (updated) parts.push(`${updated}개 갱신`);
  if (!parts.length) parts.push('변경 없음(이미 같은 조건으로 저장되어 있습니다)');
  let s = parts.join(' · ');
  if (skipped) s += ` · ${skipped}개 제외(최대 ${MAX_VIEWS}개)`;
  return s;
}

export { MAX_VIEWS, normalizeName, normalizeQuery };
export default parseImport;
