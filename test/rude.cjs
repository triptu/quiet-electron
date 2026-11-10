// Does everything an app can do to come to the front on macOS. Each main passes in what it
// loaded from 'electron' and 'electron/main', with require() or with import.
module.exports = function behaveRudely({ app, BrowserWindow, MainBrowserWindow }) {
  app.whenReady().then(() => {
    const win = new BrowserWindow({ width: 600, height: 400 })
    win.webContents.setWindowOpenHandler(() => ({ action: 'allow', overrideBrowserWindowOptions: { width: 320, height: 200 } }))
    win.loadURL('data:text/html,<body style="background:%23e33"><input id=i autofocus><p id=o></p><a id=link href="about:blank" target=_blank>link</a><script>i.oninput=()=>o.textContent=i.value</script></body>')
    setTimeout(() => {
      win.show()
      win.focus()
      win.moveTop()
      win.webContents.focus()
      app.show()
      app.focus({ steal: true })
      win.webContents.executeJavaScript("window.open('about:blank', '_blank')", true)
    }, 800)
    setTimeout(() => {
      // This window's page opens one through Electron's default handler.
      const second = new MainBrowserWindow({ width: 300, height: 200, kiosk: true })
      second.on('sheet-begin', () => (globalThis.sheetsBegun = (globalThis.sheetsBegun ?? 0) + 1))
      second.loadURL('data:text/html,second')
      second.focus()
      second.setFullScreen(true)
      second.webContents.executeJavaScript("window.open('about:blank', '_blank')", true)
      const sheet = new MainBrowserWindow({ parent: second, modal: true, width: 200, height: 100 })
      sheet.loadURL('data:text/html,sheet')
    }, 1500)
  })
}
