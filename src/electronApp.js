const axios = require('axios')
const { app, shell, ipcMain, dialog, BrowserWindow, Notification, Menu } = require('electron')
const aboutWindow = require('about-window').default
const fs = require('fs')
const spk = require('./spk')
const selfEncoder = require('./selfEncoderJob')
const selfEncoderUpload = require('./selfEncoderUpload')
const config = require('./config')
const package = require('../package.json')
const isMac = process.platform === 'darwin'
const BUILD_STR = config.Build.number.toString()

if (require('electron-squirrel-startup')) {
    app.quit()
    process.exit(0)
}

let errored = false
let errorHandler = () => {}
const errorAlert = (message) => {
    dialog.showMessageBoxSync(null,{
        type: 'error',
        title: 'Error',
        message: message
    })
    app.quit()
}

process.on('uncaughtException',(error) => {
    errored = true
    if (error.code === 'EADDRINUSE')
        errorHandler = () => errorAlert('Port ' + error.port + ' is in use. Perhaps you have another instance running?')
    else
        errorHandler = () => errorAlert(error.toString())
    if (app.isReady())
        errorHandler()
})

if (!config.isRemoteApp) {
    require('./index')
    AuthManager = require('./authManager')
} else
    require('./remoteAppUser')

let mainWindow

const getIcon = () => {
    switch (process.platform) {
        case 'darwin':
            return __dirname + '/../public/macos_icon.icns'
        case 'win32':
            return __dirname + '/../public/win32_icon.ico'
        default:
            return __dirname + '/../public/favicon.png'
    }
}

const openAboutWindow = () => aboutWindow({
    product_name: package.productName,
    description: package.description,
    license: package.license,
    use_version_info: true,
    icon_path: 'file://'+__dirname+'/../public/macos_icon.png',
    copyright: 'Copyright (C) 2023 TechCoderX. Build: ' + BUILD_STR
})

const switchAppType = (type = 0) => {
    fs.writeFileSync(config.dataDir+'/db/app_type',type.toString())
    app.relaunch()
    app.exit()
}

const menuTemplate = [
    ...(isMac ? [{
        label: app.name,
        submenu: [
            { label: 'About OneLoveIPFS', click: openAboutWindow },
            { type: 'separator' },
            { role: 'hide' },
            { role: 'hideothers' },
            { role: 'unhide' },
            { type: 'separator' },
            { role: 'quit' }
        ]
    }] : []), {
        label: 'Uploader',
        submenu: [...(!isMac ? [{
            label: 'About',
            click: openAboutWindow
        }] : []),...(!config.isRemoteApp ? [{ 
            label: 'Reset Auth Keys',
            click: async () => {
                let resetAuthAlert = await dialog.showMessageBox(null,{
                    type: 'info',
                    buttons: ['Proceed','Cancel'],
                    title: 'Reset Auth Keys',
                    message: 'This will reset the keys used for authentication. The app will be relaunched.'
                })
                if (resetAuthAlert.response === 0 && !config.isRemoteApp) {
                    AuthManager.refreshKeys()
                    app.relaunch()
                    app.exit()
                }
            }
        }] : []), {
            label: 'Switch to '+(config.isRemoteApp?'local':'remote')+' environment',
            click: async () => {
                let content = config.isRemoteApp ? 0 : 1
                let switchEnvAlert = await dialog.showMessageBox(null,{
                    type: 'info',
                    buttons: ['Proceed','Cancel'],
                    title: 'Switch to '+(config.isRemoteApp?'local':'remote')+' environment',
                    message: 'The app will be relaunched.'
                })
                if (switchEnvAlert.response === 0)
                    switchAppType(content)
            }
        }, {
            label: 'Configuration Guide',
            click: () => shell.openExternal('https://github.com/oneloveipfs/ipfsVideoUploader/blob/master/docs/ConfigDocs.md')
        }]
    }, {
        label: 'Edit',
        submenu: [
            { role: 'undo' },
            { role: 'redo' },
            { type: 'separator' },
            { role: 'cut' },
            { role: 'copy' },
            { role: 'paste' },
            { role: 'delete' },
            { role: 'selectAll' },
            ...(isMac ? [
                { type: 'separator' },
                { label: 'Speech', submenu: [{ role: 'startSpeaking' }, { role: 'stopSpeaking' }] }
            ] : [])
        ]
    }, {
        label: 'View',
        submenu: [
            { role: 'reload' },
            { role: 'forceReload' },
            { role: 'toggleDevTools' },
            { type: 'separator' },
            { role: 'resetZoom' },
            { role: 'zoomIn' },
            { role: 'zoomOut' },
            { type: 'separator' },
            { role: 'togglefullscreen' }
        ]
    }, {
        label: 'Window',
        submenu: [
            { role: 'minimize' },
            { role: 'zoom' },
            ...(isMac ? [
                { type: 'separator' },
                { role: 'front' },
                { type: 'separator' },
                { role: 'window' }
            ] : [{ role: 'close' }])
        ]
    }, {
        role: 'help',
        submenu: [
            // { label: 'Learn More', click: () => shell.openExternal('https://oneloveipfs.com') },
            // { label: 'Documentation', click: () => shell.openExternal('https://docs.oneloveipfs.com') },
            { label: 'Report An Issue', click: () => shell.openExternal('https://github.com/MrFasolo97/ipfsVideoUploader/issues') },
            { label: 'OneLoveIPFS Discord Server', click: () => shell.openExternal('https://discord.gg/QsBnrwqsSV') },
            // { label: 'OneLoveIPFS Matrix Space', click: () => shell.openExternal('https://matrix.to/#/#oneloveipfs:privex.io') },
            { type: 'separator' },
            { label: 'Source Code', click: () => shell.openExternal('https://github.com/MrFasolo97/ipfsVideoUploader') },
            { label: 'View License', click: () => shell.openExternal('https://github.com/MrFasolo97/ipfsVideoUploader/blob/master/LICENSE') }
        ]
    }
]

const createWindow = () => {
    if (errored) return errorHandler()
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 700,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: __dirname + '/electronPreload.js'
        },
        icon: getIcon()
    })

    let menu = Menu.buildFromTemplate(menuTemplate)
    Menu.setApplicationMenu(menu)

    mainWindow.loadURL(`http://localhost:${config.HTTP_PORT}`)
    mainWindow.on('closed', () => mainWindow = null)
}

app.on('ready', createWindow)
app.on('resize', (e, x, y) => mainWindow.setSize(x, y))
app.on('window-all-closed', () => {
    if (!isMac)
        app.quit()
})

app.on('activate', () => {
    if (mainWindow === null)
        createWindow()
})

ipcMain.on('switch_app_type',() => switchAppType(config.isRemoteApp ? 0 : 1))
ipcMain.on('open_browser_window',(evt,arg) => shell.openExternal(arg))
ipcMain.on('spk_auth', async (evt,arg) => evt.sender.send('spk_auth_result', await spk.auth(arg)))
ipcMain.on('spk_cookie', async (evt,arg) => evt.sender.send('spk_cookie_result', await spk.cookie(arg.user, arg.token)))
ipcMain.on('spk_list_uploads', async (evt,arg) => evt.sender.send('spk_list_uploads_result', await spk.listUploads(arg)))
ipcMain.on('spk_update_info', async (evt,arg) => evt.sender.send('spk_update_info_result', await spk.updateInfo(arg.cookie,arg.id,arg.title,arg.desc,arg.tags,arg.nsfw,arg.thumbnail)))
ipcMain.on('spk_finalize_publish', async (evt,arg) => evt.sender.send('spk_finalize_publish_result', await spk.finalizePublish(arg.cookie,arg.id)))
ipcMain.on('spk_upload', (evt,arg) => {
    spk.upload(
        arg.cookie,
        arg.videoPath,
        (e) => evt.sender.send('spk_video_upload_error', spk.tusError(e)),
        (bu,bt) => evt.sender.send('spk_video_upload_progress', Math.round((bu / bt) * 100)),
        (vid) => spk.upload(
            arg.cookie,
            arg.thumbnailPath,
            (e) => evt.sender.send('spk_thumbnail_upload_error', spk.tusError(e)),
            (bu,bt) => evt.sender.send('spk_thumbnail_upload_progress', Math.round((bu / bt) * 100)),
            (tid) => spk.finalizeUpload(arg.cookie,arg.user,vid,tid,arg.videoFname,arg.size,arg.duration,(e,r) => {
                if (e || !r.data)
                    evt.sender.send('spk_upload_error',e)
                else
                    evt.sender.send('spk_upload_result',r.data)
            })
        )
    )
})
ipcMain.on('spk_thumbnail_upload', (evt,arg) => {
    spk.upload(
        arg.cookie,
        arg.thumbnailPath,
        (e) => evt.sender.send('spk_thumbnail_upload_error', spk.tusError(e)),
        (bu,bt) => evt.sender.send('spk_thumbnail_upload_progress', Math.round((bu / bt) * 100)),
        (tid) => evt.sender.send('spk_thumbnail_upload_result',tid)
    )
})
ipcMain.on('self_encode', (evt,arg) => selfEncoder(arg.id,arg.path,(heading,resp) => evt.sender.send(heading,resp)))
ipcMain.on('self_encode_upload', (evt,arg) => selfEncoderUpload(arg.encodeId,arg.uploadId,arg.token,arg.outputs,arg.threads,arg.endpoint,(heading,resp) => evt.sender.send(heading,resp)))

// Submit upload directly from filesystem
ipcMain.on('fs_upload', async (evt,arg) => {
    if (config.isRemoteApp)
        return evt.sender.send('fs_upload_error',{error: 'Fs upload is not supported in remote app build'})
    // requiring file uploader module here to avoid redundant dependencies in remote app build
    const fileUploader = require('./ipfsUploadHandler')
    if (!fs.existsSync(arg.filepath))
        return evt.sender.send('fs_upload_error',{error: 'File not found in filesystem'})
    if (config.enforceIPFSOnline && await fileUploader.isIPFSOnline() === false)
        return evt.sender.send('fs_upload_error',{error: 'IPFS daemon is offline'})
    let randomID = fileUploader.IPSync.randomID()
    fileUploader.uploadFromFs(arg.type,arg.filepath,randomID,arg.user,arg.network,arg.skynet,() => fileUploader.writeUploadRegister())
    evt.sender.send('fs_upload_result',{id: randomID})
})

// Update check
axios.get('https://uploader.oneloveipfs.com/latest_build').then((build) => {
    if (config.Build.number < build.data.number) {
        let updateNotify = new Notification({
            title: 'An update is available',
            body: 'The latest version is ' + build.data.version + ' (build ' + build.data.number + '). Click here to download.',
            urgency: 'normal'
        })
        updateNotify.on('click',() => shell.openExternal(build.data.link))
        updateNotify.show()
    }
}).catch(() => {})