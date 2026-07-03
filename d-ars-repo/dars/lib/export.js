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
