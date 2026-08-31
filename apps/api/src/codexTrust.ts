/**
 * Pre-seeds Codex trust for a workspace directory so an unattended agent does
 * not stall on the folder-trust or hooks-review dialog — the Codex counterpart
 * of claudeTrust's ensureDirectoryTrusted.
 *
 * Trust lives in $CODEX_HOME/config.toml (default ~/.codex/config.toml):
 * - `[projects."<path>"] trust_level = "trusted"` trusts the folder, and
 * - `[hooks.state."<hooks.json path>:<event>:<group>:<index>"] trusted_hash`
 *   entries approve each installed hook definition by content hash.
 *
 * Not implemented yet: until seeding lands, a Codex terminal's first boot
 * shows the trust dialogs and needs one manual confirmation in the terminal.
 */
export const ensureCodexDirectoryTrusted = (_targetCwd: string): void => {
  // TODO(codex-parity): seed [projects] and [hooks.state] in the Codex config.
};
