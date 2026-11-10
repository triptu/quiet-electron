# quiet-electron

Run an Electron app under Playwright on macOS without it taking your keyboard. The app never becomes the active app, its windows never become key, and by default they are invisible and let clicks pass through. You can keep typing in other apps while the tests run.

On Linux and Windows it does nothing.

## Why Electron tests steal focus on macOS

On macOS, keyboard input goes to the active app. Several Electron calls make an app active:

- `win.show()`, and a window created with the default `show: true`, activate the app and make the window key.
- `win.focus()` and `webContents.focus()` do the same.
- `app.focus()` and `app.show()` activate the app.
- `win.setFullScreen(true)` and kiosk mode move the window to its own Space, and macOS switches to it.

Most apps make some of these calls at startup. Each test launches the app again, so during a run your typing keeps landing in the test app.

Playwright does not need the app to be active. It sends input through the DevTools protocol and emulates page focus, so typing, clicking and screenshots work on a window that is in the background.

## Install

```sh
bun add -d github:triptu/quiet-electron
```

## Use

With Playwright's Electron launcher:

```ts
import { _electron } from 'playwright'
import { launchQuiet } from 'quiet-electron'

const app = await launchQuiet(_electron, { args: ['path/to/app'] })
```

`launchQuiet` takes the same options as `_electron.launch`. It adds the shim's arguments before yours and removes `ELECTRON_RUN_AS_NODE` from the environment, since Electron cannot launch an app with it set.

If you build the launch yourself, put `quietArgs()` before the app path:

```ts
import { quietArgs } from 'quiet-electron'

const app = await _electron.launch({ args: [...quietArgs(env), 'path/to/app'], env })
```

`quietArgs(env)` returns `['-r', shimPath]` on macOS and `[]` elsewhere or when the mode is `off`. The shim reads `QUIET_ELECTRON` in the app's process, so if you pass your own `env`, pass the one the app runs with.

## Requirements

An app whose main process loads Electron with `require('electron')` works with any Electron version. An app whose main process uses `import ... from 'electron'` needs Electron 37 or later, or at least 36.2.0 on Electron 36, or 35.4.0 on Electron 35. The shim covers `import` through `module.registerHooks`, which Node added in 22.15.0 and 23.5.0, and those are the first Electron releases that ship Node 22.15.0. On an older Electron the shim still loads, but an `import` of `electron` gets the plain module and the app can come to the front.

## Modes

Set `QUIET_ELECTRON` when you run the tests.

| Mode | Activates the app | Window opacity | Mouse |
| --- | --- | --- | --- |
| `hidden` (default) | never | 0 | passes through to what is behind |
| `visible` | never | as the app sets it | normal |
| `off` | as the app does | as the app sets it | normal |

Use `visible` to watch a run without losing your keyboard. Use `off` to run the app exactly as it is. Any other value is an error.

## What the shim changes

The shim is `quiet.cjs`, loaded with `-r` in the main process before the app's code. It acts only in the main process on macOS. It:

- sets the activation policy to `accessory`, so the app has no Dock icon and is not in Cmd-Tab;
- makes `win.show()` call `showInactive()`, except for a modal child, which shows as a sheet and does not activate the app;
- creates every `BaseWindow` and `BrowserWindow` hidden and then calls `win.show()`, so a window created with `show: true` does not activate the app and a modal child still becomes a sheet;
- creates the windows a page opens, through `window.open` or a link with `target=_blank`, hidden and then shows them the same way. It wraps each `webContents.setWindowOpenHandler`, and sets one that allows when the app sets none, which is what Electron does without a handler. A handler that denies still denies, and its `overrideBrowserWindowOptions` are kept except for `show`, `fullscreen` and `kiosk`. A handler that returns `createWindow` builds the window itself, through the classes above;
- removes `fullscreen` and `kiosk` from window options;
- makes `win.focus()`, `win.moveTop()`, `win.setFullScreen()`, `win.setKiosk()`, `webContents.focus()`, `app.focus()`, `app.show()`, `app.hide()` and `app.dock.show()` do nothing;
- in `hidden` mode, sets each window's opacity to 0 and makes it ignore the mouse;
- removes its own `-r <shim>` from `process.argv`.

It replaces the window classes the app gets from `electron`, `electron/main`, `electron/common`, `electron/renderer` and `electron/utility`, which in the main process are all the same module, through both `require` and `import`.

Windows stay visible to the system, so the page keeps drawing frames and `page.screenshot()` captures it.

## Limits

- In the main process, `win.isFocused()` is false and `BrowserWindow.getFocusedWindow()` is null. Code that behaves differently when the app is in front takes its background path.
- Full screen and kiosk mode never turn on. The first time in a process that the app makes each kind of request, through `setFullScreen(true)`, `setKiosk(true)`, or the `fullscreen` or `kiosk` window option, the shim writes a line to stderr naming what it ignored. A test that needs full screen must run with `QUIET_ELECTRON=off`, and that test then brings the app to the front.
- `BrowserWindow` and `BaseWindow` are proxies of Electron's classes, so `win.constructor === BrowserWindow` is false. `win instanceof BrowserWindow` and `BrowserWindow.getAllWindows()` work as usual.
- Native menus, dialogs, notifications and the tray are not covered. A native dialog or a menu role such as `togglefullscreen` can still bring the app forward.
- The clipboard is still shared with you. A test that copies or pastes reads and writes your clipboard.
- An app that sets a window's opacity or mouse handling itself after creating it can undo `hidden` mode for that window.
- The shim loads the same way as Playwright's own loader, with `-r` on the Electron command line. A packaged app whose fuses stop Playwright from launching it stops the shim too.

## Tests

```sh
bun install
bun test
```

The tests run only on macOS. They launch an app that makes every call above, with a CommonJS main and with an ESM main, each loading Electron both as `electron` and as `electron/main`. Its pages open windows through the app's handler, through a link with `target=_blank` and through Electron's default handler, and it opens a modal child with the default `show: true`. The tests sample the frontmost app every 50 ms and check that the test app is never frontmost, that typed text reaches its input, that its screenshot shows the page, that every window has the mode's opacity and can still enter full screen, that the modal child became a sheet, and that the shim reports the full screen and kiosk requests it ignored.
