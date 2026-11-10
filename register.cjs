// Loaded into the test process with NODE_OPTIONS="--require <this file>". Every Playwright
// `_electron.launch` in that process then goes through launchQuiet, so the project under
// test needs no change. Playwright removes NODE_OPTIONS before it starts Electron, so this
// file never runs in the app.
const Module = require('node:module')
const { basename } = require('node:path')
const { launchQuiet } = require('./launch.cjs')

const wrapped = new WeakSet()
const load = Module._load
Module._load = function (...args) {
  const exports = load.apply(this, args)
  // hasOwn reads no getter, so a module that throws on unknown keys is left alone.
  if (exports && Object.hasOwn(exports, '_electron')) wrap(exports._electron)
  return exports
}

function wrap(electron) {
  if (typeof electron?.launch !== 'function' || wrapped.has(electron)) return
  wrapped.add(electron)
  const launch = electron.launch
  electron.launch = function (options = {}) {
    const args = options.args ?? []
    // The project already loads a shim, its own copy or this one, through launchQuiet or
    // quietArgs. A second copy would patch the app twice.
    if (args.some((arg, i) => (arg === '-r' || arg === '--require') && basename(args[i + 1] ?? '') === 'quiet.cjs')) return launch.call(this, options)
    return launchQuiet({ launch: (opts) => launch.call(this, opts) }, options)
  }
}
