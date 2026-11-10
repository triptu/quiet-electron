# Add quiet-electron to an Electron project

You are adding `quiet-electron` to a project whose Playwright tests launch an Electron app. When you finish, a test run on macOS never brings the app to the front, and every test still passes with its assertions unchanged.

[docs/how-it-works.md](docs/how-it-works.md) says what the package changes in the app, which modes it has and what it cannot do. Read it before you start.

## 1. Check that it fits

1. The tests must launch the app with Playwright's `_electron.launch`. If they launch Electron another way, stop and tell the user.
2. If the app's main process loads Electron with `import`, check the project's Electron version against [ESM mains](docs/how-it-works.md#esm-mains). If it is too old, tell the user before you go on.

## 2. Install

Install it as a dev dependency, pinned to the release, with the package manager the project already uses:

```sh
bun add -d github:triptu/quiet-electron#v0.1.0
npm install -D github:triptu/quiet-electron#v0.1.0
pnpm add -D github:triptu/quiet-electron#v0.1.0
yarn add -D quiet-electron@github:triptu/quiet-electron#v0.1.0
```

## 3. Find every launch

Search the whole repository for `_electron` and for `.launch(`. Launches are usually in a fixture or a launch helper, but check scripts, global setup and each test file too. Change all of them. One launch left unchanged still takes the keyboard.

## 4. Change each launch

When the call passes its options straight to `_electron.launch`, replace it with `launchQuiet`. It takes the same options and returns the same value.

```ts
import { _electron } from '@playwright/test'
import { launchQuiet } from 'quiet-electron'

const app = await launchQuiet(_electron, { args: ['path/to/app'] })
```

`launchQuiet` puts the shim's arguments before yours and removes `ELECTRON_RUN_AS_NODE` from the environment. Electron cannot launch an app with that variable set, and editors and agent tools built on Electron often export it.

When the project builds the launch itself and you cannot swap the call, add `quietArgs(env)` to the start of `args`, before the app path, and remove `ELECTRON_RUN_AS_NODE` yourself:

```ts
import { _electron } from '@playwright/test'
import { quietArgs } from 'quiet-electron'

const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE
const app = await _electron.launch({ args: [...quietArgs(env), 'path/to/app'], env })
```

Rules for both forms:

- Pass `quietArgs` the same `env` object the app is launched with. `quietArgs()` with no argument reads `process.env`.
- Do not set `QUIET_ELECTRON` in the shared launch code. The developer sets it when they run the tests.
- Do not add a platform check. On Linux and Windows `quietArgs` returns `[]` and `launchQuiet` adds nothing.

## 5. Tests that need the app in front

Some tests cannot pass while the app stays in the background. Look for tests that:

- enter full screen or kiosk mode;
- assert on `win.isFocused()`, `BrowserWindow.getFocusedWindow()` or the app's focus and blur events;
- depend on anything else in [Limits](docs/how-it-works.md#limits).

Launch only those tests with the mode off:

```ts
const app = await launchQuiet(_electron, { args: ['path/to/app'], env: { ...process.env, QUIET_ELECTRON: 'off' } })
```

Such a test takes the keyboard while it runs on a Mac. Prefer to run it by default only off the Mac, and on the Mac only when the developer asks:

```ts
const foreground = process.platform !== 'darwin' || process.env.RUN_FOREGROUND_TESTS === '1'
test.skip(!foreground, 'brings the app to the front on macOS; set RUN_FOREGROUND_TESTS=1 to run it here')
```

Use this skip only when the project runs the same tests on Linux or Windows, such as in CI. If the Mac is the only place they run, keep them running there with the mode off, and tell the user which tests they are.

## 6. Verify on a Mac

If you are not on macOS, say so in your report. Do not claim the change is verified.

1. Start a sampler that records the frontmost app while the suite runs:

   ```sh
   while true; do lsappinfo info -only bundlepath "$(lsappinfo front)"; sleep 0.05; done > /tmp/quiet-electron-frontmost.log
   ```

2. Run the full Electron suite in the default mode, then stop the sampler.
3. Check the log. No line may name the Electron app under test (the `.app` bundle the tests launch, for a dev build usually `node_modules/electron/dist/Electron.app`). Ignore lines from tests you launched with the mode off.
4. Every test that passed before must pass now.

## 7. When a test fails

1. Read the app's stderr for lines that start with `quiet-electron: ignored`. Each one names a full screen or kiosk request the shim skipped. A test that depends on that request belongs in step 5.
2. Compare what the test expects with [Limits](docs/how-it-works.md#limits). If it needs the app in front, handle it as in step 5.
3. If the test fails for another reason, run it once with `QUIET_ELECTRON=off`. If it fails there too, quiet-electron did not cause the failure. Leave it and report it.
4. Never loosen or delete an assertion, skip a test outright, or add a retry to make a test pass. If steps 1 to 3 do not explain a failure, stop and report the test, its error and what you tried.

## 8. Report

Tell the user:

- which launch calls you changed;
- which tests launch with the mode off, and how to run them on a Mac;
- the result of the check in step 6, or that it was not run;
- that `QUIET_ELECTRON=visible` shows the windows during a run and `QUIET_ELECTRON=off` runs the app unchanged.
