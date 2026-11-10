// Loaded with `-r` in the Electron main process, before the app's code. On macOS it
// keeps the app from activating and its windows from taking key focus.
const Module = require('node:module')
const { resolve } = require('node:path')
const { readMode } = require('./modes.cjs')

// Electron leaves `-r <shim>` in process.argv, where an app that reads its arguments
// would take the shim's path for its own.
const at = process.argv.findIndex((arg, i) => (arg === '-r' || arg === '--require') && resolve(process.argv[i + 1] ?? '') === __filename)
if (at !== -1) process.argv.splice(at, 2)

const mode = readMode(process.env)
// Only the main process has windows and an activation policy. Under ELECTRON_RUN_AS_NODE
// the process is plain Node.
if (process.platform === 'darwin' && process.type === 'browser' && mode.load) quiet(mode, require('electron'))

function quiet(mode, electron) {
  const { app, BaseWindow, BrowserWindow } = electron
  const nothing = () => {}

  // No Dock icon, not in Cmd-Tab, and not activated by launching.
  app.setActivationPolicy('accessory')
  if (app.dock) app.dock.show = async () => {}

  // Each of these calls -[NSApplication activateIgnoringOtherApps:] or -unhide:, which
  // activates the app. showInactive orders a window front without either.
  app.focus = nothing
  app.show = nothing
  app.hide = nothing // with show a no-op, hiding could never be undone
  const show = BaseWindow.prototype.show
  BaseWindow.prototype.show = function () {
    // A modal child shows as a sheet, which does not activate the app.
    if (this.isModal() && this.getParentWindow()) show.call(this)
    else this.showInactive()
  }
  BaseWindow.prototype.focus = nothing
  BaseWindow.prototype.moveTop = nothing
  // Full screen moves the window to its own Space and macOS switches to it, activating
  // the app. Kiosk mode enters full screen natively. A test that expects either would
  // otherwise fail with no hint why, so the first ignored request says so.
  const warned = new Set()
  function ignored(what) {
    if (warned.has(what)) return
    warned.add(what)
    process.stderr.write(`quiet-electron: ignored ${what}, since it would bring the app to the front. Set QUIET_ELECTRON=off to run it.\n`)
  }
  BaseWindow.prototype.setFullScreen = function (on) {
    if (on) ignored('setFullScreen(true)')
  }
  BaseWindow.prototype.setKiosk = function (on) {
    if (on) ignored('setKiosk(true)')
  }
  // The keys are removed rather than set to false: `fullscreen: false` also makes the
  // window unable to enter full screen.
  function withoutFullScreen({ fullscreen, kiosk, ...options }) {
    if (fullscreen) ignored('the fullscreen window option')
    if (kiosk) ignored('the kiosk window option')
    return options
  }

  function tuck(win) {
    if (mode.opacity !== undefined) win.setOpacity(mode.opacity)
    if (mode.ignoreMouse) win.setIgnoreMouseEvents(true)
  }
  // Every BrowserWindow, whichever code built it.
  app.on('browser-window-created', (_event, win) => tuck(win))

  // Electron builds the windows a page opens with its own BrowserWindow, not the app's,
  // and with `show: true` unless the open handler says otherwise. So every handler's
  // `allow` creates the window hidden, and it is shown once created.
  const showOnCreate = Symbol('quiet-electron show')
  const allow = () => ({ action: 'allow' })
  function quietOpenHandler(handler) {
    return function (details) {
      const response = handler.call(this, details)
      // With createWindow the app builds the window itself, through the quiet classes.
      if (response?.action !== 'allow' || response.createWindow) return response
      const asked = response.overrideBrowserWindowOptions
      const options = withoutFullScreen(typeof asked === 'object' && asked ? asked : {})
      return { ...response, overrideBrowserWindowOptions: { ...options, show: false, [showOnCreate]: options.show !== false } }
    }
  }
  app.on('web-contents-created', (_event, contents) => {
    // webContents.focus() focuses its window, which activates the app.
    contents.focus = nothing
    const setWindowOpenHandler = contents.setWindowOpenHandler
    // Electron treats a handler that is not a function as no handler, which allows.
    contents.setWindowOpenHandler = (handler) => setWindowOpenHandler.call(contents, quietOpenHandler(typeof handler === 'function' ? handler : allow))
    contents.setWindowOpenHandler(allow)
    contents.on('did-create-window', (win, { options }) => {
      if (options[showOnCreate]) win.show()
    })
  })

  // A Proxy, not a subclass: getAllWindows() filters by constructor name, so windows
  // must stay plain BrowserWindows. A window created with `show: true` would show
  // natively inside the constructor, activating the app, so it is shown here instead.
  function quietClass(Class) {
    const Quiet = new Proxy(Class, {
      construct(target, [options = {}, ...rest], newTarget) {
        const win = Reflect.construct(target, [{ ...withoutFullScreen(options), show: false }, ...rest], newTarget === Quiet ? target : newTarget)
        tuck(win)
        if (options.show !== false) win.show()
        return win
      },
    })
    return Quiet
  }
  const replaced = { BaseWindow: quietClass(BaseWindow), BrowserWindow: quietClass(BrowserWindow) }
  const quietElectron = new Proxy(electron, {
    get: (target, key) => (Object.hasOwn(replaced, key) ? replaced[key] : Reflect.get(target, key)),
  })
  // In the main process each of these resolves to the same module as `electron`.
  const specifiers = new Set(['electron', 'electron/main', 'electron/common', 'electron/renderer', 'electron/utility'])
  const load = Module._load
  Module._load = function (request, ...rest) {
    return specifiers.has(request) ? quietElectron : load.call(this, request, ...rest)
  }
  if (Module.registerHooks) quietImports(electron, quietElectron, specifiers)
}

// `import ... from 'electron'` does not go through Module._load, and Electron's exports
// cannot be redefined. So the specifier resolves to a module that re-exports the proxy.
// `require` is left to Module._load, which also covers require() from ESM.
function quietImports(electron, quietElectron, specifiers) {
  globalThis[Symbol.for('quiet-electron')] = quietElectron
  const url = 'quiet-electron:electron'
  const names = Object.keys(electron).filter((name) => /^[A-Za-z_$][\w$]*$/.test(name) && name !== 'default')
  const source = [
    `const electron = globalThis[Symbol.for('quiet-electron')]`,
    'export default electron',
    ...names.map((name) => `export const ${name} = electron.${name}`),
  ].join('\n')
  Module.registerHooks({
    resolve(specifier, context, next) {
      if (specifiers.has(specifier) && !context.conditions.includes('require')) return { url, format: 'module', shortCircuit: true }
      return next(specifier, context)
    },
    load(target, context, next) {
      return target === url ? { format: 'module', source, shortCircuit: true } : next(target, context)
    },
  })
}
