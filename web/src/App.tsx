import { Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { ToastProvider } from "./components/Toast";
import { Brand } from "./pages/Brand";
import { Changelog } from "./pages/Changelog";
import { Community } from "./pages/Community";
import { DocPage, DocsIndex } from "./pages/Docs";
import { Home } from "./pages/Home";
import { Legal } from "./pages/Legal";
import { RenderFrame } from "./pages/Render";
import { Status } from "./pages/Status";
import { Kit } from "./pages/Kit";
import { NotFound } from "./pages/Placeholder";

/** Every route the site serves. scripts/check-routes.mjs loads each of these in a real browser. */
export const ROUTES = ["/", "/kit", "/docs", "/changelog", "/community", "/brand", "/privacy", "/terms", "/status"] as const;

export function App() {
  return (
    <ToastProvider>
      <Layout>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/kit" element={<Kit />} />
          <Route path="/docs" element={<DocsIndex />} />
          <Route path="/docs/:slug" element={<DocPage />} />
          {/* On the docs host the same pages live at /topics (the bridge maps hosts; see web/src/lib/hosts.ts). */}
          <Route path="/topics" element={<DocsIndex />} />
          <Route path="/topics/:slug" element={<DocPage />} />
          <Route path="/changelog" element={<Changelog />} />
          <Route path="/community" element={<Community />} />
          <Route path="/brand" element={<Brand />} />
          <Route path="/privacy" element={<Legal page="privacy" />} />
          <Route path="/terms" element={<Legal page="terms" />} />
          <Route path="/status" element={<Status />} />
          <Route path="/__render" element={<RenderFrame />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Layout>
    </ToastProvider>
  );
}
