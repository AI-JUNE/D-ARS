// 포털 화면에 보이는 가운뎃점·이모지 문구를 업무 문장으로 바꾼다. 못 찾은 항목은 목록으로 보고한다.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const J = [
  ['app/(portal)/layout.jsx', [
    ['D-ARS · 콜봇 연계 · v4', 'D-ARS 콜봇 연계 v4'],
  ]],
  ['app/(portal)/CommandPalette.jsx', [
    ['placeholder="페이지 이동 · 검색 (예: 세션, 통계, ums)"', 'placeholder="페이지 검색 (예: 세션, 통계, ums)"'],
    ['빠른 이동 · <kbd>Ctrl</kbd>', '빠른 이동 <kbd>Ctrl</kbd>'],
  ]],
  ['app/(portal)/dashboard/page.jsx', [
    ['멀티모달 전환 · 완료 · 이탈 (건) · 막대에 마우스를 올리면 상세', '멀티모달 전환, 완료, 이탈 (건)'],
    ['개인정보 자동 마스킹 · 5초 갱신', '개인정보 자동 마스킹, 5초 간격 갱신'],
  ]],
  ['app/(portal)/launcher/page.jsx', [
    ['방식 · 초대 문구 · 폴백 정책을 구성', '방식, 초대 문구, 폴백 정책 설정'],
    ['초대 · 브랜딩', '초대 문구와 브랜딩'],
    ['hint="발신 주체 · 로고 텍스트"', 'hint="발신 주체, 로고 텍스트"'],
    ['세션 · 폴백 정책', '세션과 폴백 정책'],
  ]],
  ['app/(portal)/help/page.jsx', [
    ['도움말 · FAQ', '도움말과 FAQ'],
    ['사용 안내 · 자주 묻는 질문', '사용 안내, 자주 묻는 질문'],
    ['관리자(GOWON) · 시스템 문제', '관리자(GOWON). 시스템 문제'],
  ]],
  ['app/(portal)/notifications/page.jsx', [
    ['알림 · 30초 갱신', '알림, 30초 간격 갱신'],
    ['{s.help} · 기본 {s.def}{s.unit} · {s.min}~{s.max}', '{s.help}, 기본 {s.def}{s.unit}, {s.min}~{s.max}'],
  ]],
  ['app/(portal)/report/page.jsx', [
    ['일별 운영 지표 요약 · 인쇄하여 PDF로 저장', '일별 운영 지표 요약, 인쇄 후 PDF 저장'],
    ["생성 {now || '…'} · 운영 GOWON · {period}", "생성 {now || '…'}, 운영 GOWON, {period}"],
  ]],
  ['app/login/page.jsx', [
    ["데모 계정 {info.enforced ? '' : '· 현재 접근 제한 미적용(", "샘플 계정 {info.enforced ? '' : '(현재 접근 제한 미적용, "],
    ['admin · 관리자', 'admin (관리자)'],
    ['operator · 상담', 'operator (상담사)'],
    ['viewer · 뷰어', 'viewer (뷰어)'],
  ]],
  ['app/(portal)/history/page.jsx', [
    ['상호작용 로그 · 15초 자동 갱신 · 번호 마스킹', '상호작용 로그, 15초 간격 갱신, 번호 마스킹'],
    ["· {total}건{srvRange ? ` · ${rangeLabel(srvRange)}` : ''}", "{total}건{srvRange ? `, ${rangeLabel(srvRange)}` : ''}"],
  ]],
  ['app/(portal)/templates/page.jsx', [
    ['📞 보이는 ARS · 화면 안내', '보이는 ARS 화면 안내'],
  ]],
  ['app/(portal)/stats/page.jsx', [
    ['📊 일별 전환·완료·이탈', '일별 전환, 완료, 이탈'],
    ['{days} · 막대 호버 시 상세', '{days}'],
  ]],
];
let miss = 0;
for (const [f, pairs] of J) {
  const p = path.join(root, f);
  let s = fs.readFileSync(p, 'utf8');
  for (const [a, b] of pairs) {
    if (!s.includes(a)) { console.log('MISS', f, a); miss++; continue; }
    s = s.split(a).join(b);
  }
  fs.writeFileSync(p, s, 'utf8');
}
console.log('done, miss=' + miss);
