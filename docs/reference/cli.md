# CLI Reference

## Start the dashboard

```bash
octogent
```

Starts the local API for the current project and opens the UI when bundled web assets are present.

If the current directory has not been initialized yet, `octogent` also creates or updates the local `.octogent/` scaffold automatically on first run.

### Environment Variables

- `HOST`: Host address to bind to (default: `127.0.0.1`, or `0.0.0.0` when `OCTOGENT_ALLOW_REMOTE_ACCESS=1`)
- `OCTOGENT_API_PORT` or `PORT`: Port to listen on (default: `8787`)
- `OCTOGENT_ALLOW_REMOTE_ACCESS`: Set to `1` to allow access from other machines; this relaxes host/origin checks and, unless `HOST` is set explicitly, binds to `0.0.0.0` instead of `127.0.0.1`
- `OCTOGENT_WORKSPACE_CWD`: Override the workspace directory
- `OCTOGENT_PROJECT_STATE_DIR`: Override the project state directory
- `OCTOGENT_PROMPTS_DIR`: Override the prompts directory
- `OCTOGENT_WEB_DIST_DIR`: Override the web UI distribution directory
- `OCTOGENT_LOCALE`: UI/CLI locale (`en` or `zh-CN`)
- `OCTOGENT_MAX_TERMINAL_SESSIONS`: Cap on concurrently running terminal sessions
- `OCTOGENT_TERMINAL_STALL_MS`: Milliseconds without transcript activity before a running terminal is marked `stalled` (default: `120000`)

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

Shows each terminal ID, lifecycle state, recorded process ID when available, lifecycle reason, and display name.

## Stop or kill a terminal

```bash
octogent terminal stop <terminal-id>
octogent terminal kill <terminal-id>
```

`stop` closes an active session or sends `SIGTERM` to the recorded process for a stale terminal. `kill` uses `SIGKILL`.

## Prune inactive terminal records

```bash
octogent terminal prune
```

Removes terminal records whose lifecycle state is `stale`, `stopped`, or `exited`. It does not remove active sessions.

## Send a message

```bash
octogent channel send <terminal-id> "message"
```

Use `--from <terminal-id>` when sending on behalf of a worker or parent terminal. If `--from` is omitted, the CLI falls back to `OCTOGENT_SESSION_ID` when the command is running inside an Octogent-managed terminal.

## List messages

```bash
octogent channel list <terminal-id>
```
