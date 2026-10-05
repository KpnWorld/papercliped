/**
 * Pure report builders. They take already-fetched Paperclip API payloads and
 * return `{ markdown, data }` so chat clients get something readable while
 * automations still get structured numbers. Field access is defensive: the
 * Paperclip API is versioned independently of this bridge.
 */

type Json = Record<string, any>;

export interface Report {
  markdown: string;
  data: Json;
}

export const usd = (cents: unknown) => `$${((Number(cents) || 0) / 100).toFixed(2)}`;
const n = (v: unknown) => Number(v) || 0;
const pct = (v: unknown) => `${n(v).toFixed(1)}%`;

function table(headers: string[], rows: (string | number)[][]): string {
  if (rows.length === 0) return "_none_\n";
  const line = (cells: (string | number)[]) => `| ${cells.map((c) => String(c).replace(/\|/g, "\\|")).join(" | ")} |`;
  return [line(headers), line(headers.map(() => "---")), ...rows.map(line)].join("\n") + "\n";
}

export function statusReport(input: {
  dashboard: Json;
  agents: Json[];
  pendingApprovals: Json[];
  now?: Date;
}): Report {
  const { dashboard: d, agents, pendingApprovals } = input;
  const attention = agents.filter((a) => a.status === "error" || a.status === "paused");
  const md: string[] = [
    `# Paperclip status — ${(input.now ?? new Date()).toISOString()}`,
    "",
    "## Agents",
    `- Active/idle: **${n(d.agents?.active)}** · Running: **${n(d.agents?.running)}** · Paused: **${n(d.agents?.paused)}** · Error: **${n(d.agents?.error)}**`,
    "",
    "## Tasks",
    `- Open: **${n(d.tasks?.open)}** · In progress: **${n(d.tasks?.inProgress)}** · Blocked: **${n(d.tasks?.blocked)}** · Done: **${n(d.tasks?.done)}**`,
    "",
    "## Spend this month",
    `- ${usd(d.costs?.monthSpendCents)} of ${usd(d.costs?.monthBudgetCents)} (${pct(d.costs?.monthUtilizationPercent)})`,
    "",
    `## Needs attention`,
    `- Pending approvals: **${pendingApprovals.length}**`,
    `- Budget incidents: **${n(d.budgets?.activeIncidents)}**`,
    "",
    attention.length
      ? table(
          ["Agent", "Status", "Role"],
          attention.map((a) => [a.name ?? a.id, a.status, a.role ?? ""]),
        )
      : "- No agents in error or paused.\n",
  ];
  return {
    markdown: md.join("\n"),
    data: {
      agents: d.agents,
      tasks: d.tasks,
      costs: d.costs,
      pendingApprovals: pendingApprovals.length,
      budgets: d.budgets,
      attention: attention.map((a) => ({ id: a.id, name: a.name, status: a.status })),
    },
  };
}

export function costReport(input: {
  summary: Json;
  byAgent: Json[];
  byProject: Json[];
  from?: string;
  to?: string;
}): Report {
  const { summary: s, byAgent, byProject } = input;
  const range = input.from || input.to ? `${input.from ?? "…"} → ${input.to ?? "now"}` : "current month";
  const md = [
    `# Cost report (${range})`,
    "",
    `Total spend **${usd(s.spendCents)}** of budget **${usd(s.budgetCents)}** (${pct(s.utilizationPercent)})`,
    "",
    "## By agent",
    table(
      ["Agent", "Cost", "Input tok", "Output tok"],
      byAgent.map((r) => [r.agentName ?? r.agentId ?? "?", usd(r.costCents), n(r.inputTokens), n(r.outputTokens)]),
    ),
    "## By project",
    table(
      ["Project", "Cost"],
      byProject.map((r) => [r.projectName ?? r.projectId ?? "unassigned", usd(r.costCents)]),
    ),
  ].join("\n");
  return { markdown: md, data: { summary: s, byAgent, byProject } };
}

export function agentPerformanceReport(input: { agents: Json[]; issues: Json[]; byAgent: Json[] }): Report {
  const spend = new Map(input.byAgent.map((r) => [r.agentId, n(r.costCents)]));
  const rows = input.agents.map((a) => {
    const mine = input.issues.filter((i) => i.assigneeAgentId === a.id);
    const done = mine.filter((i) => i.status === "done").length;
    const inProgress = mine.filter((i) => i.status === "in_progress").length;
    const blocked = mine.filter((i) => i.status === "blocked").length;
    const cost = spend.get(a.id) ?? 0;
    return {
      id: a.id,
      name: a.name,
      role: a.role,
      status: a.status,
      done,
      inProgress,
      blocked,
      spendCents: cost,
      budgetMonthlyCents: n(a.budgetMonthlyCents),
      costPerDoneCents: done > 0 ? Math.round(cost / done) : null,
    };
  });
  rows.sort((x, y) => y.done - x.done);
  const md = [
    "# Agent performance",
    "",
    table(
      ["Agent", "Role", "Status", "Done", "In progress", "Blocked", "Spend", "Cost / done"],
      rows.map((r) => [
        r.name ?? r.id,
        r.role ?? "",
        r.status,
        r.done,
        r.inProgress,
        r.blocked,
        usd(r.spendCents),
        r.costPerDoneCents === null ? "—" : usd(r.costPerDoneCents),
      ]),
    ),
  ].join("\n");
  return { markdown: md, data: { agents: rows } };
}

export function activityDigest(input: { entries: Json[]; since?: string }): Report {
  const { entries } = input;
  const byAction = new Map<string, number>();
  for (const e of entries) byAction.set(e.action ?? "unknown", (byAction.get(e.action ?? "unknown") ?? 0) + 1);
  const top = [...byAction.entries()].sort((a, b) => b[1] - a[1]);
  const md = [
    `# Activity digest${input.since ? ` since ${input.since}` : ""}`,
    "",
    `${entries.length} event(s).`,
    "",
    table(["Action", "Count"], top),
    "## Latest",
    table(
      ["When", "Actor", "Action", "Entity"],
      entries.slice(0, 20).map((e) => [
        e.createdAt ?? "",
        e.actorId ?? e.agentId ?? e.actorType ?? "",
        e.action ?? "",
        `${e.entityType ?? ""}:${e.entityId ?? ""}`,
      ]),
    ),
  ].join("\n");
  return { markdown: md, data: { count: entries.length, byAction: Object.fromEntries(top), entries } };
}
