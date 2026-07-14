// lib/sortParams.js — 목록 API 공통 **서버 사이드 정렬** 유틸 (순수 함수 · React/DB 비의존)
//
// 배경: 목록이 서버 검색·페이징(limit/offset)으로 전환된 뒤에도 **정렬은 "화면에 로드된 행" 기준**이었다.
//       → 50건만 로드한 상태에서 "요청 많은 순"으로 정렬하면 51번째 이후의 더 큰 값이 누락돼
//         사용자가 **1위를 잘못 읽는다**(정렬 결과가 페이지 로드량에 따라 달라짐). 감사·정산에 위험.
//       여기서는 정렬 조건을 서버로 보내 **전체 데이터 기준**으로 정렬한 뒤 페이지를 잘라 준다.
//
// 보안 설계(SQL 인젝션 방지):
//   - 사용자는 **키 이름만** 보낼 수 있고(`?sort=req&dir=desc`), 그 키가 라우트에 선언된
//     화이트리스트(spec)에 **정확히 존재할 때만** 정렬한다. 없는 키·이상한 키는 조용히 무시(기본 정렬).
//   - 실제 SQL 조각은 라우트 코드가 spec 에 직접 적어 둔 문자열이며, 사용자 입력은 절대 SQL 에 들어가지 않는다.
//   - 그럼에도 방어적으로 `SAFE_EXPR` 로 spec 의 SQL 조각을 검사한다(세미콜론·주석·인용부호 차단).
//   - `@neondatabase/serverless` 태그드 템플릿은 **컬럼명을 바인딩할 수 없고** 이 버전에 `sql.unsafe` 도 없다
//     → 라우트는 정렬이 지정된 경우에만 함수 호출 형태 `sql(text, params)`(값은 여전히 $1 바인딩)로 실행한다.
//
// spec 형태: { <키>: { sql: '<정렬식>', val?: (row) => 비교값 } }
//   - sql : DB 경로에서 쓸 정렬식(컬럼명 또는 case 식)
//   - val : 데모 폴백(메모리 배열) 경로에서 쓸 비교값 추출자(생략 시 row[키])
//
// NULL 정책: DB·데모 모두 **오름/내림과 무관하게 NULL(빈 값)은 항상 뒤**로 보낸다(화면 일관성).
// 개인정보·인증·과금 로직과 무관(조회 파라미터만 다룸).

// spec 의 SQL 조각 허용 문자(라우트 작성자 실수 방지용 방어선). 세미콜론·따옴표·주석(--) 불가.
const SAFE_EXPR = /^[A-Za-z0-9_ ().,:*/+=<>|-]+$/;

export function isSafeExpr(expr) {
  const s = String(expr || '');
  if (!s || s.length > 200) return false;
  if (s.includes('--') || s.includes('/*')) return false;
  return SAFE_EXPR.test(s);
}

// ?sort=<키>&dir=asc|desc 파싱. 화이트리스트에 없으면 null(= 라우트 기본 정렬 유지).
export function parseSortParams(url, spec = {}) {
  let sp;
  try {
    sp = (url instanceof URL ? url : new URL(String(url), 'http://local')).searchParams;
  } catch {
    sp = new URLSearchParams();
  }
  const key = (sp.get('sort') || '').trim();
  if (!key || !Object.prototype.hasOwnProperty.call(spec, key)) return null;
  const dir = (sp.get('dir') || '').trim().toLowerCase() === 'desc' ? 'desc' : 'asc';
  return { key, dir };
}

// ORDER BY 조각 생성. 정렬이 없거나 spec 이 이상하면 null → 라우트는 기존 기본 정렬 경로를 그대로 쓴다.
// tiebreak: 같은 값일 때의 결정적 2차 정렬(페이지 경계에서 행이 중복·누락되지 않게 하는 안전장치).
export function orderBySql(sort, spec = {}, tiebreak = 'id asc') {
  if (!sort || !spec[sort.key]) return null;
  const expr = spec[sort.key].sql;
  if (!isSafeExpr(expr)) return null;
  const tb = tiebreak && isSafeExpr(tiebreak) ? `, ${tiebreak}` : '';
  const dir = sort.dir === 'desc' ? 'desc' : 'asc';
  return `${expr} ${dir} nulls last${tb}`;
}

const isBlank = (v) => v == null || v === '';

function compareVals(av, bv) {
  if (typeof av === 'number' && typeof bv === 'number') return av - bv;
  return String(av).localeCompare(String(bv), 'ko', { numeric: true });
}

// 데모 폴백(메모리 배열) 정렬 — DB 경로와 같은 의미(빈 값 뒤로, id 2차 정렬). 원본 불변.
export function sortRowsBy(rows, sort, spec = {}) {
  const list = Array.isArray(rows) ? rows : [];
  if (!sort || !spec[sort.key]) return list;
  const s = spec[sort.key];
  const get = typeof s.val === 'function' ? s.val : (r) => r?.[sort.key];
  const mul = sort.dir === 'desc' ? -1 : 1;
  return [...list].sort((a, b) => {
    const av = get(a);
    const bv = get(b);
    const an = isBlank(av);
    const bn = isBlank(bv);
    if (an || bn) {
      if (an && bn) return 0;
      return an ? 1 : -1; // 빈 값은 방향과 무관하게 항상 뒤
    }
    const c = mul * compareVals(av, bv);
    if (c) return c;
    return compareVals(a?.id, b?.id); // 결정적 2차 정렬
  });
}

// 화면(클라이언트)이 목록·집계·내보내기 요청에 실을 파라미터. 정렬 없으면 빈 객체(= 기존 요청과 동일).
export function sortQuery(sort) {
  if (!sort || !sort.key) return {};
  return { sort: sort.key, dir: sort.dir === 'desc' ? 'desc' : 'asc' };
}

export default parseSortParams;
