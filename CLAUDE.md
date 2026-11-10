# quiet-electron

A small package that keeps an Electron app in the background on macOS while Playwright tests it. Electron loads `quiet.cjs` (the shim) with `-r` into the app's main process, before the app's code.

## Where things are written down

- `README.md` is the product page for someone deciding whether to use the package.
- `PROMPT.md` tells a coding agent how to add the package to another project.
- `docs/how-it-works.md` is the reference: the modes, what the shim changes, the Electron versions an ESM main needs, and the limits.

Each fact lives in one of these, and the others link to it. A change to what the shim does, to a mode or to a limit updates `docs/how-it-works.md` in the same commit.

## The code

- `quiet.cjs` is the shim. It runs inside the app.
- `index.js` runs in the test process. It exports `launchQuiet`, `quietArgs` and `shimPath`. `index.d.ts` holds their types.
- `modes.cjs` defines what each `QUIET_ELECTRON` value does. Both sides read it: `quietArgs` to decide whether to load the shim, and the shim to decide what to do.

## Tests

```sh
bun install
bun test
```

A test run must never take the user's keyboard or cover their screen.

- Never add a control case that runs the app with the shim off, even to prove that the test app comes forward without it. Run that check by hand, and only when the user asks.
- The `visible` mode case shows windows on the user's screen, so it runs only on request: `QUIET_ELECTRON_TEST_VISIBLE=1 bun test`.

The tests run only on macOS. On other platforms the suite skips, because the shim changes nothing there.

The suite launches through `launchQuiet`, which removes `ELECTRON_RUN_AS_NODE`, so it passes from a shell that exports that variable. If you launch Electron by hand to debug, unset it first.

The tests sample the frontmost app through `lsappinfo` during the whole run and assert that Electron never appears. Activation is asynchronous and can be brief, so window state read at the end would miss it. The test also asserts that samples were taken after the app's attempts, so a sampler that stopped early cannot pass.

### The test app

`test/rude.cjs` is the test app. `test/rude-app` runs it from a CommonJS main. `test/rude-esm-app` runs it from an ESM main. Each main loads Electron as both `electron` and `electron/main`.

The test app:

- creates windows with the default `show: true`;
- calls `win.show()`, `win.focus()`, `win.moveTop()`, `webContents.focus()`, `app.show()` and `app.focus({ steal: true })`;
- creates a window with `kiosk: true` and calls `setFullScreen(true)` on it;
- opens a window from a page through its own open handler, with `window.open` and with a `target=_blank` link that the test clicks;
- opens a window from a page through Electron's default handler;
- opens a modal child of a window;
- builds a window from a subclass that overrides `show()`.

It does not exercise these paths that the shim also covers: `app.hide()`, `app.dock.show()`, `setKiosk(true)`, the `fullscreen` window option, a `BaseWindow` built directly, a window with `show: false`, and an open handler that returns `createWindow`. It does not try the native routes in the [limits](docs/how-it-works.md#limits).

When you add a way for an app to come forward, add the call to `test/rude.cjs`.

## Invariants that are easy to break

[docs/how-it-works.md](docs/how-it-works.md) says what the shim does. These are the reasons behind code that looks like it could be simpler.

- **The window classes are Proxies, not subclasses.** `BrowserWindow.getAllWindows()` filters by constructor name, so a window built through a subclass would be left out. The proxy constructs with Electron's own class as `new.target`, so windows stay plain `BrowserWindow`s. An app's own subclass keeps its `new.target`.
- **New windows show through the shim's own show function.** The code calls `quietShow.call(win)`, never `win.show()`. An app's subclass may override `show()` and use its own fields, which do not exist yet while the base constructor runs.
- **The `fullscreen` and `kiosk` option keys are removed, not set to `false`.** `fullscreen: false` also makes the window unable to enter full screen later. The test checks every window is still `fullScreenable`.
- **Opacity and mouse handling are set in two places.** They are the proxy's constructor and the `browser-window-created` event. The event covers windows Electron builds itself, such as the ones a page opens. The constructor covers `BaseWindow`, which does not fire it.
- **The stderr lines keep their `quiet-electron: ignored` prefix.** `PROMPT.md` and the reference tell readers to look for it, and the test asserts the full lines.

## Working rules

- The package has no build step and no runtime dependencies. Keep it that way.
- Commit in small logical commits with plain messages.
- Docs and comments use plain, short sentences. No metaphors, no em dashes. Describe the current state, not how it got there.

`AGENTS.md` is a symlink to this file. Edit `CLAUDE.md` only.
