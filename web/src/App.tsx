import { Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { ToastProvider } from "./components/Toast";
import { Brand } from "./pages/Brand";
import { Changelog } from "./pages/Changelog";
import { Community } from "./pages/Community";
import { Home } from "./pages/Home";
import { Legal } from "./pages/Legal";
import { RenderFrame } from "./pages/Render";
import { Kit } from "./pages/Kit";
import { NotFound, Placeholder } from "./pages/Placeholder";

/** Every route the site serves. scripts/check-routes.mjs loads each of these in a real browser. */
export const ROUTES = ["/", "/kit", "/docs", "/changelog", "/community", "/brand", "/privacy", "/terms"] as const;

export function App() {
  return (
    <ToastProvider>
      <Layout>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/kit" element={<Kit />} />
          <Route path="/docs/*" element={<Placeholder title="Docs" note="The new docs site is coming in phase 3. The current docs are served by the bridge and on GitHub." />} />
          <Route path="/changelog" element={<Changelog />} />
          <Route path="/community" element={<Community />} />
          <Route path="/brand" element={<Brand />} />
          <Route path="/privacy" element={<Legal page="privacy" />} />
          <Route path="/terms" element={<Legal page="terms" />} />
          <Route path="/__render" element={<RenderFrame />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Layout>
    </ToastProvider>
  );
}
