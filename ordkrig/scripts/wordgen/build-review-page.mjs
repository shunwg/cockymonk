// Bygger gjennomgangs-sida (HTML) for ordlista: avhukbare ord + kopierbar fjernliste.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Papa from 'papaparse';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CSV = path.join(__dirname, '..', '..', 'src', 'data', 'words', 'no.csv');
const OUT = process.argv[2];

// Valgfritt filter som argument 2: "kort" = kun kort-tier, "vanlig" = kun hovedtier
const TIER = process.argv[3] ?? 'alle';
const { data } = Papa.parse(fs.readFileSync(CSV, 'utf8'), { header: true, skipEmptyLines: true });
const items = data
  .filter((r) => {
    const isShort = (r.tags ?? '').split(';').includes('kort');
    if (TIER === 'kort') return isShort;
    if (TIER === 'vanlig') return !isShort;
    return true;
  })
  .map((r) => ({ w: r.word, d: r.definition }));

const html = `<title>Word War 1 – ordliste (${items.length} ord)</title>
<style>
  :root { --bg:#fff; --text:#111; --muted:#71717a; --hair:#e4e4e7; --panel:#fafafa; --accent:#111; }
  @media (prefers-color-scheme: dark) { :root { --bg:#121316; --text:#ececf0; --muted:#8e8e93; --hair:#2b2c31; --panel:#1b1c20; --accent:#fff; } }
  :root[data-theme="light"] { --bg:#fff; --text:#111; --muted:#71717a; --hair:#e4e4e7; --panel:#fafafa; --accent:#111; }
  :root[data-theme="dark"] { --bg:#121316; --text:#ececf0; --muted:#8e8e93; --hair:#2b2c31; --panel:#1b1c20; --accent:#fff; }
  * { box-sizing:border-box; }
  body { margin:0; background:var(--bg); color:var(--text); font:15px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif; }
  .wrap { max-width:760px; margin:0 auto; padding:28px 18px 140px; }
  h1 { font-size:22px; margin:0 0 4px; }
  .sub { color:var(--muted); font-size:13.5px; margin:0 0 18px; }
  .search { width:100%; padding:10px 14px; border:1px solid var(--hair); border-radius:10px; background:var(--panel); color:var(--text); font-size:15px; margin-bottom:14px; }
  .row { display:flex; gap:12px; align-items:flex-start; padding:9px 10px; border-bottom:1px solid var(--hair); border-radius:8px; }
  .row:hover { background:var(--panel); }
  .row input { margin-top:4px; width:17px; height:17px; accent-color:var(--accent); flex:none; }
  .row.checked { opacity:.45; }
  .row.checked .w { text-decoration: line-through; }
  .w { font-weight:700; }
  .d { color:var(--muted); }
  .bar { position:fixed; left:0; right:0; bottom:0; background:var(--panel); border-top:1px solid var(--hair); padding:10px 18px 14px; }
  .bar-inner { max-width:760px; margin:0 auto; display:flex; flex-direction:column; gap:8px; }
  .bar-top { display:flex; justify-content:space-between; align-items:center; gap:12px; }
  .count { font-size:13.5px; color:var(--muted); }
  .copybtn { font:600 14px -apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif; padding:8px 16px; border-radius:999px; border:1.5px solid var(--accent); background:transparent; color:var(--text); cursor:pointer; }
  textarea { width:100%; height:52px; border:1px solid var(--hair); border-radius:8px; background:var(--bg); color:var(--text); font:13px ui-monospace,Consolas,monospace; padding:8px; resize:vertical; }
</style>
<div class="wrap">
  <h1>Word War 1 – ordliste</h1>
  <p class="sub">${items.length} ord. Huk av ord som skal FJERNES fra spillet. Fjernlista nederst oppdateres fortløpende – kopier den og lim inn i chatten, så blokkerer jeg ordene.</p>
  <input class="search" id="q" type="search" placeholder="Søk i ord og forklaringer…">
  <div id="list"></div>
</div>
<div class="bar"><div class="bar-inner">
  <div class="bar-top">
    <span class="count" id="count">0 ord merket for fjerning</span>
    <button class="copybtn" id="copy">Kopier fjernliste</button>
  </div>
  <textarea id="out" readonly placeholder="Avhukede ord dukker opp her…"></textarea>
</div></div>
<script>
  const DATA = ${JSON.stringify(items)};
  const checked = new Set();
  const list = document.getElementById('list');
  const out = document.getElementById('out');
  const count = document.getElementById('count');
  function renderOut() {
    out.value = [...checked].join(', ');
    count.textContent = checked.size + ' ord merket for fjerning';
  }
  function render(filter) {
    const f = (filter ?? '').toLowerCase();
    list.innerHTML = '';
    for (const it of DATA) {
      if (f && !it.w.toLowerCase().includes(f) && !it.d.toLowerCase().includes(f)) continue;
      const row = document.createElement('label');
      row.className = 'row' + (checked.has(it.w) ? ' checked' : '');
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = checked.has(it.w);
      cb.addEventListener('change', () => {
        cb.checked ? checked.add(it.w) : checked.delete(it.w);
        row.classList.toggle('checked', cb.checked);
        renderOut();
      });
      const span = document.createElement('span');
      span.innerHTML = '<span class="w">' + it.w + '</span> – <span class="d">' + it.d + '</span>';
      row.append(cb, span);
      list.append(row);
    }
  }
  document.getElementById('q').addEventListener('input', (e) => render(e.target.value));
  document.getElementById('copy').addEventListener('click', async () => {
    out.select();
    try { await navigator.clipboard.writeText(out.value); } catch { document.execCommand('copy'); }
  });
  render('');
  renderOut();
</script>
`;

fs.writeFileSync(OUT, html, 'utf8');
console.log(`Skrev gjennomgangs-side (${items.length} ord) til ${OUT}`);
