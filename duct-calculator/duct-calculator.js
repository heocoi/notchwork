/* Duct sizing engine. Internal units: inches, cfm, fpm, in.wg per 100 ft.
   Loaded by the page and by node tests.

   Sources:
   - Friction: Darcy-Weisbach, dp = f * (L/D) * rho*V^2/(2*gc), with f from the Colebrook equation
     (ASHRAE Handbook, Fundamentals, Duct Design chapter). Standard air 0.075 lb/ft3, kinematic
     viscosity 1.62e-4 ft2/s, galvanized steel roughness 0.0003 ft (0.09 mm), the usual ductulator basis.
   - Rectangular equivalent: Huebscher, De = 1.30 (a*b)^0.625 / (a+b)^0.25 (ASHRAE Fundamentals).
   - ashraeSimplified(): the published ASHRAE simplified fit dp = 0.109136 Q^1.9 / D^5.02, used only as an
     independent cross-check in the tests. */
(function (root) {
  'use strict';
  var RHO = 0.075;            // lb/ft3, standard air
  var NU = 1.62e-4;           // ft2/s
  var EPS = 0.0003;           // ft, galvanized steel
  var GC = 32.174;            // lbm ft / (lbf s2)
  var IN_WG = 5.2022;         // lbf/ft2 per in.wg
  var CFM_PER_LS = 1 / 0.471947443;
  var PA_M_PER_UNIT = 249.0889 / 30.48; // 1 in.wg/100ft in Pa/m
  var FPM_PER_MS = 196.850394;

  function area(dIn) { var d = dIn / 12; return Math.PI * d * d / 4; } // ft2
  function velocity(dIn, cfm) { return cfm / area(dIn); }            // fpm

  // Friction loss in in.wg per 100 ft of a round duct.
  function friction(dIn, cfm) {
    var d = dIn / 12, v = velocity(dIn, cfm), vs = v / 60;
    var re = vs * d / NU, f;
    if (re < 2300) f = 64 / re;
    else {
      f = 0.02;
      for (var i = 0; i < 80; i++) f = Math.pow(-2 * Math.log10(EPS / d / 3.7 + 2.51 / (re * Math.sqrt(f))), -2);
    }
    var pv = RHO * vs * vs / (2 * GC) / IN_WG; // velocity pressure, in.wg
    return f * (100 / d) * pv;
  }

  // Diameter for a target friction rate. Friction falls as diameter grows, so bisect.
  function diameterByFriction(cfm, fr) {
    if (!(cfm > 0) || !(fr > 0)) return null;
    var lo = 0.5, hi = 400;
    if (friction(lo, cfm) < fr || friction(hi, cfm) > fr) return null;
    for (var i = 0; i < 100; i++) {
      var mid = (lo + hi) / 2;
      if (friction(mid, cfm) > fr) lo = mid; else hi = mid;
    }
    return (lo + hi) / 2;
  }
  function diameterByVelocity(cfm, fpm) {
    if (!(cfm > 0) || !(fpm > 0)) return null;
    return 12 * Math.sqrt(4 * cfm / fpm / Math.PI);
  }

  function equivDiameter(a, b) { return 1.30 * Math.pow(a * b, 0.625) / Math.pow(a + b, 0.25); }
  // Width b that gives equivalent diameter de with side a. De grows with b, so bisect.
  function widthForEquivalent(de, a) {
    var lo = a, hi = a * 400;
    if (equivDiameter(a, lo) > de) return null; // even a square a x a is already bigger than needed
    for (var i = 0; i < 100; i++) {
      var mid = (lo + hi) / 2;
      if (equivDiameter(a, mid) < de) lo = mid; else hi = mid;
    }
    return (lo + hi) / 2;
  }

  // Next stock round size up. Inch: every 1 in to 24, every 2 in above. Metric: every 25 mm to 600, 50 above.
  function standardRound(dIn, metric) {
    var eps = 1e-9;
    if (metric) { var mm = dIn * 25.4, st = mm <= 600 ? 25 : 50; return Math.ceil(mm / st - eps) * st / 25.4; }
    return dIn <= 24 ? Math.ceil(dIn - eps) : Math.ceil(dIn / 2 - eps) * 2;
  }

  // Rectangular sizes for a round diameter. heights in inches, step = width rounding in inches.
  // Widths are rounded UP, so the real friction is at or below the target.
  function rectTable(dIn, cfm, heights, step) {
    var rows = [];
    heights.forEach(function (h) {
      var w = widthForEquivalent(dIn, h);
      if (w === null) return;
      var ws = Math.ceil(w / step - 1e-9) * step;
      var de = equivDiameter(h, ws);
      rows.push({ h: h, w: ws, exactW: w, de: de, aspect: ws / h,
                  velocity: cfm / (h * ws / 144), friction: friction(de, cfm) });
    });
    return rows;
  }

  // Independent published fit, ASHRAE simplified equation (cross-check only).
  function ashraeSimplified(cfm, dIn) { return 0.109136 * Math.pow(cfm, 1.9) / Math.pow(dIn, 5.02); }

  function size(cfm, mode, value, metric) {
    var d = mode === 'velocity' ? diameterByVelocity(cfm, value) : diameterByFriction(cfm, value);
    if (d === null || d < 1 || d > 200) return null;
    var std = standardRound(d, metric);
    return { diameter: d, velocity: velocity(d, cfm), friction: friction(d, cfm),
             standard: std, stdVelocity: velocity(std, cfm), stdFriction: friction(std, cfm) };
  }

  var api = { friction: friction, velocity: velocity, diameterByFriction: diameterByFriction,
    diameterByVelocity: diameterByVelocity, equivDiameter: equivDiameter, widthForEquivalent: widthForEquivalent,
    standardRound: standardRound, rectTable: rectTable, ashraeSimplified: ashraeSimplified, size: size,
    cfmToLs: function (c) { return c / CFM_PER_LS; }, lsToCfm: function (l) { return l * CFM_PER_LS; },
    frToPaM: function (x) { return x * PA_M_PER_UNIT; }, paMToFr: function (x) { return x / PA_M_PER_UNIT; },
    fpmToMs: function (x) { return x / FPM_PER_MS; }, msToFpm: function (x) { return x * FPM_PER_MS; } };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.DuctCalc = api;
})(typeof window !== 'undefined' ? window : this);
