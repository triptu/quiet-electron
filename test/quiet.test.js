import { describe, expect, test } from 'bun:test'
import { spawn } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import electronPath from 'electron'
import { _electron } from 'playwright'
import { launchQuiet } from '../index.js'

const here = dirname(fileURLToPath(import.meta.url))
// The same app twice: its main process loads electron with require() and with import.
const rudeApps = { CommonJS: resolve(here, 'rude-app'), ESM: resolve(here, 'rude-esm-app') }
const electronBundle = electronPath.slice(0, electronPath.indexOf('.app/') + '.app'.length)

// Records the frontmost app's bundle path every 50 ms, through LaunchServices.
function sampleFrontmost() {
  const loop = 'while true; do lsappinfo info -only bundlepath "$(lsappinfo front)"; sleep 0.05; done'
  const sampler = spawn('sh', ['-c', loop])
  const samples = []
  sampler.stdout.on('data', (chunk) => {
    for (const line of String(chunk).split('\n')) {
      const path = /"LSBundlePath"="(.*)"/.exec(line)?.[1]
      if (path !== undefined) samples.push(path)
    }
  })
  return {
    count: () => samples.length,
    stop() {
      sampler.kill()
      return samples
    },
  }
}

// The main window, the window its page opens, the one its link opens, the kiosk window,
// the window its page opens through Electron's default handler, and its modal sheet.
const windowCount = 7

async function runRudeApp(mode, main) {
  const sampler = sampleFrontmost()
  const app = await launchQuiet(_electron, { args: [rudeApps[main]], env: { ...process.env, QUIET_ELECTRON: mode } })
  let stderr = ''
  app.process().stderr.on('data', (chunk) => (stderr += chunk))
  try {
    const page = await app.firstWindow()
    await page.locator('#link').click()
    // The app's attempts to come forward run at 800 and 1500 ms.
    while (app.windows().length < windowCount) await app.waitForEvent('window', { timeout: 5000 })
    const beforeWait = sampler.count()
    // Activation is asynchronous: leave time for one to show in the samples.
    await page.waitForTimeout(1000)
    await page.locator('#i').pressSequentially('typed by the test')
    const typed = await page.locator('#o').textContent()
    const shot = await page.screenshot()
    const centre = await app.evaluate(({ nativeImage }, png) => {
      const image = nativeImage.createFromBuffer(Buffer.from(png, 'base64'))
      const { width, height } = image.getSize()
      const bgra = image.toBitmap()
      const at = (Math.floor(height / 2) * width + Math.floor(width / 2)) * 4
      return [bgra[at + 2], bgra[at + 1], bgra[at]]
    }, shot.toString('base64'))
    // BaseWindow, since BrowserWindow.getAllWindows() leaves out subclasses, shim or not.
    const windows = await app.evaluate(({ BaseWindow }) =>
      BaseWindow.getAllWindows().map((w) => ({
        visible: w.isVisible(),
        opacity: w.getOpacity(),
        fullScreen: w.isFullScreen(),
        fullScreenable: w.isFullScreenable(),
      })),
    )
    const sheetsBegun = await app.evaluate(() => globalThis.sheetsBegun ?? 0)
    const frontmost = sampler.stop()
    return { typed, centre, windows, sheetsBegun, stderr, frontmost, afterAttempts: frontmost.length - beforeWait }
  } finally {
    sampler.stop()
    await app.close()
  }
}

describe.skipIf(process.platform !== 'darwin')('on macOS', () => {
  test.each([
    { mode: 'hidden', main: 'CommonJS', opacity: 0 },
    { mode: 'hidden', main: 'ESM', opacity: 0 },
    { mode: 'visible', main: 'CommonJS', opacity: 1 },
  ])('$mode, $main main: the app never comes to the front, and the test still drives and sees it', async ({ mode, main, opacity }) => {
    const run = await runRudeApp(mode, main)
    console.log(`${mode}, ${main}: ${run.frontmost.length} frontmost samples, ${run.afterAttempts} after the attempts`)
    expect(run.afterAttempts).toBeGreaterThanOrEqual(5)
    expect(run.frontmost.filter((path) => path === electronBundle)).toEqual([])
    expect(run.typed).toBe('typed by the test')
    const [red, green, blue] = run.centre
    expect(red).toBeGreaterThan(200)
    expect(Math.max(green, blue)).toBeLessThan(80)
    expect(run.windows).toEqual(Array(windowCount).fill({ visible: true, opacity, fullScreen: false, fullScreenable: true }))
    expect(run.sheetsBegun).toBe(1)
    const notices = run.stderr.split('\n').filter((line) => line.startsWith('quiet-electron:'))
    expect(notices).toEqual([
      'quiet-electron: ignored the kiosk window option, since it would bring the app to the front. Set QUIET_ELECTRON=off to run it.',
      'quiet-electron: ignored setFullScreen(true), since it would bring the app to the front. Set QUIET_ELECTRON=off to run it.',
    ])
  }, 20_000)
})

if (process.platform !== 'darwin') console.warn('Skipping: quiet-electron changes nothing outside macOS, so its tests run only there.')
