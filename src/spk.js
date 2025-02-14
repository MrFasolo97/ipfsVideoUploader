// Helper file for communicating with 3Speak APIs
import fs from 'node:fs'
import axios from 'axios'
const tus = await import('tus-js-client')
const SPK_API_URL = 'https://studio.3speak.tv'
const SPK_UPLOAD_URL = 'https://uploads.3speak.tv/files'
const SPK_GATEWAY = 'https://ipfs-3speak.b-cdn.net'
const SPK_GATEWAY_TIMEOUT = 10000

const spk = {
    auth: async (username) => {
        try {
            let r = await axios.get(SPK_API_URL+'/mobile/login?username='+username)
            if (r.data && r.data.error)
                return { error: r.data.error }
            else if (r.data && !r.data.memo)
                return { error: 'No memo to decode?!' }
            return { memo: r.data.memo }
        } catch (e) {
            return { error: e.toString() }
        }
    },
    cookie: async (username, token) => {
        try {
            let r = await axios.get(SPK_API_URL+'/mobile/login?username='+username+'&access_token='+token)
            if (r.data && r.data.error)
                return { error: r.data.error }
            return { cookie: r.headers['set-cookie'] }
        } catch (e) {
            return { error: e.toString() }
        }
    },
    listUploads: async (cookie) => {
        try {
            let r = await axios.get(SPK_API_URL+'/mobile/api/my-videos',{ headers: { Cookie: cookie }})
            if (!Array.isArray(r.data) || (r.data && r.data.error))
                return { error: r.data.error }
            return { uploads: r.data }
        } catch (e) {
            return { error: e.toString() }
        }
    },
    upload: (cookie, path, onError, onProgress, cb) => {
        let upload = new tus.Upload(fs.createReadStream(path), {
            endpoint: SPK_UPLOAD_URL,
            retryDelays: [0,3000,5000,10000,20000],
            parallelUploads: 10,
            headers: {
                Cookie: cookie
            },
            onError: onError,
            onProgress: onProgress,
            onSuccess: () => {
                let url = upload.url.toString().split('/')
                cb(url[url.length - 1])
            }
        })
        upload.findPreviousUploads().then(p => {
            if (p.length > 0)
                upload.resumeFromPreviousUpload(p[0])
            upload.start()
        })
    },
    finalizeUpload: (cookie, hiveUser, videoId, thumbnailId, videoFname, size, duration, cb) => {
        axios.post(SPK_API_URL+'/mobile/api/upload_info',{
            filename: videoId,
            oFilename: videoFname,
            size: size,
            duration: duration,
            thumbnail: thumbnailId,
            owner: hiveUser
        }, { headers: {
            'Cookie': cookie,
            'Content-Type': 'application/json'
        }})
        .then(r => cb(null,r))
        .catch(e => cb(e.toString()))
    },
    updateInfo: async (cookie, id, title, desc, tags, nsfw = false, thumbnail = '') => {
        if (Array.isArray(tags))
            tags = tags.join(',')
        let r 
        try {
            let newDetails = {
                videoId: id,
                title: title,
                description: desc,
                tags: tags,
                isNsfwContent: nsfw
            }
            if (thumbnail)
                newDetails.thumbnail = thumbnail
            r = (await axios.post(SPK_API_URL+'/mobile/api/update_info',newDetails, { headers: {
                'Cookie': cookie,
                'Content-Type': 'application/json'
            }})).data
        } catch (e) {
            if (e.response && e.response.data)
                return e.response.data
            else
                return {error: e.toString()}
        }
        return r
    },
    finalizePublish: async (cookie, id) => {
        let r 
        try {
            r = (await axios.post(SPK_API_URL+'/mobile/api/my-videos/iPublished',{ videoId: id }, { headers: {
                'Cookie': cookie,
                'Content-Type': 'application/json'
            }})).data
        } catch (e) {
            if (e.response && e.response.data)
                return e.response.data
            else
                return {error: e.toString()}
        }
        return r
    },
    tusError: (e) => {
        console.log('tus error',e)
        try {
            let errorres = JSON.parse(e.originalResponse._xhr.responseText)
            if (errorres.error)
                return errorres.error
            else
                return e.originalResponse._xhr.responseText
        } catch {
            return 'Unknown Tus error'
        }
    },
    retrieveIPFS: async (hash) => {
        hash = parseIPFSHash(hash)
        if ( hash == null ) {
            return 400; // Bad Request
        } else {
            try {
                let gwFileInfo = await axios.head(SPK_GATEWAY+'/ipfs/'+hash,{
                    timeout: SPK_GATEWAY_TIMEOUT,
                    decompress: false
                })
                return gwFileInfo.status
            } catch (e) {
                if (e.response && typeof e.response.status === 'number')
                    return e.response.status
                return 404
            }
        }
    }
}

const parseIPFSHash = (hash) => {
    let ID = null;
    try {
        let IDTemp = CID.parse(hash)
        ID = IDTemp.toString();
    } catch (e) {
        console.log(e.toString())
    }
    return ID
}

export default spk