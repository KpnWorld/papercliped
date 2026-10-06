// Cloudflare Worker (free plan): wakes and keeps the Papercliped bridge awake on Render's free tier.
// Render sleeps a free service after ~15 min of silence and a sleeping service can't wake itself, so the ping must come from outside.
// Deploy: see docs/LAUNCH.md §5. Cron below runs every 5 minutes (well inside Render's 15-minute window).
export default {
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(ping(env));
  },
  // Visiting the worker URL shows the last result (handy for checking it works).
  async fetch(_req, env) {
    return new Response(JSON.stringify(await ping(env)), { headers: { "content-type": "application/json" } });
  },
};

async function ping(env) {
  const target = env.TARGET_URL; // e.g. https://papercliped.co/readyz
  const started = Date.now();
  try {
    const res = await fetch(target, { signal: AbortSignal.timeout(60_000), headers: { "user-agent": "papercliped-keepalive/1" } });
    return { target, status: res.status, ms: Date.now() - started };
  } catch (e) {
    return { target, error: String(e), ms: Date.now() - started };
  }
}
