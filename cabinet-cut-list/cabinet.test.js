// Plain node tests: node cabinet.test.js
// Point CABINET_ENGINE at another file to run the same cases against it (used for the red check).
const path = require('path');
const C = require(process.env.CABINET_ENGINE ? path.resolve(process.env.CABINET_ENGINE) : './cabinet.js');
let n = 0, bad = 0;
function eq(name, got, want, tol) {
  n++;
  const ok = tol != null ? Math.abs(got - want) <= tol : got === want;
  if (!ok) { bad++; console.log('FAIL ' + name + ': got ' + got + ', want ' + want); }
}
const part = (r, name) => r.parts.find(p => p.name === name);

// parsing and formatting
eq('parse 29 1/4', C.parseLen('29 1/4', 'in'), 29.25, 1e-9);
eq('parse 2\' 6"', C.parseLen('2\' 6"', 'in'), 30, 1e-9);
eq('parse 7-3/4', C.parseLen('7-3/4', 'in'), 7.75, 1e-9);
eq('parse junk', C.parseLen('abc', 'in'), null);
eq('parse empty', C.parseLen('', 'in'), null);
eq('parse mm 762', C.parseLen('762', 'mm'), 762, 1e-9);
eq('parse mm suffix', C.parseLen('762 mm', 'mm'), 762, 1e-9);
eq('parse mm fraction rejected', C.parseLen('1/2', 'mm'), null);
eq('fmt 28.4375', C.fmt(28.4375, 'in'), '28 7/16');
eq('fmt 11.75', C.fmt(11.75, 'in'), '11 3/4');
eq('fmt 30', C.fmt(30, 'in'), '30');
eq('fmt 1/32 step', C.fmt(0.03125, 'in'), '1/32');
eq('fmt rounds up to whole', C.fmt(7.999, 'in'), '8');
eq('fmt mm', C.fmt(713.5, 'mm'), '713.5');
eq('fmt mm whole', C.fmt(714, 'mm'), '714');

// Case A, worked by hand: wall box 30 wide, 30 high, 12 deep, 3/4 plywood, 1/4 back sitting
// in a rabbet cut half the panel thickness (3/8) deep, one fixed and one adjustable shelf.
//   Side          30 x 12, qty 2
//   Top/Bottom    30 - 2*3/4 = 28 1/2 wide, 12 deep, qty 2
//   Fixed shelf   28 1/2 x (12 - 1/4 back) = 11 3/4
//   Adjustable    28 1/2 - 1/16 = 28 7/16 wide, 11 3/4 - 1/4 setback = 11 1/2 deep
//   Back          (30 - 3/4) x (30 - 3/4) = 29 1/4 x 29 1/4 (3/8 into each of four rabbets)
const A = C.compute({ unit: 'in', W: 30, H: 30, D: 12, t: 0.75, bt: 0.25, back: 'inset', fixed: 1, adj: 1 });
eq('A no error', A.error, undefined);
eq('A side along', part(A, 'Side').along, 30, 1e-9);
eq('A side across', part(A, 'Side').across, 12, 1e-9);
eq('A side qty', part(A, 'Side').qty, 2);
eq('A top along', part(A, 'Top/Bottom').along, 28.5, 1e-9);
eq('A top across', part(A, 'Top/Bottom').across, 12, 1e-9);
eq('A top qty', part(A, 'Top/Bottom').qty, 2);
eq('A fixed along', part(A, 'Fixed shelf').along, 28.5, 1e-9);
eq('A fixed across', part(A, 'Fixed shelf').across, 11.75, 1e-9);
eq('A adj along', part(A, 'Adjustable shelf').along, 28.4375, 1e-9);
eq('A adj across', part(A, 'Adjustable shelf').across, 11.5, 1e-9);
eq('A back along', part(A, 'Back').along, 29.25, 1e-9);
eq('A back across', part(A, 'Back').across, 29.25, 1e-9);
eq('A part kinds', A.parts.length, 5);
eq('A pieces', A.pieces, 2 + 2 + 1 + 1 + 1);
eq('A csv', C.toCsv(A, 'in'),
  'Side, 30, 12, 2, yes\nTop/Bottom, 28 1/2, 12, 2, yes\nFixed shelf, 28 1/2, 11 3/4, 1, yes\nAdjustable shelf, 28 7/16, 11 1/2, 1, yes\nBack, 29 1/4, 29 1/4, 1, yes');

// Case B: same box, back applied over the rear (overlay). The 12" is the overall depth, back included.
//   Sides and Top/Bottom are 12 - 1/4 = 11 3/4 deep. Back is the full 30 x 30.
const B = C.compute({ unit: 'in', W: 30, H: 30, D: 12, t: 0.75, bt: 0.25, back: 'overlay', fixed: 0, adj: 0 });
eq('B side across', part(B, 'Side').across, 11.75, 1e-9);
eq('B top across', part(B, 'Top/Bottom').across, 11.75, 1e-9);
eq('B back along', part(B, 'Back').along, 30, 1e-9);
eq('B back across', part(B, 'Back').across, 30, 1e-9);
eq('B no shelf rows', B.parts.length, 3);

// Case C: no back. Sides and Top/Bottom are the full depth, no Back row.
const Cc = C.compute({ unit: 'in', W: 24, H: 34.5, D: 23.75, t: 0.75, bt: 0.25, back: 'none', fixed: 0, adj: 2 });
eq('C no back row', part(Cc, 'Back'), undefined);
eq('C side across', part(Cc, 'Side').across, 23.75, 1e-9);
eq('C top along', part(Cc, 'Top/Bottom').along, 22.5, 1e-9);
eq('C adj qty', part(Cc, 'Adjustable shelf').qty, 2);
eq('C adj across', part(Cc, 'Adjustable shelf').across, 23.5, 1e-9);

// Case D, millimetres: 600 x 720 x 560, 18 mm panels, 6 mm back in a rabbet 9 mm deep, 1 adjustable shelf.
//   Side 720 x 560. Top/Bottom 600 - 36 = 564 x 560. Back grain runs up the height: 702 along, 582 across.
//   Adjustable: 564 - 1.5 = 562.5 wide, (560 - 6) - 6 = 548 deep.
const D = C.compute({ unit: 'mm', W: 600, H: 720, D: 560, t: 18, bt: 6, back: 'inset', fixed: 0, adj: 1 });
eq('D side', part(D, 'Side').along, 720, 1e-9);
eq('D top', part(D, 'Top/Bottom').along, 564, 1e-9);
eq('D back along', part(D, 'Back').along, 702, 1e-9);
eq('D back across', part(D, 'Back').across, 582, 1e-9);
eq('D adj along', part(D, 'Adjustable shelf').along, 562.5, 1e-9);
eq('D adj across', part(D, 'Adjustable shelf').across, 548, 1e-9);
eq('D csv', C.toCsv(D, 'mm').split('\n')[3], 'Back, 702, 582, 1, yes');
// tall back: 36 high, 20 wide, along follows the height
const T = C.compute({ unit: 'in', W: 20, H: 36, D: 12, t: 0.75, bt: 0.25, back: 'overlay', fixed: 0, adj: 0 });
eq('T back along is height', part(T, 'Back').along, 36, 1e-9);
eq('T back across is width', part(T, 'Back').across, 20, 1e-9);

// errors
eq('E width too small', typeof C.compute({ unit: 'in', W: 1.5, H: 30, D: 12, t: 0.75, bt: 0.25, back: 'inset', fixed: 0, adj: 0 }).error, 'string');
eq('E height too small', typeof C.compute({ unit: 'in', W: 30, H: 1.5, D: 12, t: 0.75, bt: 0.25, back: 'inset', fixed: 0, adj: 0 }).error, 'string');
eq('E zero depth', typeof C.compute({ unit: 'in', W: 30, H: 30, D: 0, t: 0.75, bt: 0.25, back: 'inset', fixed: 0, adj: 0 }).error, 'string');
eq('E back deeper than box', typeof C.compute({ unit: 'in', W: 30, H: 30, D: 0.25, t: 0.75, bt: 0.25, back: 'inset', fixed: 0, adj: 0 }).error, 'string');
eq('E negative shelves', typeof C.compute({ unit: 'in', W: 30, H: 30, D: 12, t: 0.75, bt: 0.25, back: 'inset', fixed: -1, adj: 0 }).error, 'string');
eq('E fractional shelves', typeof C.compute({ unit: 'in', W: 30, H: 30, D: 12, t: 0.75, bt: 0.25, back: 'inset', fixed: 1.5, adj: 0 }).error, 'string');
eq('E NaN', typeof C.compute({ unit: 'in', W: NaN, H: 30, D: 12, t: 0.75, bt: 0.25, back: 'inset', fixed: 0, adj: 0 }).error, 'string');
eq('E unknown back', typeof C.compute({ unit: 'in', W: 30, H: 30, D: 12, t: 0.75, bt: 0.25, back: 'wat', fixed: 0, adj: 0 }).error, 'string');

console.log(n + ' checks, ' + bad + ' failed');
process.exit(bad ? 1 : 0);
