/* Stair stringer engine. Inches only. Rules from the 2021 IRC section R311.7
   (read on codes.iccsafe.org, 30 Oct 2026). Loaded by the page and by node tests. */
(function (root) {
  'use strict';

  var IRC = {
    maxRiser: 7.75,        // R311.7.5.1
    minTread: 10,          // R311.7.5.2
    nosingMin: 0.75,       // R311.7.5.3
    nosingMax: 1.25,       // R311.7.5.3
    noNosingTread: 11,     // R311.7.5.3 exception
    variation: 0.375,      // 3/8 inch, risers, treads, nosings
    maxFlightRise: 151,    // R311.7.3, 12 ft 7 in
    minHeadroom: 80,       // R311.7.2, 6 ft 8 in
    minWidth: 36,          // R311.7.1
    minLanding: 36,        // R311.7.6
    sphere: 4              // R311.7.5.1 open risers
  };
  var MIN_THROAT = 3.5;    // shop practice, not an IRC number

  // "108 3/8", "9' 0 3/8\"", "7-3/4", "108.375", "1/2" -> inches, or null
  function parseLen(str) {
    if (str == null) return null;
    var s = String(str).trim().toLowerCase();
    if (!s) return null;
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

  // nearest 1/16 as text, e.g. 7.714 -> 7 11/16"
  function fmt(x) {
    var n = Math.round(x * 16);
    var neg = n < 0; if (neg) n = -n;
    var whole = Math.floor(n / 16), rem = n % 16, d = 16;
    while (rem && rem % 2 === 0) { rem /= 2; d /= 2; }
    var out = rem ? (whole ? whole + ' ' + rem + '/' + d : rem + '/' + d) : String(whole);
    return (neg ? '-' : '') + out + '"';
  }

  function round16(x) { return Math.round(x * 16) / 16; }

  // One flight: N risers between two level surfaces, rise inches apart.
  // Every tread sits on a stringer seat tread-thickness lower than the finished
  // tread surface, so the first plumb cut is riser minus t (the first-step drop).
  function flight(rise, N, g, t, D) {
    var r = rise / N;
    var drop = t;
    var run = (N - 1) * g;
    var h = Math.sqrt(g * g + r * r);
    var pts = [[0, 0]];
    var seats = [];
    var k;
    for (k = 0; k < N; k++) {
      pts.push([k * g, (k + 1) * r - drop]);
      if (k < N - 1) {
        pts.push([(k + 1) * g, (k + 1) * r - drop]);
        seats.push((k + 1) * r - drop);
      }
    }
    var topY = N * r - drop;
    var shift = D * h / g;                          // vertical offset of the bottom edge
    var yb = function (x) { return (r / g) * x + (r - drop) - shift; };
    var xb = (shift - (r - drop)) / (r / g);
    pts.push([run, yb(run)]);
    pts.push([xb, 0]);
    return {
      risers: N, treads: N - 1, riser: r, tread: g, run: run,
      firstCut: r - drop,
      seats: seats,                                 // stringer seat heights, steps 1..N-1
      treadTops: seats.map(function (s, i) { return (i + 1) * r; }),
      topY: topY,
      pitchLen: (N - 1) * h,                        // notch tip to notch tip
      boardLen: (run - xb) * h / g,                 // long point to long point of the stock
      throat: D - r * g / h,                        // wood left under the deepest notch
      points: pts
    };
  }

  function compute(o) {
    var t = o.treadThk == null ? 1 : o.treadThk;
    var nosing = o.nosing == null ? 1 : o.nosing;
    var D = o.stock == null ? 11.25 : o.stock;
    var width = o.width == null ? 36 : o.width;
    var landing = o.landing && o.landing.on ? o.landing : null;
    var landDepth = landing ? (landing.depth == null ? IRC.minLanding : landing.depth) : 0;
    var rise = o.rise;
    var res = { ok: false, error: null, checks: [], flights: [], input: o };

    if (!(rise > 0)) { res.error = 'Enter the total rise.'; return res; }
    var N = o.risers > 0 ? Math.round(o.risers) : Math.ceil(rise / IRC.maxRiser - 1e-9);
    if (N < 3) { res.error = 'A rise this small is one or two steps. A stringer is not needed.'; return res; }
    var N1 = 0, N2 = 0;
    if (landing) {
      N1 = landing.risersFirst > 0 ? Math.round(landing.risersFirst) : Math.round(N / 2);
      N2 = N - N1;
      if (N1 < 2 || N2 < 2) { res.error = 'With a landing, each flight needs at least 2 risers. Total risers: ' + N + '.'; return res; }
    }
    var r = rise / N;
    var treadCount = landing ? (N1 - 1) + (N2 - 1) : N - 1;

    var g, treadSource;
    if (o.tread > 0) { g = o.tread; treadSource = 'entered'; }
    else if (o.maxRun > 0) {
      g = Math.floor(((o.maxRun - landDepth) / treadCount) * 16) / 16;
      treadSource = 'run';
    } else { g = IRC.minTread; treadSource = 'default'; }
    if (!(g > 0)) { res.error = 'The run limit is too short for this many treads.'; return res; }

    res.N = N; res.riser = r; res.tread = g; res.treadSource = treadSource; res.treadCount = treadCount;
    res.nosing = nosing; res.treadThk = t; res.stock = D;

    if (landing) {
      var f1 = flight(N1 * r, N1, g, t, D), f2 = flight(N2 * r, N2, g, t, D);
      f1.name = 'Lower flight'; f2.name = 'Upper flight';
      f1.rise = N1 * r; f2.rise = N2 * r;
      res.flights = [f1, f2];
      res.landingAt = N1 * r;
      res.totalRun = f1.run + landDepth + f2.run;
    } else {
      var f = flight(rise, N, g, t, D);
      f.name = 'Stair'; f.rise = rise;
      res.flights = [f];
      res.totalRun = f.run;
    }
    res.landDepth = landDepth;

    // marks rounded to 1/16 from the cumulative value, so error never builds up
    var rs = [];
    var prev = 0;
    for (var i = 1; i <= N; i++) { var m = round16(i * r); rs.push(m - prev); prev = m; }
    var markVar = Math.max.apply(null, rs) - Math.min.apply(null, rs);

    var C = res.checks;
    function add(id, label, status, detail) { C.push({ id: id, label: label, status: status, detail: detail }); }

    add('riser', 'Riser height', r <= IRC.maxRiser + 1e-9 ? 'pass' : 'fail',
      fmt(r) + ' (' + r.toFixed(3) + ' in) against a ' + fmt(IRC.maxRiser) + ' maximum, R311.7.5.1.' +
      (r > IRC.maxRiser + 1e-9 ? ' Add a riser: ' + (N + 1) + ' risers gives ' + fmt(rise / (N + 1)) + '.' : ''));
    add('tread', 'Tread depth', g >= IRC.minTread - 1e-9 ? 'pass' : 'fail',
      fmt(g) + ' nose to nose against a ' + fmt(IRC.minTread) + ' minimum, R311.7.5.2.' +
      (treadSource === 'run' ? ' Taken from your run limit, rounded down to 1/16.' : '') +
      (treadSource === 'default' ? ' No tread entered, so the 10 inch minimum is used.' : ''));
    var nStatus, nDetail;
    if (g >= IRC.noNosingTread - 1e-9 && nosing < 1e-9) { nStatus = 'pass'; nDetail = 'No nosing needed when the tread is 11 inches or deeper, R311.7.5.3.'; }
    else if (nosing >= IRC.nosingMin - 1e-9 && nosing <= IRC.nosingMax + 1e-9) { nStatus = 'pass'; nDetail = fmt(nosing) + ' is inside the ' + fmt(IRC.nosingMin) + ' to ' + fmt(IRC.nosingMax) + ' range, R311.7.5.3.'; }
    else { nStatus = 'fail'; nDetail = fmt(nosing) + ' is outside the ' + fmt(IRC.nosingMin) + ' to ' + fmt(IRC.nosingMax) + ' range. Treads 11 inches or deeper may have none, R311.7.5.3.'; }
    add('nosing', 'Nosing', nStatus, nDetail);
    add('variation', 'Riser variation', markVar <= IRC.variation + 1e-9 ? 'pass' : 'fail',
      'Marks rounded to 1/16 differ by at most ' + fmt(markVar) + ' between risers. The limit is 3/8", R311.7.5.1.');
    var worst = Math.max.apply(null, res.flights.map(function (x) { return x.rise; }));
    add('flightrise', 'Rise of one flight', worst <= IRC.maxFlightRise + 1e-9 ? 'pass' : 'fail',
      fmt(worst) + ' against a 12 ft 7 in (151") limit between floors or landings, R311.7.3.' +
      (worst > IRC.maxFlightRise + 1e-9 && !landing ? ' Turn on the landing option.' : ''));
    if (landing) {
      add('landing', 'Landing depth', landDepth >= IRC.minLanding - 1e-9 ? 'pass' : 'fail',
        fmt(landDepth) + ' in the direction of travel against a 36" minimum for a straight run, R311.7.6. Landing width must be at least the stair width (' + fmt(width) + ').');
    }
    if (o.maxRun > 0) {
      add('run', 'Run available', res.totalRun <= o.maxRun + 1e-9 ? 'pass' : 'fail',
        'The stair needs ' + fmt(res.totalRun) + (landing ? ' including the landing' : '') + ' of run. You have ' + fmt(o.maxRun) + '.');
    }
    add('width', 'Stair width', width >= IRC.minWidth - 1e-9 ? 'pass' : 'fail',
      fmt(width) + ' clear against a 36" minimum above the handrail, R311.7.1. A handrail may narrow it to 31 1/2" at and below handrail height.');
    if (o.headroom > 0) {
      add('headroom', 'Headroom', o.headroom >= IRC.minHeadroom - 1e-9 ? 'pass' : 'fail',
        fmt(o.headroom) + ' against 6 ft 8 in (80"), measured straight up from the line along the nosings, R311.7.2.');
    }
    if (o.open) {
      var gap = r - t;
      if (rise > 30) add('sphere', 'Open risers', gap < IRC.sphere - 1e-9 ? 'pass' : 'fail',
        'Gap between treads ' + fmt(gap) + '. A 4" sphere must not pass where the drop below is over 30", R311.7.5.1.');
      else add('sphere', 'Open risers', 'pass', 'Drop is 30" or less, so the 4" sphere rule does not apply, R311.7.5.1.');
    }
    var minThroat = Math.min.apply(null, res.flights.map(function (x) { return x.throat; }));
    add('throat', 'Wood left under the notch', minThroat <= 0 ? 'fail' : (minThroat >= MIN_THROAT - 1e-9 ? 'pass' : 'warn'),
      minThroat <= 0 ? 'The ' + fmt(D) + ' board is too narrow for this notch.' :
      fmt(minThroat) + ' of wood under the deepest notch. Shops usually want 3 1/2" or more. This is practice, not an IRC number.');

    res.markVar = markVar;
    res.fails = C.filter(function (c) { return c.status === 'fail'; }).length;
    res.warns = C.filter(function (c) { return c.status === 'warn'; }).length;
    res.ok = res.fails === 0;
    return res;
  }

  var api = { IRC: IRC, parseLen: parseLen, fmt: fmt, round16: round16, flight: flight, compute: compute };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Stairs = api;
})(typeof window !== 'undefined' ? window : this);
