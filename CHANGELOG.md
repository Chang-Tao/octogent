# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Agent lifecycle (this fork's evolution, phase 1)

- Terminals now report `completed` and `awaiting-review` lifecycle states,
  decided on Claude's Stop hook: a clean worktree with commits beyond the base
  counts as done, merged into the operator's branch reads completed, unmerged
  reads awaiting-review; new activity flips a finished terminal back to running.
- A completion summary (task line, commits, diff stats, branch, merged flag,
  duration) is stamped on the record and shown in the canvas node tooltip;
  session nodes carry DONE / REVIEW pills and a Hide Done toolbar toggle.
### Orchestration, flow view, and operations (this fork's evolution, phases 2–4)

- Channel delivery reaches a live agent reliably — three fixes surfaced by the
  pilot swarm run: injection writes a bracketed paste and submits with a
  delayed Enter (so the TUI cannot swallow the return), delivery requires a
  live transcript instead of a merely idle shell and marks delivered only
  after a successful write, and a session-start handover replays the queued
  backlog when a fresh agent starts in the same PTY. Agent PTYs also no longer
  inherit the operator's Claude session environment markers.
- The multi-agent workflow closed the loop on a live swarm run: pilot and
  worker agents built this batch's features in worktrees and merged them back,
  that run surfaced the channel-delivery bugs above, and the flow layout
  engine is tested against the hierarchy shape the run produced.
- New flow progress view: a pseudo-3D depth-staged scene of the whole fleet
  (octoboss → tentacles → agents → swarm workers), with pan/zoom, hover cards,
  click-to-pin, and completed agents rendered as calm dimmed dots. It is now
  the first page (nav schema 2): the view order lives in one named map, and
  persisted UI state without `navSchemaVersion: 2` has its saved view index
  migrated so nobody reloads into the wrong view.
- Each flow card narrates its node in both languages: a role line (fleet
  commander, tentacle description, swarm coordinator with sub-agent count,
  worker isolation mode) and a previous/current/next strip read from todos,
  latest commits, live runtime state, and the lifecycle.
- Claude usage source switch (`OCTOGENT_CLAUDE_USAGE_SOURCE`: auto/oauth/cli/
  off, OAuth first by default), a systemd user-service deployment guide, and
  `GET /api/health` for daemon and monitor probes.
- Finished records auto-archive after a retention period
  (`OCTOGENT_TERMINAL_RETENTION_HOURS`, default 72h); archived worktrees whose
  work is merged are reclaimed (`octogent worktree gc`), and unmerged work is
  never deleted by any automated path.

### Codex provider parity (this fork's evolution, phase 5)

- The terminal runtime now runs agents through a provider adapter layer
  (`agentProviders.ts`), and Codex terminals run unattended out of the box:
  Octogent auto-writes `.codex/hooks.json` (SessionStart, UserPromptSubmit,
  PreToolUse, PermissionRequest, and Stop, all reporting to `/api/hooks/*`)
  and seeds Codex's `config.toml` with project trust and hook trust hashes
  (`codexTrust.ts`) so Codex accepts both without prompting.
- `octogent terminal create` gained `--agent-provider` (`claude-code` or
  `codex`).
- The hook processor understands Codex payloads: `permission-request` events,
  a Stop branch that does not try to parse Codex's rollout transcript format,
  and a forced return to idle once a turn ends.
- Three new environment variables: `OCTOGENT_CODEX_SANDBOX_MODE` (`read-only`,
  `workspace-write`, or `danger-full-access`; unset defaults to
  `danger-full-access` for worktree terminals and `workspace-write` for shared
  ones, because `workspace-write` mounts `.git` read-only and a worktree agent
  could never commit — Claude has no sandbox, so this aligns the providers),
  `OCTOGENT_CODEX_APPROVAL_POLICY` (`on-request` or `never`, default `never`),
  and `OCTOGENT_CODEX_CONFIG` (overrides the Codex `config.toml` path, mainly
  for test isolation).
- Known Codex limitations: the conversation view has no transcript replay yet
  (the rollout format is not wired in) and no code-intel events.
- Web fixes landed alongside the batch: the events WebSocket reconnects
  automatically after a server restart so live views no longer freeze, and the
  flow progress view auto-fits the camera to the fleet on load.

This fork of [hesamsheikh/octogent](https://github.com/hesamsheikh/octogent) is now
maintained independently. This first batch merges the valuable open upstream pull
requests and sets up the independent-maintenance baseline.

### Added

- Integration tests for all deck route handlers, from upstream PR
  [#14](https://github.com/hesamsheikh/octogent/pull/14) (test commit only) by
  @directorsambasivagroup.
- Test coverage for the type coercion utilities, from upstream PR
  [#4](https://github.com/hesamsheikh/octogent/pull/4) by @KomalSrinivasan.
- Stalled-agent detection: a running terminal with no transcript activity for 2
  minutes (configurable via `OCTOGENT_TERMINAL_STALL_MS`) is marked with the new
  `stalled` lifecycle state, from upstream PR
  [#15](https://github.com/hesamsheikh/octogent/pull/15) by @Alecbdc; the web UI
  shows stalled terminals with an attention-style `STALLED` pill (with a zh-CN
  label, 停滞).
- Error boundary around the primary views so a render error in one view cannot
  white-screen the whole shell, ported from upstream PR
  [#5](https://github.com/hesamsheikh/octogent/pull/5) by @carson24wilson-cmyk
  (theme redesign from that PR not taken).
- Unload-time flush of pending UI state so the 250ms persistence debounce cannot
  lose state on tab close, ported from upstream PR
  [#5](https://github.com/hesamsheikh/octogent/pull/5) by @carson24wilson-cmyk
  (implemented with a keepalive `PATCH` fetch instead of `sendBeacon`, which can
  only `POST` and would be rejected by the API).
- An "Environment Variables" section in `docs/reference/cli.md`, based on
  upstream PR [#7](https://github.com/hesamsheikh/octogent/pull/7) by
  @KomalSrinivasan and checked against the variables the API reads today.
- A Windows CI job (advisory, `continue-on-error`) alongside the required Linux
  job.

### Changed

- `OCTOGENT_ALLOW_REMOTE_ACCESS=1` now binds the API to `0.0.0.0` by default
  when `HOST` is not set explicitly, based on upstream PR
  [#7](https://github.com/hesamsheikh/octogent/pull/7) by @KomalSrinivasan.
- `pnpm build` now runs through `scripts/build.mjs`, which falls back to
  `corepack pnpm` when `pnpm` is not on the PATH, from upstream PR
  [#22](https://github.com/hesamsheikh/octogent/pull/22) by @kingmarh-hash.
- pnpm build scripts for `node-pty`, `esbuild`, and `@biomejs/biome` are
  allowlisted (`onlyBuiltDependencies` in both `pnpm-workspace.yaml` and the
  root `package.json` for the pinned pnpm 10.4.1), based on upstream PR
  [#17](https://github.com/hesamsheikh/octogent/pull/17) by
  @TechIntegrationLabs.
- LICENSE and README now record the fork provenance and independent
  maintenance; the license remains MIT with the original copyright preserved.

### Fixed

- `pnpm dev` works on Windows and on paths containing spaces
  (`fileURLToPath` instead of `URL.pathname`, shell spawn on Windows for
  Node ≥ 20.12), from upstream PR
  [#24](https://github.com/hesamsheikh/octogent/pull/24) by @dcx010591-code.
- PTY file-descriptor leak: closed sessions now drop their `IPty` reference so
  the underlying master FD can be released, from upstream PR
  [#15](https://github.com/hesamsheikh/octogent/pull/15) by @Alecbdc.
- Tentacle sizing is capped to sane bounds, from upstream PR
  [#15](https://github.com/hesamsheikh/octogent/pull/15) by @Alecbdc.
- The web UI no longer silently drops terminals in unknown lifecycle states
  from the snapshot list (follow-up to the PR #15 merge).
