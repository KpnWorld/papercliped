import { CodeBlock } from "../components/CodeBlock";
import { Mascot } from "../components/Mascot";
import { ButtonLink } from "../components/ui";
import { usePageTitle } from "./usePageTitle";

/** Phase 1 front page: the full landing page arrives in phase 2. */
export function Home() {
  usePageTitle("");
  return (
    <section className="mx-auto flex max-w-4xl flex-col items-center px-4 py-20 text-center">
      <Mascot size={120} />
      <h1 className="mt-6 text-5xl font-bold sm:text-6xl">Papercliped, not Paperclipped.</h1>
      <p className="mt-4 max-w-2xl text-lg text-muted">Connect Claude, ChatGPT or any MCP app to your Paperclip. Control agents, sync with them and get reports, with permissions you choose. Free and open source.</p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <ButtonLink to="/docs/getting-started" size="lg">Get started</ButtonLink>
        <ButtonLink to="/kit" variant="secondary" size="lg">See the design kit</ButtonLink>
      </div>
      <div className="mt-10 w-full max-w-xl text-left">
        <CodeBlock label="Add it to Claude as a custom connector" code="https://papercliped.co/mcp" />
      </div>
    </section>
  );
}
