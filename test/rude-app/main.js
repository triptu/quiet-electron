// Does everything an app can do to come to the front on macOS.
const { app, BrowserWindow } = require('electron')

app.whenReady().then(() => {
  const win = new BrowserWindow({ width: 600, height: 400 })
  win.loadURL('data:text/html,<body style="background:%23e33"><input id=i autofocus><p id=o></p><script>i.oninput=()=>o.textContent=i.value</script></body>')
  setTimeout(() => {
    win.show()
    win.focus()
    win.moveTop()
    win.webContents.focus()
    app.show()
    app.focus({ steal: true })
  }, 800)
  setTimeout(() => {
    const second = new BrowserWindow({ width: 300, height: 200, kiosk: true })
    second.loadURL('data:text/html,second')
    second.focus()
    second.setFullScreen(true)
  }, 1500)
})
