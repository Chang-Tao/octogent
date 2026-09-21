# Filesystem Layout

Octogent splits files by ownership. Agent-facing project context stays in the workspace. Runtime-owned state stays in the per-project global state directory.

## Project-local files

`.octogent/` is created in the workspace.

Main paths:

- `.octogent/project.json`
- `.octogent/tentacles/`
- `.octogent/worktrees/`

`project.json` holds the stable project ID used to find global state. The tentacles folder is intended for agent-readable markdown. Worktrees are generated execution checkouts and should not be treated as context storage.

Tentacle example:

```text
.octogent/
  tentacles/
    api-backend/
      CONTEXT.md
      todo.md
      routes.md
```

`CONTEXT.md` may end with a managed `Suggested Skills` block when the operator or planner attaches Claude Code skills to that tentacle.

Deck also writes UI metadata for tentacles, but not into these markdown files. Color, status, appearance, paths, and tags are stored in global deck state.

Project-local Claude Code skills, when present, live under:

```text
.claude/
  skills/
    some-skill/
      SKILL.md
```

## Global state

Per-project runtime files are stored under:

```text
~/.octogent/projects/<project-id>/
  logs/
    server.log
    server.log.1
    server.log.2
    server.log.3
  state/
```

Notable files under `state/`:

- `tentacles.json`
- `deck.json`
- `transcripts/<sessionId>.jsonl`
- `monitor-config.json`
- `monitor-cache.json`
- `code-intel.jsonl`

`tentacles.json` is the terminal registry despite the historical name. It stores terminal records, lifecycle state, UI state, parent-child links, workspace mode, worktree IDs, and display names.

`deck.json` stores Deck presentation metadata that is not part of the agent-facing tentacle files.

`transcripts/*.jsonl` stores conversation transcript events separately from PTY scrollback. Scrollback is in memory and bounded; transcripts are persisted.

`logs/server.log` records server startup facts, runtime summaries, and uncaught errors. It rotates at 5 MB and keeps three generations. `OCTOGENT_SERVER_LOG` can override or disable this location.

## Prompt storage

- core prompts are synced from `prompts/`
- synced copies live in `.octogent/prompts/core/`
- user prompts live in `.octogent/prompts/`

## Practical rule

If something is agent-facing context, keep it in the tentacle folder.

If something is runtime-owned state, expect it under the global project state directory.

If something is an isolated execution checkout, expect it under `.octogent/worktrees/` and treat its branch lifecycle as part of the terminal that created it.

`transcripts/<terminalId>.screen.txt` stores the last 200 processed PTY lines best-effort on session teardown, for `terminal screen` fallback.
