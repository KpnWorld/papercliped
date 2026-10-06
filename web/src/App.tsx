import { Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { ToastProvider } from "./components/Toast";
import { Home } from "./pages/Home";
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
          <Route path="/changelog" element={<Placeholder title="Changelog" note="The changelog page is coming in phase 2. Until then, see CHANGELOG.md on GitHub." />} />
          <Route path="/community" element={<Placeholder title="Community" note="The community hub is coming in phase 2." />} />
          <Route path="/brand" element={<Placeholder title="Brand assets" note="Wordmark and mascot downloads are coming in phase 2." />} />
          <Route path="/privacy" element={<Placeholder title="Privacy" note="The privacy policy moves here in phase 2; the bridge still serves it today." />} />
          <Route path="/terms" element={<Placeholder title="Terms" note="The terms move here in phase 2; the bridge still serves them today." />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Layout>
    </ToastProvider>
  );
}
