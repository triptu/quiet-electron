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

| Mode | Shim | Calls that would make the app active | Window opacity | Mouse |
| --- | --- | --- | --- | --- |
| `hidden` (default) | loaded | replaced | set to 0 | windows ignore it, so clicks reach what is behind |
| `visible` | loaded | replaced | unchanged by the shim | unchanged by the shim |
| `off` | not loaded | unchanged | unchanged | unchanged |

[What the shim changes](#what-the-shim-changes) lists the replaced calls. [Limits](#limits) lists the ways an app can still come forward.

Use `visible` to watch a run and keep your keyboard. A window the app shows appears without taking focus, and a window the app created with `show: false` stays hidden. Use `off` to run the app unchanged. Any other value throws an error at launch.

The launch reads the mode to decide whether to load the shim, and the shim reads it again in the app's process. Both must see the same environment.

- `launchQuiet` launches the app with `options.env`, or with `process.env` when there is none. When that environment has no `QUIET_ELECTRON`, it copies the one from `process.env`. A value set in `options.env` wins.
- `quietArgs(env)` reads only the environment you pass it. Pass the one the app is launched with.

## Without adding it to the project

`register.cjs` loads the shim for a project that does not depend on the package. Load it into the test process with `NODE_OPTIONS`:

```sh
NODE_OPTIONS="--require $HOME/.quiet-electron/register.cjs" npx playwright test
```

It wraps `_electron.launch` on each copy of Playwright the test process loads. Every launch then works as if it went through `launchQuiet`: the shim's arguments go before the project's, `ELECTRON_RUN_AS_NODE` is removed, and `QUIET_ELECTRON` from the shell reaches the app.

- A launch that already loads this copy's shim, through `launchQuiet` or `quietArgs`, is left unchanged.
- When a project's own copy of the package and the registered copy both load into the app, only the first one acts.
- It works when the test process runs on Node, as Playwright Test does. Bun does not read `NODE_OPTIONS`.
- Playwright removes `NODE_OPTIONS` before it starts Electron, so the file never runs in the app.
- A test that needs the app in front, such as one that turns on full screen, fails as described in [Limits](#limits). The project does not know about the package, so run that test with `QUIET_ELECTRON=off` set in the shell.

## What the shim changes

The shim is `quiet.cjs`. Electron loads it with `-r` in the main process, before the app's code. It acts only in the main process on macOS. `launchQuiet` and `quietArgs` add the `-r` argument on macOS and nothing on other platforms. To load it another way, the package exports its path as `shimPath` and the file as `quiet-electron/shim`.

The shim:

- sets the activation policy to `accessory`, so the app has no Dock icon and is not in Cmd-Tab;
- makes `win.show()` call `showInactive()`. A modal child with a parent still shows natively, as a sheet, which does not activate the app;
- creates every `BaseWindow` and `BrowserWindow` with `show: false`, then shows it that same way unless the app asked for `show: false`;
- creates the windows a page opens, through `window.open` or a link with `target=_blank`, hidden, then shows them the same way;
- removes `fullscreen` and `kiosk` from window options, and makes every call to `win.setFullScreen()` and `win.setKiosk()` do nothing, with `true` or `false`;
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

## Electron versions

Every app needs Electron 30.0.0 or later. The shim replaces methods of `BaseWindow`, which Electron added in that release. On an older Electron the shim throws when it loads.

An app whose main process uses `import ... from 'electron'` also needs one of:

- Electron 37.0.0 or later
- Electron 36.2.0 or later in the 36 line
- Electron 35.4.0 or later in the 35 line

The shim covers `import` through `module.registerHooks`, which Node added in 22.15.0 and 23.5.0. Electron 35.4.0 and 36.2.0 ship Node 22.15.0. Electron 37.0.0 ships Node 22.16.0. Earlier releases in the 35 and 36 lines ship a Node without `registerHooks`.

On an Electron from 30 up to those releases the shim still loads. An `import` of `electron` then gets the plain module, and the app can come to the front. `require('electron')` is covered on every supported version.

## Limits

- In the main process, `win.isFocused()` is false and `BrowserWindow.getFocusedWindow()` is null. Code that behaves differently when the app is in front takes its background path.
- The app cannot turn on full screen or kiosk mode through `setFullScreen`, `setKiosk` or the `fullscreen` and `kiosk` window options.
  - There are four kinds of request: `setFullScreen(true)`, `setKiosk(true)`, the `fullscreen` window option and the `kiosk` window option. The first time the app makes each kind in a process, the shim writes one line to stderr. The line starts with `quiet-electron: ignored` and names the request.
  - `setFullScreen(false)` and `setKiosk(false)` are ignored too, without a line. If a route the shim does not cover put a window in full screen, `setFullScreen(false)` cannot take it out.
  - A test that needs full screen must run with `QUIET_ELECTRON=off`. That test brings the app to the front.
- `BrowserWindow` and `BaseWindow` are proxies of Electron's classes, so `win.constructor === BrowserWindow` is false. `win instanceof BrowserWindow` and `BrowserWindow.getAllWindows()` work as usual.
- Native menus, dialogs, notifications and the tray are not covered. A native dialog can still bring the app forward. So can a menu role such as `togglefullscreen`.
- The clipboard is still shared with you. A test that copies or pastes reads and writes your clipboard.
- An app that sets a window's opacity or mouse handling itself after creating it can undo `hidden` mode for that window.
- The shim loads the same way as Playwright's own loader, with `-r` on the Electron command line. A packaged app whose fuses stop Playwright from launching it stops the shim too.
