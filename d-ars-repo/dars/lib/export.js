// 공통 CSV 내보내기 (Excel 한글 호환: UTF-8 BOM)
// 파일명 날짜 스탬프(일별 다운로드 덮어쓰기 방지·감사 추적): name.ext → name_YYYY-MM-DD.ext
export function stampFilename(filename) {
  const d = new Date();
  const z = (n) => String(n).padStart(2, '0');
  const tag = `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
  const dot = String(filename).lastIndexOf('.');
  return dot === -1
    ? `${filename}_${tag}`
    : `${filename.slice(0, dot)}_${tag}${filename.slice(dot)}`;
}

export function toCSV(rows, columns) {
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const head = columns.map(c => esc(c.label)).join(',');
  const body = rows.map(r => columns.map(c => {
    const v = typeof c.value === 'function' ? c.value(r) : r[c.value];
    return esc(v);
  }).join(',')).join('\n');
  return head + '\n' + body;
}
export function downloadCSV(filename, rows, columns) {
  if (typeof window === 'undefined') return;
  const csv = '﻿' + toCSV(rows, columns);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = stampFilename(filename); a.click();
  URL.revokeObjectURL(url);
}

// 공통 Excel 내보내기 — 의존성 없이 Excel이 여는 SpreadsheetML/HTML(.xls)
// 한글: UTF-8 BOM + meta charset. 전화번호 등 앞자리 0 보존: 셀 텍스트 서식(mso-number-format).
export function toExcelHTML(rows, columns, sheetName = 'Sheet1') {
  const esc = (v) => String(v ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
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
    + `<thead><tr>${th}</tr></thead><tbody>${body}</tbody></table></body></html>`;
}
export function downloadExcel(filename, rows, columns, sheetName) {
  if (typeof window === 'undefined') return;
  const html = '﻿' + toExcelHTML(rows, columns, sheetName || 'D-ARS');
  const blob = new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = stampFilename(filename); a.click();
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
  const sub = opts.subtitle ? `<div class="sub">${esc(opts.subtitle)}</div>` : '';
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
