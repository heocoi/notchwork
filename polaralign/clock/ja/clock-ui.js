/* Polar scope clock page, Japanese UI. Same logic as ../clock-ui.js, strings and formats for Japan. Reads inputs, calls PolarClock, draws the dial. No network, no storage. */
(function () {
  'use strict';
  var C = window.PolarClock;
  var $ = function (id) { return document.getElementById(id); };
  var NS = 'http://www.w3.org/2000/svg';
  var R_STAR = 112;

  // Dial furniture: 60 ticks, an hour numeral every 5th.
  (function drawTicks() {
    var g = $('ticks');
    for (var i = 0; i < 60; i++) {
      var a = i * 6 * Math.PI / 180, major = i % 5 === 0;
      var r1 = 186, r2 = major ? 168 : 177;
      var ln = document.createElementNS(NS, 'line');
      ln.setAttribute('x1', 200 + r1 * Math.sin(a)); ln.setAttribute('y1', 200 - r1 * Math.cos(a));
      ln.setAttribute('x2', 200 + r2 * Math.sin(a)); ln.setAttribute('y2', 200 - r2 * Math.cos(a));
      ln.setAttribute('class', major ? 'tk maj' : 'tk');
      g.appendChild(ln);
      if (major) {
        var t = document.createElementNS(NS, 'text'), h = i / 5 === 0 ? 12 : i / 5, rt = 144;
        t.setAttribute('x', 200 + rt * Math.sin(a)); t.setAttribute('y', 200 - rt * Math.cos(a));
        t.textContent = h;
        g.appendChild(t);
      }
    }
  })();

  var els = { lat: $('lat'), lon: $('lon'), err: $('err'), geo: $('geo'), now: $('now') };

  function parseCoord(s) {
    s = String(s).trim().replace(',', '.');
    if (!/^[+-]?\d+(\.\d+)?$|^[+-]?\.\d+$/.test(s)) return NaN;
    return parseFloat(s);
  }

  function readInputs() {
    var lat = parseCoord(els.lat.value), lon = parseCoord(els.lon.value);
    var msg = '';
    var empty = els.lat.value.trim() === '' || els.lon.value.trim() === '';
    els.lat.classList.remove('bad'); els.lon.classList.remove('bad');
    if (empty) return { ok: false, msg: '' };
    if (isNaN(lat) || lat < -90 || lat > 90) { els.lat.classList.add('bad'); msg = '緯度は -90 から 90 の数字で入力してください。'; }
    else if (isNaN(lon) || lon < -180 || lon > 180) { els.lon.classList.add('bad'); msg = '経度は -180 から 180 の数字で入力してください。西経はマイナスです。'; }
    return msg ? { ok: false, msg: msg } : { ok: true, lat: lat, lon: lon };
  }

  function view() { return document.querySelector('input[name=view]:checked').value; }

  function fmtHA(hours) {
    var total = Math.round(hours * 60), h = Math.floor(total / 60), m = total % 60;
    return h + '時間' + (m < 10 ? '0' : '') + m + '分';
  }
  function fmtCountdown(ms) {
    var min = Math.floor(ms / 60000);
    return Math.floor(min / 60) + '時間' + (min % 60 < 10 ? '0' : '') + (min % 60) + '分';
  }

  var lastLabel = '';
  function update() {
    var nowMs = Date.now();
    var tz = 'お使いのタイムゾーン';
    try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || tz; } catch (e) { /* keep default */ }
    els.now.textContent = '端末の時計：' + new Date(nowMs).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }) + ' (' + tz + ')';

    var inp = readInputs();
    els.err.hidden = !inp.msg;
    els.err.textContent = inp.msg;
    $('star').style.display = inp.ok ? '' : 'none';
    $('read').hidden = !inp.ok;
    $('empty').hidden = inp.ok;
    if (!inp.ok) {
      $('empty').textContent = inp.msg ? '上の緯度経度を直すと、星の位置が表示されます。' : '緯度と経度を入力すると、星の位置が表示されます。';
      $('dial').setAttribute('aria-label', '極軸望遠鏡の文字盤。緯度と経度を入力すると星の位置が表示されます。');
      lastLabel = '';
      return;
    }
    var star = C.starForLatitude(inp.lat);
    var s = C.state(star, nowMs, inp.lon);
    var through = view() === 'through';
    var deg = through ? s.throughScopeClockDeg : s.nakedEyeClockDeg;
    var a = deg * Math.PI / 180;
    var x = 200 + R_STAR * Math.sin(a), y = 200 - R_STAR * Math.cos(a);
    $('dot').setAttribute('cx', x); $('dot').setAttribute('cy', y);
    $('halo').setAttribute('cx', x); $('halo').setAttribute('cy', y);
    $('spoke').setAttribute('x2', x); $('spoke').setAttribute('y2', y);
    var reading = C.formatHm(C.dialHours(deg));
    $('dialtxt').textContent = reading;
    var starJa = star.north ? '北極星' : 'はちぶんぎ座σ星';
    $('starname').textContent = starJa;
    $('ha').textContent = fmtHA(s.hourAngleDeg / 15);
    $('transit').textContent = fmtCountdown(C.millisToUpperTransit(star, nowMs, inp.lon));
    $('pd').textContent = (s.polarDistanceDeg * 60).toFixed(1) + '′';
    var label = '極軸望遠鏡の文字盤。' + starJa + 'は' + reading + 'の位置（' + (through ? '極軸望遠鏡で見た向き' : '肉眼の向き') + '）。';
    if (label !== lastLabel) { $('dial').setAttribute('aria-label', label); lastLabel = label; }
  }

  els.geo.addEventListener('click', function () {
    if (!navigator.geolocation) { els.err.hidden = false; els.err.textContent = 'このブラウザでは現在地を取得できません。緯度経度を入力してください。'; return; }
    els.geo.disabled = true;
    navigator.geolocation.getCurrentPosition(function (p) {
      els.lat.value = p.coords.latitude.toFixed(4);
      els.lon.value = p.coords.longitude.toFixed(4);
      els.geo.disabled = false;
      update();
    }, function () {
      els.geo.disabled = false;
      els.err.hidden = false;
      els.err.textContent = '現在地を取得できませんでした。緯度経度を入力してください。';
    }, { enableHighAccuracy: false, timeout: 15000, maximumAge: 0 });
  });

  ['input', 'change'].forEach(function (ev) { $('f').addEventListener(ev, update); });
  $('f').addEventListener('submit', function (e) { e.preventDefault(); });

  // Optional ?lat=..&lon=.. in the address, so a link can open the page with a site filled in.
  var q = new URLSearchParams(location.search);
  if (q.has('lat')) els.lat.value = q.get('lat');
  if (q.has('lon')) els.lon.value = q.get('lon');

  update();
  setInterval(update, 1000);
})();
