# Troubleshooting

## `pnpm test` fails because of browser APIs

Make sure the workspace dependencies are installed from the repo root:

```bash
pnpm install
```

## Package resolution is broken

Run install from the repository root, not from a subpackage.

## Node version is too old

Use Node.js `22+`.

## Terminal startup fails

Check that your shell environment is available and executable.

If startup fails with `Terminal session limit reached`, Octogent already has the configured number of live PTY-backed sessions. Stop unused terminals with `octogent terminal stop <terminal-id>` or prune inactive records with `octogent terminal prune`. The default cap is 32; set `OCTOGENT_MAX_TERMINAL_SESSIONS` to a positive integer before starting Octogent to adjust it.

## Worktree terminal creation fails

Verify:

- `git --version` works
- the workspace is a git repository
- the current user can create worktrees in `.octogent/worktrees/`

## GitHub summary is unavailable

Verify:

```bash
gh auth status
```

## Monitor refresh fails

Verify your X bearer token and API access.

## A busy terminal reads as `stalled`, and its transcript stops growing

The Octogent transcript (`state/transcripts/<terminal>.jsonl`) records state *changes* (idle → processing and back), plus one `tool_use` event per tool call reported by the agent's PreToolUse hook. A long single turn therefore shows a stream of `tool_use` events rather than repeated `processing` lines. Activity for the stall detector counts prompt submissions, tool calls, and PTY output (throttled to one tick every few seconds), so an agent that is visibly working is never `stalled`; the verdict is reserved for a live PTY that has produced nothing for `OCTOGENT_TERMINAL_STALL_MS`.

If a terminal still reads as stalled while its agent is working, check that the agent's hooks reach the API: run the API with `OCTOGENT_VERBOSE_LOGS=1` and look for `[Hook] Received hook` lines when the agent acts. Hooks live in `<workspace>/.claude/settings.json` for Claude and in the user-level `$CODEX_HOME/hooks.json` for Codex.

## `channel send` says the message is queued

That is the normal answer while the target agent is busy. A channel message is injected only when the target session is idle (as reported by its hooks and output detection); until then it stays in the queue with `status=pending`, which `octogent channel list <terminal-id>` shows. It is delivered automatically at the end of the agent's current turn. Note that `channel list` only knows about messages sent to the API process that is running now.

## The worker's session closed five minutes after its first turn

Previously, a shared-mode worker's first Stop hook marked it `completed` and released its PTY keep-alive. Without a browser, the default five-minute idle grace then closed the session (`session_close`), stranding later channel messages.

Workers created with `--initial-prompt` now stay alive between turns, even when shared-mode completion is reported. A worktree-mode `completed` verdict (proven merged work) still releases keep-alive, and `awaiting-review` remains exempt. If the old pattern persists, unset `OCTOGENT_TERMINAL_RELEASE_AFTER_TURN=1` before restarting Octogent; that override restores the old release behavior. `OCTOGENT_TERMINAL_IDLE_GRACE_MS` controls the grace after release.

When finished, use `octogent terminal stop <terminal-id>` to close the worker immediately or `octogent terminal archive <terminal-id>` to archive an eligible idle worker and release keep-alive. Retention also archives eligible idle workers after `OCTOGENT_TERMINAL_RETENTION_HOURS`. A worker whose PTY is still open is never touched by the next batch's cleanup, idle or not — the orchestrator may still continue it over the channel.

## Messages disappear after restart

That is expected. Channel messages are in-memory only and do not persist across API restarts.

## A terminal survived reload but not server restart

That is also expected. PTY sessions can survive a reconnect window, but they do not survive an API restart.

After restart, terminals that were persisted as running are marked `stale` when Octogent cannot reattach them to an in-memory PTY session. Use `octogent terminal list` to inspect lifecycle state, `octogent terminal stop <terminal-id>` or `octogent terminal kill <terminal-id>` for a recorded process, and `octogent terminal prune` to remove stale, stopped, or exited records from the UI.
