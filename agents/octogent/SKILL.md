---
name: octogent
description: Coordinate coding-agent workers (Claude Code or Codex) with Octogent from a shell — dispatch tasks into tentacles, wait for results, read answers, follow up, review and finish. Use when the user mentions Octogent, octoboss, tentacles, or asks to delegate, parallelize, or dispatch work to worker agents; also when an `octogent` command is being written or has failed.
---

# Octogent — the coordinator's routine

You are the coordinator. Workers are separate agent sessions Octogent starts for you; you never need a browser, a WebSocket or the HTTP API — only these commands, run from the project directory. Exact flags and current defaults come from `octogent guide` (printed by the installed version, so it is never stale); read it once per session before your first dispatch.

## The routine

1. **Dispatch** — `octogent tentacle create <id> --description "..."` once per work stream, then one `octogent terminal create` per worker, **always with `--tentacle-id <id>`** (without it the worker hangs off the octoboss) and `--terminal-id <name>` so you can refer to it. Put the whole task in `--initial-prompt`: goal, exact files, required behavior, tests, gates, "commit on your branch, do not push", "end with a summary and doubts". Ask the worker to write its deliverable to `.octogent/tentacles/<id>/RESULT.md` and name the path in its final message. Workers start from a clean environment — a project's virtualenv or PATH lives in `<workspace>/.octogent/env` (created by `octogent init`), or pass `--inherit-env PATH,VIRTUAL_ENV` for one worker.
2. **Wait** — `octogent terminal wait <worker> [<worker>...] --timeout 600`. Exit 0: all finished well (awaiting-review / completed). 1: one ended another way. 2: timeout (sessions stay open; wait again). **3: a worker needs attention** — it is stuck on a dialog or hit a provider error; the result block says which.
3. **Read** — `octogent terminal result <worker>` prints state, summary and the worker's final answer any time (`--json` for scripts, `--screen` to append what its terminal shows).
4. **Unstick** — `octogent terminal screen <worker>` shows the terminal as a person would see it; `octogent terminal input <worker> --keys 3` (or `down,enter`, `esc`, text with `--enter`) answers a dialog. Provider errors (usage limit, auth) show as `error=<kind>` in `terminal list`; do not re-dispatch into them.
5. **Follow up** — `octogent channel send <worker> "..."`, then `octogent channel list <worker>` until `status=confirmed`; the worker keeps its session between turns. Then `wait` again.
6. **Review and merge** — worktree workers: `git diff main..octogent/<worker>`, run the tests, `git merge --no-ff octogent/<worker>`. Shared-workspace workers change files in place.
7. **Finish** — you end every worker: `octogent terminal delete <worker> --with-worktree` (after merging) or `octogent terminal stop <worker>`. Workers do not exit on their own.

## Mistakes coordinators keep making

- Forgetting `--tentacle-id` — every worker lands on the octoboss.
- Polling `terminal list` in a loop, hand-rolling WebSocket listeners, or calling `/api/...` — `terminal wait` is the whole answer.
- Treating `stalled` as a dead process and re-dispatching — run `terminal result` and `terminal screen` first.
- Expecting the worker to "reply over the channel" — answers are read with `terminal result`.
- Dispatching the next batch without stopping the previous one.
- Two workers editing the same file in shared mode — use worktree mode, or serialize.

## Model and effort

`--agent-provider claude-code|codex`, `--effort light|standard|heavy|max` (current mapping in `octogent guide`), or `--model <id>`. Documentation tasks: light. Focused fixes: standard. Design and multi-file work: heavy. Keep `max` for what truly needs it.

## 中文速记

派发（建触手 → `terminal create` 带 `--tentacle-id`，任务写全）→ `terminal wait`（0 完成 / 3 需要处理）→ `terminal result` 读回答 → 卡住就 `terminal screen` 看、`terminal input` 答 → `channel send` 追问后再 `wait` → 审阅合并 → `terminal delete --with-worktree` 或 `stop` 收尾。确切命令以 `octogent guide` 为准。
