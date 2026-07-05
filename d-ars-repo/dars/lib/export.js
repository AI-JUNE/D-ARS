// 공통 CSV 내보내기 (Excel 한글 호환: UTF-8 BOM)
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
  a.href = url; a.download = filename; a.click();
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
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}
