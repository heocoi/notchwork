// Plain node tests: node stairs.test.js
// Point STAIRS_ENGINE at another file to run the same cases against it (used for the red check).
const path = require('path');
const S = require(process.env.STAIRS_ENGINE ? path.resolve(process.env.STAIRS_ENGINE) : './stairs.js');
let n = 0, bad = 0;
function eq(name, got, want, tol) {
  n++;
  const ok = tol != null ? Math.abs(got - want) <= tol : got === want;
  if (!ok) { bad++; console.log('FAIL ' + name + ': got ' + got + ', want ' + want); }
}
const find = (r, id) => r.checks.find(c => c.id === id);

// parsing and formatting
eq('parse 108 3/8', S.parseLen('108 3/8'), 108.375, 1e-9);
eq('parse 9\' 0 3/8"', S.parseLen('9\' 0 3/8"'), 108.375, 1e-9);
eq('parse 7-3/4', S.parseLen('7-3/4'), 7.75, 1e-9);
eq('parse 9\'', S.parseLen("9'"), 108, 1e-9);
eq('parse 1/2', S.parseLen('1/2'), 0.5, 1e-9);
eq('parse junk', S.parseLen('abc'), null);
eq('parse empty', S.parseLen(''), null);
eq('fmt 7.714', S.fmt(7.714286), '7 11/16"');
eq('fmt 7.75', S.fmt(7.75), '7 3/4"');
eq('fmt rounds up to whole', S.fmt(7.999), '8"');
eq('fmt half', S.fmt(0.5), '1/2"');

// Case A, worked by hand: rise 108, 1" treads (5/4 decking), 10" tread, 1" nosing, 2x12.
// 108 / 7.75 = 13.94 -> 14 risers. Riser 108/14 = 7.7143. 13 treads, run 130.
// FIRST STEP: plumb cut at the floor is riser minus tread thickness = 6.7143, not 7.7143.
// Pitch length 13 * sqrt(10^2 + 7.7143^2) = 164.19. Top plumb ends at 14 * 7.7143 - 1 = 107.
const A = S.compute({ rise: 108, tread: 10, nosing: 1, treadThk: 1, stock: 11.25 });
eq('A risers', A.N, 14);
eq('A riser', A.riser, 7.714286, 1e-6);
eq('A treads', A.treadCount, 13);
eq('A run', A.totalRun, 130, 1e-9);
eq('A first step cut (drop)', A.flights[0].firstCut, 6.714286, 1e-6);
eq('A first step cut text', S.fmt(A.flights[0].firstCut), '6 11/16"');
eq('A pitch length', A.flights[0].pitchLen, 164.19, 0.01);
eq('A top plumb height', A.flights[0].topY, 107, 1e-9);
eq('A first seat height', A.flights[0].seats[0], 6.714286, 1e-6);
eq('A last seat height', A.flights[0].seats[12], 99.285714, 1e-6);
eq('A first tread top', A.flights[0].treadTops[0], 7.714286, 1e-6);
eq('A throat', A.flights[0].throat, 5.14, 0.01);
eq('A board length', A.flights[0].boardLen, 151.92, 0.01);
eq('A polygon points', A.flights[0].points.length, 30);
eq('A verdict', A.ok, true);

// Case B: rise 105 -> 14 risers of exactly 7.5, 2x tread (1.5"), 3-4-5 triangle: 10 x 7.5 -> 12.5.
const B = S.compute({ rise: 105, tread: 10, nosing: 1, treadThk: 1.5 });
eq('B riser', B.riser, 7.5, 1e-9);
eq('B first cut', B.flights[0].firstCut, 6, 1e-9);
eq('B pitch', B.flights[0].pitchLen, 162.5, 1e-9);
eq('B marks never drift', B.markVar, 0, 1e-9);

// riser count edges
eq('77.5 is 10 risers', S.compute({ rise: 77.5, tread: 10 }).N, 10);
eq('77.5 riser passes', find(S.compute({ rise: 77.5, tread: 10 }), 'riser').status, 'pass');
eq('77.6 is 11 risers', S.compute({ rise: 77.6, tread: 10 }).N, 11);
const tooFew = S.compute({ rise: 108, risers: 13, tread: 10 });
eq('13 risers on 108 fails riser', find(tooFew, 'riser').status, 'fail');
eq('13 risers verdict', tooFew.ok, false);

// tread and nosing
eq('tread 9 1/2 fails', find(S.compute({ rise: 108, tread: 9.5 }), 'tread').status, 'fail');
eq('tread 10 passes', find(S.compute({ rise: 108, tread: 10 }), 'tread').status, 'pass');
eq('no nosing on 10" fails', find(S.compute({ rise: 108, tread: 10, nosing: 0 }), 'nosing').status, 'fail');
eq('no nosing on 11" passes', find(S.compute({ rise: 108, tread: 11, nosing: 0 }), 'nosing').status, 'pass');
eq('nosing 1 1/2 fails', find(S.compute({ rise: 108, tread: 10, nosing: 1.5 }), 'nosing').status, 'fail');
eq('nosing 3/4 passes', find(S.compute({ rise: 108, tread: 10, nosing: 0.75 }), 'nosing').status, 'pass');

// run limit: 13 treads. 125 / 13 = 9.615 -> 9 9/16 fails. 135 / 13 = 10.38 -> 10 3/8 passes.
const tight = S.compute({ rise: 108, maxRun: 125 });
eq('run 125 tread', tight.tread, 9.5625, 1e-9);
eq('run 125 fails tread', find(tight, 'tread').status, 'fail');
const roomy = S.compute({ rise: 108, maxRun: 135 });
eq('run 135 tread', roomy.tread, 10.375, 1e-9);
eq('run 135 passes', roomy.ok, true);
eq('entered tread too long for run', find(S.compute({ rise: 108, tread: 11, maxRun: 135 }), 'run').status, 'fail');

// landing: rise 120 -> 16 risers of 7.5, split 8 / 8, 10" treads, 36" landing.
// Runs: 7 * 10 = 70, landing 36, 70 -> 176. Each flight rises 60 and has its own first-step drop.
const L = S.compute({ rise: 120, tread: 10, treadThk: 1, landing: { on: true, risersFirst: 8, depth: 36 } });
eq('L risers', L.N, 16);
eq('L flights', L.flights.length, 2);
eq('L total run', L.totalRun, 176, 1e-9);
eq('L landing height', L.landingAt, 60, 1e-9);
eq('L lower first cut', L.flights[0].firstCut, 6.5, 1e-9);
eq('L upper first cut', L.flights[1].firstCut, 6.5, 1e-9);
eq('L verdict', L.ok, true);
eq('L short landing fails', find(S.compute({ rise: 120, tread: 10, landing: { on: true, risersFirst: 8, depth: 30 } }), 'landing').status, 'fail');
eq('L run budget: 176 needed, 170 given fails', find(S.compute({ rise: 120, tread: 10, maxRun: 170, landing: { on: true, risersFirst: 8, depth: 36 } }), 'run').status, 'fail');

// 160" rise: one flight is over 12 ft 7 in, a landing fixes it
eq('160 straight fails', find(S.compute({ rise: 160, tread: 10 }), 'flightrise').status, 'fail');
eq('160 with landing passes', find(S.compute({ rise: 160, tread: 10, landing: { on: true } }), 'flightrise').status, 'pass');

// open risers: 7.5 - 1 = 6.5 gap lets a 4" sphere through
eq('open risers fail', find(S.compute({ rise: 105, tread: 10, open: true }), 'sphere').status, 'fail');
eq('open risers small drop ok', find(S.compute({ rise: 28, tread: 10, open: true }), 'sphere').status, 'pass');
eq('closed risers no sphere check', find(S.compute({ rise: 105, tread: 10 }), 'sphere'), undefined);

// width, headroom, narrow stock, bad input
eq('width 34 fails', find(S.compute({ rise: 108, tread: 10, width: 34 }), 'width').status, 'fail');
eq('headroom 78 fails', find(S.compute({ rise: 108, tread: 10, headroom: 78 }), 'headroom').status, 'fail');
eq('headroom 80 passes', find(S.compute({ rise: 108, tread: 10, headroom: 80 }), 'headroom').status, 'pass');
eq('2x10 throat warns (9.25 - 6.11 = 3.14)', find(S.compute({ rise: 108, tread: 10, stock: 9.25 }), 'throat').status, 'warn');
eq('2x8 throat warns', find(S.compute({ rise: 108, tread: 10, stock: 7.25 }), 'throat').status, 'warn');
eq('2x6 too narrow fails', find(S.compute({ rise: 108, tread: 10, stock: 5.5 }), 'throat').status, 'fail');
eq('no rise errors', S.compute({}).ok, false);
eq('tiny rise errors', S.compute({ rise: 12 }).error !== null, true);

console.log((n - bad) + '/' + n + ' passed' + (bad ? ', ' + bad + ' FAILED' : ''));
process.exit(bad ? 1 : 0);
