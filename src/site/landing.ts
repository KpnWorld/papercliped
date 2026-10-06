/** The interactive landing page: a mascot that watches the cursor, a live user count, and a permission playground. */
import { esc } from "../oauth/pages.js";

export const LANDING_CSS = `
.hero2{display:flex;flex-wrap:wrap;align-items:center;gap:30px 50px;padding:56px max(20px,5vw) 24px;max-width:1100px;margin:0 auto}
.hero2 .copy{flex:1 1 360px;min-width:0}
.kick{display:inline-block;font-size:13px;font-weight:600;letter-spacing:.02em;padding:4px 12px;border:1px solid var(--line);border-radius:99px;color:var(--ink2);background:rgba(255,255,255,.4)}
.hero2 h1{font-size:clamp(34px,6vw,54px);line-height:1.08;margin:16px 0 14px;letter-spacing:-.02em}
.hero2 h1 em{font-style:normal;background:linear-gradient(transparent 62%,#f6e27f 62%)}
.hero2 p.sub{font-size:18px;color:var(--ink2);max-width:560px;margin:0 0 6px}
.mascot{flex:0 0 220px;width:220px;height:220px;position:relative;cursor:pointer;-webkit-tap-highlight-color:transparent}
.mascot svg{width:100%;height:100%;overflow:visible;filter:drop-shadow(0 8px 0 rgba(71,70,60,.12))}
.mascot.wiggle svg{animation:wig .7s ease}
@keyframes wig{0%,100%{transform:rotate(0)}20%{transform:rotate(-9deg) scale(1.04)}45%{transform:rotate(8deg)}70%{transform:rotate(-4deg)}}
.mascot .lid{transition:transform .08s}.mascot.blink .lid{transform:scaleY(1)}.lid{transform:scaleY(0);transform-origin:center;transform-box:fill-box}
.bubble{position:absolute;left:50%;top:-6px;transform:translate(-50%,-100%);background:#fff;border:1px solid var(--line);border-radius:12px;padding:7px 12px;font-size:14px;white-space:nowrap;opacity:0;pointer-events:none;transition:opacity .2s}
.bubble.on{opacity:1}
.stats{display:flex;flex-wrap:wrap;gap:12px;padding:14px max(20px,5vw) 6px;max-width:1100px;margin:0 auto}
.stat{border:1px solid var(--line);border-radius:12px;padding:12px 18px;background:rgba(255,255,255,.4);min-width:150px}
.stat b{display:block;font-size:30px;line-height:1.1;font-variant-numeric:tabular-nums}.stat span{font-size:13.5px;color:var(--muted)}
.play{max-width:1100px;margin:34px auto 0;padding:0 max(20px,5vw)}
.play h2{font-size:22px;margin:0 0 4px}.play p.sub2{color:var(--muted);margin:0 0 14px}
.seg{display:inline-flex;border:1px solid var(--ink2);border-radius:10px;overflow:hidden;margin-bottom:14px}
.seg button{border:0;background:transparent;padding:9px 16px;font:inherit;font-weight:600;cursor:pointer;color:var(--ink)}
.seg button[aria-pressed=true]{background:var(--ink2);color:var(--bg)}
.chat{border:1px solid var(--line);border-radius:12px;padding:16px;background:rgba(255,255,255,.45);max-width:640px}
.msg{padding:9px 13px;border-radius:12px;margin:6px 0;max-width:88%}.me{background:var(--ink2);color:var(--bg);margin-left:auto}.ai{background:#fff;border:1px solid var(--line)}
.msg small{display:block;color:var(--muted);margin-top:3px}
.tag{display:inline-block;font-size:12px;border-radius:99px;padding:1px 9px;margin-left:6px}.yes{background:#e3f1d6;color:#2f5a14}.no{background:#fde8e3;color:#8a1f11}
.band{max-width:1100px;margin:48px auto 0;padding:0 max(20px,5vw)}
.band .big{border:1px solid var(--ink2);border-radius:16px;padding:26px 28px;background:var(--ink2);color:var(--bg);font-size:clamp(20px,3.4vw,28px);font-weight:600;letter-spacing:-.01em}
.band .big small{display:block;font-size:14px;font-weight:400;opacity:.8;margin-top:6px;letter-spacing:0}
@media (prefers-reduced-motion:reduce){.mascot.wiggle svg{animation:none}.bubble{transition:none}}
`;

const MASCOT = `<svg viewBox="0 0 64 64" role="img" aria-label="Papercliped, a friendly paperclip"><rect width="64" height="64" rx="16" fill="#fffddc"/><path d="M22 38V19a10 10 0 0 1 20 0v24a14 14 0 0 1-28 0V24" fill="none" stroke="#47463c" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/><circle cx="26.5" cy="44.5" r="4" fill="#fffddc"/><circle cx="37.5" cy="44.5" r="4" fill="#fffddc"/><circle id="pl" cx="27.3" cy="45.2" r="2" fill="#0b0a07"/><circle id="pr" cx="38.3" cy="45.2" r="2" fill="#0b0a07"/><rect class="lid" x="22.5" y="40.5" width="8" height="8" rx="4" fill="#47463c"/><rect class="lid" x="33.5" y="40.5" width="8" height="8" rx="4" fill="#47463c"/><path id="mouth" d="M28.5 52q3.5 3 7 0" fill="none" stroke="#fffddc" stroke-width="2" stroke-linecap="round"/><circle cx="21.5" cy="50" r="2.2" fill="#e98a7a" opacity=".85"/><circle cx="42.5" cy="50" r="2.2" fill="#e98a7a" opacity=".85"/></svg>`;

export function landingBody(): string {
  return `
<section class="hero2">
  <div class="copy">
    <span class="kick">Papercliped, not Paperclipped.</span>
    <h1>Your AI, <em>clipped</em> to your Paperclip.</h1>
    <p class="sub">See your agents, sync their work and get reports from Claude or ChatGPT, and if you choose, let it pause, wake and assign them. You set how much it may do, and you can cut it off any time.</p>
    <p style="margin-top:18px"><a class="cta" href="/docs/signup">Create your account</a><a class="cta ghost" href="/docs/getting-started">Get started</a></p>
  </div>
  <div class="mascot" id="mascot" role="button" tabindex="0" aria-label="Say hi to the Papercliped mascot">
    <div class="bubble" id="bubble" role="status"></div>
    ${MASCOT}
  </div>
</section>

<section class="stats" aria-label="Papercliped right now">
  <div class="stat"><b id="n-users">–</b><span id="l-users">people use Papercliped</span></div>
  <div class="stat"><b id="n-conn">–</b><span>apps connected right now</span></div>
</section>

<section class="play" aria-labelledby="pt">
  <h2 id="pt">Try the permissions</h2>
  <p class="sub2">Pick what you would let Claude do, then see what happens when it tries.</p>
  <div class="seg" role="group" aria-label="Access level">
    <button type="button" data-l="read" aria-pressed="true">Read only</button>
    <button type="button" data-l="control" aria-pressed="false">Full control</button>
  </div>
  <div class="chat" id="chat" aria-live="polite"></div>
</section>

<section class="band"><div class="big">Papercliped, not Paperclipped.<small>The little clip that connects your AI to the Paperclip you already run. No lock-in, and you can disconnect in one click.</small></div></section>

<section class="cards" style="margin-top:34px">
  <div class="card"><h2>You choose the access</h2><p>Read only by default. Full control is opt-in, every time you connect.</p></div>
  <div class="card"><h2>Your keys stay sealed</h2><p>Your Paperclip key is stored encrypted and is never shown to the AI app.</p></div>
  <div class="card"><h2>Optionally anonymous</h2><p>Appear as an alias like Ann02 in the operator's logs instead of your username.</p></div>
  <div class="card"><h2>Manage it yourself</h2><p>Beta users get a page to see every connected app, change its access and disconnect it.</p></div>
</section>`;
}

const SCRIPT_TEXT = `
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Count-up for the live numbers.
  function count(el, to) {
    if (reduce || to < 2) { el.textContent = String(to); return; }
    var t0 = performance.now(), dur = 900;
    (function step(t) {
      var k = Math.min(1, (t - t0) / dur); k = 1 - Math.pow(1 - k, 3);
      el.textContent = String(Math.round(to * k));
      if (k < 1) requestAnimationFrame(step);
    })(t0);
  }
  fetch("/api/public/stats").then(function (r) { return r.json(); }).then(function (s) {
    if (typeof s.users === "number") {
      count($("n-users"), s.users);
      $("l-users").textContent = s.users === 1 ? "person uses Papercliped" : "people use Papercliped";
      count($("n-conn"), s.connections || 0);
    } else {
      $("n-users").textContent = "New";
      $("l-users").textContent = "be one of the first";
      $("n-conn").textContent = "0";
    }
  }).catch(function () { $("n-users").textContent = "New"; $("l-users").textContent = "be one of the first"; $("n-conn").textContent = "0"; });

  // The mascot: eyes follow the cursor, it blinks, and it talks when clicked.
  var m = $("mascot"), pl = $("pl"), pr = $("pr"), bub = $("bubble");
  var base = { l: [27.3, 45.2], r: [38.3, 45.2] };
  function look(x, y) {
    var b = m.getBoundingClientRect(), cx = b.left + b.width / 2, cy = b.top + b.height * 0.7;
    var dx = x - cx, dy = y - cy, d = Math.max(1, Math.hypot(dx, dy)), k = Math.min(1.6, d / 120) / d * 1.6;
    [[pl, base.l], [pr, base.r]].forEach(function (p) { p[0].setAttribute("cx", String(p[1][0] + dx * k)); p[0].setAttribute("cy", String(p[1][1] + dy * k * 0.8)); });
  }
  if (!reduce) {
    document.addEventListener("pointermove", function (e) { look(e.clientX, e.clientY); });
    setInterval(function () { m.classList.add("blink"); setTimeout(function () { m.classList.remove("blink"); }, 130); }, 3200);
  }
  var lines = ["Hi! I am Papercliped, not Paperclipped!", "I only clip what you let me.", "Psst: try the permissions below.", "Read only is my favourite. Safe!", "Boing!"];
  var li = 0, tm;
  function say() {
    bub.textContent = lines[li++ % lines.length]; bub.classList.add("on");
    m.classList.remove("wiggle"); void m.offsetWidth; m.classList.add("wiggle");
    clearTimeout(tm); tm = setTimeout(function () { bub.classList.remove("on"); }, 2400);
  }
  m.addEventListener("click", say);
  m.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); say(); } });
  setTimeout(say, 900);

  // Permission playground.
  var chat = $("chat"), btns = document.querySelectorAll(".seg button");
  var SCRIPTS = {
    read: [
      ["me", "How are my agents doing?"],
      ["ai", "You have 9 agents. 7 are idle and 2 are in an error state. The CEO agent reported a terminal access failure.", "Read", true],
      ["me", "Pause the Web Engineer."],
      ["ai", "I can not do that: you gave me Read only access, so I can look but not change anything. You can allow Full control the next time you connect.", "Change agents", false]
    ],
    control: [
      ["me", "How are my agents doing?"],
      ["ai", "You have 9 agents. 7 are idle and 2 are in an error state. The CEO agent reported a terminal access failure.", "Read", true],
      ["me", "Pause the Web Engineer."],
      ["ai", "Done. The Web Engineer is paused. I will tell you before I do anything destructive.", "Change agents", true],
      ["me", "Terminate the Mail Officer."],
      ["ai", "Terminating can't be undone, so I will check first: do you want me to terminate the Mail Officer?", "Terminate agents", true]
    ]
  };
  function show(l) {
    chat.replaceChildren();
    SCRIPTS[l].forEach(function (x, i) {
      var d = document.createElement("div");
      d.className = "msg " + x[0];
      d.appendChild(document.createTextNode(x[1]));
      if (x[0] === "ai") {
        var t = document.createElement("span");
        t.className = "tag " + (x[3] ? "yes" : "no");
        t.textContent = (x[3] ? "allowed · " : "blocked · ") + x[2];
        d.appendChild(t);
      }
      d.style.opacity = "0";
      chat.appendChild(d);
      setTimeout(function () { d.style.transition = "opacity .25s"; d.style.opacity = "1"; }, reduce ? 0 : 280 * i);
    });
  }
  btns.forEach(function (b) {
    b.addEventListener("click", function () {
      btns.forEach(function (o) { o.setAttribute("aria-pressed", String(o === b)); });
      show(b.getAttribute("data-l"));
    });
  });
  show("read");
})();
`;
export const LANDING_SCRIPT = SCRIPT_TEXT;
export const _esc = esc;
