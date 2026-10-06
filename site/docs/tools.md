# Tool reference

Every tool Papercliped gives your AI app, generated from the code (`src/tools.ts`). 30 tools in total. Each needs a level: a connection can use the tools of its level and every level below.

Raw API calls (`paperclip_api_request`) need Read only for GET and Admin for anything else.

## Read only (17)

| Tool | What it does | Changes anything? |
| --- | --- | --- |
| **List companies** `paperclip_list_companies` | List the companies the credential can access. Use this first to find a companyId. | No |
| **Org chart** `paperclip_org_chart` | Return the company's full agent org tree (who reports to whom). | No |
| **List agents** `paperclip_list_agents` | List all agents in a company with status, role and budget/spend. | No |
| **Get agent** `paperclip_get_agent` | Get one agent including its chain of command and current status. | No |
| **List goals** `paperclip_list_goals` | List the goal hierarchy for a company. | No |
| **List projects** `paperclip_list_projects` | List projects in a company. | No |
| **List issues** `paperclip_list_issues` | List issues/tasks. status may be comma-separated, e.g. 'todo,in_progress'. | No |
| **Get issue** `paperclip_get_issue` | Get an issue with project, goal, ancestors and plan document. | No |
| **List approvals** `paperclip_list_approvals` | List approval requests (hires, plans, budget overrides). Filter client-side by status if needed. | No |
| **Sync snapshot** `paperclip_sync_snapshot` | One-call picture of the company right now: dashboard counters, every agent's status, and live runs. Call at the start of a session to sync with the agents. | No |
| **Changes since cursor** `paperclip_sync_changes` | Poll for what changed. Pass the `cursor` returned by the previous call (omit the first time to get recent history). Returns new activity entries and the next cursor. | No |
| **Wait for agent** `paperclip_wait_for_agent` | Block (polling) until an agent reaches one of the target statuses (default: idle or error) or the timeout passes. Use after waking an agent to follow it to completion. | No |
| **Status report** `paperclip_report_status` | Executive status report: agents, tasks, spend, pending approvals, agents needing attention. | No |
| **Cost report** `paperclip_report_costs` | Spend vs budget with per-agent and per-project breakdown. Defaults to the current month. | No |
| **Agent performance report** `paperclip_report_agent_performance` | Per-agent throughput (done / in progress / blocked), spend and cost per completed task. | No |
| **Activity digest** `paperclip_report_activity` | Digest of audit-log activity, optionally since an ISO timestamp (e.g. start of day). | No |
| **Papercliped service status** `papercliped_service_status` | Is the hosted Papercliped service working? Returns its status (ok, degraded, down), version and aggregate 24-hour numbers (requests, success rate, latency, sign-ins). Public data only; does not touch Paperclip. | No |

## Full control (beta) (9)

| Tool | What it does | Changes anything? |
| --- | --- | --- |
| **Pause agent** `paperclip_pause_agent` | Pause an agent: stops its heartbeats and cancels its active run. Reversible with resume. | Yes |
| **Resume agent** `paperclip_resume_agent` | Resume a paused agent so heartbeats start again. | Yes |
| **Clear agent error** `paperclip_clear_agent_error` | Move an agent from `error` back to `idle`. Keeps run history. Only valid for agents in error. | Yes |
| **Wake agent now** `paperclip_wake_agent` | Manually trigger a heartbeat so the agent starts working immediately. | Yes |
| **Create goal** `paperclip_create_goal` | Create a goal. level is one of company/team/agent/task (default task). | Yes |
| **Update goal** `paperclip_update_goal` | Update a goal's title, description or status (planned/active/achieved/cancelled). | Yes |
| **Create issue** `paperclip_create_issue` | Create a task. Assigning it to an agent (assigneeAgentId) with status 'todo' is how you hand work to that agent. | Yes |
| **Update issue** `paperclip_update_issue` | Change an issue's status, priority, assignee, title etc. Optional `comment` is added in the same call. | Yes |
| **Comment on issue** `paperclip_comment_issue` | Add a markdown comment to an issue. Can wake the current assignee. | Yes |

## Admin (4)

| Tool | What it does | Changes anything? |
| --- | --- | --- |
| **Set agent budget** `paperclip_set_agent_budget` | Set an agent's monthly budget in US cents (e.g. 5000 = $50). Agents auto-pause at 100%. | Yes |
| **Terminate agent** `paperclip_terminate_agent` | PERMANENTLY deactivate an agent. Irreversible. Requires confirm=true; ask the human first and prefer pause. | Yes, can't be undone |
| **Decide approval** `paperclip_decide_approval` | Approve, reject, or request revision on an approval. Decisions bind agents, so confirm with the human. | Yes |
| **Raw API request** `paperclip_api_request` | Call any Paperclip REST endpoint under /api (path like '/companies/{id}/routines'). For endpoints without a dedicated tool. DELETE and any non-GET require confirm=true. | Yes |

See [Permissions](/docs/permissions) for how levels work and how to change them.
