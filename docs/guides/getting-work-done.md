# Get Your First Piece of Work Done With Octogent

## Part 1: Get started in ten minutes

Already installed Octogent and signed in to `claude` or `codex`? Start in a Git project with existing commits, a `README.md`, and no uncommitted changes, on a named branch with your Git commit identity configured. Begin with a small documentation edit: dispatch and review usually take about ten minutes, depending on the agent's response time.

### 1. Start Octogent

Run these commands in your project's command-line window; `init` prepares project configuration and adds `.octogent/` to Git's ignore rules.
Commit that ignore rule so the agent starts from a clean version; `octogent` starts the service and opens the browser. Leave this window running.
The octoboss (big octopus) on the page is the coordination entry point for the whole project.

```bash
cd "$(git rev-parse --show-toplevel)"
octogent init
git add .gitignore
git diff --cached --quiet || git commit -m "chore: ignore Octogent workspace"
octogent
```

### 2. Create a tentacle

Open another command-line window in the same project root; run the remaining commands there.
A tentacle (little octopus) is a folder holding one work stream's background, todos, and handoff files.
The tentacle ID below is `first-task`; save your current branch name so you can merge the result back later.

```bash
octogent_base=$(git branch --show-current)
octogent tentacle create first-task --description "First dispatch, review, and merge"
```

### 3. Give your first task to Claude Code or Codex

A terminal runs one agent session; a worktree is a separate Git checkout where it can edit files and commit its work.
This example uses Claude Code; if you signed in only to Codex, replace `claude-code` with `codex`.
`--tentacle-id first-task` attaches the terminal to your new tentacle; omitting it makes the terminal report directly to the octoboss, even if you already created a tentacle.

```bash
octogent terminal create --terminal-id first-worker --name "Small documentation fix" \
  --tentacle-id first-task --workspace-mode worktree \
  --agent-provider claude-code --effort standard \
  --initial-prompt "Edit only README.md: use the existing repository content to clarify one first-run instruction so a newcomer has one less thing to guess. Do not invent commands or change code. Run git diff --check and verify that commands mentioned in your change actually exist. Commit on your branch; do not push. End with a summary of the change, checks, and doubts."
```

### 4. Check how it is doing

Repeat the command below; `running` means the session is running, and `awaiting-review` means it has commits and a clean worktree ready for you to inspect.
The browser's flow view shows who is working; the canvas lets you open a terminal to read the agent's output and summary.
For `stalled`, first check whether the terminal is waiting for input; for `initial prompt not acknowledged` (no confirmation that the initial task was received), confirm the task has not started before sending it again.
A channel is a way to send follow-up messages, for example `octogent channel send first-worker "Report your progress and blockers"`.

```bash
octogent terminal list
```

### 5. Review, merge, and finish

When the terminal awaits review, run the first three lines: read the commits, inspect each change, check whitespace errors, and verify the README commands.
If changes are needed, use the channel command above to request them and wait for another commit; run the merge and subsequent commands only after review passes.
Merging brings the agent's commits into your current branch; `stop` ends its session, and `delete --with-worktree` removes the record, worktree, and branch.
Deletion checks for unmerged commits at that moment; investigate any refusal. Finishing this step means you have reviewed and merged your first result.

```bash
git -C .octogent/worktrees/first-worker log --oneline "$octogent_base..HEAD"
git diff "$octogent_base..octogent/first-worker"
git -C .octogent/worktrees/first-worker diff --check "$octogent_base..HEAD"
# Run the next three lines only after review passes.
git merge --no-ff octogent/first-worker -m "docs: merge first reviewed task"
octogent terminal stop first-worker
octogent terminal delete first-worker --with-worktree
```

## Part 2: Quick reference

Replace `<tentacle-id>`, `<terminal-id>`, `<project-id>`, and `<task-brief>` with actual values, removing the angle brackets too. Git examples assume the main checkout is currently on `main`; replace `main` if you use another branch. By default, the worktree ID equals the terminal ID. Each create command in this table creates a new terminal.

| What you want to do | Exact command |
| --- | --- |
| Create a tentacle / find tentacle IDs | `octogent tentacle create api-work --description "API work"` / `octogent tentacle list` |
| Dispatch to Claude Code | `octogent terminal create --name "API worker" --tentacle-id <tentacle-id> --workspace-mode worktree --agent-provider claude-code --initial-prompt "<task-brief>"` |
| Dispatch to Codex | `octogent terminal create --name "API worker" --tentacle-id <tentacle-id> --workspace-mode worktree --agent-provider codex --initial-prompt "<task-brief>"` |
| Choose a model by tier | `octogent terminal create --tentacle-id <tentacle-id> --workspace-mode worktree --agent-provider codex --effort heavy --initial-prompt "<task-brief>"`; tiers are `light`, `standard`, `heavy`, and `max` |
| Choose an explicit model | `octogent terminal create --tentacle-id <tentacle-id> --workspace-mode worktree --agent-provider claude-code --model sonnet --initial-prompt "<task-brief>"` |
| List terminals / archived records | `octogent terminal list` / `octogent terminal list --archived` |
| Read a worker's activity transcript | `tail -n 40 ~/.octogent/projects/<project-id>/state/transcripts/<terminal-id>.jsonl` |
| Send a follow-up / check delivery | `octogent channel send <terminal-id> "Add your test results and doubts"` / `octogent channel list <terminal-id>` |
| Stop / archive / delete only the record | `octogent terminal stop <terminal-id>` / `octogent terminal archive <terminal-id>` / `octogent terminal delete <terminal-id>` |
| Read commits and changes | `git -C .octogent/worktrees/<terminal-id> log main..HEAD` / `git diff main..octogent/<terminal-id>` |
| Merge after review passes | `git merge --no-ff octogent/<terminal-id>` |
| Delete the record, worktree, and branch after merging | `octogent terminal delete <terminal-id> --with-worktree` |
| Preview / reclaim archived, merged worktrees | `octogent worktree gc --dry-run` / `octogent worktree gc` |
| Archive completed records / prune inactive records | `octogent terminal archive --all-completed` / `octogent terminal prune` |

## Part 3: Go further

Use the following sections by scenario. In examples, `first-worker` represents the terminal you want to operate; Part 1 deleted it, so replace it with a current worker's ID when sending messages or reviewing work. The last section is a complete, independently runnable workflow.

### Before you start, and how to check startup

- Requirements: Node.js 22+, pnpm 10+, Git, `curl`, and a signed-in `claude` and/or `codex`; installation on Linux also needs a toolchain to compile `node-pty`. If installation is unfinished, follow the [installation guide](../getting-started/installation.md).
- Start from the root of a Git project with existing commits. Worktrees branch from committed versions; uncommitted changes in the main directory do not follow them. Commit or otherwise save your own changes first, and make sure your Git commit identity is configured.
- `octogent init` creates `.octogent/` configuration and ignore rules without starting the service. Running `octogent` directly also starts an uninitialized project, but uses a temporary state root and shows an initialization card; running `init` first is easiest without a browser.
- By default, the service looks for a free port starting at `127.0.0.1:8787`, incrementing if occupied. `OCTOGENT_API_PORT` (or `PORT`) sets the starting port. Use the actual address in startup output; in an initialized project, the CLI reads the actual address saved by the service.
- Set `OCTOGENT_NO_OPEN=1` when running without a browser. Save both standard output and standard error to a file so you can investigate startup failures, hooks, and retries later; output you only saw on screen cannot be recovered. Below, `mktemp` creates a log file and its location is printed; it is not a fixed Octogent log path.

```bash
octogent init
octogent_log=$(mktemp)
printf 'Octogent log: %s\n' "$octogent_log"
OCTOGENT_NO_OPEN=1 OCTOGENT_VERBOSE_LOGS=1 octogent >"$octogent_log" 2>&1 &
```

Verify from another command-line window in the same project; replace the port below if startup output shows something other than 8787. `/api/health` is the service health endpoint; even an empty terminal list means the CLI connected successfully.

```bash
curl --fail --silent --show-error http://127.0.0.1:8787/api/health
octogent terminal list
```

For LAN access, set `OCTOGENT_ALLOW_REMOTE_ACCESS=1` at startup; the default bind address becomes `0.0.0.0`. The CLI generates an access token and prints LAN links containing it; use one of these links from another machine. You can also set a high-entropy `OCTOGENT_ACCESS_TOKEN` of at least 32 characters. The token grants control over agents and the project, so share logs containing it only with people who need access. `HOST` can specify the bind address.

```bash
OCTOGENT_NO_OPEN=1 OCTOGENT_ALLOW_REMOTE_ACCESS=1 octogent
```

These are alternative startup methods; choose one, and do not start duplicate services for the same project.

### The mental model in five sentences

1. The octoboss (big octopus) is the coordination entry point where you, or an AI coordinator responsible for dispatch and review, divide work among tentacles and hand it to terminals for execution.
2. A tentacle holds one work stream's context, todos, and handoff files under `.octogent/tentacles/<tentacle-id>/`, usually in `CONTEXT.md` and `todo.md`, and several terminals can share it.
3. A terminal is an agent session and its runtime record, responsible for a specific task; a tentacle ID identifies the work stream, while a terminal ID identifies its executor.
4. `worktree` gives a terminal an isolated checkout and an `octogent/<terminal-id>` branch, suitable for code changes and parallel tasks; the agent should commit on its branch for the coordinator to review and merge.
5. `shared` means shared workspace: the agent works directly in the main checkout and is told not to commit, which suits read-only investigation or clearly scoped small changes, but simultaneous edits to the same file can still collide.

The deck is the interface for managing tentacle files and todos; see [Mental Model](../concepts/mental-model.md) and [Tentacles](../concepts/tentacles.md) for further boundaries.

### Choose an agent, model, and tier

- Explicitly choose the agent with `--agent-provider claude-code` or `--agent-provider codex`; omitting it uses the server-side default.
- `--effort` selects a work tier. These are this repository's defaults following its 2026-09-08 model mapping update; the suffix after `@` is the Codex reasoning level:
  - `light`: Claude `haiku` (Haiku 4.5); Codex `gpt-5.6-luna@low`.
  - `standard`: Claude `sonnet` (Sonnet 5); Codex `gpt-5.6-sol@medium`, falling back to `gpt-5.6-terra@medium`.
  - `heavy`: Claude `opus` (Opus 5); Codex `gpt-6-astra@medium`, falling back to `gpt-5.6-sol@high`.
  - `max`: Claude `fable` (Fable 5.1); Codex `gpt-6-astra@xhigh`, falling back to `gpt-5.6-sol@xhigh`.
- GPT-6 availability varies by account. Octogent chooses a visible candidate from the local Codex model cache at `$CODEX_HOME/models_cache.json` (default `~/.codex/models_cache.json`). If the cache is unreadable or lists no candidate, it still tries the first choice; account availability is not guaranteed. When needed, confirm model availability in a separate Codex session before recreating the worker.
- `--model sonnet` or `--model gpt-5.6-sol` explicitly selects a model and takes precedence over `--effort`. Identifiers must start with a letter or digit and contain only letters, digits, `.`, `_`, and `-`; `--model gpt-6-astra@medium` is invalid. An explicit model uses the agent's own default reasoning level; in the current implementation, passing both `--model` and `--effort` does not set Codex's tier reasoning level either.
- Override mappings with `OCTOGENT_EFFORT_MODELS` before starting the service; Codex values support `model@reasoning` and arrays of candidates in preference order. See the [CLI reference](../reference/cli.md).
- Flow cards show the agent and model; `terminal list` displays known values as `agent=` and `model=`. Without an explicit model selection, Claude's actual model can be learned from its transcript; until known, the card says “default model” and the CLI omits `model=`.
- Codex defaults to `workspace-write` in shared workspaces and `danger-full-access` in worktrees. The former mounts `.git` read-only and would prevent a worktree agent from committing; a worktree isolates Git changes, not system permissions. Override this with `OCTOGENT_CODEX_SANDBOX_MODE`. `OCTOGENT_CODEX_APPROVAL_POLICY` defaults to `never` so unattended work does not get stuck on approval prompts.

### Dispatch: write a complete task brief

Create a tentacle first, then a terminal. Use `--name` to make it recognizable, `--workspace-mode` to specify where changes happen, and `--initial-prompt` for the full task. **Always pass `--tentacle-id`**: when omitted, the CLI explicitly says the terminal reports directly to the octoboss; it does not choose your newly created tentacle automatically.

An executable task brief includes:

- The goal and why it matters.
- The exact files or areas that may change.
- Required behavior, listed item by item.
- Tests to add; for documentation-only tasks, specify how to verify the content.
- Gates to run. API code tasks in this repository use `pnpm --filter @octogent/api test`, `pnpm lint`, and `pnpm build`; substitute other repositories' own checks.
- For worktree tasks, “commit on your branch, do not push”; for shared-workspace tasks, change this to “do not commit.”
- “End with a summary and doubts,” including unfinished and unverified items.

Here is a complete small documentation task you can dispatch in this repository; first check that the name is unused. This block creates one Claude worker.

```bash
octogent tentacle create install-docs --description "Make the first startup after installation clearer"
octogent_brief=$(cat <<'TASK'
Goal and why: help newly installed users verify that Octogent is running, with less guesswork.
Scope: change only the First run behavior section of docs/getting-started/installation.md.
Required behavior:
- Check apps/api/src/cli.ts for the difference between direct startup and octogent init, and correct inconsistent instructions.
- Explain that the port can increment, so users should check the address in startup output.
- Add startup verification with /api/health and octogent terminal list.
Verification: this is documentation work, so add no code tests; check each claim against CLI source and verify every link and command.
Gates: run git diff --check and pnpm lint; if you cannot run a check, explain why and do not claim it passed.
Commit on your branch, do not push. Do not change other files.
End with a summary of changes, verification results, and doubts; list unverified items.
TASK
)
octogent terminal create --name "Check installation instructions" --tentacle-id install-docs \
  --workspace-mode worktree --agent-provider claude-code --effort standard \
  --initial-prompt "$octogent_brief"
```

The initial task is now delivered when the agent's `SessionStart` hook fires; a hook is a callback through which the agent reports startup, tool calls, or the end of a turn to Octogent. If readiness does not arrive, delivery falls back to 15 seconds after the agent bootstrap command; `UserPromptSubmit` acknowledges receipt. If a readiness hook was seen but no acknowledgement arrives within 10 seconds of delivery, there is exactly one retry. After another 10 seconds without acknowledgement, `initial prompt not acknowledged` appears. Without a readiness hook, delivery is not retried, to avoid sending an already-started task twice.

If this appears, inspect the terminal and logs first and resolve sign-in, update, or trust prompts. Send the task again with `channel send` only after confirming it did not start. A late acknowledgement clears the warning; the warning itself is not a new lifecycle state.

### Follow progress: check states and evidence

- Each `octogent terminal list` line shows the terminal ID, lifecycle, known process ID (`pid=`), agent (`agent=`), model (`model=`), reason (`reason=`), and name. Unknown or unrecorded fields are omitted.
- `running`: the session is running. `stalled`: the session is still alive but has had no activity for `OCTOGENT_TERMINAL_STALL_MS`, default 120000 milliseconds. Prompt submission, tool calls, and terminal output all count; output updates are throttled to once every few seconds. A stalled worker may be waiting for input; the state does not establish that the process is dead.
- `awaiting-review`: a clean worktree has unmerged commits beyond the base. `completed`: the worktree's output has been merged, or a shared-workspace agent finished a turn. Neither means “tests definitely passed.” New activity can return either state to `running`.
- `stopped`: the session was closed. `exited`: the process exited. After a restart, you may also see `stale`, meaning an old record could not be reattached to its session.
- Use the flow view for overall assignments and progress, and the canvas to open individual terminals and read output. Flow links now reflect actual activity; an open session does not imply ongoing work. The Codex conversation view currently has no full transcript replay.

Activity transcripts default to `~/.octogent/projects/<project-id>/state/transcripts/<terminal-id>.jsonl`; the project ID comes from `.octogent/project.json`. Below reads recent events for Part 1's worker. It uses the default state directory; if you configured state-path overrides, locate the actual directory instead.

```bash
octogent_project_id=$(node -p "JSON.parse(require('node:fs').readFileSync('.octogent/project.json', 'utf8')).projectId")
tail -n 40 "$HOME/.octogent/projects/$octogent_project_id/state/transcripts/first-worker.jsonl"
```

`session_start` means a session began, `state_change` records an agent state change, `tool_use` records one tool call reported by a hook, and `session_end` means the session ended. This is an activity log, not complete answers or tool output. A long turn produces multiple `tool_use` events without needing repeated `processing` entries. To investigate hooks, set `OCTOGENT_VERBOSE_LOGS=1` before starting the service and look for `[Hook] Received hook` in its log.

### Send follow-ups to a running worker

```bash
octogent channel send first-worker "Explain which commands you verified; tell me first if you have doubts."
octogent channel list first-worker
```

- `send` reports delivered or queued; a busy worker's messages queue and are delivered automatically when it becomes idle. `list` shows the corresponding `status=delivered` or `status=pending`. Delivered means written into the terminal, not that the task is complete.
- When sending on behalf of another terminal, add `--from <sender-terminal-id>`; when omitted, the current environment's `OCTOGENT_SESSION_ID` is used if present.
- Workers with an initial task keep their sessions alive between turns by default, supporting multiple turns of dialogue. A worktree marked `completed` with a confirmed merge releases keep-alive; `awaiting-review` keeps the session available for review.
- `terminal stop` ends the session immediately. Archiving releases keep-alive, after which `OCTOGENT_TERMINAL_IDLE_GRACE_MS` applies, default five minutes. Retention archiving also releases it: `OCTOGENT_TERMINAL_RETENTION_HOURS` defaults to 72 hours and covers eligible `completed`, `stopped`, and `exited` records, never automatically archiving awaiting-review records.
- `OCTOGENT_TERMINAL_RELEASE_AFTER_TURN=1` restores the old behavior of releasing keep-alive after each turn; leave it unset for continuing dialogue.
- Messages exist only in the current service's memory and disappear on restart; agent sessions cannot survive service restarts either. Write important decisions and handoffs into tentacle files. See [Inter-Agent Messaging](inter-agent-messaging.md).

### Review, test, merge, and clean up

Awaiting review is a Git completion signal. The reviewer must still read the summary, check each task requirement, inspect changes, and run relevant tests. Review from the main checkout; below assumes a `main` base and a terminal named `first-worker`. Run tests inside the worker's worktree so they test its changes.

```bash
git -C .octogent/worktrees/first-worker status --short
git -C .octogent/worktrees/first-worker log main..HEAD
git diff main..octogent/first-worker
# These gates apply to API code tasks in the Octogent repository.
(
  cd .octogent/worktrees/first-worker
  pnpm install && pnpm --filter @octogent/api test && pnpm lint && pnpm build
)
```

If something is wrong, message the worker for a correction and review the new commits. Once everything passes, merge from the main checkout. Resolve conflicts and check again before deleting the worktree. Run relevant gates on the combined result after merging too.

```bash
git merge --no-ff octogent/first-worker
# Clean up only after the merge and combined-result checks pass.
octogent terminal stop first-worker
octogent terminal delete first-worker --with-worktree
```

- `delete --with-worktree` checks for unmerged commits relative to the main checkout's current branch at deletion time, and refuses to remove a worktree referenced by other terminals. Do not use `--force` to bypass unmerged-work warnings just to “finish.” Deleting a parent also deletes its children; review the whole parent/child chain first.
- To retain records, use `terminal archive <terminal-id>`. Running records cannot be archived; stop them first if needed. Archiving hides records, retains transcripts and summaries, and may immediately reclaim merged worktrees.
- `worktree gc --dry-run` previews, and `worktree gc` reclaims archived, merged worktrees and branches. It checks Git at that moment, retaining work with uncommitted changes or a Git verdict of unmerged; records are consulted only if Git cannot answer. A shared worktree requires all associated records to qualify.
- `terminal delete <terminal-id>` removes only the record by default and keeps the worktree. `terminal prune` removes only `stale`, `stopped`, and `exited` records, without cleaning the disk. For automatic reclamation, archive and run gc before considering record removal.

**The finishing iron rule: unmerged work must not be deleted automatically.** Archive reclamation and gc follow this rule, but current batch cleanup has an exception, so it is not a global guarantee:

- An octoboss-direct terminal without a durable tentacle folder is ephemeral. Once its session and all child sessions are closed, and its top-level record is `completed`, `stopped`, `exited`, or `stale`, the next top-level dispatch deletes those records and attempts to delete their worktrees and branches, **without a live merge check**.
- Attach tasks that produce work to durable tentacles. For an existing direct task, review and merge before stopping it and dispatching another batch.
- Finished records under durable tentacles go through archive reclamation; any worker whose session remains open is protected from next-batch cleanup, busy or idle.

### Run batches and parallel workers

- Use one tentacle per work stream, with multiple terminals if needed. After separate `terminal create` commands return, workers run concurrently. Give each worker a clear file scope, use worktrees for code tasks, and have the coordinator review each result before merging.
- A parent terminal is an agent responsible for assignments and review; child terminals are its workers. Add `--parent-terminal-id <parent-terminal-id>` when creating a child, and still specify `--tentacle-id`. Each parent can have at most 9 child terminals.
- The service allows up to 32 active terminal sessions by default. For larger batches, set `OCTOGENT_MAX_TERMINAL_SESSIONS` before startup, accounting for host resources and account allowances.
- Split tasks into `todo.md` checkboxes and launch through the deck's single-item solve or swarm, a batch of collaborating workers. Avoid reordering todos during execution, and mark them complete after review. See [Working With Todos](working-with-todos.md) and [Orchestrating Child Agents](orchestrating-child-agents.md) for the procedure.

### Trial pitfalls: symptom → cause → action

These lessons come from the 2026-09-05 through 09-08 DEIMv2 and DiveoDevOps trial records, distinguishing the problems at the time from current fixes.

- **Workers appear under the octoboss even though you created a tentacle** → Terminal creation omitted `--tentacle-id` → Pass the tentacle ID every time and check the CLI's direct-reporting hint. The hint has been added; attachment rules have not changed.
- **Dependencies fail after running `npm install` in the Octogent repository** → npm cannot install this repository as its intended pnpm workspace → Run `pnpm install` from the repository root; follow the [installation guide](../getting-started/installation.md) for leftover lockfile and dependency cleanup. Installing the global CLI with `npm install -g .` is a separate step.
- **Claude committed its work but remains running or stalled** → Older versions treated the managed hook file as unfinished work in repositories that did not ignore `.claude/` → Completion detection now ignores `.claude/settings.json`, and hook installation adds that file to the repository's Git `info/exclude`. Check for other uncommitted files; you do not need to ignore all of `.claude/`.
- **No tool calls appear and state does not update** → Hooks may not be reaching the service → Start with `OCTOGENT_VERBOSE_LOGS=1` and look for `[Hook] Received hook` when the agent acts. Claude hooks live in `.claude/settings.json` in the agent's working directory; Codex hooks live at user-level `$CODEX_HOME/hooks.json` (default `~/.codex/hooks.json`). Check the files and sign-in or trust prompts; do not treat service logs as complete agent transcripts.
- **Two workers created in the same second or close together stay silent after startup** → The old fixed four-second paste delay could fire before the input interface was ready during cold starts or updates → Delivery now uses `SessionStart`, a 15-second fallback, and one retry with acknowledgement checks. Look for `reason=initial prompt not acknowledged` and retry logs; confirm no work has started before resending through the channel.
- **`channel list` lacks an expected message** → In the trial, the list was checked before the message was sent; initial tasks and agent answers are not channel messages either → Confirm that `send` succeeded, then list messages on the same service. Messages from before a restart are not retained.
- **Treating `stalled` as dead leads to duplicate dispatch** → Inactivity was confused with process exit → Inspect the terminal, activity transcript, and reason. Tool calls and output now refresh activity, so long turns no longer depend only on new prompts. A silent worker may still be waiting for input.
- **A session disappears five minutes after its first turn, leaving follow-ups unanswered** → Older versions released keep-alive after every turn → Workers with initial tasks now keep their sessions between turns by default; check whether `OCTOGENT_TERMINAL_RELEASE_AFTER_TURN=1` is set. Deliberately end workers with `terminal stop` or archive them instead of relying on the old timeout.
- **A restart kills the wrong process, or the service starts again by itself** → A worker's `pid=` is not the service PID, and a parent process may manage the service → Inspect the service PID, parent PID, and command line first, for example `ps -o pid,ppid,args -p <service-pid>`, then inspect its parent PID the same way. The service PID is in `state/runtime.json` under the project's global state directory. For systemd-managed instances, follow the [user service guide](../reference/systemd.md). Finish workers first, as restarting disconnects sessions; backend fixes also require a backend restart after rebuilding.
- **GPT-6 works on one machine but not another** → Accounts have different model lists → Prefer `--effort` so the local model cache can select a fallback, and check `model=`. Explicit `--model` does not use tier fallback; confirm account availability before specifying it.

### Further reading

- [CLI reference](../reference/cli.md): flags, environment variables, and model mapping overrides.
- [Troubleshooting](../reference/troubleshooting.md): initial task, stall, session, and messaging problems.
- [Filesystem Layout](../reference/filesystem-layout.md) and [API reference](../reference/api.md): locate persisted data and connect your own tools.
- [Working With Todos](working-with-todos.md), [Orchestrating Child Agents](orchestrating-child-agents.md), and [Inter-Agent Messaging](inter-agent-messaging.md): expand to workflows with multiple workers.

### Complete headless coordinator example

This walkthrough is for a person running Bash blocks in order, or an AI coordinator calling a shell block by block: inspect the review output before deciding to execute the merge block. Use a clean Git project with an existing `README.md` and a configured commit identity, with no Octogent instance running for the project, and both `claude` and `codex` signed in. It uses the default global state directory, with no state-directory or API-address overrides in the service environment. Do not start a second instance beside one doing active work.

Block one saves logs, waits for the service, creates one tentacle, and dispatches two small documentation tasks with non-overlapping scopes. Variables are Bash variables for this example; use the same shell for subsequent blocks.

```bash
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
test -f README.md
test -z "$(git status --porcelain)"
octogent_base=$(git branch --show-current)
test -n "$octogent_base"
octogent init
git add .gitignore
git diff --cached --quiet || git commit -m "chore: ignore Octogent workspace"
octogent_log=$(mktemp)
nohup env OCTOGENT_NO_OPEN=1 OCTOGENT_VERBOSE_LOGS=1 octogent >"$octogent_log" 2>&1 < /dev/null &
octogent_server_pid=$!
printf 'Service PID: %s; log: %s\n' "$octogent_server_pid" "$octogent_log"
octogent_project_id=$(node -p "JSON.parse(require('node:fs').readFileSync('.octogent/project.json', 'utf8')).projectId")
octogent_state="$HOME/.octogent/projects/$octogent_project_id/state"
octogent_ready=0
for octogent_attempt in {1..30}; do
  if test -f "$octogent_state/runtime.json"; then
    octogent_api=$(node -p "JSON.parse(require('node:fs').readFileSync(process.argv[1], 'utf8')).apiBaseUrl" "$octogent_state/runtime.json")
    octogent_metadata_pid=$(node -p "JSON.parse(require('node:fs').readFileSync(process.argv[1], 'utf8')).pid" "$octogent_state/runtime.json")
    if test "$octogent_metadata_pid" = "$octogent_server_pid" && curl --fail --silent --show-error "$octogent_api/api/health"; then
      octogent_ready=1
      break
    fi
  fi
  sleep 1
done
if test "$octogent_ready" != 1; then
  cat "$octogent_log"
  exit 1
fi
octogent terminal list
octogent_batch="docs-batch-$(date +%s)-$$"
octogent_claude="$octogent_batch-claude"
octogent_codex="$octogent_batch-codex"
octogent tentacle create "$octogent_batch" --description "Check first-run instructions and local-directory ignore rules"
octogent terminal create --terminal-id "$octogent_claude" --name "README worker" \
  --tentacle-id "$octogent_batch" --workspace-mode worktree \
  --agent-provider claude-code --effort standard \
  --initial-prompt "Edit only README.md: clarify one first-run instruction using the repository's actual configuration so newcomers can start it. Do not invent commands or change code. Verify the commands involved and run git diff --check. Commit on your branch; do not push. End with a summary of changes, verification, and doubts."
octogent terminal create --terminal-id "$octogent_codex" --name "Ignore-rule documentation worker" \
  --tentacle-id "$octogent_batch" --workspace-mode worktree \
  --agent-provider codex --effort light \
  --initial-prompt "Edit only .gitignore: add a comment beside the existing .octogent ignore rule explaining that it holds local agent configuration and worktrees, which should not be committed as runtime files. Preserve the meaning of every ignore rule. Verify with git check-ignore .octogent/project.json and git diff --check. Commit on your branch; do not push. End with a summary of changes, verification, and doubts."
```

Block two sends a follow-up requirement and polls both workers for up to ten minutes. On timeout, sessions remain available; inspect logs and transcripts before deciding how to continue. Message delivery status cannot substitute for reviewing the result.

```bash
octogent terminal list
octogent channel send "$octogent_claude" "Additional requirement: list the commands you verified and their source files in the commit message to support review without a browser."
octogent channel list "$octogent_claude"
octogent_done=0
for octogent_attempt in {1..120}; do
  octogent_snapshot=$(octogent terminal list)
  printf '%s\n' "$octogent_snapshot"
  octogent_done=0
  for octogent_worker in "$octogent_claude" "$octogent_codex"; do
    octogent_lifecycle=$(awk -v id="$octogent_worker" '$1 == id {print $2}' <<< "$octogent_snapshot")
    case "$octogent_lifecycle" in
      awaiting-review|completed) octogent_done=$((octogent_done + 1)) ;;
    esac
  done
  if test "$octogent_done" = 2; then break; fi
  sleep 5
done
octogent channel list "$octogent_claude"
for octogent_worker in "$octogent_claude" "$octogent_codex"; do
  tail -n 20 "$octogent_state/transcripts/$octogent_worker.jsonl"
done
test "$octogent_done" = 2
```

Block three inspects commits and all changes from the main checkout. Compare them with each task requirement and check that the follow-up was addressed too. These two tasks change only explanatory text, so the gates below match that scope. For code tasks, install dependencies and run project tests in each worktree; in this repository, use the API tests, lint, and build listed earlier.

```bash
for octogent_worker in "$octogent_claude" "$octogent_codex"; do
  git -C ".octogent/worktrees/$octogent_worker" status --short
  test -z "$(git -C ".octogent/worktrees/$octogent_worker" status --porcelain)"
  git -C ".octogent/worktrees/$octogent_worker" log "$octogent_base..HEAD"
  git diff "$octogent_base..octogent/$octogent_worker"
  git -C ".octogent/worktrees/$octogent_worker" diff --check "$octogent_base..HEAD"
done
git -C ".octogent/worktrees/$octogent_codex" check-ignore .octogent/project.json
```

Execute the final block only after review passes. If changes are needed, use `channel send` to ask the relevant worker, then repeat monitoring and review. A merge conflict or failed check stops subsequent commands, leaving worktrees for investigation. This ends the workers and removes their output worktrees; the Octogent service keeps running, with logs at the location printed in block one.

```bash
test "$(git branch --show-current)" = "$octogent_base"
test -z "$(git status --porcelain)"
octogent_review_base=$(git rev-parse HEAD)
git merge --no-ff "octogent/$octogent_claude" -m "docs: merge reviewed startup clarification"
git merge --no-ff "octogent/$octogent_codex" -m "docs: merge reviewed ignore-rule explanation"
git diff --check "$octogent_review_base..HEAD"
git check-ignore .octogent/project.json
for octogent_worker in "$octogent_claude" "$octogent_codex"; do
  git merge-base --is-ancestor "octogent/$octogent_worker" HEAD
  octogent terminal stop "$octogent_worker"
  octogent terminal delete "$octogent_worker" --with-worktree
done
octogent worktree gc --dry-run
octogent terminal list
```
