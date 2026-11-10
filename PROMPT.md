# Add quiet-electron to an Electron project

You are adding `quiet-electron` to a project whose Playwright tests launch an Electron app. When you finish, a test run on macOS keeps the app in the background, except for the tests you list in step 6. Every test that passed before still passes, with its assertions unchanged.

[docs/how-it-works.md](docs/how-it-works.md) says what the package changes in the app, which modes it has and what it cannot do. Read it before you start.

## 1. Check that it fits

1. The tests must launch the app with Playwright's `_electron.launch`. If they launch Electron another way, stop and tell the user.
2. Read the installed Electron version from `node_modules/electron/package.json`. Check it against both floors in [Electron versions](docs/how-it-works.md#electron-versions):
   - every app needs the minimum version;
   - an app whose main process loads Electron with `import` needs the higher ESM version.

   If the version is too old for the app, stop and tell the user. Do not install.

## 2. Record a baseline

Before you change anything, run the full Electron suite as it is. Write down each test that passes, each that fails and each that is skipped. On a Mac this run still brings the app to the front.

If a test fails, run it again. A test that passes on some runs and fails on others is flaky. Write that down too.

## 3. Install

Install it as a dev dependency, pinned to the release, with the package manager the project already uses:

```sh
bun add -d github:triptu/quiet-electron#v0.1.0
npm install -D github:triptu/quiet-electron#v0.1.0
pnpm add -D github:triptu/quiet-electron#v0.1.0
yarn add -D quiet-electron@github:triptu/quiet-electron#v0.1.0
```

## 4. Find every launch

Search the whole repository for `_electron` and for `.launch(`. Launches are usually in a fixture or a launch helper, but check scripts, global setup and each test file too. Change all of them. One launch left unchanged still takes the keyboard.

## 5. Change each launch

When the call passes its options straight to `_electron.launch`, replace it with `launchQuiet`. It takes the same options and returns the same value.

```ts
import { _electron } from '@playwright/test'
import { launchQuiet } from 'quiet-electron'

const app = await launchQuiet(_electron, { args: ['path/to/app'] })
```

`launchQuiet` puts the shim's arguments before yours and removes `ELECTRON_RUN_AS_NODE` from the environment. Electron cannot launch an app with that variable set, and editors and agent tools built on Electron often export it.

When the project builds the launch itself and you cannot swap the call, add `quietArgs(env)` to the start of `args`, before the app path:

```ts
import { _electron } from '@playwright/test'
import { quietArgs } from 'quiet-electron'

// `projectEnv` is the env this launch already passes. Use `process.env` if it passes none.
const env = { ...projectEnv }
delete env.ELECTRON_RUN_AS_NODE
if (env.QUIET_ELECTRON === undefined && process.env.QUIET_ELECTRON !== undefined) {
  env.QUIET_ELECTRON = process.env.QUIET_ELECTRON
}
const app = await _electron.launch({ args: [...quietArgs(env), 'path/to/app'], env })
```

The environment, for both forms:

- Keep the env the launch already passes. Do not replace it with `{ ...process.env }`. A project that builds its own env often leaves variables out on purpose.
- The developer picks the mode by setting `QUIET_ELECTRON` in the shell, so it must reach the app. `launchQuiet` does this itself: when `options.env` has no `QUIET_ELECTRON`, it takes the one from `process.env`. With `quietArgs`, copy it as in the example. An env built from scratch does not have it.
- With `quietArgs`, remove `ELECTRON_RUN_AS_NODE` from the env yourself, and pass the same `env` object to `quietArgs(env)` and to the launch. `quietArgs` reads only the env it is given, and `quietArgs()` with no argument reads `process.env`.

Other rules:

- Do not write a fixed `QUIET_ELECTRON` value into the shared launch code. Only the tests in step 6 set one.
- Do not add a platform check. On Linux and Windows `quietArgs` returns `[]` and `launchQuiet` adds nothing.

## 6. Tests that need the app in front

Some tests cannot pass while the app stays in the background. Look for tests that:

- enter full screen or kiosk mode;
- assert on `win.isFocused()`, `BrowserWindow.getFocusedWindow()` or the app's focus and blur events;
- depend on anything else in [Limits](docs/how-it-works.md#limits).

Launch only those tests with the mode off. Add `QUIET_ELECTRON: 'off'` to the env the launch already passes. A value in `options.env` wins over the shell's.

```ts
const app = await launchQuiet(_electron, { args: ['path/to/app'], env: { ...projectEnv, QUIET_ELECTRON: 'off' } })
```

Such a test takes the keyboard while it runs on a Mac. Prefer to run it by default only off the Mac, and on the Mac only when the developer asks:

```ts
const foreground = process.platform !== 'darwin' || process.env.RUN_FOREGROUND_TESTS === '1'
test.skip(!foreground, 'brings the app to the front on macOS; set RUN_FOREGROUND_TESTS=1 to run it here')
```

Use this skip only when the project runs the same tests on Linux or Windows, such as in CI. If the Mac is the only place they run, keep them running there with the mode off, and tell the user which tests they are.

## 7. Verify on a Mac

If you are not on macOS, say so in your report. Do not claim the change is verified.

Run the tests from step 6 separately from the rest. The sampler check covers only the run where every launch is quiet.

1. Start a sampler that records the time and the frontmost app:

   ```sh
   while true; do echo "$(date +%s) $(lsappinfo info -only bundlepath "$(lsappinfo front)")"; sleep 0.05; done > /tmp/quiet-electron-frontmost.log
   ```

   A valid sample is a line that holds `"LSBundlePath"="`, with a path after it.

2. Note the time (`date +%s`). Run the Electron suite in the default mode, without the tests from step 6. Leave them skipped, or filter them out with the test runner. Note the time again, wait a second, then stop the sampler.
3. Check that the log covers the run. An empty or broken log proves nothing, so the check fails unless all of these hold:
   - the first valid sample is from before the suite started, and the last from after it ended;
   - at least 5 valid samples fall between the two times you noted. The package's own test requires 5 after its app tries to come forward;
   - no two valid samples in a row are more than 2 seconds apart.

   If one does not hold, fix the sampler and run again.
4. No valid sample may name the Electron app under test. That is the `.app` bundle the tests launch, for a dev build usually `node_modules/electron/dist/Electron.app`.
5. Run the tests from step 6 in a run of their own, without the sampler. On a Mac that uses the skip, set `RUN_FOREGROUND_TESTS=1`. This run brings the app to the front.
6. Across both runs, every test that passed in the baseline must pass.

## 8. When a test fails

1. Read the app's stderr for lines that start with `quiet-electron: ignored`. Each one names a full screen or kiosk request the shim skipped. A test that depends on that request belongs in step 6.
2. Compare what the test expects with [Limits](docs/how-it-works.md#limits). If it needs the app in front, handle it as in step 6.
3. If the test fails for another reason, compare it with the baseline from step 2.
   - A test that failed in the baseline was failing before your change. Leave it and report it.
   - For a test that passed in the baseline, run it several times each way: in the default mode, with `QUIET_ELECTRON=off`, and with the original launch code. One run proves nothing when a test is flaky.
   - If it fails only in the default mode, quiet-electron causes the failure. Report the test and its error.
   - If it fails with `QUIET_ELECTRON=off` and passes with the original launch, your change to the launch causes it. Check the env and the order of `args`.
   - If it fails about as often with the original launch, it is flaky. Leave it and report it.
4. Never loosen or delete an assertion, skip a test outright, or add a retry to make a test pass. If steps 1 to 3 do not explain a failure, stop and report the test, its error and what you tried.

## 9. Report

Tell the user:

- which launch calls you changed;
- which tests launch with the mode off, and how to run them on a Mac;
- the result of the checks in step 7, with the number of valid samples, or that they were not run;
- any test whose result differs from the baseline, and any test that was already failing or flaky;
- that `QUIET_ELECTRON=visible` shows the windows during a run and `QUIET_ELECTRON=off` runs the app unchanged.
