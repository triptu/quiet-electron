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

- The tests run only on macOS. On other platforms the suite skips, because the shim changes nothing there.
- `QUIET_ELECTRON_TEST_VISIBLE=1 bun test` adds a `visible` mode case. Its windows sit on top of the other apps while it runs, so it runs only on request.
- The suite launches through `launchQuiet`, which removes `ELECTRON_RUN_AS_NODE`, so it passes from a shell that exports that variable. If you launch Electron by hand to debug, unset it first.
- `test/rude.cjs` is the test app. It makes every call that brings an app forward on macOS: it shows, focuses and raises windows, focuses the app, asks for kiosk mode and full screen, opens windows from pages three ways (through its own open handler, a `target=_blank` link and Electron's default handler), opens a modal child, and builds a window from a subclass that overrides `show()`. `test/rude-app` runs it from a CommonJS main and `test/rude-esm-app` from an ESM main. Each loads Electron both as `electron` and as `electron/main`.
- The tests sample the frontmost app through `lsappinfo` during the whole run and assert that Electron never appears. Activation is asynchronous and can be brief, so window state read at the end would miss it. The test also asserts that samples were taken after the app's attempts, so a sampler that stopped early cannot pass.
- When you add a way for an app to come forward, add the call to `test/rude.cjs`.

A test run must never take the user's keyboard or cover their screen. Never add a control case that runs the app with the shim off, even to prove that the test app does come forward without it. Run that check by hand, and only when the user asks.

## Design facts that are easy to break

- **The window classes are Proxies, not subclasses.** `BrowserWindow.getAllWindows()` filters by constructor name, so a window built through a subclass would be left out. The proxy constructs with Electron's own class as `new.target`, so windows stay plain `BrowserWindow`s. An app's own subclass keeps its `new.target`.
- **New windows show through the shim's own show function.** The code calls `quietShow.call(win)`, never `win.show()`. An app's subclass may override `show()` and use its own fields, which do not exist yet while the base constructor runs.
- **The `fullscreen` and `kiosk` option keys are removed, not set to `false`.** `fullscreen: false` also makes the window unable to enter full screen later. The test checks every window is still `fullScreenable`.
- **A modal child with a parent shows natively.** It becomes a sheet, which does not activate the app.
- **CommonJS goes through `Module._load`, ESM through `Module.registerHooks`.** An `import` of `electron` does not pass through `Module._load`, and Electron's exports cannot be redefined, so the hook resolves the specifier to a module that re-exports the proxy. `require()` from ESM still goes through `Module._load`. On a Node without `registerHooks` the shim skips the hook and does not fail.
- **Every Electron specifier is replaced.** They are `electron`, `electron/main` and the rest listed in `quiet.cjs`. In the main process they are the same module, and an app can get its window class from any of them.
- **The shim acts only in the main process on macOS.** Only that process has windows and an activation policy. Renderer and utility processes, and a process under `ELECTRON_RUN_AS_NODE`, are left alone.
- **The shim removes its own `-r <path>` from `process.argv`.** It does this before anything else. Electron leaves it there, and an app that reads its arguments would take the shim's path for its own.
- **Opacity and mouse handling are set in two places.** They are the proxy's constructor and the `browser-window-created` event. The event covers windows Electron builds itself, such as the ones a page opens. The constructor covers `BaseWindow`, which does not fire it.
- **The shim reports ignored full screen and kiosk requests on stderr.** It writes one line per kind of request. The test asserts the exact lines. Without them a test that expects full screen fails with no hint why.

## Working rules

- The package has no build step and no runtime dependencies. Keep it that way.
- Commit in small logical commits with plain messages.
- Docs and comments use plain, short sentences. No metaphors, no em dashes. Describe the current state, not how it got there.

`AGENTS.md` is a symlink to this file. Edit `CLAUDE.md` only.
