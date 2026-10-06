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
  it("on the marketing host, docs go to the docs host at /<page>", () => {
    setHosts(H);
    onHost("papercliped.co");
    expect(resolveHref("/docs/permissions#levels")).toBe("https://docs.papercliped.co/permissions#levels");
    expect(resolveHref("/docs")).toBe("https://docs.papercliped.co/");
    expect(resolveHref("/community")).toBe("/community");
    expect(resolveHref("/manage")).toBe("/manage");
  });
  it("on the docs host, docs are local /<page> and marketing pages go to the marketing host", () => {
    setHosts(H);
    onHost("docs.papercliped.co");
    expect(resolveHref("/docs/faq")).toBe("/faq");
    expect(resolveHref("/docs")).toBe("/");
    expect(resolveHref("/topics/faq")).toBe("/faq");
    expect(resolveHref("/community")).toBe("https://papercliped.co/community");
    expect(resolveHref("/")).toBe("https://papercliped.co/");
  });
  it("renders docs.papercliped.co/<page> with /<page> links in the sidebar", () => {
    setHosts(H);
    onHost("docs.papercliped.co");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    render(<MemoryRouter initialEntries={["/permissions"]}><App /></MemoryRouter>);
    expect(screen.getByRole("heading", { level: 1, name: "Permissions" })).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "FAQ" })[0]).toHaveAttribute("href", "/faq");
    expect(screen.getByRole("link", { name: "papercliped docs home" })).toHaveAttribute("href", "/");
    expect(screen.getAllByRole("link", { name: "Join the community" })[0]).toHaveAttribute("href", "https://papercliped.co/community");
  });
  it("the docs host root is the docs landing", () => {
    setHosts(H);
    onHost("docs.papercliped.co");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    render(<MemoryRouter initialEntries={["/"]}><App /></MemoryRouter>);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/docs/i);
    expect(screen.getAllByRole("link", { name: /Getting started/ })[0]).toHaveAttribute("href", "/getting-started");
  });
});
