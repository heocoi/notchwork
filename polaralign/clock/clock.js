/* Polar Scope Clock engine. A plain JS port of the Polar Align Android engine
   (IAU 2006 precession, IAU 2000B nutation, annual aberration, apparent sidereal time).
   No network, no storage. Loaded by the page and by the node parity test. */
(function (root) {
  'use strict';

  var AS2R = Math.PI / 648000;
  var MAS2R = AS2R / 1000;
  var TWO_PI = 2 * Math.PI;

  var STARS = {
    polaris: { name: 'Polaris', north: true,
      raDeg: (2 + 31 / 60 + 49.09 / 3600) * 15, decDeg: 89 + 15 / 60 + 50.8 / 3600,
      pmRa: 44.48, pmDec: -11.85 },
    sigmaOct: { name: 'Sigma Octantis', north: false,
      raDeg: (21 + 8 / 60 + 46.86357 / 3600) * 15, decDeg: -(88 + 57 / 60 + 23.3983 / 3600),
      pmRa: 26.323, pmDec: 4.721 }
  };

  function starForLatitude(lat) { return lat >= 0 ? STARS.polaris : STARS.sigmaOct; }

  function normTwoPi(x) { var r = x % TWO_PI; return r < 0 ? r + TWO_PI : r; }
  function norm360(x) { var r = x % 360; return r < 0 ? r + 360 : r; }

  // Time. Leap seconds fixed at 37 (TT-UTC = 69.184 s, valid since 2017-01-01).
  var J2000_JD = 2451545.0, TT_MINUS_UTC_SEC = 69.184, UNIX_EPOCH_JD = 2440587.5;
  function jdUtc(ms) { return UNIX_EPOCH_JD + ms / 86400000; }
  function ttCenturies(ms) { return (jdUtc(ms) + TT_MINUS_UTC_SEC / 86400 - J2000_JD) / 36525; }
  function earthRotationAngle(jdUt1) {
    var d1 = Math.floor(jdUt1), f = jdUt1 - d1, t = d1 - J2000_JD + f;
    var frac = f + 0.7790572732640 + 0.00273781191135448 * t;
    return normTwoPi(TWO_PI * (frac - Math.floor(frac)));
  }

  function meanObliquity(t) {
    return (84381.406 + (-46.836769 + (-0.0001831 + (0.00200340 + (-0.000000576 + (-0.0000000434) * t) * t) * t) * t) * t) * AS2R;
  }

  // Earth velocity over c, equatorial J2000 axes (Standish mean elements).
  function earthVelocityOverC(t) {
    var K = 0.01720209895, C_AU_DAY = 173.1446326846693, DEG = Math.PI / 180;
    var a = 1.00000261;
    var e = 0.01671123 - 0.00004392 * t;
    var bigL = (100.46457166 + 35999.37244981 * t) * DEG;
    var varpi = (102.93768193 + 0.32327364 * t) * DEG;
    var m = normTwoPi(bigL - varpi);
    var ea = m + e * Math.sin(m);
    for (var i = 0; i < 8; i++) ea -= (ea - e * Math.sin(ea) - m) / (1 - e * Math.cos(ea));
    var nu = 2 * Math.atan2(Math.sqrt(1 + e) * Math.sin(ea / 2), Math.sqrt(1 - e) * Math.cos(ea / 2));
    var p = a * (1 - e * e);
    var lon = varpi + nu;
    var vr = K / Math.sqrt(p) * e * Math.sin(nu);
    var vt = K / Math.sqrt(p) * (1 + e * Math.cos(nu));
    var vx = vr * Math.cos(lon) - vt * Math.sin(lon);
    var vy = vr * Math.sin(lon) + vt * Math.cos(lon);
    var eps = meanObliquity(0);
    return [vx / C_AU_DAY, vy * Math.cos(eps) / C_AU_DAY, vy * Math.sin(eps) / C_AU_DAY];
  }

  // IAU 2000B luni-solar series. Per term 11 numbers: nl, nlp, nf, nd, nom, ps, pst, pc, ec, ect, es.
  var NUT_TABLE = [
    0, 0, 0, 0, 1, -172064161, -174666, 33386, 92052331, 9086, 15377,
    0, 0, 2, -2, 2, -13170906, -1675, -13696, 5730336, -3015, -4587,
    0, 0, 2, 0, 2, -2276413, -234, 2796, 978459, -485, 1374,
    0, 0, 0, 0, 2, 2074554, 207, -698, -897492, 470, -291,
    0, 1, 0, 0, 0, 1475877, -3633, 11817, 73871, -184, -1924,
    0, 1, 2, -2, 2, -516821, 1226, -524, 224386, -677, -174,
    1, 0, 0, 0, 0, 711159, 73, -872, -6750, 0, 358,
    0, 0, 2, 0, 1, -387298, -367, 380, 200728, 18, 318,
    1, 0, 2, 0, 2, -301461, -36, 816, 129025, -63, 367,
    0, -1, 2, -2, 2, 215829, -494, 111, -95929, 299, 132,
    0, 0, 2, -2, 1, 128227, 137, 181, -68982, -9, 39,
    -1, 0, 2, 0, 2, 123457, 11, 19, -53311, 32, -4,
    -1, 0, 0, 2, 0, 156994, 10, -168, -1235, 0, 82,
    1, 0, 0, 0, 1, 63110, 63, 27, -33228, 0, -9,
    -1, 0, 0, 0, 1, -57976, -63, -189, 31429, 0, -75,
    -1, 0, 2, 2, 2, -59641, -11, 149, 25543, -11, 66,
    1, 0, 2, 0, 1, -51613, -42, 129, 26366, 0, 78,
    -2, 0, 2, 0, 1, 45893, 50, 31, -24236, -10, 20,
    0, 0, 0, 2, 0, 63384, 11, -150, -1220, 0, 29,
    0, 0, 2, 2, 2, -38571, -1, 158, 16452, -11, 68,
    0, -2, 2, -2, 2, 32481, 0, 0, -13870, 0, 0,
    -2, 0, 0, 2, 0, -47722, 0, -18, 477, 0, -25,
    2, 0, 2, 0, 2, -31046, -1, 131, 13238, -11, 59,
    1, 0, 2, -2, 2, 28593, 0, -1, -12338, 10, -3,
    -1, 0, 2, 0, 1, 20441, 21, 10, -10758, 0, -3,
    2, 0, 0, 0, 0, 29243, 0, -74, -609, 0, 13,
    0, 0, 2, 0, 0, 25887, 0, -66, -550, 0, 11,
    0, 1, 0, 0, 1, -14053, -25, 79, 8551, -2, -45,
    -1, 0, 0, 2, 1, 15164, 10, 11, -8001, 0, -1,
    0, 2, 2, -2, 2, -15794, 72, -16, 6850, -42, -5,
    0, 0, -2, 2, 0, 21783, 0, 13, -167, 0, 13,
    1, 0, 0, -2, 1, -12873, -10, -37, 6953, 0, -14,
    0, -1, 0, 0, 1, -12654, 11, 63, 6415, 0, 26,
    -1, 0, 2, 2, 1, -10204, 0, 25, 5222, 0, 15,
    0, 2, 0, 0, 0, 16707, -85, -10, 168, -1, 10,
    1, 0, 2, 2, 2, -7691, 0, 44, 3268, 0, 19,
    -2, 0, 2, 0, 0, -11024, 0, -14, 104, 0, 2,
    0, 1, 2, 0, 2, 7566, -21, -11, -3250, 0, -5,
    0, 0, 2, 2, 1, -6637, -11, 25, 3353, 0, 14,
    0, -1, 2, 0, 2, -7141, 21, 8, 3070, 0, 4,
    0, 0, 0, 2, 1, -6302, -11, 2, 3272, 0, 4,
    1, 0, 2, -2, 1, 5800, 10, 2, -3045, 0, -1,
    2, 0, 2, -2, 2, 6443, 0, -7, -2768, 0, -4,
    -2, 0, 0, 2, 1, -5774, -11, -15, 3041, 0, -5,
    2, 0, 2, 0, 1, -5350, 0, 21, 2695, 0, 12,
    0, -1, 2, -2, 1, -4752, -11, -3, 2719, 0, -3,
    0, 0, 0, -2, 1, -4940, -11, -21, 2720, 0, -9,
    -1, -1, 0, 2, 0, 7350, 0, -8, -51, 0, 4,
    2, 0, 0, -2, 1, 4065, 0, 6, -2206, 0, 1,
    1, 0, 0, 2, 0, 6579, 0, -24, -199, 0, 2,
    0, 1, 2, -2, 1, 3579, 0, 5, -1900, 0, 1,
    1, -1, 0, 0, 0, 4725, 0, -6, -41, 0, 3,
    -2, 0, 2, 0, 2, -3075, 0, -2, 1313, 0, -1,
    3, 0, 2, 0, 2, -2904, 0, 15, 1233, 0, 7,
    0, -1, 0, 2, 0, 4348, 0, -10, -81, 0, 2,
    1, -1, 2, 0, 2, -2878, 0, 8, 1232, 0, 4,
    0, 0, 0, 1, 0, -4230, 0, 5, -20, 0, -2,
    -1, -1, 2, 2, 2, -2819, 0, 7, 1207, 0, 3,
    -1, 0, 2, 0, 0, -4056, 0, 5, 40, 0, -2,
    0, -1, 2, 2, 2, -2647, 0, 11, 1129, 0, 5,
    -2, 0, 0, 0, 1, -2294, 0, -10, 1266, 0, -4,
    1, 1, 2, 0, 2, 2481, 0, -7, -1062, 0, -3,
    2, 0, 0, 0, 1, 2179, 0, -2, -1129, 0, -2,
    -1, 1, 0, 1, 0, 3276, 0, 1, -9, 0, 0,
    1, 1, 0, 0, 0, -3389, 0, 5, 35, 0, -2,
    1, 0, 2, 0, 0, 3339, 0, -13, -107, 0, 1,
    -1, 0, 2, -2, 1, -1987, 0, -6, 1073, 0, -2,
    1, 0, 0, 0, 2, -1981, 0, 0, 854, 0, 0,
    -1, 0, 0, 1, 0, 4026, 0, -353, -553, 0, -139,
    0, 0, 2, 1, 2, 1660, 0, -5, -710, 0, -2,
    -1, 0, 2, 4, 2, -1521, 0, 9, 647, 0, 4,
    -1, 1, 0, 1, 1, 1314, 0, 0, -700, 0, 0,
    0, -2, 2, -2, 1, -1283, 0, 0, 672, 0, 0,
    1, 0, 2, 2, 1, -1331, 0, 8, 663, 0, 4,
    -2, 0, 2, 2, 2, 1383, 0, -2, -594, 0, -2,
    -1, 0, 0, 0, 2, 1405, 0, 4, -610, 0, 2,
    1, 1, 2, -2, 2, 1290, 0, 0, -556, 0, 0,
  ];

  function nutation2000B(t) {
    var el = (485868.249036 + 1717915923.2178 * t) * AS2R;
    var elp = (1287104.79305 + 129596581.0481 * t) * AS2R;
    var f = (335779.526232 + 1739527262.8478 * t) * AS2R;
    var d = (1072260.70369 + 1602961601.2090 * t) * AS2R;
    var om = (450160.398036 + -6962890.5431 * t) * AS2R;
    var dp = 0, de = 0, tab = NUT_TABLE;
    for (var i = tab.length - 11; i >= 0; i -= 11) {
      var arg = tab[i] * el + tab[i + 1] * elp + tab[i + 2] * f + tab[i + 3] * d + tab[i + 4] * om;
      var s = Math.sin(arg), c = Math.cos(arg);
      dp += (tab[i + 5] + tab[i + 6] * t) * s + tab[i + 7] * c;
      de += (tab[i + 8] + tab[i + 9] * t) * c + tab[i + 10] * s;
    }
    var u2r = AS2R / 1e7;
    return { dpsi: dp * u2r + -0.135 * MAS2R, deps: de * u2r + 0.388 * MAS2R };
  }

  function fw(t) {
    var gamb = (-0.052928 + (10.556378 + (0.4932044 + (-0.00031238 + (-0.000002788 + 0.0000000260 * t) * t) * t) * t) * t) * AS2R;
    var phib = (84381.412819 + (-46.811016 + (0.0511268 + (0.00053289 + (-0.000000440 + (-0.0000000176) * t) * t) * t) * t) * t) * AS2R;
    var psib = (-0.041775 + (5038.481484 + (1.5584175 + (-0.00018522 + (-0.000026452 + (-0.0000000148) * t) * t) * t) * t) * t) * AS2R;
    return [gamb, phib, psib, meanObliquity(t)];
  }

  function rx(phi, m) {
    var s = Math.sin(phi), c = Math.cos(phi), o = m.slice();
    for (var j = 0; j < 3; j++) {
      o[3 + j] = c * m[3 + j] + s * m[6 + j];
      o[6 + j] = -s * m[3 + j] + c * m[6 + j];
    }
    return o;
  }
  function rz(psi, m) {
    var s = Math.sin(psi), c = Math.cos(psi), o = m.slice();
    for (var j = 0; j < 3; j++) {
      o[j] = c * m[j] + s * m[3 + j];
      o[3 + j] = -s * m[j] + c * m[3 + j];
    }
    return o;
  }

  // GCRS to true-equator-and-equinox-of-date rotation (3x3 row-major).
  function gcrsToTrueOfDate(t, nut) {
    var a = fw(t);
    var r = [1, 0, 0, 0, 1, 0, 0, 0, 1];
    r = rz(a[0], r);
    r = rx(a[1], r);
    r = rz(-(a[2] + nut.dpsi), r);
    r = rx(-(a[3] + nut.deps), r);
    return r;
  }

  function apparentSiderealTime(ms, t, nut, dut1Seconds) {
    var jdUt1 = jdUtc(ms) + dut1Seconds / 86400;
    var gmst = normTwoPi(
      earthRotationAngle(jdUt1) +
      (0.014506 + (4612.156534 + (1.3915817 + (-0.00000044 + (-0.000029956 + (-0.0000000368) * t) * t) * t) * t) * t) * AS2R);
    var om = (450160.398036 + -6962890.5431 * t) * AS2R;
    var eect = (2640.96e-6 * Math.sin(om) - 0.39e-6 * Math.cos(om) + 63.52e-6 * Math.sin(2 * om) -
      0.02e-6 * Math.cos(2 * om) - 0.87e-6 * t * Math.sin(om)) * AS2R;
    var ee = nut.dpsi * Math.cos(meanObliquity(t)) + eect;
    return normTwoPi(gmst + ee);
  }

  function normalize(v) {
    var n = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
    for (var i = 0; i < 3; i++) v[i] /= n;
  }

  // Where the pole star is, as seen from a longitude (east positive) at a given instant (unix ms).
  function state(star, ms, lonEastDeg, dut1Seconds) {
    dut1Seconds = dut1Seconds || 0;
    var t = ttCenturies(ms), years = t * 100;
    var ra0 = star.raDeg * Math.PI / 180, dec0 = star.decDeg * Math.PI / 180;
    var p = [Math.cos(dec0) * Math.cos(ra0), Math.cos(dec0) * Math.sin(ra0), Math.sin(dec0)];
    var eA = [-Math.sin(ra0), Math.cos(ra0), 0];
    var eD = [-Math.sin(dec0) * Math.cos(ra0), -Math.sin(dec0) * Math.sin(ra0), Math.cos(dec0)];
    for (var i = 0; i < 3; i++) p[i] += years * MAS2R * (star.pmRa * eA[i] + star.pmDec * eD[i]);
    normalize(p);
    var v = earthVelocityOverC(t);
    for (i = 0; i < 3; i++) p[i] += v[i];
    normalize(p);
    var nut = nutation2000B(t);
    var r = gcrsToTrueOfDate(t, nut);
    var x = r[0] * p[0] + r[1] * p[1] + r[2] * p[2];
    var y = r[3] * p[0] + r[4] * p[1] + r[5] * p[2];
    var z = r[6] * p[0] + r[7] * p[1] + r[8] * p[2];
    var ra = normTwoPi(Math.atan2(y, x));
    var dec = Math.asin(Math.max(-1, Math.min(1, z)));
    var gast = apparentSiderealTime(ms, t, nut, dut1Seconds);
    var lst = normTwoPi(gast + lonEastDeg * Math.PI / 180);
    var ha = normTwoPi(lst - ra);
    var decDeg = dec * 180 / Math.PI;
    var haDeg = ha * 180 / Math.PI;
    var naked = norm360(star.north ? -haDeg : haDeg);
    return {
      star: star,
      hourAngleDeg: haDeg,
      polarDistanceDeg: star.north ? 90 - decDeg : 90 + decDeg,
      raDeg: ra * 180 / Math.PI,
      decDeg: decDeg,
      nakedEyeClockDeg: naked,
      throughScopeClockDeg: norm360(naked + 180)
    };
  }

  // Milliseconds until the star next crosses the upper meridian (hour angle 0).
  function millisToUpperTransit(star, ms, lonEastDeg) {
    var rate = 360.98564736629 / 86400000;
    var target = ms + Math.trunc(((360 - state(star, ms, lonEastDeg).hourAngleDeg) % 360) / rate);
    for (var i = 0; i < 4; i++) {
      var ha = state(star, target, lonEastDeg).hourAngleDeg;
      var err = ha > 180 ? ha - 360 : ha;
      if (Math.abs(err) < 1e-5) return target - ms;
      target -= Math.trunc(err / rate);
    }
    return target - ms;
  }

  // Dial reading of the generic 12 hour clock, "h:mm". Same rounding as the app.
  function formatHm(hours) {
    var total = Math.round(hours * 60);
    if (total < 0) total += 24 * 60;
    var h = Math.floor(total / 60), m = total % 60;
    return h + ':' + (m < 10 ? '0' : '') + m;
  }
  function dialHours(clockDeg) { return clockDeg / 30; }

  var api = {
    STARS: STARS, starForLatitude: starForLatitude, state: state,
    millisToUpperTransit: millisToUpperTransit, formatHm: formatHm, dialHours: dialHours,
    _internals: { nutation2000B: nutation2000B, NUT_TABLE: NUT_TABLE }
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PolarClock = api;
})(typeof window !== 'undefined' ? window : this);
