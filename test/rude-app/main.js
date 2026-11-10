const { app, BrowserWindow } = require('electron')
const { BrowserWindow: MainBrowserWindow } = require('electron/main')
require('../rude.cjs')({ app, BrowserWindow, MainBrowserWindow })
