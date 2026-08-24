# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
