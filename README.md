# quiet-electron

Keeps an Electron app in the background on macOS while Playwright tests it, so you can keep typing in other apps.

## Why

On macOS, an Electron app that Playwright launches becomes the active app and puts its windows in front of yours. Each test launches the app again, so during a run your typing keeps landing in the test app.

## What you get

- The app does not become the active app when it launches, shows a window or asks for focus, and its windows do not take focus. A native dialog or a menu command can still bring it forward, as the [limits](docs/how-it-works.md#limits) say.
- By default its windows are invisible and clicks pass through them.
- Playwright still types, clicks and takes screenshots.
- `QUIET_ELECTRON=visible` leaves the windows visible so you can watch a run and keep your keyboard. `QUIET_ELECTRON=off` runs the app unchanged.
- On Linux and Windows it does nothing, so the same launch code runs in CI.

## Getting started

```sh
bun add -d github:triptu/quiet-electron#v0.2.0
```

Launch the app with `launchQuiet` in place of `_electron.launch`. It takes the same options.

```ts
import { _electron } from '@playwright/test'
import { launchQuiet } from 'quiet-electron'

const app = await launchQuiet(_electron, { args: ['path/to/app'] })
```

### Without adding it to the project

To keep a project's repository unchanged, for example a team repository, load the package into your own shell instead. Clone it once:

```sh
git clone --branch v0.2.0 https://github.com/triptu/quiet-electron ~/.quiet-electron
```

Then add this to `~/.zshenv`, which every shell reads, including the ones coding agents start:

```sh
if [ -f ~/.quiet-electron/register.cjs ]; then
  case "$NODE_OPTIONS" in
    *quiet-electron/register.cjs*) ;;
    *) export NODE_OPTIONS="${NODE_OPTIONS:+$NODE_OPTIONS }--require $HOME/.quiet-electron/register.cjs" ;;
  esac
fi
```

Every Playwright test that launches an Electron app on this Mac then keeps it in the background, in any project, with no change to its code. It works for test runners on Node, such as `playwright test`. [How it works](docs/how-it-works.md#without-adding-it-to-the-project) has the details.

### With a coding agent

Give this prompt to your coding agent:

```
Add https://github.com/triptu/quiet-electron to my Electron app's Playwright tests. Follow PROMPT.md in that repo.
```

[PROMPT.md](PROMPT.md) also covers launches that pass their own environment and tests that need the app in front, such as full screen. To change the setup later, ask the agent.

[How it works](docs/how-it-works.md) lists the modes, what changes in the app, the Electron versions it needs, and the limits.
