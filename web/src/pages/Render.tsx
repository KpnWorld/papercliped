import { useSearchParams } from "react-router-dom";
import { Mascot } from "../components/Mascot";

/**
 * Not linked anywhere: frames that scripts/render-assets.mjs screenshots into the wordmark PNGs and the social preview image.
 * Excluded from the sitemap and robots.
 */
export function RenderFrame() {
  const [q] = useSearchParams();
  const kind = q.get("kind");
  if (kind === "og")
    return (
      <div id="frame" className="flex h-[630px] w-[1200px] items-center gap-14 bg-bg px-24">
        <Mascot size={300} interactive={false} title="" />
        <div>
          <p className="font-display text-5xl font-bold lowercase text-muted">papercliped</p>
          <p className="mt-4 font-display text-7xl font-bold leading-tight">Papercliped, not Paperclipped.</p>
          <p className="mt-6 text-3xl text-muted">Connect Claude, ChatGPT or any MCP app to your Paperclip.</p>
        </div>
      </div>
    );
  return (
    <div id="frame" className="inline-flex items-center gap-4 bg-bg px-8 py-6">
      <Mascot size={96} interactive={false} title="" />
      <span className="font-display text-7xl font-bold lowercase">papercliped</span>
    </div>
  );
}
