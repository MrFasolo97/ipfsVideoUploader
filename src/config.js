import fs from 'node:fs'
import deepmerge from 'deepmerge'
const defaultFfmpegPath = (await import('ffmpeg-static')).default.replace('app.asar','app.asar.unpacked')
const defaultFfprobePath = (await import('ffprobe-static')).default.path.replace('app.asar','app.asar.unpacked')
const dataDir = (process.env.ONELOVEIPFS_DATA_DIR || (await import('os')).homedir() + '/.oneloveipfs')
const userconfigdir = dataDir+'/config.json'
let isRemoteApp = fs.existsSync(dataDir+'/db/app_type') ? fs.readFileSync(dataDir+'/db/app_type','utf-8').trim() === '1' : false
let configPath = null;
if (fs.existsSync('./config.json')) {
    configPath = './config.json'
} else if (configPath == null && fs.existsSync('../ipfsVideoUploader/config.json')) {
    configPath = '../ipfsVideoUploader/config.json'
}

if (configPath == null && fs.existsSync('./config_example.json')) {
    configPath = './config_example.json'
} else if (configPath == null && fs.existsSync('../ipfsVideoUploader/config_example.json')) {
    configPath = '../ipfsVideoUploader/config_example.json'
}


try {
    defaultConfig = await JSON.parse(fs.readFileSync(configPath));
} catch {
    // using example config
}
let userConfig = {}

if (fs.existsSync(userconfigdir)) {
    let readConfig = fs.readFileSync(userconfigdir,'utf8')
    try {
        userConfig = JSON.parse(readConfig)
        defaultConfig = deepmerge(defaultConfig,userConfig)
    } catch (error) {
        console.log('failed to parse user defined config.json, using default config instead')
    }
}

// Sprite generation script and video duration is not supported on Windows
// Also disabled on Electron apps for security reasons :\
let hasElectron = false
try {
    require('electron')
} catch {
    // electron not installed, skip
}
if ((process.platform == 'win32' && !isRemoteApp) || (hasElectron && require('electron').app)) {
    defaultConfig.spritesEnabled = false
    defaultConfig.durationAPIEnabled = false
}

// authIdentifier must not contain colons
if (!isRemoteApp && defaultConfig.ClientConfig.authIdentifier.includes(':')) {
    console.log('removing all colons from authIdentifier')
    defaultConfig.ClientConfig.authIdentifier = defaultConfig.ClientConfig.authIdentifier.replace(/:/g,'')
}

// check olisc installation if enabled
if (!isRemoteApp && defaultConfig.Olisc.enabled) {
    try {
        require.resolve('olisc')
    } catch {
        console.log('Olisc is not installed but enabled in config, disabling it now')
        defaultConfig.Olisc.enabled = false
    }
}

if (!defaultConfig.Encoder.ffmpegPath)
    defaultConfig.Encoder.ffmpegPath = defaultFfmpegPath
if (!defaultConfig.Encoder.ffprobePath)
    defaultConfig.Encoder.ffprobePath = defaultFfprobePath

if (defaultConfig.Encoder.outputs.length > 0) {
    if (defaultConfig.Encoder.encoder !== 'libx264' && defaultConfig.Encoder.encoder !== 'libx265' && defaultConfig.Encoder.threads) {
        console.log('Ignoring thread count for non-CPU encoders')
        defaultConfig.Encoder.threads = 0
    }
}

defaultConfig.isRemoteApp = isRemoteApp
defaultConfig.dataDir = dataDir

export default defaultConfig