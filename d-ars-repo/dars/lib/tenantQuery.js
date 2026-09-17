// lib/tenantQuery.js — 테넌트(고객사) 조회의 **단일 쿼리 계층** (순수 로직 · 무부작용 · DB 비의존)
//
// 배경(COMMERCIAL_READINESS "2계층 확장 여지 확보"): 파트너 역할(`partner_admin`)은 자기가 유치한
//   고객사만 봐야 한다. 지금까지 확보한 것은 판정 함수(`lib/auth.partnerScopeOf` · `lib/partner.scopeSql`)
//   뿐이고, **실제 조회는 라우트마다 손으로 SQL 을 적는 구조**였다(예: 정산 라우트의
//   `select ... from organizations order by id`). 이 구조의 문제는 하나다 —
//   범위 필터를 **빠뜨려도 아무 일도 일어나지 않는다**. 테넌트 표를 읽는 라우트가 하나 늘 때마다
//   사람이 "여기도 파트너 범위를 걸어야 하지" 를 기억해야 하고, 잊으면 파트너가 남의 고객사를 본다.
//   빌드도 테스트도 통과하고 화면도 멀쩡하다. 리셀러(2계층) 전환 시점에 한꺼번에 터진다.
//
// 그래서 이 모듈은 "필터를 끼울 수 있게" 가 아니라 **"범위를 말하지 않으면 질의가 만들어지지 않게"**
//   설계한다. 핵심 불변식 넷:
//     1) `scope` 는 **필수 인자**다. 빠뜨리면 전체가 아니라 **빈 결과**(`where false`)가 나온다.
//        — 실수의 기본값이 '전체 공개' 가 아니라 '아무것도 안 보임' 이어야 한다.
//     2) 표·컬럼·정렬키는 **등록부 화이트리스트**에서만 나온다. 사용자 입력이 식별자로 새지 않는다.
//     3) 값은 전부 바인딩 파라미터($1..). 문자열 결합으로 값을 넣는 경로가 없다.
//     4) 이 파일 **밖에서 테넌트 표를 직접 조회하면 테스트가 실패한다**(tests/tenantquery 우회 가드).
//
// 화이트라벨·파트너 명의 계약(리셀러)은 **지금 구현하지 않는다**. 범위가 들어갈 자리만 확정한다.
// 저장·전송 경로 없음(select 전용 — insert/update/delete 를 만들지 않는다).

// 파트너 식별자 형식은 lib/partner.isValidId 와 같은 규칙이다. 이 모듈은 DB·다른 모듈에 기대지
// 않는 순수 조각으로 두려고 여기서 재선언한다(lib/auth.js 가 같은 이유로 재선언하는 것과 동일).
const PARTNER_ID_RE = /^[A-Z0-9][A-Z0-9-]{2,31}$/;
function isValidPartnerId(id) {
  return typeof id === 'string' && PARTNER_ID_RE.test(id);
}

// 범위 판정 실패를 뜻하는 값(lib/auth.PARTNER_SCOPE_NONE 과 같은 빈 문자열 규약).
export const SCOPE_NONE = '';
// scope 를 아예 넘기지 않은 상태(=버그)와 "전체(null)" 를 구분하기 위한 표식.
const MISSING = Symbol('scope-missing');

// ---- 테넌트 표 등록부 -------------------------------------------------------
// 표를 추가할 때 여기 한 줄만 적으면 범위 규칙이 따라온다. `scope.kind`:
//   direct — 그 표에 파트너 컬럼이 있다.
//   viaOrg — 고객사를 거쳐 걸린다(하위 질의). 고객사 소속이 바뀌면 이력 열람도 따라 바뀐다.
//   self   — 파트너 자기 자신 행만.
export const TENANT_TABLES = Object.freeze({
  partners: Object.freeze({
    columns: Object.freeze(['id', 'name', 'status', 'created_at']),
    scope: Object.freeze({ kind: 'self', column: 'id' }),
    defaultOrder: 'id',
  }),
  organizations: Object.freeze({
    columns: Object.freeze(['id', 'name', 'partner_id', 'acquired_via', 'contracted_at', 'status', 'created_at']),
    scope: Object.freeze({ kind: 'direct', column: 'partner_id' }),
    defaultOrder: 'id',
  }),
  partner_attributions: Object.freeze({
    columns: Object.freeze(['id', 'org_id', 'partner_id', 'channel', 'contracted_at', 'attributed_by', 'reason', 'created_at']),
    scope: Object.freeze({ kind: 'viaOrg', column: 'org_id' }),
    defaultOrder: 'id',
  }),
});

export function tenantTableNames() {
  return Object.keys(TENANT_TABLES).slice().sort();
}
export function isTenantTable(name) {
  return typeof name === 'string' && Object.prototype.hasOwnProperty.call(TENANT_TABLES, name);
}

// ---- where 조각 -------------------------------------------------------------
// scope 별 where 조각과 바인딩 값. 식별자는 등록부 상수, 값은 params 로만 나간다.
//   null            → 'true'  (고원 직원 — 전체)
//   유효한 파트너 id → 표별 규칙
//   그 외(빠뜨림·'' ·형식 불량) → 'false' (빈 결과)
function scopeWhere(table, scope, paramIndex) {
  if (scope === null) return { where: 'true', params: [] };
  if (!isValidPartnerId(scope)) return { where: 'false', params: [] };
  const spec = TENANT_TABLES[table].scope;
  const p = `$${paramIndex}`;
  if (spec.kind === 'direct' || spec.kind === 'self') return { where: `${spec.column} = ${p}`, params: [scope] };
  // viaOrg — 고객사를 거친다(하위 질의). 표·컬럼 이름은 모두 이 파일의 상수이며 값만 바인딩된다.
  const orgScopeCol = TENANT_TABLES.organizations.scope.column;
  return {
    where: `${spec.column} in (select id from organizations where ${orgScopeCol} = ${p})`,
    params: [scope],
  };
}

// ---- 정렬·페이징 ------------------------------------------------------------
// 정렬키는 컬럼 화이트리스트에서만, 방향은 asc|desc 만. 이상값은 표 기본 정렬로 되돌린다.
function orderClause(table, orderBy) {
  const t = TENANT_TABLES[table];
  const fallback = `${t.defaultOrder} asc`;
  if (orderBy == null) return { clause: fallback, problems: [] };
  if (typeof orderBy !== 'string') return { clause: fallback, problems: [{ code: 'ORDER_INVALID', msg: '정렬 지정이 문자열이 아니다' }] };
  const m = orderBy.trim().match(/^([a-z_][a-z0-9_]*)(?:\s+(asc|desc))?$/i);
  if (!m || !t.columns.includes(m[1])) {
    return { clause: fallback, problems: [{ code: 'ORDER_UNKNOWN', msg: `정렬키는 ${table} 의 허용 컬럼이어야 한다` }] };
  }
  return { clause: `${m[1]} ${(m[2] || 'asc').toLowerCase()}`, problems: [] };
}

export const MAX_LIMIT = 500;
function intOrNull(v) {
  return Number.isInteger(v) ? v : null;
}

/**
 * 테넌트 표 select 문 생성.
 *   tenantSelect('organizations', { scope: null, columns: ['id','name'] })
 *     → { text: 'select id, name from organizations where true order by id asc', params: [], problems: [] }
 *
 * @param {string} table  등록부에 있는 표 이름
 * @param {{scope: string|null, columns?: string[], orderBy?: string, limit?: number, offset?: number}} opts
 *   scope — **필수**. null = 전체(직원) · 파트너 id = 그 파트너 · 그 외 = 빈 결과.
 * @returns {{text: string, params: any[], problems: {code:string,msg:string}[]}}
 *   problems 가 비어 있지 않으면 text 는 **아무 행도 반환하지 않는 질의**다(fail-closed).
 *   이 함수는 어떤 입력에도 throw 하지 않는다.
 */
export function tenantSelect(table, opts) {
  const problems = [];
  const o = opts && typeof opts === 'object' ? opts : {};

  if (!isTenantTable(table)) {
    // 표 이름조차 식별자로 흘려보내지 않는다 — 등록부에 있는 표로만 질의를 만든다.
    return {
      text: 'select 1 where false',
      params: [],
      problems: [{ code: 'TABLE_UNKNOWN', msg: '등록되지 않은 테넌트 표' }],
    };
  }
  const spec = TENANT_TABLES[table];

  // scope 누락은 '전체' 가 아니라 **버그**로 다룬다.
  const scope = Object.prototype.hasOwnProperty.call(o, 'scope') ? o.scope : MISSING;
  if (scope === MISSING) {
    problems.push({ code: 'SCOPE_REQUIRED', msg: 'scope 를 명시해야 한다(null=전체 · 파트너 id=범위 제한)' });
  } else if (scope !== null && !isValidPartnerId(scope)) {
    problems.push({ code: 'SCOPE_INVALID', msg: '범위 판정 실패 — 빈 결과를 반환한다' });
  }
  const effectiveScope = scope === null ? null : (isValidPartnerId(scope) ? scope : SCOPE_NONE);

  // 컬럼 화이트리스트
  let cols;
  if (o.columns == null) {
    cols = spec.columns.slice();
  } else if (!Array.isArray(o.columns)) {
    cols = spec.columns.slice();
    problems.push({ code: 'COLUMNS_INVALID', msg: 'columns 는 배열이어야 한다' });
  } else {
    cols = o.columns.filter((c) => spec.columns.includes(c));
    const dropped = o.columns.length - cols.length;
    if (dropped > 0) problems.push({ code: 'COLUMN_UNKNOWN', msg: `${table} 에 없는 컬럼 ${dropped}개를 버렸다` });
    if (!cols.length) {
      cols = spec.columns.slice();
      problems.push({ code: 'COLUMNS_EMPTY', msg: '남은 컬럼이 없어 기본 컬럼으로 되돌렸다' });
    }
  }

  const ord = orderClause(table, o.orderBy);
  problems.push(...ord.problems);

  const parts = [];
  const params = [];
  const failClosed = problems.length > 0;
  const sw = failClosed ? { where: 'false', params: [] } : scopeWhere(table, effectiveScope, 1);
  params.push(...sw.params);
  parts.push(`select ${cols.join(', ')} from ${table} where ${sw.where} order by ${ord.clause}`);

  const limit = intOrNull(o.limit);
  if (o.limit != null && limit === null) problems.push({ code: 'LIMIT_INVALID', msg: 'limit 은 정수여야 한다' });
  if (limit !== null) {
    params.push(Math.min(MAX_LIMIT, Math.max(1, limit)));
    parts.push(`limit $${params.length}`);
  }
  const offset = intOrNull(o.offset);
  if (o.offset != null && offset === null) problems.push({ code: 'OFFSET_INVALID', msg: 'offset 은 정수여야 한다' });
  if (offset !== null) {
    params.push(Math.max(0, offset));
    parts.push(`offset $${params.length}`);
  }

  return { text: parts.join(' '), params, problems };
}

/**
 * 조회 실행 헬퍼 — 라우트가 이 한 줄만 부르면 범위·화이트리스트·폴백이 모두 따라온다.
 * DB 를 import 하지 않는다(호출자가 `sql`·`safe` 를 넘긴다 → 이 모듈은 여전히 순수 테스트 가능).
 *
 * @param {{sql: Function, safe: Function}} io  lib/db 의 sql·safe
 * @returns {Promise<any[]>}  오류·표 없음·범위 실패 어느 경우에도 배열(빈 배열)을 반환한다.
 */
export async function selectTenantRows(io, table, opts) {
  const q = tenantSelect(table, opts);
  const run = io && typeof io.sql === 'function' ? io.sql : null;
  const guard = io && typeof io.safe === 'function' ? io.safe : null;
  if (!run || !guard) return [];
  const rows = await guard(() => run(q.text, q.params), []);
  return Array.isArray(rows) ? rows : [];
}

export default tenantSelect;
