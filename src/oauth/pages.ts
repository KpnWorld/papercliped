import { scopesUpTo, type Scope } from "./scopes.js";

export const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const LEVELS: { scope: Scope; label: string; blurb: string }[] = [
  { scope: "paperclip:read", label: "Read only", blurb: "View agents, tasks, goals, costs and reports. Cannot change anything." },
  { scope: "paperclip:control", label: "Control", blurb: "Also pause/resume/wake agents, create and update issues and goals, and comment." },
  { scope: "paperclip:admin", label: "Admin", blurb: "Also decide approvals, change budgets, terminate agents and send arbitrary API writes." },
];

const CSS = `body{font:16px/1.5 system-ui,sans-serif;max-width:34rem;margin:2rem auto;padding:0 1rem;color:#1a1a1a}
.card{border:1px solid #d0d0d0;border-radius:10px;padding:1.25rem 1.5rem}h1{font-size:1.25rem;margin:0 0 .75rem}
label{display:block;margin:.5rem 0;padding:.5rem .75rem;border:1px solid #e0e0e0;border-radius:8px;cursor:pointer}
small{color:#555;display:block}.warn{background:#fff4e5;border:1px solid #f0c36d;padding:.5rem .75rem;border-radius:8px;margin:.75rem 0}
.err{background:#fdecea;border:1px solid #f1a9a0;padding:.5rem .75rem;border-radius:8px;margin:.75rem 0}
button{font:inherit;padding:.55rem 1rem;border-radius:8px;border:1px solid #888;background:#fff;cursor:pointer}
button.go{background:#1a1a1a;color:#fff;border-color:#1a1a1a}.row{display:flex;gap:.5rem;margin-top:1rem}code{background:#f2f2f2;padding:.1rem .3rem;border-radius:4px}
@media (prefers-color-scheme:dark){body{background:#161616;color:#eee}.card,label{border-color:#444}small{color:#aaa}code{background:#2a2a2a}button{background:#222;color:#eee}button.go{background:#eee;color:#111}}`;

function shell(title: string, body: string, nonce?: string, script?: string) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>${CSS}</style></head><body><div class="card">${body}</div>${script ? `<script nonce="${nonce}">${script}</script>` : ""}</body></html>`;
}

export interface ConsentView {
  rid: string;
  csrf: string;
  clientName: string;
  redirectHost: string;
  loopbackOnly: boolean;
  requestedMax: Scope;
  login: "paperclip" | "static";
  approvalUrl?: string;
  approved: boolean;
  nonce: string;
  error?: string;
}

export function consentPage(v: ConsentView): string {
  const allowed = new Set(scopesUpTo(v.requestedMax));
  const defaultLevel: Scope = v.requestedMax === "paperclip:admin" ? "paperclip:control" : v.requestedMax;
  const levels = LEVELS.filter((l) => allowed.has(l.scope))
    .map(
      (l) =>
        `<label><input type="radio" name="level" value="${l.scope}"${l.scope === defaultLevel ? " checked" : ""}> <strong>${l.label}</strong><small>${esc(l.blurb)}</small></label>`,
    )
    .join("");
  const login =
    v.login === "paperclip"
      ? `<p><strong>1.</strong> <a href="${esc(v.approvalUrl ?? "#")}" target="_blank" rel="noopener noreferrer">Open Paperclip to sign in and approve</a> (opens a new tab).</p>
         <p id="st"><strong>2.</strong> ${v.approved ? "✅ Approved in Paperclip." : "Waiting for approval in Paperclip…"}</p>`
      : `<p><label for="pw"><strong>Bridge admin token</strong></label><input id="pw" name="password" type="password" autocomplete="off" required style="width:100%;padding:.5rem;box-sizing:border-box"></p>`;
  const script =
    v.login === "paperclip" && !v.approved
      ? `const s=document.getElementById('st');let n=0;const t=setInterval(async()=>{if(++n>200)return clearInterval(t);try{const r=await fetch('/authorize/status?rid=${encodeURIComponent(v.rid)}');const j=await r.json();if(j.approved){s.textContent='✅ Approved in Paperclip.';clearInterval(t)}}catch(e){}},2000)`
      : undefined;
  const warn = v.loopbackOnly
    ? `<div class="warn">This app will receive the authorization on <code>${esc(v.redirectHost)}</code> (your own machine). Only continue if you just started it yourself — any local program can claim this address.</div>`
    : `<p>After you approve, you will be sent back to <code>${esc(v.redirectHost)}</code>.</p>`;
  return shell(
    "Authorize access to Paperclip",
    `<h1>Authorize <em>${esc(v.clientName)}</em></h1>
     <p>This app wants to access your Paperclip instance through the bridge. Choose how much to allow:</p>
     ${v.error ? `<div class="err">${esc(v.error)}</div>` : ""}
     <form method="post" action="/authorize/decision">
       <input type="hidden" name="rid" value="${esc(v.rid)}"><input type="hidden" name="csrf" value="${esc(v.csrf)}">
       ${levels}${warn}${login}
       <div class="row"><button class="go" name="action" value="allow">Allow</button><button name="action" value="deny" formnovalidate>Deny</button></div>
     </form>
     <p><small>You can disconnect any time from the connector settings. Scopes are enforced by the bridge; the underlying Paperclip credential is stored encrypted and never shown to the app.</small></p>`,
    v.nonce,
    script,
  );
}

export function errorPage(title: string, message: string): string {
  return shell(title, `<h1>${esc(title)}</h1><p>${esc(message)}</p>`);
}
