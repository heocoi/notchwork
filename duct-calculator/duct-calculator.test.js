// Plain node tests: node duct-calculator.test.js
// Point DUCT_ENGINE at another file to run the same cases against it (red check).
// Reference values come from published sources, not from this engine:
//  - aircondlounge.com/duct-cfm-chart worked example: 8 in at 200 cfm is about 0.07 in.wg/100ft and 580 fpm;
//    6 in at 200 cfm is about 0.3 in.wg/100ft and 1000 fpm.
//  - engineeringtoolbox.com equivalent-diameter table (Huebscher): 8x12 10.7, 10x10 10.9, 12x12 13.1,
//    20x20 21.9, 12x36 21.9, 16x25 21.7, 12x45 24.1.
//  - ASHRAE simplified fit dp = 0.109136 Q^1.9 / D^5.02 (Fundamentals), within 10 percent of Colebrook.
const path = require('path');
const D = require(process.env.DUCT_ENGINE ? path.resolve(process.env.DUCT_ENGINE) : './duct-calculator.js');
let checks = 0, bad = 0;
const cases = [];
function t(name, fn) { cases.push([name, fn]); }
function near(exp, act, tol, label) {
  checks++;
  if (!(Math.abs(exp - act) <= tol)) { bad++; throw new Error((label || '') + ' expected ' + exp + ' got ' + act); }
}
function rel(exp, act, r, label) { near(exp, act, Math.abs(exp) * r, label); }
function ok(c, label) { checks++; if (!c) { bad++; throw new Error(label || 'assertion failed'); } }

t('ref 8in at 200cfm', () => { rel(580, D.velocity(8, 200), 0.03, 'v'); rel(0.07, D.friction(8, 200), 0.08, 'dp'); });
t('ref 6in at 200cfm', () => { rel(1000, D.velocity(6, 200), 0.03, 'v'); rel(0.3, D.friction(6, 200), 0.08, 'dp'); });
t('ref 14in about 1027cfm at 0.1', () => rel(0.1, D.friction(14, 1027), 0.10));
t('huebscher published table', () => {
  [[8, 12, 10.7], [10, 10, 10.9], [12, 12, 13.1], [20, 20, 21.9], [12, 36, 21.9], [16, 25, 21.7], [12, 45, 24.1]]
    .forEach(([a, b, de]) => near(de, D.equivDiameter(a, b), 0.2, a + 'x' + b));
});
t('huebscher 8x8 is 8.7', () => near(8.7, D.equivDiameter(8, 8), 0.05));
t('colebrook vs ashrae simplified grid', () => {
  [[100, 5], [200, 8], [400, 10], [1000, 14], [2000, 20], [4500, 30], [10000, 40]].forEach(([q, d]) =>
    rel(D.ashraeSimplified(q, d), D.friction(d, q), 0.10, q + 'cfm ' + d + 'in'));
});
t('inverse round trip friction', () => {
  [[100, 0.08], [1000, 0.1], [1000, 0.05], [5000, 0.08]].forEach(([q, fr]) => {
    const d = D.diameterByFriction(q, fr); near(fr, D.friction(d, q), fr * 1e-6);
  });
});
t('1000cfm at 0.1 is about 13.7 in', () => { const d = D.diameterByFriction(1000, 0.1); ok(d > 13.4 && d < 13.9, 'd=' + d); });
t('velocity mode', () => { near(15.14, D.diameterByVelocity(1000, 800), 0.01); const s = D.size(1000, 'velocity', 800, false); near(800, s.velocity, 1e-6); });
t('standard sizes', () => {
  near(15, D.standardRound(14.2, false), 1e-9); near(14, D.standardRound(14, false), 1e-9);
  near(26, D.standardRound(25.1, false), 1e-9); near(300 / 25.4, D.standardRound(299 / 25.4, true), 1e-9);
});
t('rect table is conservative and consistent', () => {
  const d = D.diameterByFriction(1000, 0.1), rows = D.rectTable(d, 1000, [6, 8, 10, 12, 14, 16, 18, 20], 2);
  ok(rows.length >= 4, 'rows ' + rows.length);
  rows.forEach(r => { ok(r.de >= d - 1e-9, 'rect smaller than round ' + r.h + 'x' + r.w); ok(r.w >= r.h, 'w<h'); ok(r.friction <= 0.1 + 1e-9, 'friction ' + r.friction); });
  const r8 = rows.find(r => r.h === 8); ok(r8 && r8.w >= 20 && r8.w <= 24, '8 high width ' + (r8 && r8.w));
});
t('invalid input', () => {
  ok(D.size(0, 'friction', 0.1, false) === null); ok(D.size(1000, 'friction', -1, false) === null);
  ok(D.size(1000, 'velocity', 0, false) === null); ok(D.diameterByFriction(1e12, 0.1) === null);
});
t('unit conversions', () => {
  near(1000, D.lsToCfm(D.cfmToLs(1000)), 1e-6); near(471.947, D.cfmToLs(1000), 1e-2);
  near(0.1, D.paMToFr(D.frToPaM(0.1)), 1e-12); near(0.8173, D.frToPaM(0.1), 1e-3); near(5.08, D.fpmToMs(1000), 1e-6);
});

for (const [n, fn] of cases) {
  try { fn(); console.log('ok   ' + n); } catch (e) { bad++; console.log('FAIL ' + n + ': ' + e.message); }
}
console.log(cases.length + ' tests, ' + checks + ' checks, ' + bad + ' failures');
process.exit(bad ? 1 : 0);
