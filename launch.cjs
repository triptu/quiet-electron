// Runs in the test process: the arguments and environment that load the shim into the app.
const { resolve } = require('node:path')
const { readMode } = require('./modes.cjs')

const shimPath = resolve(__dirname, 'quiet.cjs')

function quietArgs(env = process.env) {
  return process.platform === 'darwin' && readMode(env).load ? ['-r', shimPath] : []
}

function launchQuiet(electron, options = {}) {
  const { ELECTRON_RUN_AS_NODE, ...env } = options.env ?? process.env
  // A project that passes its own env still takes the mode from the shell.
  if (env.QUIET_ELECTRON === undefined && process.env.QUIET_ELECTRON !== undefined) env.QUIET_ELECTRON = process.env.QUIET_ELECTRON
  return electron.launch({ ...options, env, args: [...quietArgs(env), ...(options.args ?? [])] })
}

module.exports = { shimPath, quietArgs, launchQuiet }
