// tests/tenantquery.test.mjs — 테넌트 쿼리 계층 가드 (무의존성: node:test)
//
// 지키려는 것(COMMERCIAL_READINESS "2계층 확장 여지 확보")
//   1) 범위를 **말하지 않으면 질의가 만들어지지 않는다** — scope 누락은 전체가 아니라 빈 결과.
//   2) 표·컬럼·정렬키는 등록부 화이트리스트에서만 나오고, 값은 전부 바인딩 파라미터다.
//   3) 파트너 id 형식이 아닌 범위값은 **빈 결과**로 닫힌다(판정 실패 → 전체 공개 금지).
//   4) 이 계층을 **우회해 테넌트 표를 직접 조회하는 소스가 하나도 없다**(통합 스캔).
//   5) 등록부 ↔ db/partner.sql 실선언 양방향 대조 — 표·컬럼이 늘거나 줄면 여기서 실패한다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  TENANT_TABLES, tenantTableNames, isTenantTable, tenantSelect, selectTenantRows, MAX_LIMIT, SCOPE_NONE,
} from '../lib/tenantQuery.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

// ── 1) 범위 규약 ──────────────────────────────────────────────────────────
test('scope 를 빠뜨리면 전체가 아니라 빈 결과다(SCOPE_REQUIRED)', () => {
  const q = tenantSelect('organizations', {});
  assert.ok(q.problems.some((p) => p.code === 'SCOPE_REQUIRED'));
  assert.match(q.text, /where false/);
  assert.deepEqual(q.params, []);
});

test('opts 자체를 안 넘겨도 throw 하지 않고 빈 결과다', () => {
  const q = tenantSelect('organizations');
  assert.ok(q.problems.some((p) => p.code === 'SCOPE_REQUIRED'));
  assert.match(q.text, /where false/);
});

test('scope:null 은 전체 — where true, 바인딩 값 없음', () => {
  const q = tenantSelect('organizations', { scope: null });
  assert.deepEqual(q.problems, []);
  assert.match(q.text, /from organizations where true order by id asc$/);
  assert.deepEqual(q.params, []);
});

test('파트너 id 는 표별 규칙으로 좁힌다(direct · self · viaOrg)', () => {
  const org = tenantSelect('organizations', { scope: 'P-001' });
  assert.match(org.text, /where partner_id = \$1 /);
  assert.deepEqual(org.params, ['P-001']);

  const pt = tenantSelect('partners', { scope: 'P-001' });
  assert.match(pt.text, /from partners where id = \$1 /);
  assert.deepEqual(pt.params, ['P-001']);

  const at = tenantSelect('partner_attributions', { scope: 'P-001' });
  assert.match(at.text, /where org_id in \(select id from organizations where partner_id = \$1\) /);
  assert.deepEqual(at.params, ['P-001']);
});

test('범위 판정 실패값(빈 문자열·형식 불량·비문자열)은 모두 빈 결과', () => {
  // 'P-1' 은 **유효**하다(3자 하한) — 형식 규칙을 오해한 기대값을 넣지 않도록 여기 적어 둔다.
  for (const bad of [SCOPE_NONE, 'p-001', '  ', 'P0', 'ORG-001;drop', 7, {}, [], true, undefined]) {
    const q = tenantSelect('organizations', { scope: bad });
    assert.match(q.text, /where false/, `scope=${String(bad)} 가 닫히지 않았다`);
    assert.deepEqual(q.params, [], `scope=${String(bad)} 에서 값이 바인딩됐다`);
  }
});

test('등록되지 않은 표는 이름조차 질의에 넣지 않는다', () => {
  for (const t of ['users', 'visual_sessions', 'organizations; drop table x', '', null, 42]) {
    const q = tenantSelect(t, { scope: null });
    assert.equal(q.problems[0].code, 'TABLE_UNKNOWN');
    assert.equal(q.text, 'select 1 where false');
    assert.ok(!q.text.includes(String(t)) || String(t) === '', '표 이름이 질의에 새어 들어갔다');
  }
});

// ── 2) 컬럼·정렬 화이트리스트 ────────────────────────────────────────────
test('허용 컬럼만 통과하고, 모르는 컬럼은 버려진다', () => {
  const q = tenantSelect('organizations', { scope: null, columns: ['id', 'name', 'secret_memo'] });
  assert.ok(q.problems.some((p) => p.code === 'COLUMN_UNKNOWN'));
  assert.ok(!q.text.includes('secret_memo'));
});

test('컬럼 지정이 전부 무효면 기본 컬럼으로 되돌리되 fail-closed 로 닫는다', () => {
  const q = tenantSelect('organizations', { scope: null, columns: ['nope'] });
  assert.ok(q.problems.some((p) => p.code === 'COLUMNS_EMPTY'));
  assert.match(q.text, /where false/);
});

test('정렬키는 화이트리스트 밖이면 표 기본 정렬로 되돌린다', () => {
  const bad = tenantSelect('organizations', { scope: null, orderBy: 'name; drop table organizations' });
  assert.ok(bad.problems.some((p) => p.code === 'ORDER_UNKNOWN'));
  assert.ok(!bad.text.includes('drop'));
  const good = tenantSelect('organizations', { scope: null, orderBy: 'contracted_at desc' });
  assert.deepEqual(good.problems, []);
  assert.match(good.text, /order by contracted_at desc$/);
});

test('limit·offset 은 정수만·상한 클램프되고 값은 바인딩된다', () => {
  const q = tenantSelect('organizations', { scope: 'P-001', limit: 9999, offset: -5 });
  assert.match(q.text, /limit \$2 offset \$3$/);
  assert.deepEqual(q.params, ['P-001', MAX_LIMIT, 0]);
  const bad = tenantSelect('organizations', { scope: null, limit: '10' });
  assert.ok(bad.problems.some((p) => p.code === 'LIMIT_INVALID'));
});

test('값은 어떤 경우에도 SQL 문자열에 결합되지 않는다', () => {
  const q = tenantSelect('organizations', { scope: 'P-001', limit: 3, offset: 2 });
  for (const v of ['P-001', '3', '2']) assert.ok(!q.text.includes(`'${v}'`), '값이 리터럴로 들어갔다');
  assert.ok(!/=\s*[A-Z0-9-]+\s/.test(q.text.replace(/\$\d+/g, '')), '식별자 우변에 상수가 결합됐다');
});

// ── 3) 실행 헬퍼 ─────────────────────────────────────────────────────────
test('selectTenantRows 는 sql 에 (text, params) 를 그대로 넘기고 배열을 보장한다', async () => {
  const calls = [];
  const io = { sql: (text, params) => { calls.push([text, params]); return [{ id: 'ORG-001' }]; }, safe: (run) => run() };
  const rows = await selectTenantRows(io, 'organizations', { scope: 'P-001', columns: ['id'] });
  assert.deepEqual(rows, [{ id: 'ORG-001' }]);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0][1], ['P-001']);
});

test('selectTenantRows 는 DB 오류·비배열·io 누락에도 빈 배열을 돌려준다(무throw)', async () => {
  const boom = { sql: () => { throw new Error('no table'); }, safe: async (run, fb) => { try { return await run(); } catch { return fb; } } };
  assert.deepEqual(await selectTenantRows(boom, 'organizations', { scope: null }), []);
  const weird = { sql: () => null, safe: (run) => run() };
  assert.deepEqual(await selectTenantRows(weird, 'organizations', { scope: null }), []);
  assert.deepEqual(await selectTenantRows(null, 'organizations', { scope: null }), []);
  assert.deepEqual(await selectTenantRows({}, 'organizations', { scope: null }), []);
});

test('등록부는 복사본이 아니라 동결이라 밖에서 못 바꾼다', () => {
  assert.throws(() => { TENANT_TABLES.organizations = null; }, /./);
  assert.deepEqual(tenantTableNames(), ['organizations', 'partner_attributions', 'partners']);
  assert.equal(isTenantTable('organizations'), true);
  assert.equal(isTenantTable('visual_sessions'), false);
});

// ── 4) 우회 금지 스캔(통합) ──────────────────────────────────────────────
// 테넌트 표를 SQL 로 직접 건드리는 소스는 쿼리 계층 하나뿐이어야 한다.
// 사유 있는 예외만 아래에 적고, **유령 예외**(파일이 사라졌는데 목록에 남음)도 실패시킨다.
const BYPASS_EXEMPT = Object.freeze({
  'lib/tenantQuery.js': '쿼리 계층 본체 — 테넌트 표를 아는 유일한 지점',
});

function sourceFiles(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.next' || entry === '.git') continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) sourceFiles(full, out);
    else if (/\.(js|jsx|mjs)$/.test(entry)) out.push(full);
  }
  return out;
}

const SCANNED = [...sourceFiles(path.join(ROOT, 'app')), ...sourceFiles(path.join(ROOT, 'lib'))].map((f) => ({
  name: path.relative(ROOT, f).split(path.sep).join('/'),
  src: readFileSync(f, 'utf8'),
}));

// from/join/into/update + 테넌트 표 이름. 주석 안의 언급도 걸리지만, 그 편이 안전하다
// (주석이라도 "여기서 직접 읽는다"는 신호이므로 사람이 확인하게 만든다).
const TENANT_SQL_RE = new RegExp(`\\b(?:from|join|into|update)\\s+(?:${tenantTableNames().join('|')})\\b`, 'i');

test('스캔 대상 소스가 실제로 수집된다(빈 배열 통과 사고 방지)', () => {
  assert.ok(SCANNED.length >= 60, `스캔된 소스가 너무 적다: ${SCANNED.length}`);
});

test('쿼리 계층을 우회해 테넌트 표를 조회하는 소스가 없다', () => {
  const offenders = SCANNED.filter((f) => TENANT_SQL_RE.test(f.src) && !(f.name in BYPASS_EXEMPT)).map((f) => f.name);
  assert.deepEqual(offenders, [], `테넌트 표 직접 조회 — lib/tenantQuery 를 거쳐야 한다: ${offenders.join(', ')}`);
});

test('우회 예외 목록에 유령 항목이 없다(파일 존재 + 실제로 해당 표를 다룸)', () => {
  const byName = new Map(SCANNED.map((f) => [f.name, f.src]));
  for (const [name, reason] of Object.entries(BYPASS_EXEMPT)) {
    assert.ok(byName.has(name), `예외에 적힌 파일이 없다: ${name}`);
    assert.ok(reason && reason.length > 5, `예외 사유가 비었다: ${name}`);
    assert.ok(TENANT_SQL_RE.test(byName.get(name)), `더 이상 테넌트 표를 다루지 않는 낡은 예외: ${name}`);
  }
});

test('정산 라우트가 쿼리 계층과 범위 판정을 실제로 쓴다', () => {
  const src = readFileSync(path.join(ROOT, 'app/api/admin/settlement/route.js'), 'utf8');
  assert.match(src, /selectTenantRows/, '쿼리 계층을 쓰지 않는다');
  assert.match(src, /viewerScope\s*\(/, '범위를 요청자에게서 받지 않는다');
  assert.ok(!/\bsql`/.test(src), '태그드 템플릿 직접 조회가 남아 있다');
});

// ── 5) 등록부 ↔ 스키마 양방향 대조 ───────────────────────────────────────
// db/partner.sql 이 진짜 정의다. 표가 늘거나 컬럼이 바뀌면 등록부도 함께 고치도록 강제한다.
function tablesFromSql(sqlText) {
  const stripped = sqlText.replace(/--[^\n]*/g, '');
  const out = {};
  const re = /create\s+table\s+if\s+not\s+exists\s+([a-z_]+)\s*\(([\s\S]*?)\n\);/gi;
  let m;
  while ((m = re.exec(stripped))) {
    const cols = [];
    for (const raw of m[2].split('\n')) {
      const line = raw.trim();
      if (!line || /^(check|primary|unique|foreign|constraint)\b/i.test(line)) continue;
      const c = line.match(/^([a-z_][a-z0-9_]*)\s+/i);
      if (c) cols.push(c[1]);
    }
    out[m[1]] = cols;
  }
  return out;
}

const SCHEMA = tablesFromSql(readFileSync(path.join(ROOT, 'db/partner.sql'), 'utf8'));

test('스키마 파서가 세 표를 모두 찾아낸다', () => {
  assert.deepEqual(Object.keys(SCHEMA).sort(), ['organizations', 'partner_attributions', 'partners']);
});

test('등록부의 표·컬럼이 db/partner.sql 실선언과 정확히 일치한다', () => {
  assert.deepEqual(tenantTableNames(), Object.keys(SCHEMA).sort(), '등록부와 스키마의 표 목록이 다르다');
  for (const [name, spec] of Object.entries(TENANT_TABLES)) {
    assert.deepEqual(
      spec.columns.slice().sort(), SCHEMA[name].slice().sort(),
      `${name} 컬럼이 스키마와 어긋난다 — 등록부를 갱신해야 한다`,
    );
    assert.ok(spec.columns.includes(spec.defaultOrder), `${name} 기본 정렬키가 컬럼에 없다`);
    const sc = spec.scope;
    assert.ok(SCHEMA[name].includes(sc.column), `${name} 범위 컬럼 ${sc.column} 이 스키마에 없다`);
    assert.ok(['direct', 'self', 'viaOrg'].includes(sc.kind), `${name} 범위 종류가 미지의 값이다`);
  }
});

test('쿼리 계층은 쓰기 SQL 을 만들지 않는다(select 전용)', () => {
  const src = readFileSync(path.join(ROOT, 'lib/tenantQuery.js'), 'utf8');
  const body = src.replace(/\/\/[^\n]*/g, '');
  for (const kw of ['insert into', 'update ', 'delete from', 'drop ', 'alter ']) {
    assert.ok(!body.toLowerCase().includes(kw), `쓰기 SQL 키워드가 들어 있다: ${kw}`);
  }
});
