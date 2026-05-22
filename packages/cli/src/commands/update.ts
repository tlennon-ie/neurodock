import {
  runInstallAll,
  type InstallAllOptions,
  type InstallAllDependencies,
  type InstallAllResult,
} from "./install-all.js";

export type UpdateOptions = InstallAllOptions;
export type UpdateDependencies = InstallAllDependencies;
export type UpdateRunResult = InstallAllResult;

/**
 * `neurodock update` upgrades all NeuroDock MCP servers (pip/uv install
 * --upgrade) and refreshes wired client configs. It is the same code
 * path as `neurodock install-all` — re-running install IS the update
 * mechanism. The dedicated verb exists because users look for it.
 *
 * The previous behavior of `update` (re-shape client configs only,
 * without upgrading packages) moved to `neurodock sync` in 0.5.0.
 */
export async function runUpdate(
  options: UpdateOptions,
  deps: UpdateDependencies = {},
): Promise<UpdateRunResult> {
  return runInstallAll(options, deps);
}
