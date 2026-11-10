// Run by quiet.test.js in Node with NODE_OPTIONS="--require register.cjs". It launches the
// test app the way a project that never installed quiet-electron does, then through
// launchQuiet, and prints what each app saw.
import { _electron } from 'playwright'
import { launchQuiet } from '../index.js'

const [appPath, shimPath] = process.argv.slice(2)
const launches = { plain: (options) => _electron.launch(options), launchQuiet: (options) => launchQuiet(_electron, options) }
const result = {}
for (const [name, launch] of Object.entries(launches)) {
  const app = await launch({ args: [appPath] })
  try {
    const page = await app.firstWindow()
    // The app's attempts to come forward run at 800 and 1500 ms.
    await page.waitForTimeout(2500)
    result[name] = await app.evaluate(({ BaseWindow }, shim) => ({
      opacities: BaseWindow.getAllWindows().map((w) => w.getOpacity()),
      shimInArgv: process.argv.includes(shim),
    }), shimPath)
  } finally {
    await app.close()
  }
}
console.log(JSON.stringify(result))
