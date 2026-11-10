// What each QUIET_ELECTRON mode does. `off` never loads the shim.
const modes = {
  hidden: { load: true, opacity: 0, ignoreMouse: true },
  visible: { load: true, opacity: undefined, ignoreMouse: false },
  off: { load: false, opacity: undefined, ignoreMouse: false },
}

function readMode(env) {
  const name = env.QUIET_ELECTRON ?? 'hidden'
  if (!Object.hasOwn(modes, name)) {
    throw new Error(`QUIET_ELECTRON must be one of ${Object.keys(modes).join(', ')}; got ${JSON.stringify(name)}`)
  }
  return modes[name]
}

module.exports = { readMode }
