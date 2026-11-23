import fs from 'node:fs';
const p = 'app/page.jsx';
const lines = fs.readFileSync(p, 'utf8').split('\n');
const html = fs.readFileSync('_지울것/new_html.txt', 'utf8').replace(/\n$/, '').split('\n');
const css = fs.readFileSync('_지울것/new_css.txt', 'utf8').replace(/\n$/, '').split('\n');
// 1-indexed inclusive ranges: HTML 282..423, CTA css 181..184, hero/logos/stats css 96..132
if (!lines[281].includes('<!-- HERO -->') || !lines[422].includes('</div></div>') || !lines[95].includes('/* HERO */') || !lines[131].startsWith('.stat span')) {
  throw new Error('line anchors moved');
}
const out = [
  ...lines.slice(0, 95), ...css,
  ...lines.slice(132, 180),
  '.cta{background:var(--brand);color:#fff;border-radius:18px;padding:52px;display:flex;align-items:center;justify-content:space-between;gap:30px;flex-wrap:wrap;box-shadow:var(--shadow-lg)}',
  '.cta h2{font-size:30px;font-weight:800;letter-spacing:-.03em;line-height:1.3;word-break:keep-all}',
  '.cta p{color:#e3ebfa;margin-top:10px}',
  '.btn-white{background:#fff;color:var(--brand-d)}',
  '.btn-white:hover{background:var(--brand-xl);color:var(--brand-d)}',
  ...lines.slice(184, 281), ...html, ...lines.slice(423),
];
fs.writeFileSync(p, out.join('\n'));
