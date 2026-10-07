import type { PaperclipPluginManifestV1 } from "@paperclipai/plugin-sdk";
import { DEFAULT_BRIDGE_URL } from "./bridge.js";

const manifest: PaperclipPluginManifestV1 = {
  id: "papercliped.remote-control",
  apiVersion: 1,
  version: "2.3.0",
  displayName: "Papercliped",
  description: "Manage the AI apps connected to your Paperclip through Papercliped: link your account, change what each app may do, disconnect them.",
  author: "OpenSourcx",
  categories: ["connector", "ui"],
  capabilities: ["plugin.state.read", "plugin.state.write", "http.outbound", "ui.sidebar.register", "ui.page.register"],
  entrypoints: { worker: "dist/worker.js", ui: "dist/ui" },
  instanceConfigSchema: {
    type: "object",
    properties: {
      bridgeUrl: {
        type: "string",
        title: "Papercliped bridge URL",
        description: "Where your Papercliped bridge runs. Must be https. Change it only if you host your own bridge.",
        default: DEFAULT_BRIDGE_URL,
      },
    },
  },
  ui: {
    slots: [
      { type: "sidebar", id: "papercliped-nav", displayName: "Papercliped", exportName: "PapercliedSidebar", order: 90 },
      { type: "page", id: "papercliped-page", displayName: "Papercliped", exportName: "PapercliedPage", routePath: "papercliped", order: 90 },
    ],
  },
};

export default manifest;
