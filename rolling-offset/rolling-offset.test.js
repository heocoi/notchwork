// Plain node tests: node rolling-offset.test.js
// Mirrors the 13 pipefit-core tests that touch Offsets.kt and Lengths.kt (PipefitTest.kt).
// Point ROLLING_ENGINE at another file to run the same cases against it (red check).
const path = require('path');
const O = require(process.env.ROLLING_ENGINE ? path.resolve(process.env.ROLLING_ENGINE) : './rolling-offset.js');
let checks = 0, bad = 0;
const cases = [];
function t(name, fn) { cases.push([name, fn]); }
function near(exp, act, tol, label) {
  checks++;
  if (!(Math.abs(exp - act) <= tol)) { bad++; throw new Error((label || '') + ' expected ' + exp + ' got ' + act); }
}
function eq(exp, act, label) { checks++; if (exp !== act) { bad++; throw new Error((label || '') + ' expected ' + JSON.stringify(exp) + ' got ' + JSON.stringify(act)); } }
const nn = (x) => { checks++; if (x === null || x === undefined) { bad++; throw new Error('unexpected null'); } return x; };
const S = (set, run, travel, ang) => O.simple(set, run, travel, ang);
const nul = null;

t('GoldenTest.travelAndRunFactors', () => {
  [[11.25, 5.1258, 5.0273], [22.5, 2.6131, 2.4142], [30, 2, 1.7321], [45, 1.4142, 1], [60, 1.1547, 0.5774]].forEach(([a, tf, rf]) => {
    const o = nn(S(1, nul, nul, a)); near(tf, o.travel, 5e-5, 'travel ' + a); near(rf, o.run, 5e-5, 'run ' + a);
  });
});
t('GoldenTest.rollingOffset', () => {
  const r = nn(O.rolling(12, 9, 45));
  near(15, r.trueOffset, 1e-9); near(21.2132, r.travel, 5e-5); near(15, r.setback, 1e-9); near(36.87, r.rollAngleDeg, 5e-3);
});
t('GoldenTest.parallelCutback', () => near(2.4853, O.parallelCutback(6, 45), 5e-5));
t('GoldenTest.grade', () => {
  near(10, O.gradeDrop(40 * 12, 0.25), 1e-9); near(2.083, O.slopePercent(0.25), 5e-4); near(1.042, O.slopePercent(0.125), 5e-4);
});
t('Published.waPlumberRollingOffset (true offset, travel; cut length needs Fittings, not ported)', () => {
  const r = nn(O.rolling(16, 12, 45)); near(20, r.trueOffset, 1e-9); near(28.28, r.travel, 5e-3);
});
t('Published.fieldLabRise6Roll8', () => {
  const r = nn(O.rolling(6, 8, 45)); near(10, r.trueOffset, 1e-9); near(14.14, r.travel, 5e-3); near(53.13, r.rollAngleDeg, 5e-3);
});
t('Published.simple45Offset10', () => { const o = nn(S(10, nul, nul, 45)); near(14.14, o.travel, 5e-3); near(10, o.run, 1e-9); });
t('Solver.simplePairs', () => {
  const b = nn(S(10, nul, nul, 30));
  [S(nul, b.run, nul, 30), S(nul, nul, b.travel, 30), S(b.set, b.run, nul, nul), S(b.set, nul, b.travel, nul), S(nul, b.run, b.travel, nul)].forEach((o, i) => {
    const x = nn(o); near(b.set, x.set, 1e-9, 'set#' + i); near(b.travel, x.travel, 1e-9, 'travel#' + i); near(30, x.angleDeg, 1e-9, 'ang#' + i);
  });
});
t('Solver.simpleRejectsBadInput', () => {
  eq(null, S(10, nul, nul, nul)); eq(null, S(10, 5, nul, 45)); eq(null, S(10, nul, 8, nul)); eq(null, S(10, nul, nul, 90));
});
t('Solver.rollingFromRunRoundTrip', () => {
  const a = nn(O.rolling(12, 9, 45)), b = nn(O.rollingFromRun(12, 9, a.setback));
  near(a.travel, b.travel, 1e-9); near(45, b.fittingAngleDeg, 1e-9);
});
t('Solver.parse', () => {
  eq(3.5, O.parseInches('3 1/2')); eq(3.5, O.parseInches('3-1/2')); eq(12.5, O.parseInches('12,5')); eq(null, O.parseInches('1/0'));
  eq(63.5, O.parseFeetInches('5\' 3-1/2"')); eq(60, O.parseFeetInches("5'")); eq(63, O.parseFeetInches('5\'-3"'));
  eq(3.5, O.parseFeetInches('3 1/2"')); eq(null, O.parseFeetInches('abc'));
});
t('Solver.format', () => {
  eq('5\' 5-1/2"', O.formatFeetInches(65.5)); eq("6'", O.formatFeetInches(71.99)); eq('5\' 11-15/16"', O.formatFeetInches(71.95));
  eq('41-3/4', O.formatInches(41.75)); eq('0', O.formatInches(0.01)); eq('1/16', O.formatInches(0.07)); eq('1-1/8', O.formatInches(1.1, 8));
  eq('25.4', O.formatMm(1)); near(1, O.mmToInches(25.4), 1e-12);
});
t('Solver.roundTripFeetInches', () => {
  [0.0625, 11.9375, 12, 59.5, 143.8125].forEach((v) => near(v, nn(O.parseFeetInches(O.formatFeetInches(v))), 1e-9, 'rt ' + v));
});

let passed = 0;
cases.forEach(([name, fn]) => { try { fn(); passed++; console.log('ok   ' + name); } catch (e) { console.log('FAIL ' + name + ': ' + e.message); } });
console.log(passed + '/' + cases.length + ' cases pass, ' + checks + ' assertions');
process.exit(passed === cases.length ? 0 : 1);
