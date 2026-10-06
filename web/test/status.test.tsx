import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "../src/App";

const FIX = JSON.parse(readFileSync(resolve(process.cwd(), "scripts/fixtures/public-api.json"), "utf8"));
const api = vi.fn(async (u: string) => ({ ok: true, json: async () => (u.includes("/v1/status") ? FIX.status : u.includes("/v1/series") ? FIX.series : u.includes("/v1/stats") ? FIX.stats : FIX.legacy) }));
afterEach(() => vi.unstubAllGlobals());

describe("status page", () => {
  it("shows the live status, numbers and charts with text alternatives", async () => {
    vi.stubGlobal("fetch", api);
    render(<MemoryRouter initialEntries={["/status"]}><App /></MemoryRouter>);
    expect(await screen.findByRole("heading", { name: "All systems normal" })).toBeInTheDocument();
    expect(screen.getByText(/Version 2\.0\.0/)).toBeInTheDocument();
    expect(screen.getByRole("meter", { name: "Sign-ins that succeeded" })).toHaveAttribute("aria-valuenow", "90");
    expect(screen.getByRole("img", { name: /Requests and errors\. .*requests last 24 hours/ })).toBeInTheDocument();
    expect(screen.getByText("insufficient_scope")).toBeInTheDocument();
    expect(screen.getByText("wrong username or key")).toBeInTheDocument();
    // Every chart can be read as a table.
    await userEvent.click(screen.getAllByRole("button", { name: "Show as table" })[0]);
    expect(screen.getByRole("table", { name: "Requests and errors" })).toBeInTheDocument();
    expect(api).toHaveBeenCalledWith("/api/public/v1/stats?window=24h", expect.anything());
  });
  it("switches windows", async () => {
    vi.stubGlobal("fetch", api);
    render(<MemoryRouter initialEntries={["/status"]}><App /></MemoryRouter>);
    await screen.findByRole("heading", { name: "All systems normal" });
    await userEvent.click(screen.getByRole("button", { name: "Last 7 days" }));
    expect(api).toHaveBeenCalledWith("/api/public/v1/series?window=7d", expect.anything());
  });
  it("says so when the API can't be reached", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    render(<MemoryRouter initialEntries={["/status"]}><App /></MemoryRouter>);
    expect(await screen.findByRole("heading", { name: "Status unavailable" })).toBeInTheDocument();
  });
});
