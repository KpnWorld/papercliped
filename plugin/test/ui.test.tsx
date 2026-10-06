// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createHandlers } from "../src/handlers.js";
import { linkScope } from "../src/keys.js";
import { ANN_SECRET, startFakeBridge, type FakeBridge } from "./fake-bridge.js";

// Paperclip provides these components at runtime; here they are plain stand-ins with the same props.
const toasts: { title: string; tone?: string }[] = [];
let actions: Record<string, (p?: Record<string, unknown>) => Promise<unknown>> = {};
vi.mock("@paperclipai/plugin-sdk/ui", () => ({
  usePluginAction: (name: string) => actions[name],
  usePluginToast: () => (t: { title: string; tone?: string }) => (toasts.push(t), "id"),
  useHostNavigation: () => ({ linkProps: (to: string) => ({ href: to }) }),
  copyTextToClipboard: vi.fn(),
  ErrorBoundary: ({ children }: { children: ReactNode }) => <>{children}</>,
  Spinner: ({ label }: { label?: string }) => <p>{label}</p>,
  StatusBadge: ({ label, status }: { label: string; status: string }) => <span data-status={status}>{label}</span>,
  MetricCard: ({ label, value, unit }: { label: string; value: unknown; unit?: string }) => <div>{label}: {String(value)}{unit}</div>,
  KeyValueList: ({ pairs }: { pairs: { label: string; value: ReactNode }[] }) => <dl>{pairs.map((p) => <div key={p.label}><dt>{p.label}</dt><dd>{p.value}</dd></div>)}</dl>,
  DataTable: ({ columns, rows, emptyMessage, loading }: any) =>
    loading ? <p>Loading…</p> : rows.length === 0 ? <p>{emptyMessage}</p> : (
      <table><tbody>{rows.map((r: any) => <tr key={r.id}>{columns.map((c: any) => <td key={c.key}>{c.render ? c.render(r[c.key], r) : String(r[c.key])}</td>)}</tr>)}</tbody></table>
    ),
}));

const { PapercliedPage } = await import("../src/ui/index.js");

let fake: FakeBridge;
const mem = new Map<string, unknown>();
const k = (s: ReturnType<typeof linkScope>) => `${s.scopeKind}|${s.namespace}|${s.stateKey}`;
const state = { get: async (s: any) => mem.get(k(s)) ?? null, set: async (s: any, v: unknown) => void mem.set(k(s), v), delete: async (s: any) => void mem.delete(k(s)) };

beforeAll(async () => {
  fake = await startFakeBridge();
  // The worker runs in plain Node; here it shares jsdom's globals, and Node 24's fetch rejects jsdom's AbortSignal.
  const h = createHandlers({ state, fetch: (u, i) => fetch(u, { ...i, signal: undefined }), bridgeUrl: async () => fake.url, allowInsecureLoopback: true });
  const ann = { type: "user", userId: "user-ann" };
  actions = Object.fromEntries(Object.entries(h).map(([name, fn]) => [name, (p: Record<string, unknown> = {}) => (fn as any)(p, ann)]));
});
afterEach(() => cleanup());
afterAll(() => fake.server.close());

describe("the Papercliped page inside Paperclip", () => {
  it("shows the service status, links with username + secret key, and never shows the token", async () => {
    render(<PapercliedPage />);
    expect(await screen.findByText("All systems normal")).toBeInTheDocument();
    expect(screen.getByText("People: 42")).toBeInTheDocument();
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText("Username"), "ann.test1");
    await user.type(screen.getByLabelText("Secret key"), "pcs_WRONG");
    await user.click(screen.getByRole("button", { name: "Link" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/don't match/);
    await user.clear(screen.getByLabelText("Secret key"));
    await user.type(screen.getByLabelText("Secret key"), ANN_SECRET);
    await user.click(screen.getByRole("button", { name: "Link" }));
    expect(await screen.findByText("ann.test1")).toBeInTheDocument();
    expect(document.body.innerHTML).not.toMatch(/pcb_pl_|pcs_ANN/);
  });

  it("changes an app's level and disconnects it after a second click", async () => {
    render(<PapercliedPage />);
    const user = userEvent.setup();
    const level = await screen.findByLabelText("Access level for Claude");
    await user.selectOptions(level, "control");
    await waitFor(() => expect(fake.connections[0].level).toBe("paperclip:control"));
    expect(toasts.at(-1)).toMatchObject({ title: "Claude is now Full control", tone: "success" });
    await user.click(screen.getByRole("button", { name: "Disconnect" }));
    expect(fake.connections).toHaveLength(1); // nothing yet: it asks first
    await user.click(screen.getByRole("button", { name: "Disconnect Claude" }));
    expect(await screen.findByText(/No apps connected/)).toBeInTheDocument();
  });

  it("switches anonymity, lists links, and makes a new secret key shown once", async () => {
    render(<PapercliedPage />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("tab", { name: "Privacy" }));
    await user.click(screen.getByRole("checkbox"));
    expect(await screen.findByText("On: you appear as Ann02")).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Linked Paperclips" }));
    expect(await screen.findByText("This one")).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Account" }));
    const rotate = screen.getAllByRole("button", { name: "Make a new secret key" })[0];
    await user.click(rotate);
    await user.type(screen.getByLabelText("Secret key to confirm: Make a new secret key"), "pcs_WRONG");
    await user.click(screen.getByRole("button", { name: "Confirm" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/not right/);
    await user.clear(screen.getByLabelText("Secret key to confirm: Make a new secret key"));
    await user.type(screen.getByLabelText("Secret key to confirm: Make a new secret key"), fake.secret);
    await user.click(screen.getByRole("button", { name: "Confirm" }));
    const shown = await screen.findByRole("status");
    expect(within(shown).getByText("pcs_NEW1-NEW2-NEW3-NEW4")).toBeInTheDocument();
    expect((mem.get(k(linkScope("user-ann"))) as any).token).toMatch(/^pcb_pl_/); // still linked
  });

  it("deleting the account needs the username and goes back to the link form", async () => {
    render(<PapercliedPage />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("tab", { name: "Account" }));
    await user.click(screen.getAllByRole("button", { name: "Delete my account" })[0]);
    await user.type(screen.getByLabelText("Secret key to confirm: Delete my account"), fake.secret);
    expect(screen.getByRole("button", { name: "Confirm" })).toBeDisabled(); // username not typed yet
    await user.type(screen.getByLabelText("Type your username to confirm"), "ann.test1");
    await user.click(screen.getByRole("button", { name: "Confirm" }));
    expect(await screen.findByRole("heading", { name: "Link your Papercliped account" })).toBeInTheDocument();
    expect(fake.deleted).toBe(true);
  });
});
