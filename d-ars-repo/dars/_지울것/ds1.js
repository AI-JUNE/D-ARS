// DS 1단계: 남은 옛 브랜드색 리터럴 #2457C5 를 DS 주색 #0C66E4 로 교체한다.
import fs from 'node:fs';
const files = ['app/page.jsx', 'app/layout.jsx', 'lib/export.js', 'lib/ui.js', 'tests/export.test.js', 'tests/ui.test.js', 'tests/eumseniorui.test.mjs'];
for (const f of files) {
  const s = fs.readFileSync(f, 'utf8');
  const n = s.replace(/#2457C5/gi, '#0C66E4');
  if (n !== s) { fs.writeFileSync(f, n, 'utf8'); console.log('변경', f); }
}
