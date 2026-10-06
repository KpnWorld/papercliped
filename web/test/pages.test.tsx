import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "../src/App";
import tools from "../src/generated/tools.json";

const at = (path: string) => render(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>);
afterEach(() => vi.unstubAllGlobals());

describe("landing", () => {
  it("shows live counts from the public stats API", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ users: 42, connections: 7 }) }));
    at("/");
    expect(await screen.findByText("42", {}, { timeout: 3000 })).toBeInTheDocument();
  });
  it("keeps a placeholder when the API is missing, without throwing", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    at("/");
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });
  it("the permission playground has two levels, and Full control is every tool", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    at("/");
    const read = tools.filter((t) => t.scope === "paperclip:read").length;
    const status = () => screen.getByText(/tools available at this level/).textContent!;
    expect(screen.getAllByRole("radio", { name: /Read only|Full control/ })).toHaveLength(2);
    expect(screen.queryByRole("radio", { name: /Admin/ })).toBeNull();
    expect(status()).toContain(`${read} of ${tools.length}`);
    await userEvent.click(screen.getByRole("radio", { name: /Full control/ }));
    expect(status()).toContain(`${tools.length} of ${tools.length}`);
  });
});

describe("changelog page", () => {
  it("lists releases with dates and filters by kind", async () => {
    at("/changelog");
    expect(screen.getByRole("heading", { level: 1, name: "Changelog" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "v2.0.0" })).toBeInTheDocument();
    expect(screen.getAllByText("October 6, 2026").length).toBeGreaterThan(0);
    expect(screen.getByText("October 5, 2026")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Fixed" }));
    expect(screen.queryAllByText("New").filter((n) => n.tagName === "SPAN").length).toBe(0);
  });
});

describe("community page", () => {
  it("shows coming-soon instead of invented links, and builds a pre-filled GitHub issue", async () => {
    const assign = vi.fn();
    vi.stubGlobal("location", { ...window.location, assign });
    at("/community");
    expect(screen.getAllByText("Coming soon").length).toBeGreaterThanOrEqual(3); // Discussions, Discord, X, Forum unset
    const field = screen.getByLabelText("Your idea, in one line");
    await userEvent.type(field, "Cost per project");
    await userEvent.click(screen.getByRole("button", { name: "Continue on GitHub" }));
    const url = new URL(assign.mock.calls[0][0]);
    expect(url.origin + url.pathname).toBe("https://github.com/OpenSourcx/papercliped/issues/new");
    expect(url.searchParams.get("title")).toBe("Idea: Cost per project");
    expect(url.searchParams.get("labels")).toBe("enhancement");
  });
});

describe("brand and legal", () => {
  it("brand page offers the downloads", () => {
    at("/brand");
    const main = screen.getByRole("main");
    for (const f of ["mascot-light.svg", "mascot-dark.svg", "wordmark-light.png", "wordmark-dark.png"]) expect(within(main).getAllByRole("link").some((a) => a.getAttribute("href") === `/brand/${f}`)).toBe(true);
  });
  it("privacy and terms render with the placeholders filled", () => {
    const { unmount } = at("/privacy");
    const main = screen.getByRole("main");
    expect(main.textContent).toContain("support@papercliped.co");
    expect(main.textContent).toContain("https://papercliped.co");
    expect(main.textContent).not.toContain("{{");
    unmount();
    at("/terms");
    expect(screen.getByRole("main").textContent).not.toContain("{{");
  });
});

describe("hero demo", () => {
  it("shows an AI app steering a Paperclip, with tabs for each example", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    at("/");
    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((t) => t.textContent)).toEqual(["Pause an agent", "Weekly report", "Approve a request"]);
    await userEvent.click(tabs[2]);
    expect(tabs[2]).toHaveAttribute("aria-selected", "true");
    expect(await screen.findByText("Approved. The CEO can now hire a Support Agent.", {}, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.getAllByText("paperclip_decide_approval").length).toBeGreaterThan(1); // the demo chip and the playground
  });
});
