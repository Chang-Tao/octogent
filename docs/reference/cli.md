# CLI Reference

## Start the dashboard

```bash
octogent
```

Starts the local API for the current project and opens the UI when bundled web assets are present.

If the current directory has not been initialized yet, the dashboard still starts, but it runs against a temporary state root and shows a setup card asking you to run `octogent init`. The local `.octogent/` scaffold is created by `octogent init` (or the setup card's **Initialize workspace** action), not by the dashboard itself. Anything created before that point is migrated into the project on initialization.

### Environment Variables

- `HOST`: Host address to bind to (default: `127.0.0.1`, or `0.0.0.0` when `OCTOGENT_ALLOW_REMOTE_ACCESS=1`)
- `OCTOGENT_API_PORT` or `PORT`: Port to listen on (default: `8787`)
- `OCTOGENT_ALLOW_REMOTE_ACCESS`: Set to `1` to allow access from other machines; this relaxes host/origin checks and, unless `HOST` is set explicitly, binds to `0.0.0.0` instead of `127.0.0.1`
- `OCTOGENT_WORKSPACE_CWD`: Override the workspace directory
- `OCTOGENT_HOME`: Override the global state root (default: `~/.octogent`)
- `OCTOGENT_PROJECT_STATE_DIR`: Override the project state directory
- `OCTOGENT_PROMPTS_DIR`: Override the prompts directory
- `OCTOGENT_WEB_DIST_DIR`: Override the web UI distribution directory
- `OCTOGENT_LOCALE`: UI/CLI locale (`en` or `zh-CN`)
- `OCTOGENT_MAX_TERMINAL_SESSIONS`: Cap on concurrently running terminal sessions
- `OCTOGENT_TERMINAL_STALL_MS`: Milliseconds without transcript activity before a running terminal is marked `stalled` (default: `120000`)
- `OCTOGENT_TERMINAL_RETENTION_HOURS`: Hours after which `completed`, `stopped`, and `exited` terminal records are auto-archived; `awaiting-review` records never expire (default: `72`, invalid values fall back to the default)
- `OCTOGENT_CLAUDE_USAGE_SOURCE`: Claude usage data source: `auto` (OAuth first, CLI PTY fallback), `oauth`, `cli`, or `off` to disable collection (default: `auto`)

Example for headless servers:

```bash
OCTOGENT_ALLOW_REMOTE_ACCESS=1 octogent
# or specify a custom host
HOST=192.168.1.100 octogent
```

## Initialize a project

```bash
octogent init [project-name]
```

Creates or updates the `.octogent/` scaffold in the current directory without starting the dashboard.

Use this when you want to initialize the project explicitly or set the project display name ahead of time. In normal use, running `octogent` inside the codebase is enough to initialize and start the app.

## List registered projects

```bash
octogent projects
```

## Create a tentacle

```bash
octogent tentacle create <name> --description "API runtime and routes"
```

Octogent must already be running for this command.

## List tentacles

```bash
octogent tentacle list
```

## Create a terminal

```bash
octogent terminal create [options]
```

Options:

- `--name`, `-n`: terminal display name
- `--workspace-mode`, `-w`: `shared` or `worktree`
- `--initial-prompt`, `-p`: raw initial prompt text
- `--terminal-id`: explicit terminal ID
- `--tentacle-id`: existing tentacle ID to attach to
- `--worktree-id`: explicit worktree ID
- `--parent-terminal-id`: parent terminal ID for child terminals
- `--prompt-template`: prompt template name
- `--prompt-variables`: JSON object of prompt template variables

## List terminals

```bash
octogent terminal list
```

Shows each terminal ID, lifecycle state, recorded process ID when available, lifecycle reason, and display name. Archived records are hidden by default; pass `--archived` to list only archived records.

## Stop or kill a terminal

```bash
octogent terminal stop <terminal-id>
octogent terminal kill <terminal-id>
```

`stop` closes an active session or sends `SIGTERM` to the recorded process for a stale terminal. `kill` uses `SIGKILL`.

## Archive terminal records

```bash
octogent terminal archive <terminal-id>
octogent terminal archive --all-completed
```

Archiving stamps `archivedAt` on the record so default listings hide it; transcripts and completion summaries are kept on disk. A running terminal cannot be archived. `--all-completed` archives every record whose lifecycle state is `completed`. Records in `completed`, `stopped`, or `exited` state are also archived automatically once `OCTOGENT_TERMINAL_RETENTION_HOURS` passes; `awaiting-review` records are never auto-archived so unmerged work stays visible.

## Prune inactive terminal records

```bash
octogent terminal prune
```

Removes terminal records whose lifecycle state is `stale`, `stopped`, or `exited`. It does not remove active sessions. Prune only cleans up records — it never touches the disk; use `octogent worktree gc` to reclaim merged worktrees and branches.

## Reclaim merged worktrees

```bash
octogent worktree gc
octogent worktree gc --dry-run
```

Removes the worktree directory and branch of every archived worktree terminal whose work is proven merged — the record's lifecycle state is `completed`, or its completion summary says `merged`. Unmerged work (including `awaiting-review`) is never reclaimed, and a worktree shared by several terminal records is only reclaimed when every record qualifies. `--dry-run` lists the reclaimable worktrees without removing anything. The server also reclaims eligible worktrees automatically when the archive sweep archives their records. Terminal records stay in place either way — that is what `octogent terminal prune` is for.

## Send a message

```bash
octogent channel send <terminal-id> "message"
```

Use `--from <terminal-id>` when sending on behalf of a worker or parent terminal. If `--from` is omitted, the CLI falls back to `OCTOGENT_SESSION_ID` when the command is running inside an Octogent-managed terminal.

## List messages

```bash
octogent channel list <terminal-id>
```
