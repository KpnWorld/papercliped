import { build } from "esbuild";
import { createPluginBundlerPresets } from "@paperclipai/plugin-sdk/bundlers";

const p = createPluginBundlerPresets({ workerEntry: "src/worker.ts", manifestEntry: "src/manifest.ts", uiEntry: "src/ui/index.tsx", sourcemap: false, minify: false });
// The host loads the worker with its own SDK; `node:` built-ins stay external for a node platform build.
for (const cfg of [p.esbuild.worker, p.esbuild.manifest, p.esbuild.ui]) {
  await build({ ...cfg, jsx: "automatic", logLevel: "info" });
}
