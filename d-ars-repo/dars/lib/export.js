// 공통 CSV 내보내기 (Excel 한글 호환: UTF-8 BOM)
// 파일명 날짜 스탬프(일별 다운로드 덮어쓰기 방지·감사 추적): name.ext → name_YYYY-MM-DD.ext
//
// 조회 조건 기록(2026-07-14, 22회차 · 감사·정산 신뢰성):
//   내보내기는 이미 **서버 전체 기준**(현재 조건의 모든 행)인데, 정작 **파일에는 그 조건이 남지 않았다**
//   → "UMS 12건" 파일이 전체인지 '최근 7일·실패'인지 구분할 수 없었다. 이제 PDF·Excel 은 현재 주소의
//   조회 조건(기간·검색어·필터·정렬)을 **문서 머리말에 자동 기록**한다(`lib/conditionSummary.js`).
//   **CSV 는 기계 파싱 대상**이라 데이터 무결성을 우선해 본문을 그대로 둔다(머리말 미삽입).
// (상대 경로 임포트 — 이 파일은 node:test 러너가 별칭 해석 없이 직접 임포트한다)
import { currentSearch, exportSubtitle, conditionSlug } from './conditionSummary.js';

// 파일명 = 이름[_조건슬러그]_YYYY-MM-DD.확장자
//   조건 슬러그(2026-07-14, 23회차): 같은 날 조건만 바꿔 두 번 내보내면 파일명이 충돌하고(브라우저가 `(1)`),
//   폴더에 쌓인 파일을 **열기 전에는 구분할 수 없었다**. 특히 CSV 는 본문에 머리말을 넣지 않으므로
//   파일명이 유일한 구분 수단이다. → `ums_7d_실패_2026-07-14.csv`
//   `slug` 미지정 시 기존 출력과 **바이트 동일**(하위호환 — 기존 호출부·테스트 무영향).
export function stampFilename(filename, opts = {}) {
  const d = new Date();
  const z = (n) => String(n).padStart(2, '0');
  const tag = `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
  const slug = typeof opts.slug === 'string' && opts.slug ? `_${opts.slug}` : '';
  const dot = String(filename).lastIndexOf('.');
  return dot === -1
    ? `${filename}${slug}_${tag}`
    : `${filename.slice(0, dot)}${slug}_${tag}${filename.slice(dot)}`;
}

// 현재 주소의 조회 조건을 파일명에 자동 반영(호출부 변경 0 · opts.slug=false 면 생략).
export function exportFilename(filename, opts = {}) {
  if (opts.slug === false) return stampFilename(filename);
  const slug = typeof opts.slug === 'string' ? opts.slug : conditionSlug(currentSearch());
  return stampFilename(filename, { slug });
}

// CSV 수식 인젝션 방지: 스프레드시트 앱(Excel·Sheets·LibreOffice)에서 =,+,-,@,tab,CR 로
// 시작하는 셀은 수식으로 실행될 수 있다. 위험 문자로 시작하면 작은따옴표(')를 앞에 붙여 텍스트로 강제.
// 전화번호(010-…)·한글·숫자·날짜(2026-…)는 위험 문자로 시작하지 않으므로 불변 → 전화번호 처리 무영향.
export function sanitizeCell(v) {
  const s = String(v ?? '');
  return /^[=+\-@\t\r]/.test(s) ? "'" + s : s;
}
export function toCSV(rows, columns) {
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const head = columns.map(c => esc(c.label)).join(',');
  const body = rows.map(r => columns.map(c => {
    const v = typeof c.value === 'function' ? c.value(r) : r[c.value];
    return esc(sanitizeCell(v));
  }).join(',')).join('\n');
  return head + '\n' + body;
}
// CSV 본문은 **기계 파싱 대상이라 불변**(머리말 미삽입) — 대신 **파일명**에 조건을 남긴다(23회차).
export function downloadCSV(filename, rows, columns, opts = {}) {
  if (typeof window === 'undefined') return;
  const csv = '﻿' + toCSV(rows, columns);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = exportFilename(filename, opts); a.click();
  URL.revokeObjectURL(url);
}

// 공통 Excel 내보내기 — 의존성 없이 Excel이 여는 SpreadsheetML/HTML(.xls)
// 한글: UTF-8 BOM + meta charset. 전화번호 등 앞자리 0 보존: 셀 텍스트 서식(mso-number-format).
// opts.subtitle 이 있으면 표 위에 **조회 조건 머리말**(병합 셀 1줄)을 넣는다 — 미지정 시 기존 출력과 100% 동일(하위호환).
export function toExcelHTML(rows, columns, sheetName = 'Sheet1', opts = {}) {
  const esc = (v) => String(v ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const cap = opts.subtitle
    ? `<tr><td colspan="${columns.length}" style="background:#faf5f2;color:#8a7970;border:1px solid #e6dcd6;`
      + `padding:6px 10px;font-size:12px">${esc(opts.subtitle)}</td></tr>`
    : '';
  const th = columns.map(c =>
    `<th style="background:#be5535;color:#fff;border:1px solid #d8c7bf;padding:6px 10px;font-weight:700">${esc(c.label)}</th>`
  ).join('');
  const body = rows.map(r => '<tr>' + columns.map(c => {
    const v = typeof c.value === 'function' ? c.value(r) : r[c.value];
    return `<td style="border:1px solid #e6dcd6;padding:5px 10px;mso-number-format:'\\@'">${esc(v)}</td>`;
  }).join('') + '</tr>').join('');
  return `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel">`
    + `<head><meta charset="utf-8">`
    + `<!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet>`
    + `<x:Name>${esc(sheetName)}</x:Name><x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions>`
    + `</x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]-->`
    + `</head><body><table style="border-collapse:collapse;font-family:'Malgun Gothic',sans-serif;font-size:13px">`
    + `<thead>${cap}<tr>${th}</tr></thead><tbody>${body}</tbody></table></body></html>`;
}
// 현재 주소의 조회 조건을 머리말로 자동 기록(호출부 변경 0 · 명시 opts 로 덮어쓰기 가능, false 면 생략).
export function downloadExcel(filename, rows, columns, sheetName, opts = {}) {
  if (typeof window === 'undefined') return;
  const subtitle = opts.subtitle === false ? '' : (opts.subtitle || exportSubtitle(currentSearch()));
  const html = '﻿' + toExcelHTML(rows, columns, sheetName || 'D-ARS', { subtitle });
  const blob = new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = exportFilename(filename, opts); a.click();
  URL.revokeObjectURL(url);
}

// 공통 PDF 내보내기 — 의존성 없이 브라우저 인쇄(PDF로 저장)로 표를 출력.
// 숨김 iframe에 브랜드 리포트 HTML을 렌더 후 print() → 팝업 차단 영향 없음. 읽기 전용·비파괴.
export function printPDF(title, rows, columns, opts = {}) {
  if (typeof window === 'undefined') return;
  const list = Array.isArray(rows) ? rows : [];
  const esc = (v) => String(v ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const th = columns.map(c => `<th>${esc(c.label)}</th>`).join('');
  const body = list.length
    ? list.map(r => '<tr>' + columns.map(c => {
        const v = typeof c.value === 'function' ? c.value(r) : r[c.value];
        return `<td>${esc(v)}</td>`;
      }).join('') + '</tr>').join('')
    : `<tr><td class="empty" colspan="${columns.length}">데이터가 없습니다.</td></tr>`;
  const now = new Date().toLocaleString('ko-KR', { dateStyle: 'long', timeStyle: 'short' });
  // 조회 조건은 **자동 기록**(호출부 변경 0). 명시 subtitle 이 있으면 그것을 쓰고, false 면 생략한다.
  const subtitle = opts.subtitle === false ? '' : (opts.subtitle || exportSubtitle(currentSearch()));
  const sub = subtitle ? `<div class="sub">${esc(subtitle)}</div>` : '';
  const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${esc(title)}</title><style>
*{box-sizing:border-box}
body{font-family:'Malgun Gothic','Apple SD Gothic Neo',sans-serif;color:#2b201c;margin:28px;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.brand{display:flex;align-items:center;gap:8px;font-weight:800;color:#be5535;font-size:13px}
.brand .dot{width:11px;height:11px;border-radius:50%;background:#be5535;display:inline-block}
h1{font-size:20px;margin:8px 0 2px}.meta,.sub{color:#8a7970;font-size:12px}.sub{margin-top:2px}
table{border-collapse:collapse;width:100%;margin-top:16px;font-size:12px}
th{background:#be5535;color:#fff;text-align:left;padding:7px 10px;border:1px solid #d8c7bf;font-weight:700}
td{padding:6px 10px;border:1px solid #e6dcd6;word-break:break-word}tbody tr:nth-child(even){background:#faf5f2}
td.empty{text-align:center;color:#8a7970;padding:18px}
.foot{margin-top:18px;color:#a2938b;font-size:11px;border-top:1px solid #ece3dd;padding-top:8px}
@page{margin:14mm}
</style></head><body>
<div class="brand"><span class="dot"></span> D-ARS · 보이는 ARS</div>
<h1>${esc(title)}</h1>
<div class="meta">생성 ${esc(now)} · 운영 GOWON · ${list.length}건</div>${sub}
<table><thead><tr>${th}</tr></thead><tbody>${body}</tbody></table>
<div class="foot">본 문서는 D-ARS 관리자 포털에서 자동 생성되었습니다. 고객 번호는 마스킹 처리됩니다. · #be5535</div>
</body></html>`;
  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  Object.assign(iframe.style, { position: 'fixed', right: '0', bottom: '0', width: '0', height: '0', border: '0' });
  document.body.appendChild(iframe);
  const doc = iframe.contentWindow.document;
  doc.open(); doc.write(html); doc.close();
  const run = () => {
    try { iframe.contentWindow.focus(); iframe.contentWindow.print(); } catch (e) {}
    setTimeout(() => { try { document.body.removeChild(iframe); } catch (e) {} }, 1500);
  };
  if (doc.readyState === 'complete') setTimeout(run, 200);
  else iframe.onload = () => setTimeout(run, 200);
}
