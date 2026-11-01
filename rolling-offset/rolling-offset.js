/* Offset engine, 1:1 port of android/pipefit-core Offsets.kt and Lengths.kt.
   Internal unit is inches. Loaded by the page and by node tests. */
(function (root) {
  'use strict';
  var MM_PER_INCH = 25.4;
  var toRad = function (d) { return d * Math.PI / 180; };
  var toDeg = function (r) { return r * 180 / Math.PI; };
  var pos = function (x) { return x > 0 && isFinite(x); };
  var given = function (x) { return x !== null && x !== undefined; };

  // set = travel*sin(a) = run*tan(a). Exactly two of four inputs; null when impossible.
  function simple(set, run, travel, angleDeg) {
    var n = [set, run, travel, angleDeg].filter(given).length;
    if (n !== 2) return null;
    if ([set, run, travel].some(function (v) { return given(v) && !pos(v); })) return null;
    if (given(angleDeg) && !(angleDeg > 0 && angleDeg < 90)) return null;
    var s, r, t, a;
    if (given(angleDeg)) {
      a = toRad(angleDeg);
      if (given(set)) { s = set; r = s / Math.tan(a); t = s / Math.sin(a); }
      else if (given(run)) { r = run; s = r * Math.tan(a); t = r / Math.cos(a); }
      else { t = travel; s = t * Math.sin(a); r = t * Math.cos(a); }
    } else if (given(set) && given(run)) {
      s = set; r = run; t = Math.sqrt(s * s + r * r); a = Math.atan(s / r);
    } else if (given(set)) {
      if (travel <= set) return null;
      s = set; t = travel; r = Math.sqrt(t * t - s * s); a = Math.atan(s / r);
    } else {
      if (travel <= run) return null;
      r = run; t = travel; s = Math.sqrt(t * t - r * r); a = Math.atan(s / r);
    }
    return { set: s, run: r, travel: t, angleDeg: toDeg(a) };
  }

  // Rolling offset with a known fitting angle. T = sqrt(rise^2 + roll^2).
  function rolling(rise, roll, fit) {
    if (!(rise >= 0 && roll >= 0 && rise + roll > 0) || !(fit > 0 && fit < 90)) return null;
    var T = Math.sqrt(rise * rise + roll * roll), a = toRad(fit);
    return { trueOffset: T, travel: T / Math.sin(a), setback: T / Math.tan(a),
             rollAngleDeg: toDeg(Math.atan2(roll, rise)), fittingAngleDeg: fit };
  }

  // Rolling offset when the run is known instead of the angle.
  function rollingFromRun(rise, roll, run) {
    if (!(rise >= 0 && roll >= 0 && rise + roll > 0) || !(run > 0)) return null;
    var T = Math.sqrt(rise * rise + roll * roll);
    return { trueOffset: T, travel: Math.sqrt(T * T + run * run), setback: run,
             rollAngleDeg: toDeg(Math.atan2(roll, rise)), fittingAngleDeg: toDeg(Math.atan(T / run)) };
  }

  function parallelCutback(spacing, angleDeg) { return spacing * Math.tan(toRad(angleDeg) / 2); }
  function gradeDrop(runInches, slopeInchesPerFoot) { return runInches / 12 * slopeInchesPerFoot; }
  function slopePercent(inchesPerFoot) { return inchesPerFoot / 12 * 100; }

  var FRAC = /^(?:(\d+)[\s-]+)?(\d+)\s*\/\s*(\d+)$/;
  // Non-negative inches: "12.5", "12,5", "3 1/2", "3-1/2", "1/2"
  function parseInches(text) {
    var s = String(text).trim();
    if (!s) return null;
    if (s.indexOf(',') >= 0 && s.indexOf('.') < 0) s = s.replace(',', '.');
    if (/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(s)) {
      var v = parseFloat(s);
      return isFinite(v) && v >= 0 ? v : null;
    }
    var m = FRAC.exec(s);
    if (!m) return null;
    var den = parseFloat(m[3]);
    if (den === 0) return null;
    return parseFloat(m[1] || '0') + parseFloat(m[2]) / den;
  }

  // Feet-inch input: "5' 3-1/2\"", "5'", "5'-3\"", "3 1/2\"", or plain inches
  function parseFeetInches(text) {
    var s = String(text).trim().replace(/’/g, "'").replace(/”/g, '"');
    var tick = s.indexOf("'");
    if (tick < 0) return parseInches(s.replace(/"$/, ''));
    var fs = s.substring(0, tick).trim();
    if (!/^[+-]?(\d+\.?\d*|\.\d+)$/.test(fs)) return null;
    var feet = parseFloat(fs);
    if (feet < 0) return null;
    var rest = s.substring(tick + 1).trim().replace(/^-+/, '').trim().replace(/"$/, '').trim();
    if (!rest) return feet * 12;
    var inch = parseInches(rest);
    return inch === null ? null : feet * 12 + inch;
  }

  function mmToInches(mm) { return mm / MM_PER_INCH; }
  function inchesToMm(i) { return i * MM_PER_INCH; }

  function gcd(a, b) { while (b) { var t = a % b; a = b; b = t; } return a; }
  // Kotlin round() is half away from zero; values here are non-negative so Math.round matches.
  function formatInches(v, den) {
    den = den || 16;
    var total = Math.round(Math.abs(v) * den), whole = Math.floor(total / den), num = total % den, d = den, body;
    if (num === 0) body = String(whole);
    else { var g = gcd(num, d); num /= g; d /= g; body = whole === 0 ? num + '/' + d : whole + '-' + num + '/' + d; }
    return v < 0 && total !== 0 ? '-' + body : body;
  }
  function formatFeetInches(v, den) {
    den = den || 16;
    var units = Math.round(Math.abs(v) * den), feet = Math.floor(units / (12 * den)), iu = units % (12 * den);
    var istr = formatInches(iu / den, den), body;
    if (feet === 0) body = istr + '"';
    else if (iu === 0) body = feet + "'";
    else body = feet + "' " + istr + '"';
    return v < 0 && units !== 0 ? '-' + body : body;
  }
  function formatMm(inches, decimals) { return inchesToMm(inches).toFixed(decimals === undefined ? 1 : decimals); }

  var api = { simple: simple, rolling: rolling, rollingFromRun: rollingFromRun, parallelCutback: parallelCutback,
    gradeDrop: gradeDrop, slopePercent: slopePercent, parseInches: parseInches, parseFeetInches: parseFeetInches,
    mmToInches: mmToInches, inchesToMm: inchesToMm, formatInches: formatInches, formatFeetInches: formatFeetInches,
    formatMm: formatMm, toRad: toRad, toDeg: toDeg };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.RollingOffset = api;
})(typeof window !== 'undefined' ? window : this);
