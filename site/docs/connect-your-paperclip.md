# Set up your Paperclip for Papercliped

Papercliped talks to **your** Paperclip over the internet, so your Paperclip needs a public address. This guide gets you one, step by step, whether you already own a domain or not.

You don't need to open any ports on your router for any option below.

## What Papercliped needs from your Paperclip
- **A public `https://` address on port 443** that answers over the internet. Private, LAN, `localhost` and plain `http://` addresses are refused on purpose.
- **Paperclip in authenticated mode and public exposure.** You can check from any computer:
  ```
  curl https://your-address/api/health
  ```
  A healthy answer is JSON that includes `"status":"ok"`, `"deploymentMode":"authenticated"` and `"deploymentExposure":"public"`. (On Windows PowerShell, `curl.exe https://your-address/api/health` works the same way.)
- **No login wall or bot challenge in front of `/api/*`.** If you put something like Cloudflare Access, "Under Attack" mode or a managed challenge in front of Paperclip, it must skip `/api/*`, or Papercliped will be blocked.
- **Paperclip must accept the new hostname.** Paperclip can reject hostnames it doesn't know, and public mode needs its public URL set. Paperclip's own settings for this include `PAPERCLIP_PUBLIC_URL` and `PAPERCLIP_ALLOWED_HOSTNAMES`; the exact steps are in Paperclip's deployment docs (search "Paperclip deployment modes" on docs.paperclip.ing). Check them there rather than guessing.

Paperclip listens on port `3100` by default, which the examples below use. If yours is different, use your port.

## Path A: you own a domain (recommended)
This gives you a stable address like `https://paperclip.yourdomain.com` that survives restarts. The tunnel and DNS are free on Cloudflare's free plan. The domain itself isn't: there is no free `.com`. (Cloudflare Registrar sells domains at wholesale cost, so it's one cheap option if you need to buy one.)

1. **Put your domain on Cloudflare.** Create a free Cloudflare account, add your domain, and switch its nameservers to the two Cloudflare gives you (done at the company where you bought the domain). Wait until Cloudflare shows the domain as active.
2. **Install `cloudflared`** on the machine that runs Paperclip. Find the installer for Windows, macOS or Linux on Cloudflare's downloads page (search "cloudflared downloads").
3. **Log in.** This opens a browser so you can pick your domain:
   ```
   cloudflared tunnel login
   ```
4. **Create the tunnel.** Pick any name:
   ```
   cloudflared tunnel create papercliped-paperclip
   ```
   It prints a tunnel ID (a UUID) and saves a credentials file in your `.cloudflared` folder. Keep that file private.
5. **Write the config.** In your `.cloudflared` folder (`~/.cloudflared` on macOS/Linux, `%USERPROFILE%\.cloudflared` on Windows) create `config.yml`:
   ```
   tunnel: <TUNNEL-ID>
   credentials-file: <PATH-TO-THE-CREDENTIALS-FILE>.json
   ingress:
     - hostname: paperclip.yourdomain.com
       service: http://localhost:3100
     - service: http_status:404
   ```
   The last rule is required: it answers 404 for anything else.
6. **Point the name at the tunnel:**
   ```
   cloudflared tunnel route dns papercliped-paperclip paperclip.yourdomain.com
   ```
7. **Run it.** To try it first:
   ```
   cloudflared tunnel run papercliped-paperclip
   ```
   To keep it running (starts with your computer), install it as a service:
   - **macOS:** `cloudflared service install` (runs when you log in) or `sudo cloudflared service install` (runs at boot).
   - **Linux:** `cloudflared service install` (with `sudo` if needed).
   - **Windows:** run `cloudflared.exe service install` from an Administrator PowerShell. A Windows service may not read the config from your user folder; check Cloudflare's "Run as a service on Windows" page for where it expects `config.yml`.
8. **Check it** from any computer:
   ```
   curl https://paperclip.yourdomain.com/api/health
   ```
   You should see the JSON described above.

**If your computer sleeps or turns off,** the tunnel goes down and your connected AI apps stop working until it's back. Turn off sleep on the machine, or run Paperclip on an always-on computer or server.

## Path B: you don't have a domain yet
All of these are free. They differ in how stable the address is.

| Option | Address | Stable? | Good for |
| --- | --- | --- | --- |
| Tailscale Funnel | `https://<machine>.<tailnet>.ts.net` | Yes | Daily use |
| ngrok free plan | one free static `ngrok-free.app` / `ngrok-free.dev` domain | Yes | Daily use, with a caveat below |
| Cloudflare quick tunnel | random `*.trycloudflare.com` | **No, changes every restart** | Trying Papercliped only |

### Tailscale Funnel (stable)
Funnel makes a service on your computer reachable from the public internet at your tailnet's `ts.net` name.
1. Create a free Tailscale account and install Tailscale on the machine that runs Paperclip.
2. In the Tailscale admin console, turn on **HTTPS certificates** for your tailnet and allow Funnel. (Running the `tailscale funnel` command below walks you through enabling it and updates your tailnet policy for you.)
3. Start Funnel for Paperclip's port:
   ```
   tailscale funnel 3100
   ```
   It prints your public address, like `https://my-pc.my-tailnet.ts.net`. Funnel only serves on ports 443, 8443 and 10000; use the default 443 for Papercliped.
4. Funnel traffic has bandwidth limits you can't change. That is fine for Papercliped's small requests, but check Tailscale's Funnel docs for the current rules on your plan.

### ngrok free plan (stable address, one catch)
1. Create a free ngrok account. Every account gets one free static "dev domain" (for example `your-name.ngrok-free.dev`); see it in the ngrok dashboard under Domains.
2. Install ngrok and add your authtoken (the dashboard shows the exact command).
3. Run, with your own domain:
   ```
   ngrok http --url=your-name.ngrok-free.dev 3100
   ```
4. **The catch:** on the free plan ngrok shows a "visit site" warning page to browsers. Papercliped's requests come from a program, not a browser, but if the connection fails with a strange HTML page, this is the likely cause. Check ngrok's free-plan docs for the current behavior and any header that skips it.

### Cloudflare quick tunnel (trial only)
No account, no domain:
```
cloudflared tunnel --url http://localhost:3100
```
It prints a random `https://something.trycloudflare.com` address. **The address changes every time you restart it**, and when it changes your Papercliped connection stops working until you connect again with the new address. Quick tunnels are for trying Papercliped for an afternoon, not for daily use.

## Connect to Papercliped
1. Make sure `curl https://your-address/api/health` works (see above).
2. Go to [Create your account]({{URL}}/docs/signup), add Papercliped as a connector in Claude, and choose **Connect your Paperclip**.
3. Enter your public address (just the address, no path). The box **Also install the Papercliped plugin in my Paperclip** is ticked by default; it installs the [Paperclip plugin](/docs/paperclip-plugin) and its [control room](/docs/control-room) for you if you are your Paperclip's instance admin. Then approve the request in your Paperclip.

## Keep it safe
- **Expose only Paperclip.** Point the tunnel at Paperclip's port and nothing else on your computer.
- **Keep Paperclip up to date.**
- **Use a dedicated Paperclip user for the connection** if you can, so you can see and limit what it does.
- **You can cut access any time:** revoke the Papercliped key in Paperclip, or disconnect apps in the [Paperclip plugin](/docs/paperclip-plugin).
- **If the tunnel or your computer is off,** connected apps simply stop working until it's back. Nothing is lost.

## Troubleshooting
- **"Could not reach your Paperclip":** the tunnel isn't running, the DNS name hasn't spread yet (give a new name a few minutes), or the address isn't on port 443. Test with `curl https://your-address/api/health` from another network (for example, your phone's mobile data).
- **"Private address" errors:** you entered a LAN address, `localhost`, or `http://`. Use the public `https://` address from your tunnel.
- **A challenge or login page appears:** exempt `/api/*` from Cloudflare Access, "Under Attack" mode or any managed challenge.
- **"Host not allowed" or a 4xx from Paperclip:** Paperclip doesn't know the new hostname. Set its public URL and allowed hostnames (see Paperclip's deployment docs, above) and restart it.
- **Certificate warnings:** use the HTTPS address your tunnel provider gives you, not your own certificate on a raw IP. Tunnels handle certificates for you.
- **Worked yesterday, not today:** the address changed (quick tunnels do this), the tunnel stopped, or the computer slept.

## Not independently confirmed
These came from vendor docs summarized through search, not read page by page. Check the vendor's current docs before relying on them: Windows service setup for `cloudflared`, Tailscale's current Funnel limits, ngrok's free-plan warning page behavior, and Paperclip's exact setting names for public URL and allowed hostnames.
