# How quiet-electron works

## Why Electron apps take focus on macOS

On macOS, keyboard input goes to the active app. Several Electron calls make an app active:

- `win.show()`, and a window created with the default `show: true`, activate the app and make the window key.
- `win.focus()` and `webContents.focus()` do the same.
- `app.focus()` and `app.show()` activate the app.
- `win.setFullScreen(true)` and kiosk mode move the window to its own Space, and macOS switches to it.

Most apps make some of these calls at startup. Each test launches the app again, so during a run your typing keeps landing in the test app.

Playwright does not need the app to be active. It sends input through the DevTools protocol and emulates page focus, so typing, clicking and screenshots work on a window that is in the background.

## Modes

The `QUIET_ELECTRON` environment variable picks the mode. Set it when you run the tests.

| Mode | Activates the app | Windows | Mouse |
| --- | --- | --- | --- |
| `hidden` (default) | never | invisible (opacity 0) | passes through to what is behind |
| `visible` | never | shown on top of your other windows | normal |
| `off` | as the app does | as the app sets them | normal |

Use `visible` to watch a run and keep your keyboard. Use `off` to run the app unchanged. In `off` mode the shim is not loaded. Any other value throws an error at launch.

The launch reads the mode to decide whether to load the shim, and the shim reads it again in the app's process. Both must see the same environment.

## What the shim changes

The shim is `quiet.cjs`. Electron loads it with `-r` in the main process, before the app's code. It acts only in the main process on macOS. `launchQuiet` and `quietArgs` add the `-r` argument on macOS and nothing on other platforms. To load it another way, the package exports its path as `shimPath` and the file as `quiet-electron/shim`.

The shim:

- sets the activation policy to `accessory`, so the app has no Dock icon and is not in Cmd-Tab;
- makes `win.show()` call `showInactive()`. A modal child with a parent still shows natively, as a sheet, which does not activate the app;
- creates every `BaseWindow` and `BrowserWindow` with `show: false`, then shows it that same way unless the app asked for `show: false`;
- creates the windows a page opens, through `window.open` or a link with `target=_blank`, hidden, then shows them the same way;
- removes `fullscreen` and `kiosk` from window options, and ignores `win.setFullScreen(true)` and `win.setKiosk(true)`;
- makes `win.focus()`, `win.moveTop()`, `webContents.focus()`, `app.focus()`, `app.show()`, `app.hide()` and `app.dock.show()` do nothing;
- in `hidden` mode, sets each window's opacity to 0 and makes it ignore the mouse;
- removes its own `-r <shim>` from `process.argv`, so an app that reads its arguments does not see it.

It replaces the window classes the app gets from `electron`, `electron/main`, `electron/common`, `electron/renderer` and `electron/utility`, through both `require` and `import`. In the main process these are all the same module.

Windows stay visible to the system, so the page keeps drawing frames and `page.screenshot()` captures it.

### Windows a page opens

Electron builds these windows itself, so the shim wraps each `webContents.setWindowOpenHandler`. When the app sets no handler, the shim sets one that allows, which is what Electron does without a handler.

- A handler that denies still denies.
- A handler that allows keeps its `overrideBrowserWindowOptions`, without `fullscreen` and `kiosk`. A window it asked for with `show: false` stays hidden.
- A handler that returns `createWindow` builds the window itself, through the replaced classes.

## ESM mains

An app whose main process loads Electron with `require('electron')` works with any Electron version.

An app whose main process uses `import ... from 'electron'` needs one of:

- Electron 37 or later
- Electron 36.2.0 or later in the 36 line
- Electron 35.4.0 or later in the 35 line

The shim covers `import` through `module.registerHooks`, which Node added in 22.15.0 and 23.5.0. Those Electron releases are the first to ship Node 22.15.0. On an older Electron the shim still loads, but an `import` of `electron` gets the plain module and the app can come to the front.

## Limits

- In the main process, `win.isFocused()` is false and `BrowserWindow.getFocusedWindow()` is null. Code that behaves differently when the app is in front takes its background path.
- Full screen and kiosk mode never turn on. The first time in a process that the app makes each kind of request (`setFullScreen(true)`, `setKiosk(true)`, the `fullscreen` window option or the `kiosk` window option), the shim writes a line to stderr that starts with `quiet-electron: ignored` and names the request. A test that needs full screen must run with `QUIET_ELECTRON=off`, and that test then brings the app to the front.
- `BrowserWindow` and `BaseWindow` are proxies of Electron's classes, so `win.constructor === BrowserWindow` is false. `win instanceof BrowserWindow` and `BrowserWindow.getAllWindows()` work as usual.
- Native menus, dialogs, notifications and the tray are not covered. A native dialog or a menu role such as `togglefullscreen` can still bring the app forward.
- The clipboard is still shared with you. A test that copies or pastes reads and writes your clipboard.
- An app that sets a window's opacity or mouse handling itself after creating it can undo `hidden` mode for that window.
- The shim loads the same way as Playwright's own loader, with `-r` on the Electron command line. A packaged app whose fuses stop Playwright from launching it stops the shim too.
