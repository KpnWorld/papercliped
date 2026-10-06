import { FAVICON_LINK } from "../site/favicon.js";
/**
 * Operator dashboard (served at /admin). One self-contained page: no external scripts, fonts or images, so the CSP can be
 * `default-src 'none'` + a per-response script nonce. All data is drawn with DOM/SVG APIs and `textContent` — client names,
 * tenant hosts and tool names are untrusted strings and are never interpolated into HTML.
 *
 * Design follows the dataviz method: one axis per chart (throughput and latency are separate charts, never dual-axis), colour
 * assigned by job (categorical blue/orange for Paperclip-vs-bridge time, a one-hue ramp for ordered percentiles, reserved
 * status colours that always ship with an icon + label), thin marks with 2px surface gaps, hairline solid gridlines, a legend
 * for ≥2 series, a crosshair tooltip, and a "view as table" for every chart.
 */
import { esc } from "../oauth/pages.js";

const CSS = String.raw`
:root{color-scheme:light;--surface:#fcfcfb;--card:#ffffff;--ink:#0b0b0b;--ink2:#52514e;--ink3:#7a7974;--hair:#e7e6e2;--hair2:#d8d7d2;
--s1:#2a78d6;--s2:#eb6834;--r300:#6da7ec;--r450:#2a78d6;--r600:#184f95;--neutral:#b8b7b1;
--good:#0ca30c;--warn:#fab219;--serious:#ec835a;--crit:#d03b3b;--goodink:#08700a;--warnink:#8a5b00;--critink:#b02a2a;--wash:#f4f3ef}
@media (prefers-color-scheme:dark){:root{color-scheme:dark;--surface:#1a1a19;--card:#212120;--ink:#ffffff;--ink2:#c3c2b7;--ink3:#8f8e86;--hair:#2e2e2c;--hair2:#3a3a37;
--s1:#3987e5;--s2:#d95926;--r300:#6da7ec;--r450:#3987e5;--r600:#2a78d6;--neutral:#6b6a65;--goodink:#4cc24c;--warnink:#fab219;--critink:#ff7b7b;--wash:#262624}}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--surface);color:var(--ink);font:14px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
.wrap{max-width:1240px;margin:0 auto;padding:16px}
header{display:flex;flex-wrap:wrap;gap:12px 20px;align-items:center;justify-content:space-between;margin-bottom:14px}
h1{font-size:16px;font-weight:600;margin:0;letter-spacing:.01em}h1 small{font-weight:400;color:var(--ink2);margin-left:8px}
.ctl{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.seg{display:inline-flex;border:1px solid var(--hair2);border-radius:8px;overflow:hidden}
.seg button{border:0;background:transparent;color:var(--ink2);padding:6px 10px;font:inherit;cursor:pointer;border-right:1px solid var(--hair2)}
.seg button:last-child{border-right:0}.seg button:hover{background:var(--wash)}
.seg button[aria-pressed=true]{background:var(--wash);color:var(--ink);font-weight:600}
button.plain,.signout button{border:1px solid var(--hair2);background:transparent;color:var(--ink2);border-radius:8px;padding:6px 10px;font:inherit;cursor:pointer}
button.plain:hover,.signout button:hover{background:var(--wash)}
button:focus-visible,summary:focus-visible,th[tabindex]:focus-visible,.hit:focus-visible{outline:2px solid var(--s1);outline-offset:2px}
.signout{margin:0}
.pill{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--hair2);border-radius:999px;padding:3px 10px;font-weight:600}
.pill .ic{font-weight:700}.pill.healthy{color:var(--goodink)}.pill.degraded{color:var(--warnink)}.pill.critical{color:var(--critink)}.pill.idle{color:var(--ink2)}
.live{display:inline-flex;align-items:center;gap:6px;color:var(--ink2)}
.dot{width:8px;height:8px;border-radius:50%;background:var(--good)}.dot.stale{background:var(--warn)}.dot.off{background:var(--crit)}.dot.paused{background:var(--neutral)}
@media (prefers-reduced-motion:no-preference){.dot:not(.stale):not(.off):not(.paused){animation:pulse 2s ease-in-out infinite}
.flash{animation:flash 1.6s ease-out}}
@keyframes pulse{50%{opacity:.35}}@keyframes flash{from{background:var(--wash)}to{background:transparent}}
.banner{display:none;margin:0 0 12px;padding:8px 12px;border:1px solid var(--hair2);border-radius:8px;background:var(--wash);color:var(--ink)}
.banner.show{display:block}.banner b{color:var(--critink)}
main{transition:opacity .15s}main.loading{opacity:.6}
.reasons{margin:0 0 12px;color:var(--ink2)}
.grid{display:grid;gap:12px}
.tiles{grid-template-columns:repeat(auto-fit,minmax(160px,1fr));margin-bottom:12px}
.hero{grid-column:1/-1}@media (min-width:900px){.hero{grid-column:span 2}}
.card{background:var(--card);border:1px solid var(--hair);border-radius:12px;padding:14px 16px;min-width:0}
.card h2{font-size:13px;font-weight:600;margin:0 0 2px;color:var(--ink)}.card .sub{color:var(--ink2);font-size:12px;margin:0 0 8px}
.tile .lbl{color:var(--ink2);font-size:12px}.tile .val{font-size:24px;font-weight:600;line-height:1.2;margin-top:2px}
.tile .note{color:var(--ink2);font-size:12px;margin-top:2px}.tile .val .ic{font-size:16px;margin-right:4px}
.tile.hero .val{font-size:52px;line-height:1.05}.tile.hero .note{font-size:13px}
.good{color:var(--goodink)}.warn{color:var(--warnink)}.bad{color:var(--critink)}
.two{grid-template-columns:1fr}@media (min-width:900px){.two{grid-template-columns:1fr 1fr}}
.legend{display:flex;flex-wrap:wrap;gap:4px 14px;margin:0 0 6px;color:var(--ink2);font-size:12px}
.legend span{display:inline-flex;align-items:center;gap:6px}.legend i{display:inline-block;width:10px;height:10px;border-radius:2px}.legend i.ln{height:2px;width:14px;border-radius:0}
.chart{position:relative}.chart svg{display:block;width:100%;height:auto;overflow:visible}
.chart text{fill:var(--ink3);font:11px system-ui,sans-serif}
.tip{position:absolute;pointer-events:none;background:var(--card);border:1px solid var(--hair2);border-radius:8px;padding:8px 10px;font-size:12px;box-shadow:0 4px 18px rgba(0,0,0,.14);z-index:5;min-width:140px;display:none}
.tip .th{color:var(--ink2);margin-bottom:4px}.tip .row{display:flex;align-items:center;gap:8px;margin-top:2px}
.tip .row i{display:inline-block;width:12px;height:2px}.tip .row b{font-weight:600;color:var(--ink);min-width:3.2em;text-align:right;font-variant-numeric:tabular-nums}.tip .row span{color:var(--ink2)}
details.tv{margin-top:6px}details.tv summary{cursor:pointer;color:var(--ink2);font-size:12px}
.tw{max-height:240px;overflow:auto;margin-top:6px}
table{border-collapse:collapse;width:100%;font-size:12.5px}
th,td{padding:5px 6px;text-align:left;border-bottom:1px solid var(--hair);white-space:nowrap}
td.txt{max-width:190px;overflow:hidden;text-overflow:ellipsis}
.tail{max-height:420px;overflow:auto}
th{font-weight:600;color:var(--ink2);font-size:12px;position:sticky;top:0;background:var(--card)}
th.n,td.n{text-align:right;font-variant-numeric:tabular-nums}th[tabindex]{cursor:pointer}th[aria-sort=ascending]::after{content:" ▲";font-size:9px}th[aria-sort=descending]::after{content:" ▼";font-size:9px}
.tbl{overflow-x:auto}
.chip{display:inline-flex;align-items:center;gap:4px;font-weight:600}.chip.ok{color:var(--goodink)}.chip.rej{color:var(--ink2)}.chip.fault{color:var(--critink)}.chip.slow{color:var(--warnink)}
.split{display:inline-flex;height:6px;width:44px;border-radius:3px;overflow:hidden;gap:2px;vertical-align:middle;background:var(--hair)}.split i{display:block;height:100%}
.empty{color:var(--ink2);padding:18px 4px}
h2.sect{font-size:13px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--ink2);margin:22px 2px 10px}
ul.logfeed{list-style:none;margin:0;padding:0;font:12.5px/1.7 ui-monospace,SFMono-Regular,Menlo,monospace}
ul.logfeed li{padding:1px 4px;border-radius:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
ul.logfeed .t{color:var(--ink3)}ul.logfeed .u{font-weight:600}ul.logfeed .d{color:var(--ink3)}
ul.logfeed .k-joined{color:var(--goodink)}ul.logfeed .k-left{color:var(--ink2)}ul.logfeed .k-failed{color:var(--critink)}ul.logfeed .k-updated{color:var(--ink)}
footer{color:var(--ink3);font-size:12px;margin:14px 0 4px}footer b{color:var(--ink2);font-weight:600}
.ln{display:block}.mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px}
.err{background:var(--wash);border:1px solid var(--hair2);padding:8px 10px;border-radius:8px;color:var(--critink);margin:10px 0}
form.login{max-width:360px;margin:12vh auto;background:var(--card);border:1px solid var(--hair);border-radius:12px;padding:20px}
form.login input{width:100%;padding:8px 10px;margin:8px 0 12px;border:1px solid var(--hair2);border-radius:8px;background:var(--surface);color:var(--ink);font:inherit}
form.login button{border:1px solid var(--ink);background:var(--ink);color:var(--surface);border-radius:8px;padding:8px 14px;font:inherit;cursor:pointer;width:100%}
`;

export function loginPage(_nonce: string, error?: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Papercliped panel — sign in</title>${FAVICON_LINK}<style>${CSS}</style></head><body>
<form class="login" method="post" action="/login"><h1>Papercliped panel</h1><p style="color:var(--ink2);margin:6px 0 0">Operator sign-in</p>
${error ? `<div class="err" role="alert">${esc(error)}</div>` : ""}
<label for="t" style="display:block;margin-top:12px">Admin token</label><input id="t" name="token" type="password" autocomplete="off" required autofocus><button type="submit">Sign in</button></form></body></html>`;
}

export function panelPage(nonce: string, o: { slowMs: number }): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Papercliped panel — live</title>${FAVICON_LINK}<style>${CSS}</style></head>
<body data-slow="${Number(o.slowMs) || 1500}"><div class="wrap">
<header><h1>Papercliped panel<small id="where"></small></h1>
<div class="ctl"><span id="pill" class="pill idle"><span class="ic">•</span><span>Loading…</span></span>
<span class="live"><span id="dot" class="dot stale"></span><span id="age">connecting…</span></span>
<div class="seg" id="win" role="group" aria-label="Time window"></div>
<button class="plain" id="pause" type="button" aria-pressed="false">Pause</button>
<form class="signout" method="post" action="/logout"><button type="submit">Sign out</button></form></div></header>
<div id="banner" class="banner" role="status"></div>
<main id="main">
<p id="reasons" class="reasons"></p>
<section class="grid tiles" id="tiles" aria-label="Key numbers"></section>
<section class="grid two">
<div class="card"><h2>Throughput</h2><p class="sub">Tool calls per bucket, split by outcome</p><div id="c-thr"></div></div>
<div class="card"><h2>Latency</h2><p class="sub">End-to-end time inside the bridge, per bucket</p><div id="c-lat"></div></div>
<div class="card"><h2>Where the time goes</h2><p class="sub">Average per call: waiting on the user's Paperclip vs. the bridge itself</p><div id="c-split"></div></div>
<div class="card"><h2>Latency distribution</h2><p class="sub">How many calls finished within each time band (axis shows each band's upper bound, in ms unless marked s)</p><div id="c-hist"></div></div>
</section>
<h2 class="sect" id="community-h">Community</h2>
<section class="grid tiles" id="ctiles" aria-label="Community numbers"></section>
<section class="grid two">
<div class="card"><h2>Connections over time</h2><p class="sub">Clients that finished connecting vs. connection attempts that failed</p><div id="c-conn"></div></div>
<div class="card"><h2>Community log</h2><p class="sub">Newest first. <span id="feed-note"></span></p><div class="tbl tail" id="t-feed"></div></div>
<div class="card"><h2>Why connections fail</h2><p class="sub">Failed or abandoned sign-ins in this window</p><div class="tbl" id="t-fail"></div></div>
<div class="card"><h2>Most active users</h2><p class="sub">By tool calls in this window</p><div class="tbl" id="t-users"></div></div>
</section>
<h2 class="sect">Performance detail</h2>
<section class="grid two">
<div class="card"><h2>Tools</h2><p class="sub">Click a column to sort. "Wait" = time waiting on the user's Paperclip</p><div class="tbl" id="t-tools"></div></div>
<div class="card"><h2>Tenants — slowest Paperclip instances</h2><p class="sub">Sorted by "Wait p95": time spent waiting on that tenant's Paperclip</p><div class="tbl" id="t-inst"></div></div>
<div class="card"><h2>Errors by class</h2><p class="sub">Caller mistakes are not system faults</p><div class="tbl" id="t-err"></div></div>
<div class="card"><h2>OAuth &amp; MCP endpoints</h2><p class="sub">HTTP requests handled by the bridge</p><div class="tbl" id="t-http"></div></div>
</section>
<section class="grid two" style="margin-top:12px">
<div class="card"><h2>Live tail</h2><p class="sub">Newest calls first (✎ = changes something). Arguments and results are never recorded.</p><div class="tbl tail" id="t-live"></div></div>
<div class="card"><h2>Slowest calls in window</h2><p class="sub">Where to look first</p><div class="tbl" id="t-slow"></div></div>
</section>
</main>
<footer id="foot"></footer></div>
<script nonce="${nonce}">${String.raw`
(function () {
'use strict';
var SLOW = Number(document.body.getAttribute('data-slow')) || 1500;
var WINDOWS = ['5m', '15m', '1h', '6h', '24h', '7d'];
var WIN_MS = { '5m': 300000, '15m': 900000, '1h': 3600000, '6h': 21600000, '24h': 86400000, '7d': 604800000 };
var state = { win: '15m', paused: false, data: null, lastOk: 0, err: null, events: [], lastId: 0, sort: {}, open: {}, hovering: false, feed: [], lastFeedId: 0, cname: 'cliped' };
var hash = (location.hash || '').replace('#', '');
if (WINDOWS.indexOf(hash) >= 0) state.win = hash;

function $(id) { return document.getElementById(id); }
function el(tag, props, kids) {
  var e = document.createElement(tag);
  if (props) for (var k in props) { if (k === 'class') e.className = props[k]; else if (k === 'text') e.textContent = props[k]; else e.setAttribute(k, props[k]); }
  (kids || []).forEach(function (c) { if (c != null) e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
  return e;
}
var NS = 'http://www.w3.org/2000/svg';
function sv(tag, props) { var e = document.createElementNS(NS, tag); for (var k in props) e.setAttribute(k, props[k]); return e; }
function fmtMs(v) { if (v == null || isNaN(v)) return '—'; if (v >= 1000) return (v / 1000).toFixed(v >= 10000 ? 1 : 2) + ' s'; if (v >= 100) return Math.round(v) + ' ms'; return (Math.round(v * 10) / 10) + ' ms'; }
function fmtInt(n) { return Math.round(n).toLocaleString(); }
function fmtPct(v) { return (v >= 10 ? v.toFixed(0) : v.toFixed(1)) + '%'; }
function pad(n) { return (n < 10 ? '0' : '') + n; }
function fmtTime(t, sec) { var d = new Date(t); return pad(d.getHours()) + ':' + pad(d.getMinutes()) + (sec ? ':' + pad(d.getSeconds()) : ''); }
function fmtDay(t) { var d = new Date(t); return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' ' + fmtTime(t); }
function niceStep(v) { if (v <= 0) return 1; var p = Math.pow(10, Math.floor(Math.log(v) / Math.LN10)), f = v / p; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p; }
function short(n) { return String(n).replace(/^paperclip_/, ''); }
var ALIAS = /^[A-Z][a-z]{1,2}[0-9]{2}$/;
function nameCell(n) { if (n && ALIAS.test(n)) return el('span', { title: 'Anonymous user (shown as an alias)' }, [el('span', { 'aria-hidden': 'true', text: '◌ ' }), n]); return n || '—'; }
function cls(name) { return 'fill:var(' + name + ')'; }

// ───────── status chips (colour never carries meaning alone: icon + label) ─────────
function chip(kind, label) { return el('span', { class: 'chip ' + kind }, [el('span', { 'aria-hidden': 'true', text: kind === 'ok' ? '✓' : kind === 'fault' ? '✕' : kind === 'slow' ? '▲' : '!' }), label]); }
var SHORTCLS = { upstream_5xx: 'server error', upstream_unreachable: 'unreachable', upstream_4xx: 'rejected', internal: 'bridge error', invalid_input: 'bad input', insufficient_scope: 'no scope', read_only: 'read-only', rate_limited: 'throttled', unauthorized: 'unauthorized' };
function outcome(ev) {
  if (ev.ok) return chip('ok', ev.status && ev.kind === 'http' ? String(ev.status) : 'ok');
  var fault = ev.errorClass === 'upstream_5xx' || ev.errorClass === 'upstream_unreachable' || ev.errorClass === 'internal';
  return chip(fault ? 'fault' : 'rej', (ev.status || '') + ' ' + (SHORTCLS[ev.errorClass] || ev.errorClass || 'error'));
}

// ───────── charts ─────────
function drawChart(host, cfg) {
  host.textContent = '';
  var W = Math.max(280, host.clientWidth || 560), H = 214, m = { l: 48, r: 14, t: 10, b: 24 };
  var iw = W - m.l - m.r, ih = H - m.t - m.b;
  var base, n, slotLabel;
  if (cfg.cats) { n = cfg.cats.length; base = 0; } else {
    base = Math.floor(cfg.from / cfg.bucketMs) * cfg.bucketMs; n = Math.max(1, Math.ceil((cfg.to - base) / cfg.bucketMs));
  }
  var slots = new Array(n);
  if (cfg.cats) { for (var c = 0; c < n; c++) slots[c] = cfg.rows[c]; } else {
    cfg.rows.forEach(function (b) { var i = Math.round((b.t - base) / cfg.bucketMs); if (i >= 0 && i < n) slots[i] = b; });
  }
  var ymax = 0;
  for (var i = 0; i < n; i++) {
    var s = slots[i]; if (!s) continue;
    if (cfg.type === 'bars') { var tot = 0; cfg.series.forEach(function (se) { tot += se.get(s) || 0; }); ymax = Math.max(ymax, tot); }
    else cfg.series.forEach(function (se) { var v = se.get(s); if (v != null) ymax = Math.max(ymax, v); });
  }
  if (cfg.refLine) ymax = Math.max(ymax, cfg.refLine.value * 1.1);
  var step = niceStep(ymax / 4); if (cfg.intTicks && step < 1) step = 1; var nTicks = Math.max(2, Math.ceil(ymax / step - 1e-9)); ymax = step * nTicks;
  var yS = function (v) { return m.t + ih - (v / ymax) * ih; };

  // legend (≥2 series)
  if (cfg.series.length > 1) {
    var lg = el('div', { class: 'legend' });
    cfg.series.forEach(function (se) { var k = el('i', { style: 'background:var(' + se.color + ')', class: cfg.type === 'lines' ? 'ln' : '' }); lg.appendChild(el('span', null, [k, se.label])); });
    host.appendChild(lg);
  }
  var wrap = el('div', { class: 'chart' });
  var svg = sv('svg', { viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-label': cfg.title });
  // grid + y ticks (hairline, solid)
  for (var t = 0; t <= nTicks; t++) {
    var v = step * t, y = yS(v);
    svg.appendChild(sv('line', { x1: m.l, x2: W - m.r, y1: y, y2: y, style: 'stroke:var(--hair);stroke-width:1' }));
    var tx = sv('text', { x: m.l - 6, y: y + 3.5, 'text-anchor': 'end' }); tx.textContent = cfg.yFmt(v); svg.appendChild(tx);
  }
  // x ticks
  var slotW = iw / n;
  var ticks = cfg.cats ? n : Math.min(6, n);
  for (var k2 = 0; k2 < ticks; k2++) {
    var idx = cfg.cats ? k2 : Math.round((k2 / Math.max(1, ticks - 1)) * (n - 1));
    var lab = cfg.cats ? cfg.cats[idx] : fmtTime(base + idx * cfg.bucketMs, cfg.bucketMs < 60000);
    var xt = sv('text', { x: m.l + idx * slotW + slotW / 2, y: H - 6, 'text-anchor': 'middle' }); xt.textContent = lab; svg.appendChild(xt);
  }
  // reference line (threshold) — only drawn when it is within range
  if (cfg.refLine && cfg.refLine.value <= ymax) {
    var ry = yS(cfg.refLine.value);
    svg.appendChild(sv('line', { x1: m.l, x2: W - m.r, y1: ry, y2: ry, style: 'stroke:var(--warn);stroke-width:1;stroke-dasharray:4 3' }));
    var rt = sv('text', { x: W - m.r, y: ry - 4, 'text-anchor': 'end' }); rt.textContent = cfg.refLine.label; svg.appendChild(rt);
  }
  // marks
  var bw = Math.max(1, Math.min(24, slotW - 2));
  if (cfg.type === 'bars') {
    for (var j = 0; j < n; j++) {
      var sj = slots[j]; if (!sj) continue;
      var x = m.l + j * slotW + (slotW - bw) / 2, acc = 0, drawn = 0;
      cfg.series.forEach(function (se, si) {
        var val = se.get(sj) || 0; if (val <= 0) return;
        var h = Math.max(1, (val / ymax) * ih), top = m.t + ih - acc - h, gap = drawn > 0 && h > 3 ? 2 : 0;
        var isTop = cfg.series.slice(si + 1).every(function (o) { return !(o.get(sj) > 0); });
        var r = isTop && bw >= 6 ? Math.min(4, h) : 0, hh = h - gap;
        var d = r ? 'M' + x + ',' + (top + hh) + 'V' + (top + r) + 'Q' + x + ',' + top + ' ' + (x + r) + ',' + top + 'H' + (x + bw - r) + 'Q' + (x + bw) + ',' + top + ' ' + (x + bw) + ',' + (top + r) + 'V' + (top + hh) + 'Z'
                    : 'M' + x + ',' + top + 'H' + (x + bw) + 'V' + (top + hh) + 'H' + x + 'Z';
        svg.appendChild(sv('path', { d: d, style: 'fill:var(' + se.color + ')' }));
        acc += h; drawn++;
      });
      if (cfg.valueLabels && sj) { var vt = sv('text', { x: x + bw / 2, y: m.t + ih - acc - 4, 'text-anchor': 'middle' }); vt.textContent = cfg.yFmt(cfg.series[0].get(sj) || 0); if ((cfg.series[0].get(sj) || 0) > 0) svg.appendChild(vt); }
    }
  } else {
    cfg.series.forEach(function (se) {
      var d = '', pen = false, last = null;
      for (var q = 0; q < n; q++) {
        var sq = slots[q], vq = sq ? se.get(sq) : null;
        if (vq == null) { pen = false; continue; }
        var px = m.l + q * slotW + slotW / 2, py = yS(vq);
        d += (pen ? 'L' : 'M') + px.toFixed(1) + ',' + py.toFixed(1); pen = true; last = [px, py];
      }
      if (d) svg.appendChild(sv('path', { d: d, fill: 'none', style: 'stroke:var(' + se.color + ');stroke-width:2;stroke-linejoin:round;stroke-linecap:round' }));
      if (last) svg.appendChild(sv('circle', { cx: last[0], cy: last[1], r: 4, style: 'fill:var(' + se.color + ');stroke:var(--card);stroke-width:2' }));
    });
  }
  // hover layer: crosshair + one tooltip listing every series
  var cross = sv('line', { y1: m.t, y2: m.t + ih, style: 'stroke:var(--hair2);stroke-width:1;display:none' }); svg.appendChild(cross);
  var hov = cfg.series.map(function (se) { var c2 = sv('circle', { r: 4, style: 'fill:var(' + se.color + ');stroke:var(--card);stroke-width:2;display:none' }); svg.appendChild(c2); return c2; });
  var hit = sv('rect', { x: m.l, y: m.t, width: iw, height: ih, fill: 'transparent', tabindex: '0', class: 'hit', 'aria-label': cfg.title + ' — use arrow keys to read values' });
  svg.appendChild(hit);
  var tip = el('div', { class: 'tip', role: 'status' });
  var cur = -1;
  function show(ix) {
    ix = Math.max(0, Math.min(n - 1, ix)); cur = ix;
    var sl = slots[ix], cx = m.l + ix * slotW + slotW / 2;
    cross.setAttribute('x1', cx); cross.setAttribute('x2', cx); cross.style.display = '';
    tip.textContent = '';
    tip.appendChild(el('div', { class: 'th', text: cfg.cats ? (cfg.catsLong || cfg.cats)[ix] : fmtDay(base + ix * cfg.bucketMs) }));
    if (!sl) { tip.appendChild(el('div', { class: 'row', text: 'no data' })); hov.forEach(function (h) { h.style.display = 'none'; }); }
    cfg.series.forEach(function (se, si) {
      var vv = sl ? se.get(sl) : null;
      if (cfg.type === 'lines') { if (vv == null) hov[si].style.display = 'none'; else { hov[si].setAttribute('cx', cx); hov[si].setAttribute('cy', yS(vv)); hov[si].style.display = ''; } }
      if (sl) tip.appendChild(el('div', { class: 'row' }, [el('i', { style: 'background:var(' + se.color + ')' }), el('b', { text: vv == null ? '—' : cfg.valFmt(vv) }), el('span', { text: se.label })]));
    });
    tip.style.display = 'block';
    var tw = tip.offsetWidth || 160, left = (cx / W) * wrap.clientWidth + 12;
    if (left + tw > wrap.clientWidth) left = (cx / W) * wrap.clientWidth - tw - 12;
    tip.style.left = Math.max(0, left) + 'px'; tip.style.top = '8px';
  }
  function hide() { cross.style.display = 'none'; hov.forEach(function (h) { h.style.display = 'none'; }); tip.style.display = 'none'; }
  hit.addEventListener('pointermove', function (e) { var r = svg.getBoundingClientRect(); show(Math.floor(((e.clientX - r.left) * (W / r.width) - m.l) / slotW)); });
  hit.addEventListener('pointerenter', function () { state.hovering = true; });
  hit.addEventListener('pointerleave', function () { state.hovering = false; hide(); }); hit.addEventListener('blur', hide);
  hit.addEventListener('focus', function () { show(cur < 0 ? n - 1 : cur); });
  hit.addEventListener('keydown', function (e) { if (e.key === 'ArrowLeft') { show((cur < 0 ? n : cur) - 1); e.preventDefault(); } else if (e.key === 'ArrowRight') { show((cur < 0 ? -1 : cur) + 1); e.preventDefault(); } else if (e.key === 'Escape') hide(); });
  wrap.appendChild(svg); wrap.appendChild(tip); host.appendChild(wrap);
  // table view (every value reachable without hovering)
  var det = el('details', { class: 'tv' }); if (state.open[host.id]) det.open = true; det.addEventListener('toggle', function () { state.open[host.id] = det.open; });
  var tw2 = el('div', { class: 'tw' }), tb = el('table'), hd = el('tr');
  hd.appendChild(el('th', { text: cfg.cats ? 'Band' : 'Time' }));
  cfg.series.forEach(function (se) { hd.appendChild(el('th', { class: 'n', text: se.label })); });
  tb.appendChild(el('thead', null, [hd]));
  var body = el('tbody');
  for (var z = 0; z < n; z++) {
    var sz = slots[z]; if (!sz && !cfg.cats) continue;
    var tr = el('tr'); tr.appendChild(el('td', { text: cfg.cats ? (cfg.catsLong || cfg.cats)[z] : fmtDay(base + z * cfg.bucketMs) }));
    cfg.series.forEach(function (se) { var vz = sz ? se.get(sz) : null; tr.appendChild(el('td', { class: 'n', text: vz == null ? '—' : cfg.valFmt(vz) })); });
    body.appendChild(tr);
  }
  tb.appendChild(body); tw2.appendChild(tb); det.appendChild(el('summary', { text: 'View as table' })); det.appendChild(tw2); host.appendChild(det);
}

// ───────── sortable tables ─────────
function table(host, id, cols, rows, defSort, empty) {
  host.textContent = '';
  if (!rows.length) { host.appendChild(el('div', { class: 'empty', text: empty || 'Nothing in this window.' })); return; }
  var st = state.sort[id] || (state.sort[id] = { key: defSort.key, dir: defSort.dir || -1 });
  var sorted = rows.slice().sort(function (a, b) { var x = a[st.key], y = b[st.key]; if (x == null) x = -Infinity; if (y == null) y = -Infinity; return (x < y ? -1 : x > y ? 1 : 0) * st.dir; });
  var tb = el('table'), hr = el('tr');
  cols.forEach(function (c) {
    var th = el('th', { class: c.num ? 'n' : '', text: c.label, tabindex: '0', scope: 'col' });
    if (st.key === c.key) th.setAttribute('aria-sort', st.dir > 0 ? 'ascending' : 'descending');
    var go = function () { if (st.key === c.key) st.dir = -st.dir; else { st.key = c.key; st.dir = c.num ? -1 : 1; } table(host, id, cols, rows, defSort, empty); };
    th.addEventListener('click', go); th.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
    hr.appendChild(th);
  });
  tb.appendChild(el('thead', null, [hr]));
  var body = el('tbody');
  sorted.forEach(function (r) { var tr = el('tr'); if (r._id && r._new) tr.className = 'flash'; cols.forEach(function (c) { var td = el('td', { class: c.num ? 'n' : 'txt' }); var out = c.cell ? c.cell(r) : String(r[c.key] == null ? '—' : r[c.key]); if (!c.num && typeof out === 'string') td.title = out; td.appendChild(typeof out === 'string' ? document.createTextNode(out) : out); tr.appendChild(td); }); body.appendChild(tr); });
  tb.appendChild(body); host.appendChild(tb);
}
function msCell(k) { return function (r) { var v = r[k]; if (v == null) return '—'; return v >= SLOW ? el('span', { class: 'chip slow', title: 'Slower than ' + fmtMs(SLOW) }, [el('span', { 'aria-hidden': 'true', text: '▲' }), fmtMs(v)]) : fmtMs(v); }; }

// ───────── tiles ─────────
function tile(label, value, note, extra) {
  var t = el('div', { class: 'card tile' + (extra && extra.hero ? ' hero' : '') });
  t.appendChild(el('div', { class: 'lbl', text: label }));
  var v = el('div', { class: 'val' + (extra && extra.cls ? ' ' + extra.cls : '') });
  if (extra && extra.icon) v.appendChild(el('span', { class: 'ic', 'aria-hidden': 'true', text: extra.icon }));
  v.appendChild(document.createTextNode(value)); t.appendChild(v);
  if (note) t.appendChild(el('div', { class: 'note', text: note }));
  if (extra && extra.spark) t.appendChild(extra.spark);
  return t;
}
function spark(values) {
  var vs = values.slice(-12); var ok = vs.filter(function (x) { return x != null; }); if (ok.length < 2) return document.createTextNode('');
  var W = 120, H = 26, mx = Math.max.apply(null, ok) || 1, d = '';
  vs.forEach(function (v, i) { if (v == null) return; d += (d ? 'L' : 'M') + (i / (vs.length - 1) * (W - 6) + 3).toFixed(1) + ',' + (H - 4 - (v / mx) * (H - 8)).toFixed(1); });
  var s = sv('svg', { viewBox: '0 0 ' + W + ' ' + H, width: W, height: H, 'aria-hidden': 'true' });
  s.appendChild(sv('path', { d: d, fill: 'none', style: 'stroke:var(--neutral);stroke-width:2;stroke-linejoin:round' }));
  var lastI = vs.length - 1; if (vs[lastI] != null) s.appendChild(sv('circle', { cx: (W - 3), cy: (H - 4 - (vs[lastI] / mx) * (H - 8)), r: 3.5, style: 'fill:var(--s1);stroke:var(--card);stroke-width:2' }));
  return s;
}
function delta(cur, prev, higherIsWorse, unit) {
  if (!prev || prev <= 0) return '';
  var ch = (cur - prev) / prev * 100; if (Math.abs(ch) < 1) return 'flat vs previous ' + state.win;
  return (ch > 0 ? '▲ ' : '▼ ') + Math.abs(ch).toFixed(0) + '% ' + (unit === 'lat' ? (ch > 0 ? 'slower' : 'faster') : (ch > 0 ? 'more' : 'fewer')) + ' vs previous ' + state.win;
}

// ───────── render ─────────
var PLAIN = { invalid_input: 'Caller mistake (bad input)', insufficient_scope: 'Caller lacked the scope', read_only: 'Blocked by read-only mode', upstream_4xx: 'Paperclip rejected the request (4xx)', upstream_5xx: 'Paperclip server error (5xx)', upstream_unreachable: 'Paperclip unreachable / timed out', rate_limited: 'Rate limited', unauthorized: 'Missing or invalid token', internal: 'Bridge internal error' };
var FAULTS = { upstream_5xx: 1, upstream_unreachable: 1, internal: 1 };

function render() {
  var d = state.data; if (!d) return;
  var t = d.totals, p = d.previous, sys = d.system, mins = (d.to - d.from) / 60000;
  // header
  var pill = $('pill'), h = d.health, icons = { healthy: '✓', degraded: '▲', critical: '✕', idle: '•' }, names = { healthy: 'Healthy', degraded: 'Degraded', critical: 'Critical', idle: 'Idle' };
  pill.className = 'pill ' + h.state; pill.textContent = ''; pill.appendChild(el('span', { class: 'ic', 'aria-hidden': 'true', text: icons[h.state] })); pill.appendChild(el('span', { text: names[h.state] }));
  $('reasons').textContent = h.reasons.length ? (h.state === 'idle' ? h.reasons[0] : 'Why: ' + h.reasons.join(' · ')) : '';
  var nodes = sys.nodes || [], lead = nodes[0] || null;
  $('where').textContent = sys.mode + ' · ' + (nodes.length ? nodes.length + ' bridge node' + (nodes.length > 1 ? 's' : '') : 'no bridge reporting');
  // tiles
  var tiles = $('tiles'); tiles.textContent = '';
  var faultRate = t.count ? t.faults / t.count * 100 : 0, rejRate = t.count ? (t.errors - t.faults) / t.count * 100 : 0;
  tiles.appendChild(tile('p95 latency', t.count ? fmtMs(t.p95) : '—', t.count ? 'p50 ' + fmtMs(t.p50) + ' · p99 ' + fmtMs(t.p99) + (p.count ? ' · ' + delta(t.p95, p.p95, true, 'lat') : '') : 'No calls in this window', { hero: true, cls: t.p95 >= SLOW * 3 ? 'bad' : t.p95 >= SLOW ? 'warn' : '', icon: t.p95 >= SLOW * 3 ? '✕' : t.p95 >= SLOW ? '▲' : '' }));
  tiles.appendChild(tile('Calls', fmtInt(t.count), (t.count / Math.max(mins, 1 / 60)).toFixed(t.count / mins >= 10 ? 0 : 1) + ' per minute' + (p.count ? ' · ' + delta(t.count, p.count, false, 'n') : '')));
  tiles.appendChild(tile('System faults', t.count ? fmtPct(faultRate) : '—', fmtInt(t.faults) + ' of ' + fmtInt(t.count) + ' calls', { cls: faultRate >= 10 ? 'bad' : faultRate >= 2 ? 'warn' : t.count ? 'good' : '', icon: faultRate >= 10 ? '✕' : faultRate >= 2 ? '▲' : t.count ? '✓' : '' }));
  tiles.appendChild(tile('Rejected', t.count ? fmtPct(rejRate) : '—', 'Caller mistakes: bad input, missing scope, read-only'));
  tiles.appendChild(tile('Paperclip wait p95', t.count ? fmtMs(t.upstreamP95) : '—', 'Time spent waiting on users\' Paperclips'));
  tiles.appendChild(tile('Bridge overhead p95', t.count ? fmtMs(t.bridgeP95) : '—', 'Everything that isn\'t waiting on Paperclip', { cls: t.bridgeP95 >= SLOW ? 'warn' : '', icon: t.bridgeP95 >= SLOW ? '▲' : '' }));
  var silent = sys.bridgeSilentMs, down = silent == null || silent > sys.bridgeSilentAfterMs;
  tiles.appendChild(tile('Bridge', silent == null ? 'never reported' : down ? 'not reporting' : 'reporting', silent == null ? 'No bridge has written a health sample yet' : down ? 'Last heard ' + Math.round(silent / 1000) + ' s ago — asleep, down, or cannot reach the database' : nodes.length + ' node' + (nodes.length > 1 ? 's' : '') + ' · last sample ' + Math.round(silent / 1000) + ' s ago' + (lead ? ' · v' + lead.version : ''), { cls: down ? 'bad' : 'good', icon: down ? '✕' : '✓' }));
  var ping = lead ? lead.dbPingMs : null;
  tiles.appendChild(tile('Bridge → database', ping == null ? (lead ? 'failing' : '—') : fmtMs(ping), 'Round-trip measured by the bridge' + (sys.panelPingMs != null ? ' · panel ' + fmtMs(sys.panelPingMs) : ''), { cls: lead && ping == null ? 'bad' : ping != null && ping >= 250 ? 'warn' : '', icon: lead && ping == null ? '✕' : ping != null && ping >= 250 ? '▲' : '', spark: spark(sys.recentPing || []) }));
  var lag = lead ? lead.loopLagP99Ms : null;
  tiles.appendChild(tile('Event-loop lag p99', lag == null ? '—' : fmtMs(lag), lead ? 'Bridge process · memory ' + Math.round(lead.rssMb) + ' MB' : 'No data', { cls: lag != null && lag >= 100 ? 'warn' : '', icon: lag != null && lag >= 100 ? '▲' : '' }));
  tiles.appendChild(tile('Live connections', sys.liveGrants == null ? '—' : fmtInt(sys.liveGrants), 'Active OAuth grants'));
  // charts
  var common = { from: d.from, to: d.to, bucketMs: d.bucketMs };
  if (state.hovering) { /* keep the chart under the pointer stable while it is being read */ }
  else if (!t.count) { ['c-thr', 'c-lat', 'c-split', 'c-hist'].forEach(function (id) { var e = $(id); e.textContent = ''; e.appendChild(el('div', { class: 'empty', text: 'No tool calls in this window yet.' })); }); }
  else {
    drawChart($('c-thr'), Object.assign({ title: 'Throughput', type: 'bars', rows: d.series, intTicks: true, yFmt: fmtInt, valFmt: fmtInt, series: [
      { label: 'Succeeded', color: '--s1', get: function (b) { return b.count - b.errors; } },
      { label: 'Rejected (caller)', color: '--neutral', get: function (b) { return b.errors - b.faults; } },
      { label: 'System faults ✕', color: '--crit', get: function (b) { return b.faults; } }] }, common));
    drawChart($('c-lat'), Object.assign({ title: 'Latency percentiles', type: 'lines', rows: d.series, yFmt: fmtMs, valFmt: fmtMs, refLine: { value: SLOW, label: 'slow ' + fmtMs(SLOW) }, series: [
      { label: 'p50', color: '--r300', get: function (b) { return b.p50; } },
      { label: 'p95', color: '--r450', get: function (b) { return b.p95; } },
      { label: 'p99', color: '--r600', get: function (b) { return b.p99; } }] }, common));
    drawChart($('c-split'), Object.assign({ title: 'Latency split', type: 'bars', rows: d.series, yFmt: fmtMs, valFmt: fmtMs, series: [
      { label: 'Waiting on Paperclip', color: '--s1', get: function (b) { return b.avgUpstream; } },
      { label: 'Bridge', color: '--s2', get: function (b) { return b.avgBridge; } }] }, common));
    var cats = ['≤25', '≤50', '≤100', '≤200', '≤400', '≤800', '≤1.6s', '≤3.2s', '>3.2s'], catsLong = ['under 25 ms', '25–50 ms', '50–100 ms', '100–200 ms', '200–400 ms', '400–800 ms', '0.8–1.6 s', '1.6–3.2 s', '3.2 s or more'];
    drawChart($('c-hist'), { title: 'Latency distribution', type: 'bars', cats: cats, catsLong: catsLong, rows: d.histogram.map(function (n) { return { n: n }; }), valueLabels: true, intTicks: true, yFmt: fmtInt, valFmt: fmtInt, series: [{ label: 'Calls', color: '--s1', get: function (b) { return b.n; } }] });
  }
  renderCommunity();
  // tables
  var num = function (k, f) { return function (r) { return r[k] == null ? '—' : f(r[k]); }; };
  table($('t-tools'), 'tools', [
    { key: 'key', label: 'Tool', cell: function (r) { return short(r.key); } }, { key: 'count', label: 'Calls', num: 1, cell: num('count', fmtInt) },
    { key: 'faultPct', label: 'Faults', num: 1, cell: function (r) { return r.faults ? chip('fault', fmtPct(r.faultPct)) : '0%'; } },
    { key: 'rejPct', label: 'Rejected', num: 1, cell: function (r) { return fmtPct(r.rejPct); } },
    { key: 'p50', label: 'p50', num: 1, cell: msCell('p50') }, { key: 'p95', label: 'p95', num: 1, cell: msCell('p95') }, { key: 'upstreamP95', label: 'Wait p95', num: 1, cell: msCell('upstreamP95') }],
    d.byTool.map(function (r) { return Object.assign({ faultPct: r.faults / r.count * 100, rejPct: (r.errors - r.faults) / r.count * 100 }, r); }), { key: 'count' }, 'No tool calls yet.');
  table($('t-inst'), 'inst', [
    { key: 'key', label: 'Tenant host' }, { key: 'count', label: 'Calls', num: 1, cell: num('count', fmtInt) },
    { key: 'faults', label: 'Faults', num: 1, cell: function (r) { return r.faults ? chip('fault', fmtInt(r.faults)) : '0'; } },
    { key: 'p95', label: 'p95', num: 1, cell: msCell('p95') }, { key: 'upstreamP95', label: 'Wait p95', num: 1, cell: msCell('upstreamP95') }],
    d.byInstance, { key: 'upstreamP95' }, 'No tenant traffic yet (single-instance mode has no tenant host).');
  var totalErr = d.byError.reduce(function (a, r) { return a + r.count; }, 0);
  table($('t-err'), 'err', [
    { key: 'key', label: 'Class', cell: function (r) { return el('span', null, [FAULTS[r.key] ? chip('fault', PLAIN[r.key] || r.key) : chip('rej', PLAIN[r.key] || r.key)]); } },
    { key: 'count', label: 'Count', num: 1, cell: num('count', fmtInt) }, { key: 'share', label: 'Share', num: 1, cell: function (r) { return fmtPct(r.share); } }],
    d.byError.map(function (r) { return Object.assign({ share: totalErr ? r.count / totalErr * 100 : 0 }, r); }), { key: 'count' }, 'No errors in this window.');
  table($('t-http'), 'http', [
    { key: 'key', label: 'Endpoint' }, { key: 'count', label: 'Requests', num: 1, cell: num('count', fmtInt) },
    { key: 'errors', label: 'Errors', num: 1, cell: function (r) { return r.errors ? chip('rej', fmtInt(r.errors)) : '0'; } },
    { key: 'p50', label: 'p50', num: 1, cell: msCell('p50') }, { key: 'p95', label: 'p95', num: 1, cell: msCell('p95') }],
    d.http.byRoute, { key: 'count' }, 'No OAuth or MCP requests yet.');
  var slowRows = d.slowest.map(function (e) { return Object.assign({ at2: fmtTime(e.at, true) }, e); });
  table($('t-slow'), 'slow', [
    { key: 'at', label: 'Time', cell: function (r) { return fmtTime(r.at, true); } }, { key: 'name', label: 'Tool', cell: function (r) { return short(r.name); } },
    { key: 'totalMs', label: 'Total', num: 1, cell: msCell('totalMs') }, { key: 'upstreamMs', label: 'Wait', num: 1, cell: function (r) { return r.upstreamMs == null ? '—' : fmtMs(r.upstreamMs); } },
    { key: 'ok', label: 'Result', cell: outcome }, { key: 'instance', label: 'Tenant', cell: function (r) { return r.instance || '—'; } }], slowRows, { key: 'totalMs' }, 'No calls in this window.');
  // footer
  $('foot').textContent = '';
  $('foot').appendChild(document.createTextNode('Times are in your local time zone. '));
  $('foot').appendChild(el('b', { text: sys.persistent ? "History is read from the bridge's Postgres database." : 'This panel is showing in-memory demo data.' }));
  $('foot').appendChild(document.createTextNode(' This panel is a separate program with a read-only database role: it cannot see Paperclip credentials, secret keys or the real usernames of anonymous users (they appear as aliases like Ann02).'));
  renderStatus();
}


var FAILWHY = { 'connect_failed:denied': 'Cancelled by the user', 'connect_failed:expired': 'Paperclip approval expired or was cancelled', 'connect_failed:unreachable': 'Paperclip unreachable or not a Paperclip', 'connect_failed:invalid_instance': 'Invalid or blocked Paperclip address', 'connect_failed:too_many_attempts': 'Too many addresses tried', 'login_failed:bad_credentials': 'Wrong username or secret key', 'login_failed:rate_limited': 'Locked out by the rate limit' };
function renderCommunity() {
  var d = state.data; if (!d || !d.community) return;
  var c = d.community, k = c.counts || {}, started = k.started || 0, completed = k.completed || 0;
  state.cname = c.name || 'cliped';
  var ct = $('ctiles'); ct.textContent = '';
  var rate = c.successRate, rateTxt = rate == null ? '—' : fmtPct(rate * 100), poor = started >= 5 && rate != null;
  ct.appendChild(tile('Users', fmtInt(c.totalUsers), 'All accounts ever created'));
  ct.appendChild(tile('Active users', fmtInt(c.activeUsers), 'Made tool calls in this window'));
  ct.appendChild(tile('New users', fmtInt(k.joined || 0), fmtInt(k.login || 0) + ' sign-ins · ' + fmtInt(k.updated || 0) + ' updates'));
  ct.appendChild(tile('Connection success', rateTxt, started ? fmtInt(completed) + ' of ' + fmtInt(started) + ' sign-ins completed' : 'No sign-ins started yet', { cls: !poor ? '' : rate >= 0.8 ? 'good' : rate >= 0.5 ? 'warn' : 'bad', icon: !poor ? '' : rate >= 0.8 ? '✓' : rate >= 0.5 ? '▲' : '✕' }));
  var failN = 0; Object.keys(c.failures || {}).forEach(function (x) { failN += c.failures[x]; });
  ct.appendChild(tile('Failed sign-ins', fmtInt(failN), 'Wrong keys, lockouts, unreachable Paperclips, cancels', { cls: failN > 0 && started >= 5 && failN / Math.max(started, 1) > 0.3 ? 'warn' : '', icon: failN > 0 && started >= 5 && failN / Math.max(started, 1) > 0.3 ? '▲' : '' }));
  ct.appendChild(tile('Left', fmtInt(k.left || 0), 'Disconnected, expired for inactivity, or deleted'));
  if (!state.hovering) {
    var any = (c.series || []).length;
    if (!any) { var e = $('c-conn'); e.textContent = ''; e.appendChild(el('div', { class: 'empty', text: 'No sign-ins in this window yet.' })); }
    else drawChart($('c-conn'), { title: 'Connections', type: 'bars', rows: c.series, from: d.from, to: d.to, bucketMs: d.bucketMs, intTicks: true, yFmt: fmtInt, valFmt: fmtInt, series: [
      { label: 'Connected', color: '--s1', get: function (b) { return b.completed; } },
      { label: 'Failed ✕', color: '--crit', get: function (b) { return b.failed; } }] });
  }
  var fr = Object.keys(c.failures || {}).map(function (key) { return { key: key, why: FAILWHY[key] || key, count: c.failures[key] }; });
  table($('t-fail'), 'fail', [{ key: 'why', label: 'Reason' }, { key: 'count', label: 'Count', num: 1, cell: function (r) { return fmtInt(r.count); } }], fr, { key: 'count' }, 'No failed sign-ins in this window.');
  table($('t-users'), 'users', [
    { key: 'key', label: 'User', cell: function (r) { return nameCell(r.key); } }, { key: 'count', label: 'Calls', num: 1, cell: function (r) { return fmtInt(r.count); } },
    { key: 'faults', label: 'Faults', num: 1, cell: function (r) { return r.faults ? chip('fault', fmtInt(r.faults)) : '0'; } },
    { key: 'p95', label: 'p95', num: 1, cell: msCell('p95') }], c.byUser || [], { key: 'count' }, 'No user activity in this window yet.');
}
var VERB = { joined: 'joined', left: 'left', updated: 'updated', login: 'signed in', login_failed: 'failed to sign in', connect_failed: 'could not connect' };
function feedLine(e) {
  var li = el('li', { class: e._new ? 'flash' : '' });
  var cls = e.kind === 'joined' ? 'k-joined' : e.kind === 'left' ? 'k-left' : (e.kind === 'login_failed' || e.kind === 'connect_failed') ? 'k-failed' : 'k-updated';
  var icon = e.kind === 'joined' ? '+' : e.kind === 'left' ? '−' : e.kind === 'updated' ? '↻' : e.kind === 'login' ? '→' : '✕';
  var verb = (VERB[e.kind] || e.kind) + ((e.kind === 'joined' || e.kind === 'left' || e.kind === 'updated') ? ' ' + state.cname : '');
  li.appendChild(el('span', { class: 't', text: fmtTime(e.at, true) + ' ' }));
  li.appendChild(el('span', { class: cls, 'aria-hidden': 'true', text: icon + ' ' }));
  var u = el('span', { class: 'u' }); u.appendChild(e.username ? nameCell(e.username) : document.createTextNode('(visitor)')); li.appendChild(u);
  li.appendChild(document.createTextNode(' - '));
  li.appendChild(el('span', { class: cls, text: verb }));
  if (e.detail && e.kind !== 'joined') li.appendChild(el('span', { class: 'd', text: ' (' + String(e.detail).replace(/_/g, ' ') + ')' }));
  return li;
}
function renderFeed() {
  var host = $('t-feed'); host.textContent = '';
  if (!state.feed.length) { host.appendChild(el('div', { class: 'empty', text: 'Waiting for the first user event…' })); return; }
  var ul = el('ul', { class: 'logfeed' }); state.feed.forEach(function (e) { ul.appendChild(feedLine(e)); }); host.appendChild(ul);
  state.feed.forEach(function (e) { e._new = false; });
}
async function loadFeed() {
  clearTimeout(feedTimer);
  try {
    var r = await fetch('/api/community/events?limit=40&after=' + state.lastFeedId, { credentials: 'same-origin', cache: 'no-store' });
    if (r.status === 401) { location.reload(); return; }
    if (r.ok) {
      var j = await r.json(); state.cname = j.name || state.cname;
      if (j.events.length) { var first = state.lastFeedId === 0; j.events.forEach(function (e) { e._new = !first; }); state.feed = j.events.concat(state.feed).slice(0, 40); state.lastFeedId = Math.max(state.lastFeedId, j.events[0].id || 0); renderFeed(); }
      else if (!state.feed.length) renderFeed();
    }
  } catch (e) { /* the summary loop reports connectivity */ }
  finally { if (!state.paused && !document.hidden) feedTimer = setTimeout(loadFeed, 2500); }
}

function renderLive() {
  var rows = state.events.map(function (e) { return Object.assign({ _id: e.id, _new: e._new }, e); });
  table($('t-live'), 'live', [
    { key: 'at', label: 'Time', cell: function (r) { return fmtTime(r.at, true); } },
    { key: 'name', label: 'Tool', cell: function (r) { return short(r.name) + (r.mutation ? ' ✎' : ''); } },
    { key: 'ok', label: 'Result', cell: outcome },
    { key: 'totalMs', label: 'Took', num: 1, cell: function (r) { var tot = r.totalMs || 0, up = r.upstreamMs || 0; var w = el('span', null, [msCell('totalMs')(r)]); if (r.kind === 'tool' && tot > 0) { var sp = el('span', { class: 'split', title: 'Paperclip ' + fmtMs(up) + ' · bridge ' + fmtMs(tot - up), style: 'margin-left:8px' }); sp.appendChild(el('i', { style: 'width:' + Math.round(up / tot * 100) + '%;background:var(--s1)' })); sp.appendChild(el('i', { style: 'width:' + Math.round((tot - up) / tot * 100) + '%;background:var(--s2)' })); w.appendChild(sp); } return w; } },
    { key: 'instance', label: 'Tenant', cell: function (r) { return r.instance || '—'; } }],
    rows, { key: 'at' }, 'Waiting for the first call…');
  state.events.forEach(function (e) { e._new = false; });
}

function renderStatus() {
  var age = state.lastOk ? Math.round((Date.now() - state.lastOk) / 1000) : null, dot = $('dot'), bn = $('banner');
  if (state.paused) { dot.className = 'dot paused'; $('age').textContent = 'paused'; }
  else if (state.err) { dot.className = 'dot off'; $('age').textContent = 'reconnecting…'; }
  else if (age == null) { dot.className = 'dot stale'; $('age').textContent = 'connecting…'; }
  else { dot.className = 'dot' + (age > 20 ? ' stale' : ''); $('age').textContent = age < 3 ? 'live' : 'updated ' + age + 's ago'; }
  if (state.err) { bn.className = 'banner show'; bn.textContent = ''; bn.appendChild(el('b', { text: 'Cannot reach the bridge: ' })); bn.appendChild(document.createTextNode(state.err + ' — showing the last data. Retrying.')); } else bn.className = 'banner';
}

// ───────── data loop ─────────
var timer, evTimer, feedTimer, main = $('main');
async function load() {
  clearTimeout(timer); main.classList.add('loading');
  try {
    var r = await fetch('/api/summary?window=' + state.win, { credentials: 'same-origin', cache: 'no-store' });
    if (r.status === 401) { location.reload(); return; }
    if (!r.ok) { var j = await r.json().catch(function () { return {}; }); throw new Error(j.error || 'HTTP ' + r.status); }
    state.data = await r.json(); state.lastOk = Date.now(); state.err = null; render();
  } catch (e) { state.err = e.message; renderStatus(); }
  finally { main.classList.remove('loading'); if (!state.paused && !document.hidden) timer = setTimeout(load, WIN_MS[state.win] <= 3600000 ? 3000 : 10000); }
}
async function loadEvents() {
  clearTimeout(evTimer);
  try {
    var r = await fetch('/api/events?limit=40&after=' + state.lastId, { credentials: 'same-origin', cache: 'no-store' });
    if (r.status === 401) { location.reload(); return; }
    if (r.ok) {
      var j = await r.json();
      if (j.events.length) { var first = state.lastId === 0; j.events.forEach(function (e) { e._new = !first; }); state.events = j.events.concat(state.events).slice(0, 40); state.lastId = Math.max(state.lastId, j.events[0].id || 0); renderLive(); }
      else if (!state.events.length) renderLive();
    }
  } catch (e) { /* the summary loop reports connectivity */ }
  finally { if (!state.paused && !document.hidden) evTimer = setTimeout(loadEvents, 2000); }
}
function kick() { clearTimeout(timer); clearTimeout(evTimer); clearTimeout(feedTimer); load(); loadEvents(); loadFeed(); }

// controls
var seg = $('win');
WINDOWS.forEach(function (w) { var b = el('button', { type: 'button', 'aria-pressed': String(w === state.win), text: w }); b.addEventListener('click', function () { state.win = w; location.hash = w; Array.prototype.forEach.call(seg.children, function (c) { c.setAttribute('aria-pressed', String(c.textContent === w)); }); state.sort = {}; kick(); }); seg.appendChild(b); });
$('pause').addEventListener('click', function () { state.paused = !state.paused; this.setAttribute('aria-pressed', String(state.paused)); this.textContent = state.paused ? 'Resume' : 'Pause'; if (state.paused) { clearTimeout(timer); clearTimeout(evTimer); clearTimeout(feedTimer); renderStatus(); } else kick(); });
document.addEventListener('visibilitychange', function () { if (document.hidden) { clearTimeout(timer); clearTimeout(evTimer); clearTimeout(feedTimer); } else if (!state.paused) kick(); });
setInterval(renderStatus, 1000);
var rz; window.addEventListener('resize', function () { cancelAnimationFrame(rz); rz = requestAnimationFrame(function () { if (state.data) render(); }); });
kick();
})();
`}</script></body></html>`;
}
