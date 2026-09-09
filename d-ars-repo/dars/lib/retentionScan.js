// lib/retentionScan.js — 스키마의 개인정보 컬럼 발견 + 파기 대상 누락 판정(순수 로직)
//
// 배경(COMMERCIAL_READINESS "개인정보 보관·파기 정책 코드화"):
//   `lib/retention.js` 의 PII_TABLES 는 **사람이 손으로 적는 목록**이었다. 스키마에 개인정보
//   컬럼이 하나 새로 생기면, 파기 스크립트는 아무 오류 없이 "대상 0건"을 보고하고 그 컬럼만
//   영원히 남는다. 빌드도 테스트도 통과하는 전형적 잠복 사고이며, 개인정보 파기 의무는
//   "몰랐다"가 면책이 되지 않는다. 그래서 db/*.sql 을 직접 읽어 **코드가 스키마와 대조**한다.
//   (백업 커버리지 `lib/backupCheck.js` 와 같은 양방향 대조 방식.)
//
// 이 모듈은 **아무 것도 실행하지 않는다** — SQL 을 파싱해 판정만 반환한다.
//   파일 읽기는 호출자(테스트·CLI)가 하고, 실제 파기는 사람이 승인한다.

import { stripSqlComments } from './backupCheck.js';
import { PII_TABLES } from './retention.js';

// ---- (1) SQL → 표·컬럼 ----

// 컬럼 정의가 아니라 제약 정의로 시작하는 토큰(컬럼명으로 오인 금지).
export const CONSTRAINT_STARTERS = new Set([
  'primary', 'unique', 'foreign', 'check', 'constraint', 'exclude', 'like', 'partition',
]);

function normName(raw) {
  return String(raw || '').replace(/"/g, '').split('.').pop().toLowerCase();
}

// openIdx 위치의 '(' 와 짝이 맞는 ')' 사이를 돌려준다. 문자열 리터럴('...')과 중첩 괄호
// (numeric(10,2) 같은 타입 인자)를 건너뛴다. 짝이 없으면 빈 문자열.
function sliceBalanced(text, openIdx) {
  let depth = 0;
  let inStr = false;
  for (let i = openIdx; i < text.length; i += 1) {
    const c = text[i];
    if (inStr) {
      if (c === "'") {
        if (text[i + 1] === "'") i += 1; // 이스케이프된 따옴표
        else inStr = false;
      }
      continue;
    }
    if (c === "'") { inStr = true; continue; }
    if (c === '(') depth += 1;
    else if (c === ')') {
      depth -= 1;
      if (depth === 0) return text.slice(openIdx + 1, i);
    }
  }
  return '';
}

// 최상위(괄호 깊이 0) 콤마로만 분리한다.
function splitTopLevel(body) {
  const parts = [];
  let cur = '';
  let depth = 0;
  let inStr = false;
  for (let i = 0; i < body.length; i += 1) {
    const c = body[i];
    if (inStr) {
      cur += c;
      if (c === "'") {
        if (body[i + 1] === "'") { cur += body[i + 1]; i += 1; }
        else inStr = false;
      }
      continue;
    }
    if (c === "'") { inStr = true; cur += c; continue; }
    if (c === '(') { depth += 1; cur += c; continue; }
    if (c === ')') { depth -= 1; cur += c; continue; }
    if (c === ',' && depth === 0) { parts.push(cur); cur = ''; continue; }
    cur += c;
  }
  if (cur.trim()) parts.push(cur);
  return parts;
}

// SQL → [{ table, columns[] }] (표·컬럼 모두 사전순·중복 제거).
// `create table` 본문과 `alter table … add column` 을 모두 반영한다.
// 주석 처리된 DDL 은 stripSqlComments 가 먼저 제거하므로 잡히지 않는다(미적용 예시 배제).
// 이상 입력에 throw 하지 않는다.
export function tableColumnsInSql(sql) {
  const text = stripSqlComments(typeof sql === 'string' ? sql : '');
  const out = new Map();
  if (!text) return [];

  const reCreate = /create\s+table\s+(?:if\s+not\s+exists\s+)?([a-zA-Z0-9_."]+)\s*\(/gi;
  let m;
  while ((m = reCreate.exec(text)) !== null) {
    const table = normName(m[1]);
    if (!table) continue;
    const openIdx = m.index + m[0].length - 1;
    const cols = splitTopLevel(sliceBalanced(text, openIdx))
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => normName(s.split(/\s+/)[0]))
      .filter((c) => /^[a-z_][a-z0-9_]*$/.test(c) && !CONSTRAINT_STARTERS.has(c));
    const prev = out.get(table) || [];
    out.set(table, [...new Set([...prev, ...cols])]);
  }

  const reAlter = /alter\s+table\s+(?:if\s+exists\s+)?([a-zA-Z0-9_."]+)\s+add\s+column\s+(?:if\s+not\s+exists\s+)?([a-zA-Z0-9_"]+)/gi;
  while ((m = reAlter.exec(text)) !== null) {
    const table = normName(m[1]);
    const col = normName(m[2]);
    if (!table || !col) continue;
    const prev = out.get(table) || [];
    if (!prev.includes(col)) out.set(table, [...prev, col]);
  }

  return [...out.entries()]
    .map(([table, columns]) => ({ table, columns: [...new Set(columns)].sort() }))
    .sort((a, b) => (a.table < b.table ? -1 : a.table > b.table ? 1 : 0));
}

// ---- (2) 컬럼명 → 개인정보 후보 ----

// 컬럼 **이름**만으로 개인정보 후보를 고른다. 이름은 거짓양성이 날 수 있으므로(예: 시나리오
// 이름) 후보에는 반드시 판단(보호 또는 면제)을 붙이게 하고, 판단이 없는 컬럼만 문제로 본다.
// 이름을 놓치는 쪽보다 넓게 잡는 쪽으로 설계한다.
export const PII_PATTERNS = [
  { kind: '전화번호',       re: /(^|_)(phone|tel|mobile|hp|cell)(_|$)/ },
  { kind: '이메일',         re: /(^|_)(email|mail)(_|$)/ },
  { kind: '주민등록번호',   re: /(^|_)(ssn|rrn|jumin)(_|$)/ },
  { kind: '주소',           re: /(^|_)(addr|address|zipcode|postcode)(_|$)/ },
  { kind: '생년월일',       re: /(^|_)(birth|birthday|birthdate|dob)(_|$)/ },
  { kind: '이름',           re: /(^|_)(name|username)(_|$)/ },
  { kind: 'IP',             re: /(^|_)(ip|ipaddr)(_|$)/ },
  { kind: '계정 식별자',    re: /(^|_)(actor|account|login|user_id|userid)(_|$)/ },
  { kind: '작성자 식별자',  re: /_by$/ },
  { kind: '통화 식별자',    re: /(^|_)(call_id|caller|cli|ani)(_|$)/ },
];

// 컬럼명이 어떤 개인정보 유형으로 보이는지. 아니면 null.
export function piiKindOf(column) {
  const c = String(column || '').toLowerCase();
  if (!c) return null;
  for (const p of PII_PATTERNS) if (p.re.test(c)) return p.kind;
  return null;
}

// 스키마 전체에서 개인정보 후보 컬럼을 뽑는다 → [{ table, column, kind }] (표·컬럼 사전순).
export function piiCandidates(tables) {
  const list = Array.isArray(tables) ? tables : [];
  const out = [];
  for (const t of list) {
    const table = t && typeof t.table === 'string' ? t.table : '';
    const cols = t && Array.isArray(t.columns) ? t.columns : [];
    if (!table) continue;
    for (const column of cols) {
      const kind = piiKindOf(column);
      if (kind) out.push({ table, column, kind });
    }
  }
  return out.sort((a, b) => (a.table + '.' + a.column < b.table + '.' + b.column ? -1 : 1));
}

// ---- (3) 판단(면제) 목록 ----

// 개인정보 후보로 잡혔지만 **파기 대상이 아니라고 판단한** 컬럼과 그 사유.
// 사유 없는 면제는 두지 않는다. 유령 항목(스키마에서 사라진 컬럼)은 테스트가 실패시킨다.
export const PII_EXEMPT = [
  { table: 'audit_events',   column: 'actor',      reason: '적재 시점에 이미 마스킹된 값만 저장(lib/audit.js) — 원문 미보유' },
  { table: 'audit_events',   column: 'ip',         reason: '적재 시점에 이미 마스킹된 값만 저장(lib/audit.js) — 원문 미보유' },
  { table: 'docs',           column: 'name',       reason: '서류 종류 이름(예: 가족관계증명서) — 사람 이름 아님' },
  { table: 'scenarios',      column: 'name',       reason: '시나리오 이름 — 사람 이름 아님' },
  { table: 'scenarios',      column: 'updated_by', reason: '운영자 표시명. 고객 개인정보 아니며 변경 이력 추적에 필요(운영자 퇴사 시 처리는 AUTH_ROLLOUT 계정 회수 절차)' },
];

const key = (t, c) => `${t}.${c}`;

// PII_TABLES 가 실제로 파기하는 (표, 컬럼) 집합.
export function protectedColumns(tables = PII_TABLES) {
  const list = Array.isArray(tables) ? tables : [];
  return new Set(list.filter((t) => t && t.table && t.piiCol).map((t) => key(t.table, t.piiCol)));
}

// 스키마에 있는 개인정보 후보 중 **파기도 면제도 되지 않은** 컬럼. 항상 빈 배열이어야 한다.
export function unprotectedPii(candidates, tables = PII_TABLES, exempt = PII_EXEMPT) {
  const prot = protectedColumns(tables);
  // 사유가 비었거나 공백뿐인 면제는 면제로 인정하지 않는다(형식만 채운 면제 방지).
  const ex = new Set((Array.isArray(exempt) ? exempt : [])
    .filter((e) => e && typeof e.reason === 'string' && e.reason.trim())
    .map((e) => key(e.table, e.column)));
  return (Array.isArray(candidates) ? candidates : [])
    .filter((c) => c && !prot.has(key(c.table, c.column)) && !ex.has(key(c.table, c.column)));
}

// 스키마에 없는데 면제 목록에만 남은 항목(=개명·삭제 후 방치). 항상 빈 배열이어야 한다.
export function staleExempt(candidates, exempt = PII_EXEMPT) {
  const found = new Set((Array.isArray(candidates) ? candidates : []).map((c) => key(c.table, c.column)));
  return (Array.isArray(exempt) ? exempt : []).filter((e) => e && !found.has(key(e.table, e.column)));
}

// 사유가 비어 있는 면제 항목(=근거 없는 면제). 항상 빈 배열이어야 한다.
export function unreasonedExempt(exempt = PII_EXEMPT) {
  return (Array.isArray(exempt) ? exempt : []).filter((e) => !e || typeof e.reason !== 'string' || !e.reason.trim());
}

// PII_TABLES 가 가리키는 표·컬럼·날짜컬럼이 스키마에 실제로 있는지. 없으면 파기문이 조용히
// 실패하거나(존재하지 않는 컬럼) 아무 것도 지우지 않는다. 항상 빈 배열이어야 한다.
export function brokenTargets(schemaTables, tables = PII_TABLES) {
  const map = new Map((Array.isArray(schemaTables) ? schemaTables : []).map((t) => [t.table, new Set(t.columns || [])]));
  const out = [];
  for (const t of Array.isArray(tables) ? tables : []) {
    if (!t || !t.table) continue;
    const cols = map.get(t.table);
    if (!cols) { out.push({ ...t, missing: 'table' }); continue; }
    if (!cols.has(t.piiCol)) { out.push({ ...t, missing: 'piiCol' }); continue; }
    if (!cols.has(t.dateCol)) out.push({ ...t, missing: 'dateCol' });
  }
  return out;
}

// ---- (4) 종합 판정 ----

// 스키마 SQL 묶음(파일 내용 배열) → 파기 정책 정합성 판정.
// blockers 가 있으면 "개인정보 파기 정책이 코드로 보장된다"고 말할 수 없다.
export function scanSchemas(sqlTexts) {
  const merged = (Array.isArray(sqlTexts) ? sqlTexts : [sqlTexts]).filter((s) => typeof s === 'string').join('\n');
  const schemaTables = tableColumnsInSql(merged);
  const candidates = piiCandidates(schemaTables);
  const unprotected = unprotectedPii(candidates);
  const stale = staleExempt(candidates);
  const unreasoned = unreasonedExempt();
  const broken = brokenTargets(schemaTables, PII_TABLES);

  const blockers = [];
  for (const c of unprotected) {
    blockers.push({ code: 'PII_UNPROTECTED', msg: `${c.table}.${c.column}(${c.kind}) 이 파기 대상에도 면제 목록에도 없다` });
  }
  for (const b of broken) {
    blockers.push({ code: 'PII_TARGET_BROKEN', msg: `파기 대상 ${b.table}.${b.piiCol} 의 ${b.missing} 가 스키마에 없다` });
  }
  const warnings = [];
  for (const e of stale) {
    warnings.push({ code: 'PII_EXEMPT_STALE', msg: `면제 항목 ${e.table}.${e.column} 이 스키마에 없다(개명·삭제 후 방치)` });
  }
  for (const e of unreasoned) {
    warnings.push({ code: 'PII_EXEMPT_NO_REASON', msg: `사유 없는 면제 항목: ${e && e.table}.${e && e.column}` });
  }

  return {
    ok: blockers.length === 0,
    schemaTables,
    candidates,
    protected: [...protectedColumns()].sort(),
    exempt: PII_EXEMPT.slice(),
    unprotected,
    blockers,
    warnings,
  };
}

export default scanSchemas;
