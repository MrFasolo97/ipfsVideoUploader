import async from 'async'
import encoder from 'encoderHelpers'
import * as fs from 'node:fs'
import config from './config'
const defaultDir = process.env.ONELOVEIPFS_DATA_DIR || (await import('os')).homedir() + '/.oneloveipfs'

module.exports = async (jobid,filepath,evt) => {
    // usually done in remote app build
    // we expect this not to be called if disabled
    if (config.Encoder.outputs.length === 0)
        return evt('self_encode_error',{ id: jobid, error: 'no outputs to encode to' })

    let width, height, duration, orientation
    try {
        let ffprobeDetails = await encoder.getFFprobeVideo(filepath)
        width = ffprobeDetails.width
        height = ffprobeDetails.height
        duration = ffprobeDetails.duration
        orientation = ffprobeDetails.orientation
    } catch (e) {
        return evt('self_encode_error',{ id: jobid, error: 'failed to ffprobe video info' })
    }
    if (!width || !height || !duration || !orientation)
        return evt('self_encode_error',{ id: jobid, error: 'failed to ffprobe video info' })

    let outputResolutions = encoder.determineOutputs(width,height,config.Encoder.outputs)

    try {
        // Overwrite if exists
        if (fs.existsSync(defaultDir+'/'+jobid))
            fs.unlinkSync(defaultDir+'/'+jobid)

        // Create folders
        fs.mkdirSync(defaultDir+'/'+jobid,{ recursive: true })
        for (let r in outputResolutions)
            fs.mkdirSync(defaultDir+'/'+jobid+'/'+outputResolutions[r]+'p')
    } catch (e) {
        return evt('self_encode_error',{ id: jobid, error: e.toString() })
    }

    const ops = encoder.hlsEncode(
        jobid,filepath,
        orientation,
        config.Encoder.encoder,
        config.Encoder.quality,
        outputResolutions,
        false,
        defaultDir+'/'+jobid,
        config.Encoder.threads,
        (id, resolution, p) => {
            evt('self_encode_progress',{
                id: id,
                job: 'encode',
                resolution: resolution,
                frames: p.frames,
                fps: p.currentFps,
                progress: p.percent
            })
            console.log('ID '+id+' - '+resolution+'p --- Frames: '+p.frames+'   FPS: '+p.currentFps+'   Progress: '+p.percent.toFixed(3)+'%')
        },
        (id, resolution, e) => {
            console.error(id+' - '+resolution+'p --- Error',e)
            evt('self_encode_error',{ id: id, error: resolution + 'p resolution encoding failed' })
        })
    evt('self_encode_step',{
        id: jobid,
        step: 'encode',
        outputs: outputResolutions
    })
    async.parallel(ops,() => {
        // post processing
        let total = 0
        for (let o in outputResolutions)
            total += fs.readdirSync(defaultDir+'/'+jobid+'/'+outputResolutions[o]+'p').length
        evt('self_encode_step',{
            id: jobid,
            step: 'encodecomplete',
            outputs: outputResolutions,
            totalFiles: total,
            duration: duration
        })
        // register self encode upload in renderer
    })
}