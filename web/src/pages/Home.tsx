import { AppLink } from "../components/AppLink";
import { Accordion } from "../components/Accordion";
import { CodeBlock } from "../components/CodeBlock";
import { CountUp } from "../components/CountUp";
import { GitHubIcon } from "../components/Layout";
import { Mascot } from "../components/Mascot";
import { Playground } from "../components/Playground";
import { Stepper } from "../components/Stepper";
import { ButtonLink, Card, TextLink } from "../components/ui";
import { community } from "../config/community";
import tools from "../generated/tools.json";
import { useLiveStats } from "../lib/useLiveStats";
import { usePageTitle } from "./usePageTitle";

const MCP_URL = "https://papercliped.co/mcp";

function Section({ id, eyebrow, title, lede, children }: { id: string; eyebrow: string; title: string; lede?: string; children: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="mx-auto max-w-6xl px-4 py-16 sm:py-20">
      <p className="text-sm font-bold uppercase tracking-widest text-muted">{eyebrow}</p>
      <h2 id={`${id}-h`} className="mt-2 text-3xl font-bold sm:text-4xl">{title}</h2>
      {lede && <p className="mt-3 max-w-2xl text-lg text-muted">{lede}</p>}
      <div className="mt-8">{children}</div>
    </section>
  );
}

const APPS = ["Claude", "Claude Code", "ChatGPT", "Any MCP app", "npm", "Paperclip plugin"];

const SECURITY = [
  { t: "You approve it in your Paperclip", d: "Sign-in happens on your own Paperclip. No passwords pass through Papercliped." },
  { t: "Scoped, revocable access", d: "Read only by default. Change the level or disconnect any app at any time, effective on its next request." },
  { t: "Keys stay sealed", d: "Paperclip keys are encrypted at rest; tokens and secret keys are stored only as one-way hashes." },
  { t: "Guarded egress", d: "Only public https Paperclip addresses are reachable, so the bridge can't be pointed at private networks." },
  { t: "No trackers", d: "No analytics, no ads, no third-party scripts on this site." },
  { t: "Open source", d: "MIT licensed. Read the code, run it yourself, or send a fix." },
];

const FAQ = [
  { q: "Is Papercliped free?", a: "Yes. It's free and open source (MIT). The hosted bridge at papercliped.co runs the same code you can run yourself." },
  { q: "What is Paperclip?", a: "Paperclip is an open-source orchestrator for companies of AI agents. Papercliped is an independent project that connects AI apps to your Paperclip; it isn't made by the Paperclip team." },
  { q: "What can the AI do with my Paperclip?", a: <>Only what the level you pick allows: Read only by default, Full control (beta) if you choose it. Try the playground above, and see <TextLink to="/docs/permissions">Permissions</TextLink>.</> },
  { q: "Does my Paperclip need to be public?", a: <>For the hosted bridge, yes: a public https address. No domain? See <TextLink to="/docs/connect-your-paperclip">Set up your Paperclip</TextLink>. Or run Papercliped locally with <code className="font-mono">npx papercliped@latest</code>.</> },
  { q: "Can I stop it any time?", a: <>Yes. Disconnect an app or change its level on the manage page, revoke the key in Paperclip, or delete your account.</> },
  { q: "Which AI apps work?", a: <>Claude (web, desktop, mobile, Claude Code), ChatGPT, and any app that supports MCP. See <TextLink to="/docs/other-ai-apps">Any AI app</TextLink>.</> },
];

export function Home() {
  usePageTitle("");
  const stats = useLiveStats();
  return (
    <>
      <section className="relative overflow-hidden">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 pb-16 pt-12 sm:pt-20 lg:grid-cols-[1.2fr_1fr]">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-sm font-medium">
              <span aria-hidden="true">✦</span> Free and open source · v2
            </p>
            <h1 className="mt-5 text-5xl font-bold leading-[1.05] sm:text-6xl lg:text-7xl">Papercliped, not Paperclipped.</h1>
            <p className="mt-5 max-w-xl text-lg text-muted sm:text-xl">Connect Claude, ChatGPT or any MCP app to your Paperclip. Control agents, sync with them and get reports, at the access level you choose.</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <ButtonLink to="/docs/getting-started" size="lg">Get started</ButtonLink>
              <ButtonLink to={community.github} variant="secondary" size="lg"><GitHubIcon /> Star on GitHub</ButtonLink>
            </div>
            <dl className="mt-8 flex flex-wrap gap-6">
              <div><dt className="text-sm text-muted">People connected</dt><dd className="font-display text-3xl font-bold"><CountUp value={stats?.users ?? null} /></dd></div>
              <div><dt className="text-sm text-muted">Live connections</dt><dd className="font-display text-3xl font-bold"><CountUp value={stats?.connections ?? null} /></dd></div>
              <div><dt className="text-sm text-muted">Tools</dt><dd className="font-display text-3xl font-bold">{tools.length}</dd></div>
            </dl>
          </div>
          <div className="flex flex-col items-center gap-6">
            <div className="animate-float">
              <Mascot size={220} hopOnClick title="Papercliped mascot. Click me." className="cursor-pointer drop-shadow-xl" />
            </div>
            <div className="w-full max-w-md">
              <CodeBlock label="Add to Claude as a custom connector" code={MCP_URL} />
            </div>
          </div>
        </div>
        <div className="border-y border-line bg-surface">
          <ul aria-label="Works with" className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-8 gap-y-3 px-4 py-5 text-sm font-semibold">
            <li className="text-muted">Works with</li>
            {APPS.map((a) => <li key={a} className="rounded-full border border-line bg-bg px-3 py-1 transition-transform duration-150 hover:-translate-y-0.5 hover:rotate-[-2deg]">{a}</li>)}
          </ul>
        </div>
      </section>

      <Section id="how" eyebrow="How it works" title="Three steps, about a minute" lede="You keep control the whole way: you approve the connection in your own Paperclip and choose what the AI may do.">
        <Stepper steps={[
          { title: "Add the connector", body: <><p>In Claude open <strong>Settings → Connectors → Add custom connector</strong> and paste the address. ChatGPT and other MCP apps work the same way.</p><CodeBlock code={MCP_URL} /></> },
          { title: "Connect your Paperclip", body: <p>Enter your Paperclip's public address and approve the request inside your Paperclip. Pick a username and save the secret key you're shown once.</p> },
          { title: "Choose the level, then ask", body: <p>Leave it on <strong>Read only</strong> or pick <strong>Full control (beta)</strong>. Then ask: “What are my agents working on?” or “Pause the agent that's over budget.”</p> },
        ]} />
      </Section>

      <Section id="playground" eyebrow="Permission playground" title="See exactly what the AI can do" lede="Every tool, and the level it needs. Switch levels to see what changes.">
        <Playground />
      </Section>

      <Section id="plugins" eyebrow="Two plugins, one service" title="Use it from your AI app, or from inside Paperclip">
        <div className="grid gap-4 md:grid-cols-2">
          <Card interactive>
            <h3 className="text-xl font-bold">Papercliped for AI apps</h3>
            <p className="mt-2 text-muted">The main one. Claude, ChatGPT or any MCP client gets {tools.length} tools to control and report on your Paperclip. Hosted at papercliped.co, or run it yourself.</p>
            <div className="mt-4 flex flex-wrap gap-3"><ButtonLink to="/docs/getting-started" size="sm">Get started</ButtonLink><ButtonLink to="/docs/other-ai-apps" size="sm" variant="secondary">Any AI app</ButtonLink></div>
          </Card>
          <Card interactive>
            <h3 className="text-xl font-bold">Papercliped plugin for Paperclip <span className="align-middle text-xs font-bold uppercase text-muted">beta</span></h3>
            <p className="mt-2 text-muted">A page inside your Paperclip to link your account and manage connected apps: change their level, disconnect them, go anonymous.</p>
            <div className="mt-4"><ButtonLink to="/docs/paperclip-plugin" size="sm" variant="secondary">Paperclip plugin</ButtonLink></div>
          </Card>
        </div>
      </Section>

      <Section id="security" eyebrow="Security" title="Built to be trusted with your agents">
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {SECURITY.map((s) => <Card as="li" interactive key={s.t}><h3 className="font-sans text-lg font-bold">{s.t}</h3><p className="mt-1 text-muted">{s.d}</p></Card>)}
        </ul>
        <p className="mt-6"><TextLink to="/docs/security">Read the security model</TextLink></p>
      </Section>

      <section aria-labelledby="cta-h" className="mx-auto max-w-6xl px-4 py-12">
        <div className="flex flex-col items-start gap-6 rounded-3xl bg-accent p-8 text-accent-ink sm:flex-row sm:items-center sm:p-12">
          <div className="flex-1">
            <h2 id="cta-h" className="text-3xl font-bold">Build it with us</h2>
            <p className="mt-2 max-w-xl opacity-90">Papercliped is a community project. Suggest a feature, report a bug, or send a pull request.</p>
          </div>
          <AppLink to="/community" className="inline-flex h-12 items-center rounded-lg bg-bg px-6 font-semibold text-ink transition-transform duration-150 hover:-translate-y-0.5 active:scale-[0.97]">Join the community</AppLink>
        </div>
      </section>

      <Section id="faq" eyebrow="FAQ" title="Questions people ask">
        <Accordion items={FAQ} />
      </Section>
    </>
  );
}
