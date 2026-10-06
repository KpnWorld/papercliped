import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "../src/App";
import { resolveHref, setHosts } from "../src/lib/hosts";

const H = { marketing: "papercliped.co", docs: "docs.papercliped.co" };
function onHost(host: string) {
  vi.stubGlobal("location", { ...window.location, host, hostname: host.split(":")[0], href: `https://${host}/`, assign: vi.fn() });
}
afterEach(() => {
  setHosts(null);
  vi.unstubAllGlobals();
});

describe("host-aware links", () => {
  it("without a host map, every page is relative on the current host", () => {
    setHosts({});
    expect(resolveHref("/docs/permissions")).toBe("/docs/permissions");
    expect(resolveHref("/topics/faq#x")).toBe("/docs/faq#x");
    expect(resolveHref("/community")).toBe("/community");
    expect(resolveHref("https://github.com/x")).toBe("https://github.com/x");
  });
  it("on the marketing host, docs go to the docs host at /topics", () => {
    setHosts(H);
    onHost("papercliped.co");
    expect(resolveHref("/docs/permissions#levels")).toBe("https://docs.papercliped.co/topics/permissions#levels");
    expect(resolveHref("/docs")).toBe("https://docs.papercliped.co/topics");
    expect(resolveHref("/community")).toBe("/community");
    expect(resolveHref("/manage")).toBe("/manage");
  });
  it("on the docs host, docs are local /topics and marketing pages go to the marketing host", () => {
    setHosts(H);
    onHost("docs.papercliped.co");
    expect(resolveHref("/docs/faq")).toBe("/topics/faq");
    expect(resolveHref("/topics")).toBe("/topics");
    expect(resolveHref("/community")).toBe("https://papercliped.co/community");
    expect(resolveHref("/")).toBe("https://papercliped.co/");
  });
  it("renders /topics pages on the docs host with /topics links in the sidebar", () => {
    setHosts(H);
    onHost("docs.papercliped.co");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    render(<MemoryRouter initialEntries={["/topics/permissions"]}><App /></MemoryRouter>);
    expect(screen.getByRole("heading", { level: 1, name: "Permissions" })).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "FAQ" })[0]).toHaveAttribute("href", "/topics/faq");
    expect(screen.getAllByRole("link", { name: "Join the community" })[0]).toHaveAttribute("href", "https://papercliped.co/community");
  });
});
