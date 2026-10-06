import { AppLink } from "../components/AppLink";
import { Mascot } from "../components/Mascot";
import { ButtonLink, Card, Table } from "../components/ui";
import { PALETTES } from "../theme/palettes";
import { usePageTitle } from "./usePageTitle";

const ASSETS = [
  { file: "/brand/mascot-light.svg", label: "Mascot, light (SVG)" },
  { file: "/brand/mascot-dark.svg", label: "Mascot, dark (SVG)" },
  { file: "/brand/wordmark-light.png", label: "Wordmark, light (PNG)" },
  { file: "/brand/wordmark-dark.png", label: "Wordmark, dark (PNG)" },
];

export function Brand() {
  usePageTitle("Brand assets");
  const c = PALETTES.clip;
  return (
    <div className="mx-auto max-w-5xl px-4 py-12 sm:py-16">
      <h1 className="text-4xl font-bold sm:text-5xl">Brand assets</h1>
      <p className="mt-3 max-w-2xl text-lg text-muted">Writing about Papercliped, making a video, or building something on top? Use these. They're free to use for talking about the project.</p>

      <section aria-labelledby="dl-h" className="mt-10">
        <h2 id="dl-h" className="text-2xl font-bold">Downloads</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Card className="flex items-center gap-5">
            <Mascot size={88} hopOnClick />
            <div>
              <h3 className="font-sans text-lg font-bold">The mascot</h3>
              <p className="text-sm text-muted">A smiling paperclip. Keep its proportions and colours.</p>
            </div>
          </Card>
          <Card className="flex items-center gap-4">
            <span className="font-display text-5xl font-bold lowercase">papercliped</span>
          </Card>
        </div>
        <ul className="mt-4 flex flex-wrap gap-3">
          {ASSETS.map((a) => <li key={a.file}><a href={a.file} download className="inline-flex h-10 items-center rounded-lg border border-field px-4 text-sm font-semibold transition-transform duration-150 hover:-translate-y-0.5">{a.label}</a></li>)}
        </ul>
      </section>

      <section aria-labelledby="use-h" className="mt-12 grid gap-4 md:grid-cols-2">
        <h2 id="use-h" className="sr-only">Usage</h2>
        <Card>
          <h3 className="font-sans text-lg font-bold">Please do</h3>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-muted">
            <li>Write the name as <strong className="text-ink">Papercliped</strong>: one word, capital P (the wordmark itself is lowercase).</li>
            <li>Leave clear space around the mascot of at least a quarter of its width.</li>
            <li>Use the light version on light backgrounds and the dark version on dark ones.</li>
            <li>Link to papercliped.co or the GitHub repository when you can.</li>
          </ul>
        </Card>
        <Card>
          <h3 className="font-sans text-lg font-bold">Please don't</h3>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-muted">
            <li>Stretch, recolour or redraw the mascot, or add effects to it.</li>
            <li>Suggest that Papercliped is made or endorsed by Paperclip. It's an independent project.</li>
            <li>Combine our marks with Paperclip's logo or other companies' logos.</li>
            <li>Use the name or mascot for a different product.</li>
          </ul>
        </Card>
      </section>

      <section aria-labelledby="col-h" className="mt-12">
        <h2 id="col-h" className="text-2xl font-bold">Colours and type</h2>
        <p className="mt-2 text-muted">The default "clip" theme. The site also rotates seasonal palettes; see the <AppLink className="text-link underline" to="/kit">design kit</AppLink>.</p>
        <div className="mt-4">
          <Table caption="Brand colours" head={["Role", "Light", "Dark"]} rows={[
            ["Background", c.light.bg, c.dark.bg], ["Ink (text)", c.light.ink, c.dark.ink], ["Brand olive / cream", c.light.accent, c.dark.accent], ["Muted text", c.light.muted, c.dark.muted],
          ].map(([role, l, d]) => [role, <span className="inline-flex items-center gap-2 font-mono"><span className={`inline-block h-4 w-4 rounded border border-line swatch-clip-light-${role === "Background" ? "bg" : role === "Ink (text)" ? "ink" : role === "Muted text" ? "muted" : "accent"}`} />{l}</span>, <span className="inline-flex items-center gap-2 font-mono"><span className={`inline-block h-4 w-4 rounded border border-line swatch-clip-dark-${role === "Background" ? "bg" : role === "Ink (text)" ? "ink" : role === "Muted text" ? "muted" : "accent"}`} />{d}</span>])} />
        </div>
        <p className="mt-4 text-muted">Type: <span className="font-display font-bold text-ink">Bricolage Grotesque</span> for headlines and the wordmark, <span className="font-semibold text-ink">Inter</span> for text, <span className="font-mono text-ink">JetBrains Mono</span> for code. All three are free under the SIL Open Font License.</p>
      </section>

      <div className="mt-12"><ButtonLink to="/community" variant="secondary">Back to the community</ButtonLink></div>
    </div>
  );
}
