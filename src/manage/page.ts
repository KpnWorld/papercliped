import { DISPLAY, FONTS_CSS, MONO, SANS, THEME, THEME_DARK, esc } from "../oauth/pages.js";
import { FAVICON_LINK } from "../site/favicon.js";

const CSS = `
${FONTS_CSS}
:root{--bg:${THEME.bg};--ink:${THEME.ink};--ink2:${THEME.ink2};--muted:${THEME.muted};--line:${THEME.line};--err:${THEME.errInk};color-scheme:light}
@media (prefers-color-scheme:dark){:root{--bg:${THEME_DARK.bg};--ink:${THEME_DARK.ink};--ink2:${THEME_DARK.ink2};--muted:${THEME_DARK.muted};--line:${THEME_DARK.line};color-scheme:dark}.card{background:rgba(255,255,255,.04)!important}}
h1,h2,.brand{font-family:${DISPLAY}}.brand{text-transform:lowercase;font-weight:700}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.55 ${SANS}}
a{color:var(--ink)}button,input,select{font:inherit;color:inherit}
:focus-visible{outline:2px solid var(--ink2);outline-offset:2px}
header{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:16px max(20px,5vw);border-bottom:1px solid var(--line)}
.brand{display:flex;align-items:center;gap:8px;font-weight:600;font-size:17px}.brand img{width:26px;height:26px}
main{max-width:760px;margin:0 auto;padding:28px 20px 60px}
h1{font-size:22px;margin:0 0 4px}h2{font-size:16px;margin:30px 0 8px}p.lede{color:var(--muted);margin:0 0 18px}
.card{border:1px solid var(--line);border-radius:10px;padding:14px 16px;margin:10px 0;background:rgba(255,255,255,.35)}
label.f{display:block;font-size:12px;color:var(--muted);margin:12px 0 4px}
input[type=text],input[type=password]{width:100%;height:42px;padding:0 12px;border:1px solid var(--line);border-radius:8px;background:transparent}
.btn{height:38px;padding:0 16px;border:1px solid var(--ink2);border-radius:8px;background:var(--ink2);color:var(--bg);font-weight:600;cursor:pointer}
.btn.ghost{background:transparent;color:var(--ink);border-color:var(--line)}.btn.danger{background:#8a1f11;border-color:#8a1f11;color:#fff}.btn:disabled{opacity:.5;cursor:not-allowed}
.row{display:flex;flex-wrap:wrap;gap:10px;align-items:center}.grow{flex:1;min-width:0}
.pill{display:inline-block;font-size:12px;padding:2px 9px;border:1px solid var(--line);border-radius:99px;color:var(--ink2)}
.muted{color:var(--muted);font-size:13.5px}
.err{background:#fde8e3;border:1px solid #e9a99c;color:var(--err);border-radius:8px;padding:9px 12px;margin:12px 0}
.ok{background:#e9f3df;border:1px solid #b9d49b;color:#2f5a14;border-radius:8px;padding:9px 12px;margin:12px 0}
.secret{display:block;margin:12px 0;padding:14px 12px;border:1px dashed var(--ink2);border-radius:8px;font:13px ${MONO};user-select:all;overflow-wrap:anywhere}
select{height:34px;border:1px solid var(--line);border-radius:8px;background:transparent;padding:0 8px}
.hide{display:none}
`;

const JS = `
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var app = $("app");
  function h(tag, attrs) {
    var el = document.createElement(tag);
    for (var k in (attrs || {})) {
      if (k === "class") el.className = attrs[k];
      else if (k.slice(0, 2) === "on") el.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] !== false && attrs[k] != null) el.setAttribute(k, attrs[k]);
    }
    for (var i = 2; i < arguments.length; i++) {
      var c = arguments[i];
      if (c == null || c === false) continue;
      el.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    }
    return el;
  }
  function api(method, path, body) {
    var opt = { method: method, headers: { "x-papercliped": "1" }, credentials: "same-origin" };
    if (body !== undefined) { opt.headers["content-type"] = "application/json"; opt.body = JSON.stringify(body); }
    return fetch("/api/manage" + path, opt).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) { return { status: r.status, body: j }; });
    });
  }
  function note(kind, text) { return h("div", { class: kind, role: kind === "err" ? "alert" : "status" }, text); }
  function when(ms) { if (!ms) return "never"; var d = Date.now() - ms, m = Math.round(d / 60000); if (m < 1) return "just now"; if (m < 60) return m + " min ago"; if (m < 1440) return Math.round(m / 60) + " h ago"; return Math.round(m / 1440) + " days ago"; }
  var LEVELS = { "paperclip:read": "Read only", "paperclip:control": "Full control" };

  function loginView(msg) {
    app.replaceChildren();
    var u = h("input", { type: "text", id: "u", autocomplete: "username", autocapitalize: "off", spellcheck: "false" });
    var s = h("input", { type: "password", id: "s", autocomplete: "current-password", placeholder: "pcs_XXXX-XXXX-..." });
    var box = h("div");
    var go = function (e) {
      e.preventDefault();
      api("POST", "/login", { username: u.value, secret: s.value }).then(function (r) {
        if (r.status === 200) return load();
        box.replaceChildren(note("err", r.body.error || "Could not sign in"));
      });
    };
    app.appendChild(h("h1", {}, "Manage your connections"));
    app.appendChild(h("p", { class: "lede" }, "Sign in with your Papercliped username and secret key."));
    app.appendChild(h("form", { onsubmit: go },
      msg ? note("ok", msg) : null, box,
      h("label", { class: "f", for: "u" }, "Username"), u,
      h("label", { class: "f", for: "s" }, "Secret key"), s,
      h("div", { class: "row", style: "margin-top:16px" }, h("button", { class: "btn", type: "submit" }, "Sign in"))));
    app.appendChild(h("p", { class: "muted", style: "margin-top:18px" }, "Lost your secret key? Connect from your AI app again and choose Connect your Paperclip: you keep your account and get a new key."));
  }

  function confirmBox(title, text, withUsername, danger, run) {
    var s = h("input", { type: "password", autocomplete: "current-password", placeholder: "Your secret key" });
    var c = withUsername ? h("input", { type: "text", autocomplete: "off", placeholder: "Type your username" }) : null;
    var out = h("div");
    var box = h("div", { class: "card" }, h("strong", {}, title), h("p", { class: "muted" }, text), out,
      h("label", { class: "f" }, "Confirm with your secret key"), s, c ? h("label", { class: "f" }, "Username") : null, c,
      h("div", { class: "row", style: "margin-top:12px" },
        h("button", { class: "btn" + (danger ? " danger" : ""), type: "button", onclick: function () { run(s.value, c ? c.value : undefined, out, box); } }, "Confirm"),
        h("button", { class: "btn ghost", type: "button", onclick: function () { box.remove(); } }, "Cancel")));
    return box;
  }

  function appView(me) {
    app.replaceChildren();
    app.appendChild(h("h1", {}, "Hi, " + me.name));
    app.appendChild(h("p", { class: "lede" }, (me.paperclip ? "Connected to " + me.paperclip : "No Paperclip connected") + (me.connected ? "" : " (connection expired)") + (me.anonymous ? " · appearing anonymously" : "")));

    if (!me.beta) {
      app.appendChild(h("div", { class: "card" }, h("strong", {}, "Join the beta"),
        h("p", { class: "muted" }, "The beta adds this connection manager: see every app connected to your Paperclip, change what each may do, and disconnect any of them."),
        h("button", { class: "btn", type: "button", onclick: function () { api("POST", "/beta", { beta: true }).then(load); } }, "Join the beta")));
      return;
    }

    app.appendChild(h("h2", {}, "Connected apps"));
    var list = h("div"); app.appendChild(list);
    function refresh() {
      api("GET", "/connections").then(function (r) {
        list.replaceChildren();
        var cs = (r.body && r.body.connections) || [];
        if (!cs.length) list.appendChild(h("p", { class: "muted" }, "No apps connected. Add Papercliped as a connector in Claude or ChatGPT."));
        cs.forEach(function (c) {
          var sel = h("select", { "aria-label": "Access level for " + c.app });
          [["read", "Read only"], ["control", "Full control"]].forEach(function (o) { sel.appendChild(h("option", { value: o[0], selected: LEVELS["paperclip:" + o[0]] === LEVELS[c.level] ? "selected" : false }, o[1])); });
          var msg = h("span", { class: "muted", role: "status" });
          sel.addEventListener("change", function () {
            api("POST", "/connections/" + encodeURIComponent(c.id), { level: sel.value }).then(function (x) { msg.textContent = x.status === 200 ? "Saved." : (x.body.error || "Could not save"); });
          });
          list.appendChild(h("div", { class: "card row" },
            h("div", { class: "grow" }, h("strong", {}, c.app), h("div", { class: "muted" }, "Last used " + when(c.lastUsedAt) + " · connected " + when(c.createdAt))),
            sel, msg,
            h("button", { class: "btn ghost", type: "button", onclick: function () { api("DELETE", "/connections/" + encodeURIComponent(c.id)).then(refresh); } }, "Disconnect")));
        });
      });
    }
    refresh();
    app.appendChild(h("p", { class: "muted" }, "Changes apply on the app's very next request. Raising or lowering access never needs the app to reconnect."));

    app.appendChild(h("h2", {}, "Privacy"));
    var anon = h("input", { type: "checkbox", id: "anon" }); anon.checked = me.anonymous;
    var pmsg = h("span", { class: "muted", role: "status" });
    anon.addEventListener("change", function () {
      api("POST", "/privacy", { anonymous: anon.checked }).then(function (r) { pmsg.textContent = r.status === 200 ? (r.body.anonymous ? "You now appear as " + r.body.alias + "." : "You now appear under your username.") : (r.body.error || "Could not save"); });
    });
    app.appendChild(h("label", { class: "card row", for: "anon" }, anon, h("span", { class: "grow" }, "Appear anonymously in the operator logs and dashboard (as a name like Ann02)."), pmsg));

    app.appendChild(h("h2", {}, "Paperclip plugin"));
    app.appendChild(h("p", { class: "muted" }, "Manage these same connections from inside Paperclip. Install the Papercliped plugin there, then make a one-time code here and paste it into the plugin."));
    var codeBox = h("div"); var linkList = h("div");
    app.appendChild(h("div", { class: "row" }, h("button", { class: "btn ghost", type: "button", onclick: function () {
      api("POST", "/plugin-link", {}).then(function (r) {
        if (r.status !== 200) return codeBox.replaceChildren(note("err", r.body.error || "Could not make a code"));
        codeBox.replaceChildren(h("span", { class: "secret" }, r.body.code), h("p", { class: "muted" }, "Works once, for " + Math.round(r.body.expiresInSec / 60) + " minutes. Paste it into the Papercliped page in Paperclip."));
      });
    } }, "Link Paperclip plugin")));
    app.appendChild(codeBox); app.appendChild(linkList);
    function refreshLinks() {
      api("GET", "/plugin-links").then(function (r) {
        linkList.replaceChildren();
        ((r.body && r.body.links) || []).forEach(function (l) {
          linkList.appendChild(h("div", { class: "card row" },
            h("div", { class: "grow" }, h("strong", {}, "Paperclip plugin" + (l.host ? " · " + l.host : "")), h("div", { class: "muted" }, "Last used " + when(l.lastUsedAt) + " · linked " + when(l.createdAt))),
            h("button", { class: "btn ghost", type: "button", onclick: function () { api("DELETE", "/plugin-links/" + encodeURIComponent(l.id)).then(refreshLinks); } }, "Unlink")));
        });
      });
    }
    refreshLinks();

    app.appendChild(h("h2", {}, "Security"));
    var area = h("div");
    var rot = h("button", { class: "btn ghost", type: "button", onclick: function () {
      area.replaceChildren(confirmBox("Make a new secret key", "Your old key stops working immediately. The new key is shown once.", false, false, function (secret, _c, out, box) {
        api("POST", "/secret/rotate", { secret: secret }).then(function (r) {
          out.replaceChildren();
          if (r.status !== 200) return out.appendChild(note("err", r.body.error || "Failed"));
          box.replaceChildren(h("strong", {}, "Your new secret key"), h("span", { class: "secret" }, r.body.secret), h("p", { class: "muted" }, "Save it in a password manager now. It will not be shown again."));
        });
      }));
    } }, "Make a new secret key");
    var dis = h("button", { class: "btn ghost", type: "button", onclick: function () {
      area.replaceChildren(confirmBox("Disconnect your Paperclip", "Papercliped forgets your Paperclip key and asks your Paperclip to revoke it. Every connected app stops working. Your account stays; reconnect any time.", false, true, function (secret, _c, out) {
        api("POST", "/paperclip/disconnect", { secret: secret }).then(function (r) { if (r.status !== 200) return out.replaceChildren(note("err", r.body.error || "Failed")); load(); });
      }));
    } }, "Disconnect my Paperclip");
    var del = h("button", { class: "btn danger", type: "button", onclick: function () {
      area.replaceChildren(confirmBox("Delete my account", "Removes your username, stored Paperclip key and every connection. This cannot be undone.", true, true, function (secret, name, out) {
        api("POST", "/account/delete", { secret: secret, confirm: name }).then(function (r) { if (r.status !== 200) return out.replaceChildren(note("err", r.body.error || "Failed")); loginView("Your account was deleted."); });
      }));
    } }, "Delete my account");
    app.appendChild(h("div", { class: "row" }, rot, dis, del));
    app.appendChild(area);
    app.appendChild(h("div", { style: "margin-top:26px" }, h("button", { class: "btn ghost", type: "button", onclick: function () { api("POST", "/logout", {}).then(function () { loginView(); }); } }, "Sign out")));
  }

  function load() {
    api("GET", "/me").then(function (r) { if (r.status === 200) appView(r.body); else loginView(); });
  }
  load();
})();
`;

export function managePage(nonce: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><meta name="robots" content="noindex"><title>Manage connections · Papercliped</title>${FAVICON_LINK}<style>${CSS}</style></head><body><header><a class="brand" href="/" style="text-decoration:none;color:inherit"><img alt="" src="data:image/svg+xml,${encodeURIComponent(FAV)}"><span>Papercliped</span></a><span class="pill">beta</span></header><main id="app" aria-live="polite"><noscript>${esc("This page needs JavaScript.")}</noscript></main><script nonce="${nonce}">${JS}</script></body></html>`;
}

import { FAVICON_SVG as FAV } from "../site/favicon.js";
export { JS as MANAGE_SCRIPT };
