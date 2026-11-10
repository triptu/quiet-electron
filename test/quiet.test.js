import { describe, expect, test } from 'bun:test'
import { spawn } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import electronPath from 'electron'
import { _electron } from 'playwright'
import { launchQuiet } from '../index.js'

const rudeApp = resolve(dirname(fileURLToPath(import.meta.url)), 'rude-app')
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
    stop() {
      sampler.kill()
      return samples
    },
  }
}

async function runRudeApp(mode) {
  const sampler = sampleFrontmost()
  const app = await launchQuiet(_electron, { args: [rudeApp], env: { ...process.env, QUIET_ELECTRON: mode } })
  try {
    const page = await app.firstWindow()
    // The app's attempts to come forward run at 800 and 1500 ms.
    while (app.windows().length < 2) await app.waitForEvent('window', { timeout: 5000 })
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
    const windows = await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().map((w) => ({ visible: w.isVisible(), opacity: w.getOpacity() })),
    )
    return { typed, centre, windows, frontmost: sampler.stop() }
  } finally {
    sampler.stop()
    await app.close()
  }
}

describe.skipIf(process.platform !== 'darwin')('on macOS', () => {
  test('hidden: the app never comes to the front, and the test still drives and sees it', async () => {
    const run = await runRudeApp('hidden')
    expect(run.frontmost.length).toBeGreaterThan(40)
    expect(run.frontmost.filter((path) => path === electronBundle)).toEqual([])
    expect(run.typed).toBe('typed by the test')
    const [red, green, blue] = run.centre
    expect(red).toBeGreaterThan(200)
    expect(Math.max(green, blue)).toBeLessThan(80)
    expect(run.windows).toEqual([
      { visible: true, opacity: 0 },
      { visible: true, opacity: 0 },
    ])
  }, 20_000)

  test('visible: the app never comes to the front, and its windows can be seen', async () => {
    const run = await runRudeApp('visible')
    expect(run.frontmost.length).toBeGreaterThan(40)
    expect(run.frontmost.filter((path) => path === electronBundle)).toEqual([])
    expect(run.typed).toBe('typed by the test')
    expect(run.windows).toEqual([
      { visible: true, opacity: 1 },
      { visible: true, opacity: 1 },
    ])
  }, 20_000)
})

if (process.platform !== 'darwin') console.warn('Skipping: quiet-electron changes nothing outside macOS, so its tests run only there.')
