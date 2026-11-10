/** Absolute path to the shim. Load it in the Electron main process with `-r <shimPath>`. */
export declare const shimPath: string

/**
 * The Electron arguments that load the shim: `['-r', shimPath]` on macOS, and `[]` on other
 * platforms or when `QUIET_ELECTRON=off`. Throws when `QUIET_ELECTRON` is not
 * `hidden`, `visible` or `off`. Pass the environment the app will run with.
 */
export declare function quietArgs(env?: Record<string, string | undefined>): string[]

interface Launcher {
  launch(options: { args?: string[]; env?: Record<string, string | undefined> }): unknown
}

/**
 * Calls Playwright's `_electron.launch` with the shim's arguments before `options.args`
 * and without `ELECTRON_RUN_AS_NODE` in the environment. When `options.env` has no
 * `QUIET_ELECTRON`, it takes the one from `process.env`.
 */
export declare function launchQuiet<L extends Launcher>(electron: L, options?: Parameters<L['launch']>[0]): ReturnType<L['launch']>
