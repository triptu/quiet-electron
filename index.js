import { fileURLToPath } from 'node:url'
import modes from './modes.cjs'

export const shimPath = fileURLToPath(new URL('./quiet.cjs', import.meta.url))

export function quietArgs(env = process.env) {
  const mode = modes.readMode(env)
  return process.platform === 'darwin' && mode.load ? ['-r', shimPath] : []
}

export function launchQuiet(electron, options = {}) {
  const { ELECTRON_RUN_AS_NODE, ...env } = options.env ?? process.env
  // A project that passes its own env still takes the mode from the shell.
  if (env.QUIET_ELECTRON === undefined && process.env.QUIET_ELECTRON !== undefined) env.QUIET_ELECTRON = process.env.QUIET_ELECTRON
  return electron.launch({ ...options, env, args: [...quietArgs(env), ...(options.args ?? [])] })
}
