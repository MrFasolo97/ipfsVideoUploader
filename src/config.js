const REMOTE_APP = 0
const fs = require('fs')
const shell = require('shelljs')
const deepmerge = require('deepmerge')
const userconfigdir = (process.env.ONELOVEIPFS_DATA_DIR || require('os').homedir() + '/.oneloveipfs') + '/config.json'
let defaultConfig = require('../config.json')
if (REMOTE_APP === 1)
    defaultConfig = require('../remoteAppConfig.json')
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
if (process.platform == 'win32' && REMOTE_APP === 0 || require('electron').app) {
    defaultConfig.spritesEnabled = false
    defaultConfig.durationAPIEnabled = false
}

// authIdentifier must not contain colons
if (defaultConfig.ClientConfig.authIdentifier.includes(':')) {
    console.log('removing all colons from authIdentifier')
    defaultConfig.ClientConfig.authIdentifier = defaultConfig.ClientConfig.authIdentifier.replace(/:/g,'')
}

// check olisc installation if enabled
if (defaultConfig.Olisc.enabled) {
    try {
        require.resolve('olisc')
    } catch {
        console.log('Olisc is not installed but enabled in config, disabling it now')
        defaultConfig.Olisc.enabled = false
    }
}

if (defaultConfig.Encoder.outputs.length > 0) {
    const whichFfmpeg = shell.which('ffmpeg').toString()
    const whichFfprobe = shell.which('ffprobe').toString()
    if ((!whichFfmpeg || !whichFfprobe) && (!defaultConfig.Encoder.ffmpegPath || !defaultConfig.Encoder.ffprobePath)) {
        console.log('cound not find ffmpeg/ffprobe, disabling internal video encoder')
        defaultConfig.Encoder.outputs = []
    } else {
        if (!defaultConfig.Encoder.ffmpegPath)
            defaultConfig.Encoder.ffmpegPath = whichFfmpeg
        if (!defaultConfig.Encoder.ffprobePath)
            defaultConfig.Encoder.ffprobePath = whichFfprobe
    }
}

module.exports = defaultConfig