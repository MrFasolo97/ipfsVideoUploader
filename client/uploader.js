// Load auth details
let username

let hiveOptions = {
    url: 'https://techcoderx.com',
    useAppbaseApi: true,
    rebranded_api: true,
}

hive.api.setOptions(hiveOptions)

// Setup subtitles tab
const allLangCodes = languages.getAllLanguageCode()
let langOptions = ''
let langNameList = []
for(let i = 0; i < allLangCodes.length; i++) {
    let langName = languages.getLanguageInfo(allLangCodes[i]).name
    langOptions += '<option value="' + langName + '">'
    langNameList.push(langName)
}

let subtitleList = []
try {
    let savedSubtitles = JSON.parse(localStorage.getItem('OneLoveSubtitles'))
    if (savedSubtitles)
        subtitleList = savedSubtitles
} catch {}

// Beneficiaries
let hiveBeneficiaries = new Beneficiaries('Hive')
let steemBeneficiaries = new Beneficiaries('Steem')
let blurtBeneficiaries = new Beneficiaries('Blurt')

// Load Avalon login
let avalonUser = sessionStorage.getItem('avalonUser')
let avalonKey = sessionStorage.getItem('avalonKey')

// Post parameters (videohash, video240, video480 etc)
let postparams = {}
let scheduleDatePicker

// Socket.io connection to server
let uplStat
axios.get('/proxy_server').then((r) => {
    uplStat = io.connect(r.data.server+'/uploadStat')
    uplStat.on('begin',(s) => {
        console.log('begin',s)
        switch (s.step) {
            case 'encode':
                let encodeProgressBars = []
                document.getElementById('uploadProgressFront').innerText = 'Encoding HLS video...'
                for (let r in s.outputs) {
                    // create encoding progress bar elements
                    let back = document.createElement('div')
                    back.setAttribute('class','progressBack')
                    back.setAttribute('id','encodeProgressBack'+s.outputs[r])
                    let front = document.createElement('div')
                    front.setAttribute('class','progressFront')
                    front.setAttribute('id','encodeProgressFront'+s.outputs[r])
                    back.appendChild(front)
                    document.getElementById('encodeProgress').appendChild(document.createElement('br'))
                    document.getElementById('encodeProgress').appendChild(back)

                    // setup progress
                    encodeProgressBars.push('encodeProgressBack'+s.outputs[r])
                    document.getElementById('encodeProgressFront'+s.outputs[r]).innerText = 'Encoding to '+s.outputs[r]+'... (0%)'
                }
                updateDisplayByIDs(encodeProgressBars,[])
                break
            case 'container':
                document.getElementById('encodeProgress').innerHTML = ''
                document.getElementById('uploadProgressFront').innerText = 'Processing output container...'
                break
            case 'ipfsadd':
                document.getElementById('uploadProgressFront').innerText = 'Adding to IPFS...'
                break
            default:
                break
        }
    })
    uplStat.on('progress',(p) => {
        console.log('progress',p)
        switch (p.job) {
            case 'encode':
                document.getElementById('encodeProgressFront'+p.resolution).style.width = p.progress+'%'
                document.getElementById('encodeProgressFront'+p.resolution).innerText = 'Encoding to '+p.resolution+'... ('+Math.round(p.progress)+'%)'
                break
            case 'ipfsadd':
                document.getElementById('uploadProgressFront').innerText = 'Adding to IPFS... ('+p.progress+' of '+p.total+' files)'
                break
            default:
                break
        }
    })
    uplStat.on('error',(e) => {
        console.log('upload processing error',e)
    })
    uplStat.on('result',(r) => {
        if (r.error) return console.log('uplStat Error', r.error)
        switch (r.type) {
            case 'videos':
                let existingDuration = postparams.duration
                postparams = Object.assign(postparams,r)
                // use duration from fake player if possible
                if (existingDuration && typeof existingDuration === 'number')
                    postparams.duration = existingDuration
                break
            case 'video240':
                postparams.ipfs240hash = r.hash
                if (r.skylink) postparams.skylink240 = r.skylink
                break
            case 'video480':
                postparams.ipfs480hash = r.hash
                if (r.skylink) postparams.skylink480 = r.skylink
                break
            case 'video720':
                postparams.ipfs720hash = r.hash
                if (r.skylink) postparams.skylink720 = r.skylink
                break
            case 'video1080':
                postparams.ipfs1080hash = r.hash
                if (r.skylink) postparams.skylink1080 = r.skylink
                break
            case 'hls':
                postparams = Object.assign(postparams,r)
                break
            default:
                return console.log('uplStat Error: missing type in repsonse')
        }
        postVideo()
        console.log(postparams)
    })
}).catch((e) => console.log(e))

// Vars loaded from config
let config;

document.addEventListener('DOMContentLoaded', async () => {
    await Auth.Avalon()
    username = await Auth.Hive()
    loadSelectPlatforms()
    updateSubtitle()
    // Get configuration, then load accounts and authorities
    axios.get('/config').then((result) => {
        config = result.data

        loadPins('videos')

        if (config.disabled) {
            document.getElementById('disabledText').innerText = config.disabledMessage
            document.getElementById('disabledImg').src = 'public/memes/' + config.disabledMeme
            updateDisplayByIDs(['disabledPage'],['uploadForm','modeBtn'])
        }

        // Beneficiaries description text
        let beneficiariesGrapheneList = []
        if (hiveDisplayUser) beneficiariesGrapheneList.push('HIVE')
        if (steemUser) beneficiariesGrapheneList.push('STEEM')
        if (blurtUser) beneficiariesGrapheneList.push('BLURT')
        let beneficiariesGrapheneListText = ''
        if (beneficiariesGrapheneList.length > 2)
            beneficiariesGrapheneListText += beneficiariesGrapheneList.slice(0,-1).join(', ') + ' or ' + beneficiariesGrapheneList[beneficiariesGrapheneList.length-1]
        else
            beneficiariesGrapheneListText = beneficiariesGrapheneList.join(' or ')
        let beneficiariesDescText = 'Add some accounts here to automatically receive a portion of your '+beneficiariesGrapheneListText+' post rewards.'
        if (avalonUser)
            beneficiariesDescText += ' Avalon beneficiaries are set in blockchain config such that @dtube receives 10% of DTUBE curation rewards.'
        document.getElementById('beneficiariesDesc').innerText = beneficiariesDescText

        if (config.olisc)
            updateDisplayByIDs(['schedulepost','scheduledStr'],[])

        // Hide Avalon first curated tag info if not logged in with Avalon
        if (!avalonUser || (!avalonKey && (!avalonKc || !avalonKcUser))) {
            document.getElementById('tagInfo1').style.display = 'none'
        } else {
            javalon.getAccount(avalonUser,(err,acc) => {
                if (err) return
                document.getElementById('dtcBurnInput').placeholder = 'Available: ' + thousandSeperator(acc.balance / 100) + ' DTUBE'
                document.getElementById('avalonvwlabel').innerText = 'Avalon vote weight: 1% (~' + thousandSeperator(Math.floor(0.01 * javalon.votingPower(acc))) + ' VP)'
                window.availableForBurn = acc.balance / 100
                window.availableAvalonBw = acc.bw
                window.availableAvalonVP = acc.vt
                loadAvalonAuthorityStatus(acc)
            })
            if (!hiveDisplayUser) {
                document.getElementById('tagLbl').innerText = 'Tag:'
                document.getElementById('tagInfo1').style.display = 'none'
            }
        }

        if (steemUser && config.steemloginApp) steem.api.getAccounts([steemUser],(e,acc) => {
            if (e) return
            loadGrapheneAuthorityStatus(acc[0],'steem')
            getCommunitySubs(acc[0].name,'steem')
        })
        else
            updateDisplayByIDs([],['beneficiaryHeadingSteem','beneficiaryTableListSteem','totalBeneficiariesLabelSteem','steemCommunity'])

        if (blurtUser && config.blurtApp)
            blurt.api.getAccounts([blurtUser],(e,acc) => {
                if (e) return
                loadGrapheneAuthorityStatus(acc[0],'blurt')
            })
        else
            updateDisplayByIDs([],['beneficiaryHeadingBlurt','beneficiaryTableListBlurt','totalBeneficiariesLabelBlurt'])

        hive.api.setOptions(hiveOptions)
        if (hiveDisplayUser) hive.api.getAccounts([username],(e,acc) => {
            if (e) return
            if (acc.length > 0)
                loadGrapheneAuthorityStatus(acc[0],'hive')
            getCommunitySubs(username,'hive')
        })
    })

    // TODO: Display warning if resumable uploads is unavailable
    if (tus.isSupported) {
        console.log('tus is supported')
    } else {
        console.log('tus is not supported')
    }

    // Scheduled uploads date and time picker
    const oneYear = 31536000000
    const now = Math.ceil(new Date().getTime() / 300000) * 300000
    scheduleDatePicker = flatpickr('#scheduleposttime',{
        enableTime: true,
        dateFormat: 'F j, Y G:i K',
        minDate: new Date(now),
        maxDate: new Date(now+(100*oneYear)),
        minuteIncrement: 5,
        onChange: (selectedTime, dateStr, instance) => {
            let s = new Date(selectedTime[0]).getTime()
            if (!Number.isInteger(s/300000))
                scheduleDatePicker.setDate(Math.ceil(s / 300000) * 300000)
            document.getElementById('scheduledStr').innerText = 'Scheduled to publish at '+new Date(Math.ceil(s / 300000) * 300000).toLocaleString()
        }
    })

    document.getElementById('schedulepostswitch').onchange = () => {
        if (document.getElementById('schedulepostswitch').checked) {
            updateDisplayByIDs(['schedulepostdetails'],[])
            if (scheduleDatePicker.selectedDates.length > 0)
                document.getElementById('scheduledStr').innerText = 'Scheduled to publish at '+new Date(scheduleDatePicker.selectedDates[0]).toLocaleString()
            else
                document.getElementById('scheduledStr').innerText = 'Please select a date and time to schedule'
        } else {
            updateDisplayByIDs([],['schedulepostdetails'])
            document.getElementById('scheduledStr').innerText = 'Publishing immediately'
        }
    }

    document.getElementById('languages').innerHTML = langOptions

    document.getElementById('tabBasics').onclick = () => {
        document.getElementById('advanced').style.display = "none"
        document.getElementById('subtitles').style.display = "none"
        document.getElementById('basics').style.display = "block"
        document.getElementById('tabAdvanced').style.backgroundColor = "transparent"
        document.getElementById('tabSubtitles').style.backgroundColor = "transparent"
        document.getElementById('tabBasics').style.backgroundColor = "#2196F3"
        return true
    }

    document.getElementById('tabAdvanced').onclick = () => {
        document.getElementById('advanced').style.display = "block"
        document.getElementById('subtitles').style.display = "none"
        document.getElementById('basics').style.display = "none"
        document.getElementById('tabAdvanced').style.backgroundColor = "#2196F3"
        document.getElementById('tabSubtitles').style.backgroundColor = "transparent"
        document.getElementById('tabBasics').style.backgroundColor = "transparent"
        return true
    }

    document.getElementById('tabSubtitles').onclick = () => {
        document.getElementById('advanced').style.display = "none"
        document.getElementById('subtitles').style.display = "block"
        document.getElementById('basics').style.display = "none"
        document.getElementById('tabAdvanced').style.backgroundColor = "transparent"
        document.getElementById('tabSubtitles').style.backgroundColor = "#2196F3"
        document.getElementById('tabBasics').style.backgroundColor = "transparent"
        return true
    }

    document.getElementById('tags').onchange = () => document.getElementById('tags').value = document.getElementById('tags').value.toLowerCase()

    document.getElementById('submitbutton').onclick = () => {
        // Validate data entered
        postparams.postBody = document.getElementById('postBody').value
        postparams.description = document.getElementById('description').value
        postparams.powerup = document.getElementById('powerup').checked
        postparams.permlink = generatePermlink()
        if (document.getElementById('customPermlink').value != '') postparams.permlink = document.getElementById('customPermlink').value

        let sourceVideo = document.getElementById('sourcevideo').files
        let snap = document.getElementById('snapfile').files
        let title = document.getElementById('title').value
        if (title.length > 256)
            return alert('Title is too long!')

        let tag = document.getElementById('tags').value
        if (/^[a-z0-9- _]*$/.test(tag) == false)
            return alert('Invalid tags!')

        let tags = tag.split(' ')
        if (tags.length > 8)
            return alert('Please do not use more than 8 tags!')

        // Check for empty fields
        if (sourceVideo.length == 0)
            return alert('Please upload a video!')

        if (snap.length == 0)
            return alert('Please upload a thumbnail for your video!')

        if (title.length == 0)
            return alert('Please enter a title!')
        postparams.title = title

        if (tag.length == 0)
            return alert('Please enter some tags (up to 8) for your video!')
        postparams.tags = tags

        if (document.getElementById('schedulepostswitch').checked) {
            if (scheduleDatePicker.selectedDates.length === 0)
                return alert('Please select a date/time to schedule posting')
            postparams.scheduled = scheduleDatePicker.selectedDates[0].getTime()
        } else
            postparams.scheduled = false

        // Avalon bandwidth check (untested)
        // if (avalonUser && avalonKey && needsBandwidth())
        //     return alert('You need approximately ' + needsBandwidth() + ' additional bytes in your Avalon account to post this video.')

        // Auth.restrict()

        // Upload thumbnail
        let formdata = new FormData()
        formdata.append('image',snap[0])

        let progressbar = document.getElementById('uploadProgressBack')
        let progressbarInner = document.getElementById('uploadProgressFront')
        progressbar.style.display = "block"
        progressbarInner.innerHTML = "Uploading thumbnail... (0%)"

        let contentType = {
            headers: {
                "content-type": "multipart/form-data"
            },
            onUploadProgress: function (progressEvent) {
                console.log(progressEvent)

                let progressPercent = Math.round((progressEvent.loaded / progressEvent.total) * 100)
                updateProgressBar(progressPercent,'Uploading thumbnail...')
            }
        }

        let call = '/uploadImage?type=thumbnails&access_token=' + Auth.token
        if (Auth.iskeychain !== 'true')
            call += '&scauth=true'
        if (document.getElementById('hlsencode').checked)
            call += '&onlyhash=true'
        axios.post(call,formdata,contentType).then(function(response) {
            let uploaderResponse = response.data
            console.log(uploaderResponse)

            if (uploaderResponse.error != null) {
                reenableFields()
                progressbar.style.display = "none"
                return alert(uploaderResponse.error)
            }

            postparams = Object.assign(postparams,uploaderResponse)

            // Upload all videos
            if (document.getElementById('hlsencode').checked)
                uploadVideo(-1,() => console.log('begin encode'),uploaderResponse.fsname)
            else
                uploadVideo(0,() => console.log('all videos uploaded successfully'))
        }).catch((err) => {
            if (err.response && err.response.data && err.response.data.error)
                alert(err.response.data.error)
            else
                alert(err.toString())
            progressbar.style.display = "none"
            reenableFields()
        })
    }

    document.getElementById('avalonvw').oninput = () => {
        let avalonVW = document.getElementById('avalonvw').value
        document.getElementById('avalonvwlabel').innerText = 'Avalon vote weight: ' + avalonVW + '% (~' + thousandSeperator(Math.floor(avalonVW/100 * javalon.votingPower({vt: window.availableAvalonVP, balance: window.availableForBurn * 100}))) + ' VP)'
        if (avalonVW > 30)
            document.getElementById('avalonhighvwalert').style.display = 'block'
        else
            document.getElementById('avalonhighvwalert').style.display = 'none'
    }

    document.getElementById('postImg').onchange = () => {
        let postImg = document.getElementById('postImg').files;
        if (postImg.length == 0) {
            // do not upload if no images are selected
            return;
        }

        let imgFormData = new FormData()
        imgFormData.append('image',postImg[0])

        restrictImg();

        let progressbar = document.getElementById('uploadProgressBack')
        let progressbarInner = document.getElementById('uploadProgressFront')
        progressbar.style.display = "block";
        progressbarInner.innerHTML = "Uploading... (0%)";

        let contentType = {
            headers: {
                "content-type": "multipart/form-data"
            },
            onUploadProgress: function (progressEvent) {
                let progressPercent = Math.round((progressEvent.loaded / progressEvent.total) * 100)
                updateProgressBar(progressPercent);
            }
        }

        let call = '/uploadImage?type=images&access_token=' + Auth.token
        if (Auth.iskeychain !== 'true')
            call += '&scauth=true'
        axios.post(call,imgFormData,contentType).then(function(response) {
            console.log(response);
            progressbar.style.display = "none";
            document.getElementById('postBody').value += ('\n![' + document.getElementById('postImg').value.replace(/.*[\/\\]/, '') + '](https://ipfs.io/ipfs/' + response.data.imghash + ')');
            reenableFieldsImg();
        }).catch(function(err) {
            if (err.response.data.error)
                alert('Upload error: ' + err.response.data.error)
            else
                alert('Upload error: ' + err);
            progressbar.style.display = "none";
            reenableFieldsImg();
        })
    }

    // Subtitles
    let chosenSubtitleContent = ''

    document.getElementById('subtitleUpload').onchange = () => {
        if (document.getElementById('subtitleUpload').files.length == 0) {
            document.getElementById('chooseSubBtn').innerHTML = 'Choose subtitle file'
            chosenSubtitleContent = ''
        } else {
            document.getElementById('chooseSubBtn').innerHTML = 'Change subtitle file'
            let reader = new FileReader()
            reader.onload = (r) => chosenSubtitleContent = r.target.result
            reader.readAsText(document.getElementById('subtitleUpload').files[0])
        }
    }

    document.getElementById('uploadSubBtn').onclick = () => {
        let subtitleFile = document.getElementById('subtitleUpload').files
        let selectedLanguage = document.getElementById('newLanguageField').value

        if (selectedLanguage == '')
            return alert('Please select a language for your subtitle!')
        if (!langNameList.includes(selectedLanguage))
            return alert('Selected language is invalid!')
        if (subtitleFile.length == 0)
            return alert('Please choose a WebVTT subtitle file to upload.')
        
        document.getElementById('newLanguageField').disabled = true
        document.getElementById('chooseSubBtn').disabled = true
        document.getElementById('uploadSubBtn').disabled = true

        const contentType = {
            headers: {
                "content-type": "text/plain"
            }
        }

        let call = '/uploadSubtitle?access_token=' + Auth.token
        if (Auth.iskeychain !== 'true')
            call += '&scauth=true'
        axios.post(call,chosenSubtitleContent,contentType).then((response) => {
            let selectedLangCode = langNameList.indexOf(selectedLanguage)
            subtitleList.push({
                lang: allLangCodes[selectedLangCode],
                hash: response.data.hash
            })
            console.log(subtitleList)

            // Reset fields
            document.getElementById('chooseSubBtn').innerHTML = 'Choose subtitle file'
            document.getElementById('newLanguageField').value = ''
            reenableSubtitleFields()
            updateSubtitle()
        }).catch((err) => {
            reenableSubtitleFields()
            if (err.response.data.error) alert(err.response.data.error)
            else alert(err)
        })

        return true
    }

    document.getElementById('appendBeneficiaryBtn').onclick = () => {
        let account = document.getElementById('newBeneficiaryUser').value
        let percentage = Math.floor(document.getElementById('newBeneficiaryPercent').value * 100)
        let network = document.getElementById('newBeneficiaryNetwork').value
        let nobj = {
            Hive: {
                method: hive.api.getAccounts,
                benef: hiveBeneficiaries,
                cu: hiveDisplayUser
            },
            Steem: {
                method: steem.api.getAccounts,
                benef: hiveBeneficiaries,
                cu: steemUser
            },
            Blurt: {
                method: blurt.api.getAccounts,
                benef: blurtBeneficiaries,
                cu: blurtUser
            }
        }

        for (let n in nobj) if ((network === 'All' || network === n) && nobj[n].cu) nobj[n].method([account],(err,result) => {
            if (err) return alert('Error while validating '+n+' account: ' + err)
            if (result.length === 0) return alert('Beneficiary account specified doesn\'t exist on '+n)

            try {
                nobj[n].benef.addAccount(account,percentage)
            } catch (e) {
                return alert(e)
            }
        })
    }

    // Drafts
    document.getElementById('draftBtn').onclick = () => {
        localStorage.setItem('OneLoveTitle',document.getElementById('title').value)
        localStorage.setItem('OneLoveDescription',document.getElementById('description').value)
        localStorage.setItem('OneLoveTags',document.getElementById('tags').value)
        localStorage.setItem('OneLovePostBody',document.getElementById('postBody').value)
        localStorage.setItem('OneLoveSubtitles',JSON.stringify(subtitleList))
        localStorage.setItem('DraftGraphenePermlink',document.getElementById('customPermlink').value)
        localStorage.setItem('DraftSteemBeneficiaries',JSON.stringify(steemBeneficiaries.accounts))
        localStorage.setItem('DraftHiveBeneficiaries',JSON.stringify(hiveBeneficiaries.accounts))
        localStorage.setItem('DraftBlurtBeneficiaries',JSON.stringify(blurtBeneficiaries.accounts))
        localStorage.setItem('DraftSteemCommunity',document.getElementById('steemCommunitySelect').value)
        localStorage.setItem('DraftHiveCommunity',document.getElementById('hiveCommunitySelect').value)
        localStorage.setItem('DraftPowerUp',document.getElementById('powerup').checked)
        localStorage.setItem('DraftSkynetUpload',document.getElementById('skynetupload').checked)
        alert('Metadata saved as draft!')
    }
})

function sourceVideoSelect() {
    // Retrieve video duration from fake audio player
    let selected = document.getElementById('sourcevideo').files
    if (selected.length < 1) {
        if (postparams.duration)
            delete postparams.duration
        return
    }
    let audioObj = document.createElement('audio')
    audioObj.autoplay = false
    audioObj.addEventListener('canplaythrough',(evt) => postparams.duration = evt.currentTarget.duration)
    let videoObjUrl = URL.createObjectURL(selected[0])
    audioObj.src = videoObjUrl
}

function uploadVideo(resolution,next,thumbnailFname = '') {
    let fInputElemName
    let resolutionFType
    let progressTxt
    switch (resolution) {
        case -1:
            fInputElemName = 'sourcevideo'
            resolutionFType = 'hls'
            progressTxt = 'Uploading video...'
            break
        case 0:
            fInputElemName = 'sourcevideo'
            resolutionFType = 'videos'
            progressTxt = 'Uploading source video...'
            break
        case 1:
            fInputElemName = 'video240p'
            resolutionFType = 'video240'
            progressTxt = 'Uploading 240p video...'
            break
        case 2:
            fInputElemName = 'video480p'
            resolutionFType = 'video480'
            progressTxt = 'Uploading 480p video...'
            break
        case 3:
            fInputElemName = 'video720p'
            resolutionFType = 'video720'
            progressTxt = 'Uploading 720p video...'
            break
        case 4:
            fInputElemName = 'video1080p'
            resolutionFType = 'video1080'
            progressTxt = 'Uploading 1080p video...'
            break
        default:
            return next()
    }

    let videoToUpload = document.getElementById(fInputElemName).files

    if (videoToUpload.length < 1) return uploadVideo(resolution+1,next)

    let progressbar = document.getElementById('uploadProgressBack')
    let progressbarInner = document.getElementById('uploadProgressFront')
    progressbar.style.display = 'block'

    if (config.uploadFromFs && isElectron()) {
        progressbarInner.innerText = 'Submitting upload...'
        return axios.post('/uploadVideoFs'+geturl,{
            type: resolutionFType,
            thumbnailFname: thumbnailFname,
            skynet: document.getElementById('skynetupload').checked ? 'true' : 'false',
            filepath: videoToUpload[0].path
        }).then(result => {
            progressbarInner.innerHTML = "Processing video..."
            uplStat.emit('registerid',{
                id: result.data.id,
                type: resolutionFType,
                access_token: Auth.token,
                keychain: Auth.iskeychain
            })
            if (resolution >= 0)
                uploadVideo(resolution+1,next)
            else
                next()
        }).catch(e => {
            console.log(e)
            alert('Error occured while submitting file')
        })
    }
    progressbarInner.innerHTML = 'Uploading... (0%)'

    let videoUpload = new tus.Upload(videoToUpload[0], {
        endpoint: config.tusdEndpoint,
        retryDelays: [0,3000,5000,10000,20000],
        parallelUploads: parseInt(usersettings.uplThreads) || 10,
        metadata: {
            access_token: Auth.token,
            keychain: Auth.iskeychain,
            type: resolutionFType,
            thumbnailFname: thumbnailFname,
            createSprite: isPlatformSelected['DTube'] ? 'true' : '',
            skynet: document.getElementById('skynetupload').checked ? 'true' : 'false'
        },
        onError: (e) => {
            console.log('tus error',e)
        },
        onProgress: (bu,bt) => {
            let progressPercent = Math.round((bu / bt) * 100)
            updateProgressBar(progressPercent,progressTxt)
            console.log('Progress: ' + progressPercent + '%')
        },
        onSuccess: () => {
            progressbarInner.innerHTML = "Processing video..."

            let url = videoUpload.url.toString().split('/')
            console.log("Upload ID: " + url[url.length - 1]) // ID of upload
            uplStat.emit('registerid',{
                id: url[url.length - 1],
                type: resolutionFType,
                access_token: Auth.token,
                keychain: Auth.iskeychain
            })
            if (resolution >= 0)
                uploadVideo(resolution+1,next)
            else
                next()
        }
    })
    
    videoUpload.findPreviousUploads().then((p) => {
        if (p.length > 0)
            videoUpload.resumeFromPreviousUpload(p[0])
        videoUpload.start()
    })
}

function restrictImg() {
    const toDisable = ['postBody','postImgBtn','draftBtn','submitbutton']
    for (let i = 0; i < toDisable.length; i++) document.getElementById(toDisable[i]).disabled = true
}

function reenableFields() {
    const toEnable = ['sourcevideo','snapfile','title','description','tags','powerup','postBody','postImgBtn','draftBtn','submitbutton','newLanguageField','chooseSubBtn','uploadSubBtn','thumbnailSwapLink','linkSubmitBtn','newSnap','swapSubmitBtn']
    for (let i = 0; i < toEnable.length; i++) document.getElementById(toEnable[i]).disabled = false
}

function reenableFieldsImg() {
    const toEnable = ['postBody','postImgBtn','draftBtn','submitbutton']
    for (let i = 0; i < toEnable.length; i++) document.getElementById(toEnable[i]).disabled = false
}

function reenableSubtitleFields() {
    const toEnable = ['newLanguageField','chooseSubBtn','uploadSubBtn']
    for (let i = 0; i < toEnable.length; i++) document.getElementById(toEnable[i]).disabled = false
}

function postVideo() {
    let requiredFields = ['ipfshash','imghash','duration']
    let encodedVidInputs = ['video240p','video480p','video720p','video1080p']
    let respectiveField = ['ipfs240hash','ipfs480hash','ipfs720hash','ipfs1080hash']

    for (let i = 0; i < encodedVidInputs.length; i++)
        if (document.getElementById(encodedVidInputs[i]).files.length != 0) requiredFields.push(respectiveField[i])

    for (let j = 0; j < requiredFields.length; j++)
        if (!postparams[requiredFields[j]]) return console.log('missing hash, not proceeding with broadcast')

    if (postparams.scheduled)
        document.getElementById('uploadProgressFront').innerHTML = 'Scheduling broadcasts...'

    hiveBroadcast()
}

function hiveKeychainSignBufferPromize(user,message,role) {
    return new Promise((rs) => hive_keychain.requestSignBuffer(user,message,role,rs))
}

// Series broadcast
function hiveBroadcast() {
    let hiveTx = generatePost('hive')
    console.log('Hive tx',hiveTx)
    if (!hiveDisplayUser || supportedPlatforms.hive.filter((p) => isPlatformSelected[p]).length === 0 || config.noBroadcast)
        return hiveCb({})

    if (postparams.scheduled)
        return olisc.new(hiveTx,'hive',postparams.scheduled).then(() => hiveCb({})).catch((e) => hiveCb({error: axiosErrorMessage(e)}))

    document.getElementById('uploadProgressFront').innerHTML = 'Submitting video to Hive...'

    if (Auth.iskeychain == 'true') {
        // Broadcast with Keychain
        if (hiveAuthLogin)
            hiveauth.broadcast(hiveAuthLogin,'posting',hiveTx,() => document.getElementById('uploadProgressFront').innerText = 'Approve Hive transaction in HiveAuth PKSA')
                .then(() => hiveCb({}))
                .catch((e) => {
                    let em = ''
                    if (e.toString() === 'Error: expired')
                        em = 'HiveAuth broadcast request expired'
                    else if (e.cmd === 'sign_nack')
                        em = 'HiveAuth broadcast request rejected'
                    else if (e.cmd === 'sign_err')
                        em = e.error
                    hiveCb({error: em})
                })
        else if (isElectron())
            hive.broadcast.send({ extensions: [], operations: hiveTx },[sessionStorage.getItem('hiveKey')],(e) => hiveCb({error: e}))
        else
            hive_keychain.requestBroadcast(username,hiveTx,'Posting',hiveCb)
    } else {
        let hiveapi = new hivesigner.Client({ 
            accessToken: Auth.token,
            app: config.hivesignerApp,
            callbackURL: window.location.origin + '/upload',
            scope: ['comment','comment_options']
        })
        hiveapi.broadcast(hiveTx,(err) => hiveCb({error: err.error_description}))
    }
}

function hiveCb(r) {
    if (r.error)
        return bcError('Hive broadcast',r.error.toString())

    avalonBroadcast()
}

async function avalonBroadcast() {
    if (!dtcDisplayUser || supportedPlatforms.avalon.filter((p) => isPlatformSelected[p]).length === 0 || config.noBroadcast)
        return avalonCb()

    if (!postparams.scheduled)
        document.getElementById('uploadProgressFront').innerHTML = 'Submitting video to Avalon...'
    let tag = ''
    if (postparams.tags.length !== 0)
        tag = postparams.tags[0]
    
    let avalonGetAccPromise = new Promise((resolve,reject) => {
        javalon.getAccount(avalonUser,(err,user) => {
            if (err) return reject(err)
            resolve(user)
        })
    })

    let burnAmt = document.getElementById('dtcBurnInput').value ? Math.floor(parseFloat(document.getElementById('dtcBurnInput').value) * 100) : 0

    try {
        let avalonAcc = await avalonGetAccPromise
        let tx = {
            type: 4,
            data: {
                link: postparams.ipfshash,
                json: buildJsonMetadataAvalon(),
                vt: Math.floor(javalon.votingPower(avalonAcc)*(document.getElementById('avalonvw').value)/100),
                tag: tag
            },
            sender: avalonAcc.name,
            ts: new Date().getTime()
        }

        if (burnAmt > 0) {
            tx.type = 13
            tx.data.burn = burnAmt
        }
        console.log('Avalon tx',tx)
        if (postparams.scheduled)
            return olisc.new(tx,'avalon',postparams.scheduled).then(() => avalonCb()).catch((e) => avalonCb(axiosErrorMessage(e)))
        let signedtx
        if (avalonKc && avalonKcUser) {
            let stringifiedRawTx = JSON.stringify(tx)
            tx.hash = hivecryptpro.sha256(stringifiedRawTx).toString('hex')
            let hiveKcSign = await hiveKeychainSignBufferPromize(avalonKcUser,stringifiedRawTx,avalonKc)
            if (hiveKcSign.error)
                return avalonCb(hiveKcSign.message)
            tx.signature = [hivecryptpro.Signature.fromString(hiveKcSign.result).toAvalonSignature()]
            signedtx = tx
        } else
            signedtx = javalon.sign(sessionStorage.getItem('avalonKey'),avalonAcc.name,tx)

        javalon.sendRawTransaction(signedtx,(err,result) => {
            if (err)
                avalonCb(err.toString())
            else
                avalonCb()
        })
    } catch (e) {
        avalonCb(e.toString())
    }
}

function avalonCb(e) {
    if (e)
        return bcError('Avalon broadcast',e)

    steemBroadcaster()
}

function steemBroadcaster() {
    if (steemUser && supportedPlatforms.steem.filter((p) => isPlatformSelected[p]).length > 0 && !config.noBroadcast) {
        let steemTx = generatePost('steem')
        console.log('Steem tx',steemTx)
        document.getElementById('uploadProgressFront').innerHTML = 'Submitting video to Steem...'
        if (isElectron())
            steem.broadcast.send({ extensions: [], operations: steemTx },[sessionStorage.getItem('steemKey')],(e) => steemCb({error: e}))
        else
            steem_keychain.requestBroadcast(steemUser,steemTx,'Posting',steemCb)
    } else steemCb({})
}

function steemCb(r) {
    if (r.error)
        return bcError('Steem broadcast',r.error.toString())
    
    blurtBroadcaster()
}

function blurtBroadcaster() {
    if (blurtUser && supportedPlatforms.blurt.filter((p) => isPlatformSelected[p]).length > 0 && !config.noBroadcast) {
        let blurtTx = generatePost('blurt')
        console.log('Blurt tx',blurtTx)
        if (postparams.scheduled)
            return olisc.new(blurtTx,'blurt',postparams.scheduled).then(() => blurtCb({})).catch((e) => blurtCb({error: axiosErrorMessage(e)}))
        document.getElementById('uploadProgressFront').innerHTML = 'Submitting video to Blurt...'
        if (isElectron())
            blurt.broadcast.send({ extensions: [], operations: blurtTx },[sessionStorage.getItem('blurtKey')],(e) => blurtCb({error: e}))
        else
            blurt_keychain.requestBroadcast(blurtUser,blurtTx,'Posting',blurtCb)
    } else blurtCb({})
}

function blurtCb(r) {
    if (r.error)
        return bcError('Blurt broadcast',r.error.toString())
    
    bcFinish()
}

function bcError(tool,e) {
    alert(tool+' error: '+e)
    document.getElementById('uploadProgressBack').style.display = "none"
    reenableFields()
}

function bcFinish() {
    document.getElementById('uploadProgressFront').style.width = '100%'
    document.getElementById('uploadProgressFront').innerHTML = 'All done'
    if (!postparams.scheduled) {
        postpublish()
        updateDisplayByIDs(['postpublish'],['uploadForm','thumbnailSwapper','yourFiles','wcinfo','refiller','getHelp','settings'])
    }
}

function generatePermlink() {
    let permlink = ""
    let possible = "abcdefghijklmnopqrstuvwxyz0123456789"

    for (let i = 0; i < 8; i++) {
        permlink += possible.charAt(Math.floor(Math.random() * possible.length))
    }
    return permlink
}

function postThumbnailByPlatform(network) {
    let pf = pfPostEmbed(network)
    switch (pf) {
        case '3Speak':
            return '<center>[![]('+postparams.imghash+')](https://3speak.tv/watch?v='+usernameByNetwork(network)+'/'+postparams.permlink+')</center><hr>'
        case 'DTube':
            return '<center><a href=\'https://d.tube/#!/v/'+usernameByNetwork(network)+'/'+postparams.permlink+'\'><img src=\'https://ipfs.io/ipfs/'+postparams.imghash+'\'></a></center><hr>'
    }
}

function buildPostBody(network) {
    let result = postThumbnailByPlatform(network)+'\n\n'
    result += postparams.postBody ? postparams.postBody : postparams.description
    result += '\n\n<hr>\n'
    if (isPlatformSelected['3Speak'])
        result += '\n[▶️ 3Speak Dapp](https://3speak.tv/openDapp?uri=hive:'+usernameByNetwork(network)+':'+postparams.permlink+')'
    if (isPlatformSelected['DTube'])
        result += '\n[▶️ DTube](https://d.tube/#!/v/'+usernameByNetwork(network)+'/'+postparams.permlink+')'
    result += '\n[▶️ IPFS](https://ipfs.io/ipfs/'+postparams.ipfshash+')'
    if (postparams.skylink)
        result += '\n[▶️ Skynet](https://siasky.net/'+postparams.skylink+')'
    return result
}

function buildJsonMetadata(network) {
    let jsonMeta = {
        video: {},
        tags: postparams.tags,
        app: 'oneloveipfs/3',
    }

    if (isPlatformSelected.DTube && allowedPlatformNetworks.DTube.includes(network)) {
        let dtubeJson = buildJsonMetadataAvalon()
        for (let k in dtubeJson)
            jsonMeta.video[k] = dtubeJson[k]
        jsonMeta.video.refs = generateRefs(network)
    }

    if (isPlatformSelected['3Speak'] && allowedPlatformNetworks['3Speak'].includes(network)) {
        // Desktop app format
        /*
        jsonMeta.title = postparams.title
        jsonMeta.description = postparams.description
        jsonMeta.sourceMap = [
            ...(postparams.hasThumbnail ? [{
                type: 'thumbnail',
                url: 'ipfs://'+postparams.ipfshash+'/thumbnail.jpg'
            }] : []),
            {
                type: 'video',
                url: 'ipfs://'+postparams.ipfshash+'/default.m3u8',
                format: 'm3u8'
            }
        ]
        jsonMeta.image = ['https://ipfs-3speak.b-cdn.net/ipfs/'+postparams.imghash]
        jsonMeta.filesize = postparams.size
        jsonMeta.created = new Date().toISOString()
        jsonMeta.type = '3speak/video'
        jsonMeta.video.duration = postparams.duration
        jsonMeta.video.info = {
            author: usernameByNetwork(network),
            permlink: postparams.permlink
        }
        */
        // 3speak.tv format
        jsonMeta.type = '3speak/video'
        jsonMeta.image = ['https://ipfs-3speak.b-cdn.net/ipfs/'+postparams.imghash]
        jsonMeta.video.info = {
            author: usernameByNetwork(network),
            permlink: postparams.permlink,
            platform: '3speak',
            title: postparams.title,
            duration: postparams.duration,
            filesize: postparams.size,
            lang: 'en', // todo add lang field
            firstUpload: false,
            ipfs: postparams.ipfshash+'/default.m3u8',
            ipfsThumbnail: postparams.imghash
        }
        jsonMeta.video.content = {
            description: postparams.description,
            tags: postparams.tags
        }
    }

    return jsonMeta
}

function buildJsonMetadataAvalon() {
    let defaultRes = [240,480,720,1080]
    let jsonMeta = {
        files: {
            ipfs: {
                vid: {},
                img: {
                    118: postparams.imghash,
                    360: postparams.imghash,
                    spr: postparams.spritehash
                }
            }
        },
        dur: postparams.duration,
        title: postparams.title,
        desc: postparams.description,
        tag: postparams.tags[0],
        hide: 0,
        nsfw: 0,
        oc: 1,
        refs: generateRefs('avalon')
    }

    if (postparams.type === 'hls') {
        for (let r in postparams.resolutions)
            jsonMeta.files.ipfs.vid[postparams.resolutions[r]] = postparams.ipfshash+'/'+postparams.resolutions[r]+'p/index.m3u8'
        jsonMeta.files.ipfs.vid.src = postparams.ipfshash+'/'+postparams.resolutions[postparams.resolutions.length-1]+'p/index.m3u8'
    } else {
        jsonMeta.files.ipfs.vid.src = postparams.ipfshash
        for (let r in defaultRes)
            if (postparams['ipfs'+defaultRes[r]+'hash'])
                jsonMeta.files.ipfs.vid[defaultRes[r]] = postparams['ipfs'+defaultRes[r]+'hash']
    }

    // Add Skylinks if applicable
    if (postparams.skylink || postparams.skylink240 || postparams.skylink480 || postparams.skylink720 || postparams.skylink1080) {
        jsonMeta.files.sia = {
            vid: {}
        }
        if (postparams.skylink) jsonMeta.files.sia.vid.src = postparams.skylink
        for (let r in defaultRes)
            if (postparams['skylink'+defaultRes[r]])
                jsonMeta.files.sia.vid[defaultRes[r]] = postparams['skylink'+defaultRes[r]]
    }
    if (config.gateway) jsonMeta.files.ipfs.gw = config.gateway 

    if (subtitleList.length > 0) {
        jsonMeta.files.ipfs.sub = {}
        for (let i = 0; i < subtitleList.length; i++) {
            jsonMeta.files.ipfs.sub[subtitleList[i].lang] = subtitleList[i].hash
        }
    }

    return jsonMeta
}

function generateRefs(network) {
    let ref = []
    if (network !== 'avalon' && avalonUser)
        ref.push('dtc/' + avalonUser + '/' + postparams.ipfshash)
    if (network !== 'hive' && hiveDisplayUser)
        ref.push('hive/' + hiveDisplayUser + '/' + postparams.permlink)
    if (network !== 'steem' && steemUser)
        ref.push('steem/' + steemUser + '/' + postparams.permlink)
    if (network !== 'blurt' && blurtUser)
        ref.push('blurt/' + blurtUser + '/' + postparams.permlink)
    return ref
}

function generatePost(network) {
    // Power up all rewards or not
    let rewardPercent = postparams.powerup ? 0 : 10000
    let hmcExclude = false

    // Sort beneficiary list in ascending order
    let sortedBeneficiary = []
    if (network === 'hive')
        sortedBeneficiary = hiveBeneficiaries.sort()
    else if (network === 'steem')
        sortedBeneficiary = steemBeneficiaries.sort()
    else if (network === 'blurt') {
        sortedBeneficiary = blurtBeneficiaries.sort()
        hmcExclude = true
    }
    let user = usernameByNetwork(network)

    let commentOptions = [
        "comment_options", {
            author: user,
            permlink: postparams.permlink,
            max_accepted_payout: '1000000.000 HBD',
            percent_hbd: rewardPercent,
            allow_votes: true,
            allow_curation_rewards: true,
            extensions: []
        }
    ]

    if (sortedBeneficiary.length > 0)
        commentOptions[1].extensions.push([0, {
            beneficiaries: sortedBeneficiary
        }])

    // Create transaction
    let operations = [
        [ 'comment', {
                parent_author: '',
                parent_permlink: !hmcExclude ? document.getElementById(network+'CommunitySelect').value : postparams.tags[0],
                category: !hmcExclude ? document.getElementById(network+'CommunitySelect').value : '',
                author: user,
                permlink: postparams.permlink,
                title: postparams.title,
                body: buildPostBody(network),
                json_metadata: JSON.stringify(buildJsonMetadata(network)),
            }
        ]
    ]

    if (sortedBeneficiary.length > 0 || rewardPercent < 10000) {
        operations.push(commentOptions)
        if (network === 'steem') {
            operations[1][1].max_accepted_payout = '1000000.000 SBD'
            operations[1][1].percent_steem_dollars = rewardPercent
            delete operations[1][1].percent_hbd
        } else if (network === 'blurt') {
            operations[1][1].max_accepted_payout = '1000000.000 BLURT'
            delete operations[1][1].percent_hbd
            delete operations[0][1].category
        }
    }

    if (isPlatformSelected['3Speak'] && allowedPlatformNetworks['3Speak'].includes(network))
        operations.push(['custom_json', {
            required_auths: [],
            required_posting_auths: [user],
            id: '3speak-publish',
            json: JSON.stringify({
                author: user,
                permlink: postparams.permlink,
                category: 'general',
                language: 'en',
                duration: postparams.duration,
                title: postparams.title
            })
        }])

    return operations
}

function updateProgressBar(progress,text) {
    let progressbarInner = document.getElementById('uploadProgressFront')
    progressbarInner.style.width = progress + '%'
    progressbarInner.innerHTML = text + ' (' + progress + '%)'
}

function updateSubtitle() {
    if (subtitleList.length > 0)
        document.getElementById('subtitleHeading').style.display = 'block'
    let subtitleTableList = document.getElementById('subList')
    let subTableHtml = ''
    for (let i = 0; i < subtitleList.length; i++) {
        subTableHtml += '<tr>'
        subTableHtml += '<td class="subListLang">' + languages.getLanguageInfo(subtitleList[i].lang).name + '</td>'
        subTableHtml += '<td class="subListPrev"><a class="roundedBtn subPrevBtn" id="subPrevBtn' + i + '">Preview subtitle</a></td>'
        subTableHtml += '<td class="subListDel"><a class="roundedBtn subDelBtn" id="subDelBtn' + i + '">Remove</a></td>'
        subTableHtml += '</tr>'
    }
    subtitleTableList.innerHTML = subTableHtml

    let allSubtitlePrevBtnElems = document.querySelectorAll('a.subPrevBtn')
    
    for (let i = 0; i < allSubtitlePrevBtnElems.length; i++) {
        document.getElementById(allSubtitlePrevBtnElems[i].id).onclick = () => {
            window.open('https://ipfs.io/ipfs/' + subtitleList[i].hash,'name','width=600,height=400')
        }
    }

    let allSubtitleDelBtnElems = document.querySelectorAll('a.subDelBtn')

    for (let i = 0; i < allSubtitleDelBtnElems.length; i++) {
        document.getElementById(allSubtitleDelBtnElems[i].id).onclick = () => {
            subtitleList.splice(i,1)
            updateSubtitle()
        }
    }
}

function clearDraft() {
    localStorage.setItem('OneLoveTitle','')
    localStorage.setItem('OneLoveDescription','')
    localStorage.setItem('OneLoveTags','')
    localStorage.setItem('OneLovePostBody','')
    localStorage.setItem('OneLoveSubtitles','')
    localStorage.setItem('DraftGraphenePermlink','')
    localStorage.setItem('DraftSteemBeneficiaries','[]')
    localStorage.setItem('DraftHiveBeneficiaries','[]')
    localStorage.setItem('DraftBlurtBeneficiaries','[]')
    localStorage.setItem('DraftSteemCommunity','')
    localStorage.setItem('DraftHiveCommunity','')
    localStorage.setItem('DraftPowerUp','false')
    localStorage.setItem('DraftSkynetUpload','false')
}

function estimatedBandwidth() {
    let bytes = 710 // base tx size including signatures

    // skynet uploads require more bytes for additional skylinks
    let skylinkBytes = 0
    if (document.getElementById('skynetupload').checked)
        skylinkBytes = 70

    // additional encoded versions require +55 bytes/res
    let encodedVidInputs = ['video240p','video480p','video720p','video1080p']
    for (let i = 0; i < encodedVidInputs.length; i++) {
        if (document.getElementById(encodedVidInputs[i]).files.length != 0) {
            bytes += 55
            if (skylinkBytes > 0) skylinkBytes += 55
        }
    }

    bytes += skylinkBytes

    // see which networks we are broadcasting to, assuming we are logged in with Avalon to be relevent
    let hasHive = hiveDisplayUser ? true : false
    let hasSteem = steemUser ? true : false

    bytes += avalonUser.length // base + username length

    // tags
    let tag = document.getElementById('tags').value.split(' ')
    bytes += 2 * (tag[0].length)

    // refs
    if (hasHive)
        bytes += 16 + username.length
    if (hasSteem)
        bytes += 17 + steemUser.length
    if (hasHive && hasSteem)
        bytes += 1

    // other video metadata (e.g. duration, title, description)
    bytes += 11 // duration
    bytes += document.getElementById('title').value.length
    bytes += document.getElementById('description').value.length

    // vp and burn
    bytes += 10 // estimated 10 digit VP to be safe

    let burnAmt = document.getElementById('dtcBurnInput').value ? Math.floor(parseFloat(document.getElementById('dtcBurnInput').value) * 100) : 0
    if (burnAmt != 0)
        bytes += burnAmt.toString().length + 8

    return bytes
}

function needsBandwidth() {
    let currentBw = javalon.bandwidth({ bw: window.availableAvalonBw, balance: availableForBurn * 100 })
    if (currentBw > estimatedBandwidth())
        return false
    else
        return estimatedBandwidth() - currentBw
}

async function getCommunitySubs(acc,network) {
    let communities, node
    switch (network) {
        case 'hive':
            node = 'https://techcoderx.com'
            break
        case 'steem':
            node = 'https://api.steemit.com'
            break
    }
    try {
        communities = await axios.post(node,{
            jsonrpc: '2.0',
            method: 'bridge.list_all_subscriptions',
            params: { account: acc },
            id: 1
        })
    } catch { return }
    let selection = document.getElementById(network+'CommunitySelect')
    for (let i = 0; i < communities.data.result.length; i++) if (communities.data.result[i][0] !== 'hive-134220') {
        let newoption = document.createElement('option')
        newoption.text = communities.data.result[i][1] + ' (' + communities.data.result[i][0] + ')'
        newoption.value = communities.data.result[i][0]
        selection.appendChild(newoption)
    }
    let savedCommunity = localStorage.getItem('Draft' + capitalizeFirstLetter(network) + 'Community')
    if (savedCommunity)
        document.getElementById(network+'CommunitySelect').value = savedCommunity
}