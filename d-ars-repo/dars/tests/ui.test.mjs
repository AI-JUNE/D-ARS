// tests/ui.test.mjs — UI 표시 유틸 단위 테스트 (무의존성)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pct, fmt, fmtDur, tagClass, NODE_TYPES, journey, stepLabel, compareVals, sortRows, fmtDay, fmtTime, fmtMD, finiteNums, meterLabel, trendLabel, barsLabel } from '../lib/ui.js';

test('pct: 정상 계산(반올림)', () => {
  assert.equal(pct(1, 2), 50);
  assert.equal(pct(1, 3), 33);
  assert.equal(pct(2, 3), 67);
});

test('pct: 분모 0이면 0 (0 나누기 방지)', () => {
  assert.equal(pct(5, 0), 0);
  assert.equal(pct(0, 0), 0);
});

test('pct: 깨진 입력 방어(NaN%/음수% 누출 차단, 하위호환 유지)', () => {
  // 유효 입력은 기존과 100% 동일(하위호환)
  assert.equal(pct(1, 4), 25);
  assert.equal(pct(3, 4), 75);
  // 분자 누락/비수치 → Math.round(NaN)=NaN 누출 대신 0
  assert.equal(pct(undefined, 10), 0);
  assert.equal(pct(null, 10), 0);
  assert.equal(pct('x', 10), 0);
  assert.equal(pct(NaN, 10), 0);
  // 분모 누락/비수치/음수 → 0 ('NaN%'·음수% 방지)
  assert.equal(pct(5, undefined), 0);
  assert.equal(pct(5, null), 0);
  assert.equal(pct(5, 'x'), 0);
  assert.equal(pct(5, -10), 0);
  // 비유한(Infinity)도 0
  assert.equal(pct(Infinity, 10), 0);
  assert.equal(pct(5, Infinity), 0);
  // 숫자 문자열은 기존처럼 계산(Number 강제변환 하위호환)
  assert.equal(pct('1', '2'), 50);
});

test('fmt: 초를 mm:ss로 (0 패딩)', () => {
  assert.equal(fmt(65), '01:05');
  assert.equal(fmt(5), '00:05');
  assert.equal(fmt(600), '10:00');
  assert.equal(fmt(0), '00:00');
  assert.equal(fmt(3599), '59:59'); // 1시간 직전은 여전히 mm:ss(하위호환)
});

test('fmt: 1시간 이상은 h:mm:ss (장기 세션 분/초 혼동 해소)', () => {
  assert.equal(fmt(3600), '1:00:00');
  assert.equal(fmt(3661), '1:01:01');
  assert.equal(fmt(4530), '1:15:30'); // 이전엔 "75:30"으로 혼동
  assert.equal(fmt(36000), '10:00:00');
});

test('fmtDur: 1시간 미만은 "N분 N초"(알림 기존 표기 하위호환)', () => {
  assert.equal(fmtDur(200), '3분 20초');   // 기존 알림 표기와 동일
  assert.equal(fmtDur(30), '0분 30초');
  assert.equal(fmtDur(3599), '59분 59초');  // 1시간 직전
});

test('fmtDur: 1시간 이상은 "N시간 N분 N초" (장기 세션 명확화)', () => {
  assert.equal(fmtDur(3600), '1시간 0분 0초');
  assert.equal(fmtDur(7530), '2시간 5분 30초'); // 이전엔 "125분 30초"로 혼동
  assert.equal(fmtDur(36061), '10시간 1분 1초');
});

test('fmtDur: 잘못된 입력은 방어적으로 "0초"', () => {
  assert.equal(fmtDur(0), '0초');
  assert.equal(fmtDur(-5), '0초');
  assert.equal(fmtDur(NaN), '0초');
  assert.equal(fmtDur(Infinity), '0초');
  assert.equal(fmtDur(undefined), '0초');
  assert.equal(fmtDur(90.9), '1분 30초'); // 소수 초는 내림
});

test('fmt: 잘못된 입력은 방어적으로 00:00 (깨진 값 노출 방지)', () => {
  assert.equal(fmt(-5), '00:00');
  assert.equal(fmt(NaN), '00:00');
  assert.equal(fmt(Infinity), '00:00');
  assert.equal(fmt(undefined), '00:00');
  assert.equal(fmt(12.9), '00:12'); // 소수 초는 내림
});

test('tagClass: 알려진 상태 매핑', () => {
  assert.equal(tagClass('운영'), 't-ok');
  assert.equal(tagClass('실패'), 't-bad');
  assert.equal(tagClass('대기'), 't-warn');
  assert.equal(tagClass('진행'), 't-info');
});

test('tagClass: 미지의 상태는 기본값 t-mut', () => {
  assert.equal(tagClass('없는상태'), 't-mut');
  assert.equal(tagClass(undefined), 't-mut');
});

test('NODE_TYPES/journey: 핵심 구조 상수 존재', () => {
  assert.ok(NODE_TYPES.VISUAL_LAUNCH);
  assert.equal(NODE_TYPES.END.name, '종료');
  assert.equal(journey.length, 5);
});

test('stepLabel: 유효 인덱스는 journey 와 100% 동일(하위호환)', () => {
  assert.equal(stepLabel(0), '런칭');
  assert.equal(stepLabel(2), '상담');
  assert.equal(stepLabel(4), '완료');
  journey.forEach((label, i) => assert.equal(stepLabel(i), label));
  assert.equal(stepLabel('3'), '안내·발송'); // 숫자 문자열도 정상(느슨한 데이터 방어)
});

test('stepLabel: 범위 밖·undefined·비정수는 방어적으로 "—"', () => {
  assert.equal(stepLabel(5), '—');     // 상한 초과
  assert.equal(stepLabel(-1), '—');    // 음수
  assert.equal(stepLabel(undefined), '—');
  assert.equal(stepLabel(null), '—');
  assert.equal(stepLabel(NaN), '—');
  assert.equal(stepLabel('x'), '—');   // 파싱 불가 문자열
  assert.equal(stepLabel(2.5), '상담'); // 소수는 내림(Math.trunc)
});

test('compareVals: 두 값이 숫자면 수치 비교', () => {
  assert.ok(compareVals(2, 10) < 0);        // 2 < 10 (문자열 정렬이면 반대가 됨)
  assert.ok(compareVals(10, 2) > 0);
  assert.equal(compareVals(5, 5), 0);
});

test('compareVals: 문자열은 한글·숫자 자연 정렬', () => {
  assert.ok(compareVals('가', '나') < 0);
  assert.ok(compareVals('항목2', '항목10') < 0);  // numeric:true → 2 < 10
  assert.ok(compareVals('A2', 'A10') < 0);
});

test('compareVals: null/undefined 안전(빈 문자열 취급)', () => {
  assert.equal(compareVals(null, null), 0);
  assert.equal(compareVals(undefined, ''), 0);
  assert.ok(compareVals(null, '가') < 0);   // '' < '가'
});

test('sortRows: sort 없거나 key 없으면 원본 그대로', () => {
  const rows = [{ n: 3 }, { n: 1 }, { n: 2 }];
  assert.equal(sortRows(rows, null), rows);
  assert.equal(sortRows(rows, {}), rows);
});

test('sortRows: 오름/내림 정렬 + 원본 불변', () => {
  const rows = [{ n: 3 }, { n: 1 }, { n: 2 }];
  const asc = sortRows(rows, { key: 'n', dir: 'asc' });
  assert.deepEqual(asc.map(r => r.n), [1, 2, 3]);
  const desc = sortRows(rows, { key: 'n', dir: 'desc' });
  assert.deepEqual(desc.map(r => r.n), [3, 2, 1]);
  assert.deepEqual(rows.map(r => r.n), [3, 1, 2]); // 원본 불변
});

test('sortRows: val 함수로 파생 키 정렬(예: 완료율)', () => {
  const rows = [{ done: 1, req: 2 }, { done: 9, req: 10 }, { done: 1, req: 4 }];
  const val = (r, k) => k === 'rate' ? pct(r.done, r.req) : r[k];
  const asc = sortRows(rows, { key: 'rate', dir: 'asc' }, val);
  assert.deepEqual(asc.map(r => pct(r.done, r.req)), [25, 50, 90]);
});

test('sortRows: 안정 정렬(동률 시 입력 순서 유지)', () => {
  const rows = [{ n: 1, id: 'a' }, { n: 1, id: 'b' }, { n: 1, id: 'c' }];
  const asc = sortRows(rows, { key: 'n', dir: 'asc' });
  assert.deepEqual(asc.map(r => r.id), ['a', 'b', 'c']);
});

test('fmtDay: 유효 날짜 문자열은 앞 10자 그대로(하위호환)', () => {
  assert.equal(fmtDay('2026-07-23'), '2026-07-23');
  assert.equal(fmtDay('2026-07-23T05:13:00.000Z'), '2026-07-23'); // ISO 타임스탬프 → 날짜만
  assert.equal(fmtDay('2026-01-01 09:00'), '2026-01-01');
});

test('fmtDay: Date 객체는 ISO 날짜로(toString "Thu Jul 23" 오표기 방지)', () => {
  assert.equal(fmtDay(new Date('2026-07-23T00:00:00Z')), '2026-07-23');
});

test('fmtDay: null/undefined/Invalid/형식오류는 방어적으로 "—"', () => {
  assert.equal(fmtDay(null), '—');
  assert.equal(fmtDay(undefined), '—');
  assert.equal(fmtDay(''), '—');
  assert.equal(fmtDay('없음'), '—');
  assert.equal(fmtDay(new Date('nope')), '—'); // Invalid Date
  assert.equal(fmtDay('2026/07/23'), '—');     // 슬래시 구분자는 규격 아님
});

test('fmtMD: 유효 날짜 키는 MM-DD(기존 slice(5) 표기와 동일 — 하위호환)', () => {
  assert.equal(fmtMD('2026-07-23'), '07-23');
  assert.equal(fmtMD('2026-07-23T05:13:00.000Z'), '07-23'); // ISO 타임스탬프 → 월-일
  assert.equal(fmtMD('2026-01-01 09:00'), '01-01');
  assert.match(fmtMD('2026-12-31'), /^\d{2}-\d{2}$/);
});

test('fmtMD: null/undefined/Invalid/형식오류는 방어적으로 "—"("ined"·"" 누출 방지)', () => {
  assert.equal(fmtMD(undefined), '—'); // "undefined".slice(5)='ined' 로 새던 케이스
  assert.equal(fmtMD(null), '—');      // "null".slice(5)='' 로 새던 케이스
  assert.equal(fmtMD(''), '—');
  assert.equal(fmtMD('없음'), '—');
  assert.equal(fmtMD(new Date('nope')), '—'); // Invalid Date
  assert.equal(fmtMD('2026/07/23'), '—');     // 슬래시 구분자는 규격 아님
});

test('fmtTime: 유효 입력은 로컬 HH:MM(기존 getHours/toTimeString 표기와 동일 — 하위호환)', () => {
  const d = new Date(2026, 6, 23, 9, 5, 12); // 로컬 09:05:12
  const expect = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  assert.equal(fmtTime(d), expect);
  assert.equal(fmtTime(d), fmtTime(d.getTime())); // Date·타임스탬프 동일 결과
  assert.match(fmtTime(d), /^\d{2}:\d{2}$/);      // 항상 두 자리:두 자리
});

test('fmtTime: null/undefined/빈문자/Invalid Date는 방어적으로 "—"(NaN:NaN·"Inval" 누출 방지)', () => {
  assert.equal(fmtTime(null), '—');
  assert.equal(fmtTime(undefined), '—');
  assert.equal(fmtTime(''), '—');
  assert.equal(fmtTime('not-a-date'), '—');       // /ums 이 "Inval"로 새던 케이스
  assert.equal(fmtTime(new Date('nope')), '—');   // Invalid Date → /history 가 "NaN:NaN"으로 새던 케이스
});

test('finiteNums: 유효한 유한 숫자 배열은 그대로(하위호환 — Number(v)=항등)', () => {
  assert.deepEqual(finiteNums([0, 1, 2.5, -3, 100]), [0, 1, 2.5, -3, 100]);
  assert.deepEqual(finiteNums(['1', '2', '3']), [1, 2, 3]); // 숫자 문자열은 수치로
  assert.deepEqual(finiteNums([]), []);
});

test('finiteNums: 비유한 요소(null/undefined/NaN/Infinity/비수치문자)는 0으로 방어(SVG path "NaN" 누출 차단)', () => {
  assert.deepEqual(finiteNums([1, null, 2]), [1, 0, 2]);
  assert.deepEqual(finiteNums([undefined, NaN, Infinity, -Infinity]), [0, 0, 0, 0]);
  assert.deepEqual(finiteNums([5, 'x', 7]), [5, 0, 7]);
  // 하나라도 섞이면 Math.max 가 NaN 이 되던 케이스 → 방어 후엔 유한
  const D = finiteNums([10, null, 30]);
  assert.ok(Number.isFinite(Math.max(...D)));
});

test('finiteNums: 배열이 아니면 빈 배열(방어)', () => {
  assert.deepEqual(finiteNums(null), []);
  assert.deepEqual(finiteNums(undefined), []);
  assert.deepEqual(finiteNums('nope'), []);
  assert.deepEqual(finiteNums(123), []);
});

test('meterLabel: 값·총계·접미가 있으면 라벨+건수+퍼센트(스크린리더용)', () => {
  assert.equal(meterLabel('완료', 12, 16, '건'), '완료 12/16건 (75%)');
  assert.equal(meterLabel('문자 발송', 5, 10), '문자 발송 5/10 (50%)');
  // 퍼센트는 방어 헬퍼 pct 와 동일(반올림)
  assert.equal(meterLabel('주문상세', 2, 3), '주문상세 2/3 (67%)');
});

test('meterLabel: 총계 없음/비유한이면 건수 생략(퍼센트만·0 방어)', () => {
  // total 이 0/undefined/null 이면 pct=0 이고 건수 표기 생략
  assert.equal(meterLabel('대기', 5, 0), '대기 (0%)');
  assert.equal(meterLabel('실패', 3, undefined), '실패 (0%)');
  assert.equal(meterLabel('이탈', 1, null), '이탈 (0%)');
  // 비수치 값도 방어적으로 0%
  assert.equal(meterLabel('오류', 'x', 'y'), '오류 (0%)');
});

test('meterLabel: 라벨이 비면 퍼센트만(앞 공백 없음)', () => {
  assert.equal(meterLabel('', 3, 4), '3/4 (75%)');
  assert.equal(meterLabel(null, 1, 2), '1/2 (50%)');
  assert.equal(meterLabel(undefined, 0, 0), '0%');
  // 라벨 앞뒤 공백은 트림
  assert.equal(meterLabel('  완료  ', 1, 1), '완료 1/1 (100%)');
});

test('trendLabel: 구간 수·최소·최대·최신을 요약(AreaChart 스크린리더용)', () => {
  assert.equal(trendLabel([3, 42, 40]), '추이 그래프, 3개 구간, 최소 3, 최대 42, 최신 40');
  // 단위 접미(각 수치 뒤)
  assert.equal(trendLabel([10, 5, 8], '건'), '추이 그래프, 3개 구간, 최소 5건, 최대 10건, 최신 8건');
  // 천단위 콤마(ko-KR)
  assert.equal(trendLabel([1000, 4182]), '추이 그래프, 2개 구간, 최소 1,000, 최대 4,182, 최신 4,182');
});

test('trendLabel: 비유한 값은 0 방어, 빈/비배열은 정적 라벨 폴백(하위호환)', () => {
  // finiteNums 로 null/NaN → 0 (막대·라인 렌더와 동일 규칙)
  assert.equal(trendLabel([5, null, NaN]), '추이 그래프, 3개 구간, 최소 0, 최대 5, 최신 0');
  assert.equal(trendLabel([]), '추이 그래프');
  assert.equal(trendLabel(null), '추이 그래프');
  assert.equal(trendLabel('nope'), '추이 그래프');
  // 단일 포인트
  assert.equal(trendLabel([7]), '추이 그래프, 1개 구간, 최소 7, 최대 7, 최신 7');
});

test('barsLabel: 계열별 합계를 요약(GroupedBars 스크린리더용)', () => {
  const data = [{ day: '01', a: 3, b: 1 }, { day: '02', a: 5, b: 2 }];
  const series = [{ key: 'a', label: '멀티모달' }, { key: 'b', label: '이탈' }];
  assert.equal(barsLabel(data, series), '일별 막대 그래프, 2일, 멀티모달 8, 이탈 3');
  // label 없으면 key 로 폴백, 값은 Number()||0 방어
  assert.equal(barsLabel([{ x: '5' }, { x: null }, { x: 'z' }], [{ key: 'x' }]), '일별 막대 그래프, 3일, x 5');
});

test('barsLabel: data/series 비거나 비배열이면 정적 라벨 폴백(하위호환)', () => {
  assert.equal(barsLabel([], [{ key: 'a' }]), '일별 막대 그래프');
  assert.equal(barsLabel([{ a: 1 }], []), '일별 막대 그래프');
  assert.equal(barsLabel(null, null), '일별 막대 그래프');
  assert.equal(barsLabel('x', 'y'), '일별 막대 그래프');
});
