// lib/services.js — 서비스별 운영 집계 공통 유틸 (React·DB 비의존 순수 함수 → 단위 테스트 가능)
//
// 배경: `/api/stats` 의 `services`(서비스별 발송·자동런칭·문자발송·이탈·완료) 배열이 라우트에
//       **하드코딩 상수**로 박혀 있어 실제 운영 데이터와 무관한 숫자를 보여줬다.
//       → 멀티모달 로그(multimodal_log)와 문자 발송 로그(ums_log)를 `group by service` 로 집계해 실측화.
//
// 표준 행 형태: { name, sent, launch, sms, drop, done }
//   sent   = 해당 서비스의 멀티모달 상호작용 건수(완료율 분모)
//   launch = 자동 런칭(node = VISUAL_LAUNCH) 건수
//   sms    = 문자 발송 건수 — UMS 실발송(status='발송완료')이 있으면 실측치, 없으면 로그 채널('문자 발송') 건수
//   drop   = result='이탈' 건수
//   done   = result='완료' 건수
// 개인정보(전화번호)는 집계 대상이 아니다(읽기 전용·비PII 필드만 사용).

export const LAUNCH_NODE = 'VISUAL_LAUNCH';
export const SMS_CHANNEL = '문자 발송';
export const SMS_SENT_STATUS = '발송완료';
export const RESULT_DROP = '이탈';
export const RESULT_DONE = '완료';

const num = (v) => {
  const x = Number(v);
  return Number.isFinite(x) && x > 0 ? Math.floor(x) : 0;
};

const arr = (v) => (Array.isArray(v) ? v : []);

function bucket(map, name) {
  const key = name == null || name === '' ? '기타' : String(name);
  if (!map.has(key)) map.set(key, { name: key, sent: 0, launch: 0, drop: 0, done: 0, smsMm: 0, smsUms: 0 });
  return map.get(key);
}

// 내부 버킷 → 표준 행 배열. 건수 내림차순 → 동수는 이름 오름차순(한글 자연 정렬)으로 안정화.
function finish(map) {
  return [...map.values()]
    .map((b) => ({
      name: b.name,
      sent: b.sent,
      launch: b.launch,
      // UMS 실발송이 잡히면 그것이 사실상의 문자 발송 건수. 없으면 멀티모달 채널 로그로 폴백.
      sms: b.smsUms || b.smsMm,
      drop: b.drop,
      done: b.done,
    }))
    .sort((a, b) => b.sent - a.sent || String(a.name).localeCompare(String(b.name), 'ko'));
}

// 메모리 행 집계(데모 폴백용): 멀티모달 로그 행 + UMS 로그 행.
export function aggregateServiceRows(mmRows, umsRows) {
  const map = new Map();
  for (const r of arr(mmRows)) {
    const b = bucket(map, r?.service);
    b.sent += 1;
    if (r?.node === LAUNCH_NODE) b.launch += 1;
    if (r?.channel === SMS_CHANNEL) b.smsMm += 1;
    if (r?.result === RESULT_DROP) b.drop += 1;
    if (r?.result === RESULT_DONE) b.done += 1;
  }
  for (const r of arr(umsRows)) {
    if (r?.status !== SMS_SENT_STATUS) continue;
    bucket(map, r?.service).smsUms += 1;
  }
  return finish(map);
}

// DB group-by 결과 병합:
//   mmGroups  = [{ service, sent, launch, sms, dropped, done }]  (multimodal_log)
//   umsGroups = [{ service, sms }]                               (ums_log · 발송완료만)
export function foldServiceGroups(mmGroups, umsGroups) {
  const map = new Map();
  for (const g of arr(mmGroups)) {
    const b = bucket(map, g?.service);
    b.sent += num(g?.sent);
    b.launch += num(g?.launch);
    b.smsMm += num(g?.sms);
    b.drop += num(g?.dropped ?? g?.drop);
    b.done += num(g?.done);
  }
  for (const g of arr(umsGroups)) {
    bucket(map, g?.service).smsUms += num(g?.sms);
  }
  return finish(map);
}

// 클라이언트 응답 정규화 — 형식이 어긋나도 화면(표·진행바)이 깨지지 않게 기본값으로 수렴.
export function readServices(data) {
  return arr(data)
    .filter((r) => r && r.name != null)
    .map((r) => ({
      name: String(r.name),
      sent: num(r.sent),
      launch: num(r.launch),
      sms: num(r.sms),
      drop: num(r.drop),
      done: num(r.done),
    }));
}

// 서비스 집계 합계(요약 행·검증용).
export function servicesTotal(rows) {
  const out = { sent: 0, launch: 0, sms: 0, drop: 0, done: 0 };
  for (const r of arr(rows)) {
    out.sent += num(r?.sent);
    out.launch += num(r?.launch);
    out.sms += num(r?.sms);
    out.drop += num(r?.drop);
    out.done += num(r?.done);
  }
  return out;
}
