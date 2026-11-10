// Loaded with `-r` in the Electron main process, before the app's code. On macOS it
// keeps the app from activating and its windows from taking key focus.
const Module = require('node:module')
const electron = require('electron')
const { readMode } = require('./modes.cjs')

const mode = readMode(process.env)
if (process.platform === 'darwin' && mode.load) quiet(mode)

function quiet(mode) {
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
  // the app. Kiosk mode enters full screen natively.
  BaseWindow.prototype.setFullScreen = nothing
  BaseWindow.prototype.setKiosk = nothing
  // webContents.focus() focuses its window, which activates the app.
  app.on('web-contents-created', (_event, contents) => {
    contents.focus = nothing
  })

  function tuck(win) {
    if (mode.opacity !== undefined) win.setOpacity(mode.opacity)
    if (mode.ignoreMouse) win.setIgnoreMouseEvents(true)
  }

  // A Proxy, not a subclass: getAllWindows() filters by constructor name, so windows
  // must stay plain BrowserWindows. A window created with `show: true` would show
  // natively inside the constructor, activating the app, so it is shown here instead.
  function quietClass(Class) {
    const Quiet = new Proxy(Class, {
      construct(target, [options = {}, ...rest], newTarget) {
        const win = Reflect.construct(target, [{ ...options, show: false, fullscreen: false, kiosk: false }, ...rest], newTarget === Quiet ? target : newTarget)
        tuck(win)
        if (options.show !== false) win.showInactive()
        return win
      },
    })
    return Quiet
  }
  const replaced = { BaseWindow: quietClass(BaseWindow), BrowserWindow: quietClass(BrowserWindow) }
  const quietElectron = new Proxy(electron, {
    get: (target, key) => (Object.hasOwn(replaced, key) ? replaced[key] : Reflect.get(target, key)),
  })
  const load = Module._load
  Module._load = function (request, ...rest) {
    return request === 'electron' ? quietElectron : load.call(this, request, ...rest)
  }
}
