// The cabinet page writes CSV; the Cut List page reads it. This loads the shipped CSV parser from
// site/cutlist/index.html and checks every part survives the trip. Run: node handoff.test.js
const fs = require('fs'), path = require('path');
const C = require('./cabinet.js');
const html = fs.readFileSync(path.join(__dirname, '..', 'cutlist', 'index.html'), 'utf8');
const part = (a, b) => html.slice(html.indexOf(a), html.indexOf(b));
const { parsePartsCsv: P, parseLength } = new Function(part('// ==CORE-START==', '// ==CORE-END==') + part('// ==CSV-START==', '// ==CSV-END==') + '; return {parsePartsCsv, parseLength};')();
let n = 0, bad = 0;
const ok = (name, c) => { n++; if (!c) { bad++; console.log('FAIL ' + name); } };
const backs = ['inset', 'overlay', 'none'];
for (const unit of ['in', 'mm']) for (const back of backs) for (const adj of [0, 2]) for (const fixed of [0, 1]) {
  const o = unit === 'in' ? { W: 29.75, H: 34.5, D: 23.6875, t: 0.71875, bt: 0.25 } : { W: 597, H: 876, D: 561, t: 18, bt: 6 };
  const R = C.compute(Object.assign({ unit, back, fixed, adj }, o));
  const tag = [unit, back, fixed, adj].join('/');
  ok(tag + ' computes', !R.error);
  const r = P(C.toCsv(R, unit), 20);
  ok(tag + ' no csv errors', r.errors.length === 0);
  ok(tag + ' row count', r.rows.length === R.parts.length);
  const tol = unit === 'in' ? 1 / 64 + 1e-9 : 0.05 + 1e-9;
  R.parts.forEach((p, i) => {
    const w = r.rows[i];
    ok(tag + ' ' + p.name + ' label', w.label === p.name);
    ok(tag + ' ' + p.name + ' qty', w.qty === String(p.qty));
    ok(tag + ' ' + p.name + ' grain locked', w.rot === false);
    ok(tag + ' ' + p.name + ' width', Math.abs(parseLength(w.w) - p.along) <= tol);
    ok(tag + ' ' + p.name + ' height', Math.abs(parseLength(w.h) - p.across) <= tol);
  });
}
console.log(n + ' checks, ' + bad + ' failed');
process.exit(bad ? 1 : 0);
