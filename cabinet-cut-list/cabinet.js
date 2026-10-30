/* Frameless cabinet box parts. Pure math, loaded by the page and by node tests.
   One unit per call: inches or millimetres. Sizes returned are "along" (the way the grain runs)
   and "across". Side and Back run their grain up the height; Top/Bottom and shelves run it across the width. */
(function (root) {
  'use strict';

  // Shop assumptions, by unit.
  var ASSUME = {
    in: { shelfGap: 1 / 16, shelfSetback: 1 / 4 },   // adjustable shelf: narrower than the opening, pulled back from the front
    mm: { shelfGap: 1.5, shelfSetback: 6 }
  };
  var MAX_SHELVES = 10;

  // "29 1/4", "2' 6\"", "7-3/4", "29.25" -> inches. Millimetres take a plain number, optional "mm".
  function parseLen(str, unit) {
    if (str == null) return null;
    var s = String(str).trim().toLowerCase();
    if (!s) return null;
    if (unit === 'mm') {
      s = s.replace(/\s*mm$/, '');
      return /^\d+(\.\d+)?$/.test(s) ? parseFloat(s) : null;
    }
    s = s.replace(/["”″]/g, ' ').replace(/\binch(es)?\b|\bin\b/g, ' ').replace(/[’′]/g, "'");
    s = s.replace(/(\d)-(\d+\/\d+)/g, '$1 $2');
    var feet = 0;
    var fm = s.match(/^\s*(\d+(?:\.\d+)?)\s*(?:'|ft|feet)\s*(.*)$/);
    if (fm) { feet = parseFloat(fm[1]); s = fm[2]; }
    var tokens = s.split(/\s+/).filter(Boolean);
    var total = 0, any = fm ? true : false;
    for (var i = 0; i < tokens.length; i++) {
      var t = tokens[i], m;
      if ((m = t.match(/^(\d+)\/(\d+)$/))) {
        if (+m[2] === 0) return null;
        total += +m[1] / +m[2];
      } else if (/^\d+(\.\d+)?$/.test(t)) {
        total += parseFloat(t);
      } else return null;
      any = true;
    }
    if (!any) return null;
    return feet * 12 + total;
  }

  // Inches to the nearest 1/32 as text ("28 7/16"), millimetres to 0.1 ("713.5"). No unit mark.
  function fmt(x, unit) {
    if (unit === 'mm') return String(Math.round(x * 10) / 10);
    var n = Math.round(x * 32);
    if (n < 0) n = 0;
    var whole = Math.floor(n / 32), rem = n % 32;
    if (!rem) return String(whole);
    var d = 32;
    while (rem % 2 === 0) { rem /= 2; d /= 2; }
    return (whole ? whole + ' ' : '') + rem + '/' + d;
  }

  function isCount(v) { return typeof v === 'number' && isFinite(v) && v >= 0 && v <= MAX_SHELVES && Math.floor(v) === v; }
  function pos(v) { return typeof v === 'number' && isFinite(v) && v > 0; }

  // o: { unit, W, H, D, t, bt, back: 'inset'|'overlay'|'none', fixed, adj }
  // W, H, D are outside sizes. D is front to back and includes the back panel. t is the panel thickness,
  // bt the back thickness. An inset back sits in a rabbet cut t/2 deep in the sides, top and bottom.
  function compute(o) {
    var unit = o.unit === 'mm' ? 'mm' : 'in', A = ASSUME[unit], u = unit === 'mm' ? ' mm' : '"';
    if (!pos(o.W) || !pos(o.H) || !pos(o.D)) return { error: 'Enter the outside width, height and depth.' };
    if (!pos(o.t)) return { error: 'Enter the panel thickness.' };
    if (o.back !== 'inset' && o.back !== 'overlay' && o.back !== 'none') return { error: 'Pick a back option.' };
    if (o.back !== 'none' && !pos(o.bt)) return { error: 'Enter the back panel thickness.' };
    if (!isCount(o.fixed) || !isCount(o.adj)) return { error: 'Shelf counts must be whole numbers from 0 to ' + MAX_SHELVES + '.' };
    var W = o.W, H = o.H, D = o.D, t = o.t, bt = o.back === 'none' ? 0 : o.bt;
    if (W <= 2 * t) return { error: 'The width must be more than two panel thicknesses (' + 2 * t + u + ').' };
    if (H <= 2 * t) return { error: 'The height must be more than two panel thicknesses (' + 2 * t + u + ').' };
    if (D <= bt) return { error: 'The depth must be more than the back thickness.' };
    var inner = W - 2 * t;
    var boxDepth = o.back === 'overlay' ? D - bt : D;     // sides, top and bottom
    var shelfDepth = D - bt;                              // stops at the face of the back
    var parts = [];
    parts.push({ name: 'Side', qty: 2, along: H, across: boxDepth });
    parts.push({ name: 'Top/Bottom', qty: 2, along: inner, across: boxDepth });
    if (o.fixed > 0) parts.push({ name: 'Fixed shelf', qty: o.fixed, along: inner, across: shelfDepth });
    if (o.adj > 0) {
      if (shelfDepth - A.shelfSetback <= 0 || inner - A.shelfGap <= 0) return { error: 'The box is too small for adjustable shelves.' };
      parts.push({ name: 'Adjustable shelf', qty: o.adj, along: inner - A.shelfGap, across: shelfDepth - A.shelfSetback });
    }
    if (o.back === 'inset') parts.push({ name: 'Back', qty: 1, along: H - t, across: W - t });
    else if (o.back === 'overlay') parts.push({ name: 'Back', qty: 1, along: H, across: W });
    var pieces = 0;
    for (var i = 0; i < parts.length; i++) pieces += parts[i].qty;
    return { unit: unit, parts: parts, pieces: pieces, inner: inner };
  }

  // Lines in the format the Cut List page imports: label, width, height, qty, grain.
  // Width runs along the grain, so the grain column is always yes.
  function toCsv(res, unit) {
    return res.parts.map(function (p) {
      return [p.name, fmt(p.along, unit), fmt(p.across, unit), p.qty, 'yes'].join(', ');
    }).join('\n');
  }

  var api = { ASSUME: ASSUME, parseLen: parseLen, fmt: fmt, compute: compute, toCsv: toCsv };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Cabinet = api;
})(typeof window !== 'undefined' ? window : this);
