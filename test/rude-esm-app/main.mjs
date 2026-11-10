import { app, BrowserWindow } from 'electron'
import { BrowserWindow as MainBrowserWindow } from 'electron/main'
import behaveRudely from '../rude.cjs'

behaveRudely({ app, BrowserWindow, MainBrowserWindow })
