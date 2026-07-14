// lib/aggregate.js — 목록 화면 서버 집계 공통 유틸 (React·DB 비의존 순수 함수 → 단위 테스트 가능)
//
// 배경: history(멀티모달 이력) 화면의 KPI(완료율·이탈·평균 소요)·결과 도넛·채널 분포가
//       "화면에 로드된 행"만으로 계산돼, 서버 페이징("더 보기")으로 전환하면 수치가 왜곡된다.
//       → 서버가 전체 조건(채널·검색어)에 대해 집계한 값을 내려주고, 화면은 그것을 그대로 쓴다.
// 개인정보·인증·과금 로직과 무관(읽기 전용 집계).

// 집계 결과 표준 형태: { total, byResult:{[결과]:건수}, byChannel:[{name,count}], avgDuration }
export function emptyAgg() {
  return { total: 0, byResult: {}, byChannel: [], avgDuration: 0 };
}

// 채널 분포 정렬: 건수 내림차순 → 동수는 이름 오름차순(한글 자연 정렬)로 안정화.
function sortChannels(map) {
  return [...map.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || String(a.name).localeCompare(String(b.name), 'ko'));
}

function finish(total, byResult, chMap, durSum) {
  return {
    total,
    byResult,
    byChannel: sortChannels(chMap),
    avgDuration: total ? Math.round(durSum / total) : 0,
  };
}

// 메모리 배열(데모 폴백) 집계.
export function aggregateRows(rows) {
  const list = Array.isArray(rows) ? rows : [];
  const byResult = {};
  const chMap = new Map();
  let durSum = 0;
  for (const r of list) {
    const res = r?.result ?? '기타';
    byResult[res] = (byResult[res] || 0) + 1;
    const ch = r?.channel ?? '기타';
    chMap.set(ch, (chMap.get(ch) || 0) + 1);
    const d = Number(r?.duration);
    if (Number.isFinite(d)) durSum += d;
  }
  return finish(list.length, byResult, chMap, durSum);
}

// DB group-by 결과 집계: [{ result, channel, n, dur }] → 표준 형태.
export function foldGroups(groups) {
  const g = Array.isArray(groups) ? groups : [];
  const byResult = {};
  const chMap = new Map();
  let durSum = 0;
  let total = 0;
  for (const row of g) {
    const n = Number(row?.n) || 0;
    const dur = Number(row?.dur) || 0;
    total += n;
    durSum += dur;
    const res = row?.result ?? '기타';
    byResult[res] = (byResult[res] || 0) + n;
    const ch = row?.channel ?? '기타';
    chMap.set(ch, (chMap.get(ch) || 0) + n);
  }
  return finish(total, byResult, chMap, durSum);
}

// 특정 결과의 건수(없으면 0).
export function aggCount(agg, name) {
  const v = agg && agg.byResult ? agg.byResult[name] : 0;
  return Number.isFinite(Number(v)) ? Number(v) : 0;
}

// 클라이언트 응답 정규화 — 형식이 어긋나도 화면이 깨지지 않게 기본값으로 수렴.
export function readAgg(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return emptyAgg();
  const total = Number.isFinite(Number(data.total)) ? Number(data.total) : 0;
  const byResult = data.byResult && typeof data.byResult === 'object' && !Array.isArray(data.byResult) ? data.byResult : {};
  const byChannel = Array.isArray(data.byChannel)
    ? data.byChannel.filter((c) => c && c.name != null).map((c) => ({ name: c.name, count: Number(c.count) || 0 }))
    : [];
  const avgDuration = Number.isFinite(Number(data.avgDuration)) ? Number(data.avgDuration) : 0;
  return { total, byResult, byChannel, avgDuration };
}

// 집계 요청 URL 조립(목록과 동일한 조건 파라미터 + agg=1). 빈 값·'전체'는 생략.
export function aggUrl(base, { q = '', params = {} } = {}) {
  const sp = new URLSearchParams();
  const kw = String(q || '').trim();
  if (kw) sp.set('q', kw);
  for (const [k, v] of Object.entries(params || {})) {
    if (v == null || v === '' || v === '전체') continue;
    sp.set(k, String(v));
  }
  sp.set('agg', '1');
  return `${base}?${sp.toString()}`;
}
