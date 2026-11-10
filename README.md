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
bun add -d github:triptu/quiet-electron#v0.1.0
```

Launch the app with `launchQuiet` in place of `_electron.launch`. It takes the same options.

```ts
import { _electron } from '@playwright/test'
import { launchQuiet } from 'quiet-electron'

const app = await launchQuiet(_electron, { args: ['path/to/app'] })
```

Or give this prompt to your coding agent:

```
Add https://github.com/triptu/quiet-electron to my Electron app's Playwright tests. Follow PROMPT.md in that repo.
```

[PROMPT.md](PROMPT.md) also covers launches that pass their own environment and tests that need the app in front, such as full screen. To change the setup later, ask the agent.

[How it works](docs/how-it-works.md) lists the modes, what changes in the app, the Electron versions it needs, and the limits.
