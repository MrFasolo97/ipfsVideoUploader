// Flat file JSON database manager
import fs from 'node:fs'
import * as config from './config.js'
const dir = process.env.ONELOVEIPFS_DATA_DIR || (await import('os')).homedir() + '/.oneloveipfs'
const dbDir = dir+'/db'

// Create files if not exist already
const setupDb = (db) => {
    if (!fs.existsSync(dbDir)) {
        if (!fs.existsSync(dir))
            fs.mkdirSync(dir)
        fs.mkdirSync(dbDir)
    } 
    try {
        fs.openSync(dbDir+'/'+db+'.json','r')
    } catch (error) {
        fs.writeFileSync(dbDir+'/'+db+'.json','{}')
    }
}
setupDb('userinfo')
setupDb('hashInfo')
setupDb('hashes')
setupDb('skylinks')

// Cache JSON data into variables
let userInfo = JSON.parse(fs.readFileSync(dbDir+'/userinfo.json','utf8'))
let hashInfo = JSON.parse(fs.readFileSync(dbDir+'/hashInfo.json','utf8'))
let hashes = JSON.parse(fs.readFileSync(dbDir+'/hashes.json','utf8'))
let skylinks = JSON.parse(fs.readFileSync(dbDir+'/skylinks.json','utf8'))

let possibleTypes = ['videos','thumbnails','sprites','images','video240','video480','video720','video1080','subtitles','streams','chunks','hls']

let db = {
    // Check if user exist in hashes db
    userExistInHashesDB: (username,network) => {
        let fullusername = db.toFullUsername(username,network,true)
        if (!hashes.hasOwnProperty(fullusername))
            return false
        else
            return true
    },
    getPossibleTypes: () => {
        return possibleTypes
    },
    allUsersCount: () => {
        return Object.keys(hashes).length
    },
    // User info (aliases, user settings etc.)
    setUserAlias: (mainUser,mainNetwork,aliasUser,aliasNetwork) => {
        if (aliasUser === '__proto__' || aliasUser === 'constructor' || aliasUser === 'prototype') {
            throw 'Invalid _aliasUser_ value!'
        }
        let fullMain = db.toFullUsername(mainUser,mainNetwork)
        let fullAlias = db.toFullUsername(aliasUser,aliasNetwork)
        if (userInfo[fullMain] && userInfo[fullMain].aliasOf)
            throw 'Cannot set user alias to a main account that is aliased to another user'
        if (!userInfo[fullAlias]) userInfo[fullAlias] = {}
        userInfo[fullAlias].aliasOf = fullMain
    },
    unsetUserAlias: (mainUser,mainNetwork,aliasUser,aliasNetwork) => {
        let fullMain = db.toFullUsername(mainUser,mainNetwork)
        let fullAlias = db.toFullUsername(aliasUser,aliasNetwork)
        if (userInfo[fullAlias] && userInfo[fullAlias].aliasOf) {
            if (userInfo[fullAlias].aliasOf === fullMain)
                delete userInfo[fullAlias].aliasOf
            else
                throw 'Cannot unset user alias of another main account'
        } else
            throw 'Aliased user to delete does not exist'
    },
    getAliasOf: (username,network) => {
        let fullusername = db.toFullUsername(username,network)
        if (!userInfo[fullusername] || !userInfo[fullusername].aliasOf)
            return null
        else
            return userInfo[fullusername].aliasOf
    },
    getAliasedUsers: (mainUser,mainNetwork) => {
        let fullusername = db.toFullUsername(mainUser,mainNetwork)
        let result = []
        if (userInfo[fullusername] && userInfo[fullusername].aliasOf)
            return result
        for (let i in userInfo)
            if (userInfo[i].aliasOf === fullusername)
                result.push({username: db.toUsername(i), network: db.toNetwork(i)})
        return result
    },
    recordHash: (username,network,type,hash,size,discount) => {
        if (!hash && !size) return false
        let fullusername = db.toFullUsername(username,network,true)
        if (!hashes[fullusername]) {
            hashes[fullusername] = {
                videos: [],
                thumbnails: [],
                sprites: [],
                images: [],
            }
        }

        if (!hashes[fullusername][type]) {
            hashes[fullusername][type] = []
        }

        let isNewHash = !hashes[fullusername][type].includes(hash)

        if (isNewHash)
            hashes[fullusername][type].push(hash)

        let info = {
            size: size,
            ts: new Date().getTime()
        }

        if (isNewHash && discount)
            info.discount = discount
        
        // Record size of file
        if (size > 0 && !hashInfo[hash])
            hashInfo[hash] = info

        return isNewHash
    },
    recordSkylink: (username,network,type,skylink) => {
        let fullusername = db.toFullUsername(username,network,true)
        if (!skylinks[fullusername])
            skylinks[fullusername] = {
                videos: []
            }

        if (!skylinks[fullusername][type]) skylinks[fullusername][type] = []
        if (!skylinks[fullusername][type].includes(skylink))
            skylinks[fullusername][type].push(skylink)
    },
    // Retrieve usage and hashes data
    getUsage: (username,network,applyDiscounts = false) => {
        let result = {}
        let userHashes = db.getHashesByUser(possibleTypes,username,network)
        for (let hashtype in userHashes) {
            result[hashtype] = 0
            for (let h in userHashes[hashtype]) {
                if (hashInfo[userHashes[hashtype][h]] && typeof hashInfo[userHashes[hashtype][h]].size === 'number') {
                    let discountFactor = applyDiscounts ? (typeof hashInfo[userHashes[hashtype][h]].discount === 'string' ? config.Discounts[hashInfo[userHashes[hashtype][h]].discount] || 1 : 1) : 1
                    result[hashtype] += Math.ceil(hashInfo[userHashes[hashtype][h]].size * discountFactor)
                }
            }
        }
        return result
    },
    getTotalUsage: (username,network,applyDiscounts = false) => {
        let usageDet = db.getUsage(username,network,applyDiscounts)
        let qtotal = 0
        for (let det in usageDet) {
            qtotal += usageDet[det]
        }
        return qtotal
    },
    getAllUsage: () => {
        let totalUse = 0
        for (let fulluser in hashes)
            totalUse += db.getTotalUsage(db.toUsername(fulluser),db.toNetwork(fulluser))
        return totalUse
    },
    getHashes: (types) => {
        let hashesToReturn = {}
        function getAllHashes(hashType) {
            let hashArrToReturn = []
            for(let key in hashes) {
                if (hashes[key][hashType]) {
                    hashArrToReturn = hashArrToReturn.concat(hashes[key][hashType])
                }
            }
            return hashArrToReturn
        }

        for (let i = 0; i < possibleTypes.length; i++) {
            if (types.includes(possibleTypes[i]))
                hashesToReturn[possibleTypes[i]] = getAllHashes(possibleTypes[i])
        }

        return hashesToReturn
    },
    getSkylinks: (types,cb) => {
        let skylinksToReturn = {}
        function getAllSkylinks(linkType) {
            let skylinkArrToReturn = []
            for(let key in skylinks) {
                if (skylinks.hasOwnProperty(key) && skylinks[key][linkType] != undefined) {
                    skylinkArrToReturn = skylinkArrToReturn.concat(skylinks[key][linkType])
                }
            }
            return skylinkArrToReturn
        }

        for (let i = 0; i < possibleTypes.length; i++) {
            if (types.includes(possibleTypes[i]))
                skylinksToReturn[possibleTypes[i]] = getAllSkylinks(possibleTypes[i])
        }

        cb(skylinksToReturn)
    },
    getHashesByUser: (types,username,network) => {
        let fullusername = db.toFullUsername(username,network,true)
        let hashesToReturn = {}

        if (!hashes[fullusername]) return {}

        for (let i = 0; i < possibleTypes.length; i++) {
            if (types.includes(possibleTypes[i]))
                hashesToReturn[possibleTypes[i]] = hashes[fullusername][possibleTypes[i]]
        }
        
        return hashesToReturn
    },
    getSkylinksByUser: (types,username,network,cb) => {
        let fullusername = db.toFullUsername(username,network,true)
        let skylinksToReturn = {}

        if (!skylinks[fullusername]) return {}

        for (let i = 0; i < possibleTypes.length; i++) {
            if (types.includes(possibleTypes[i]))
                skylinksToReturn[possibleTypes[i]] = skylinks[fullusername][possibleTypes[i]]
        }
        
        cb(skylinksToReturn)
    },
    getHashInfo: (hash) => {
        return hashInfo[hash]
    },
    settingsValidator: {
        uplThreads: (value) => {
            let int = parseInt(value)
            if (isNaN(int))
                return 'Upload thread count must be a number'
            if (int < 1 || int > 50)
                return 'Upload thread count must be between 1 and 50'
            return null
        },
        descTemplate: (value) => {
            if (typeof value !== 'string')
                return 'Description template must be a string'
            if (value.length > 1000)
                return 'Description template must be less than or equal to 1,000 characters long'
            return null
        },
        darkMode: (value) => {
            if (typeof value !== 'boolean')
                return 'Dark mode setting must be a boolean'
            return null
        }
    },
    settingsTranslator: {
        uplThreads: (value) => parseInt(value),
        descTemplate: (value) => {
            if (value === '')
                return undefined
            else
                return value
        },
        darkMode: (value) => value
    },
    settingsUpdate: (username,network,key,value) => {
        let fullusername = db.toFullUsername(username,network)
        if (!userInfo[fullusername])
            userInfo[fullusername] = { settings: {} }
        if (!userInfo[fullusername].settings)
            userInfo[fullusername].settings = {}
        userInfo[fullusername].settings[key] = db.settingsTranslator[key](value)
    },
    getUserInfo: (username,network) => {
        let fullusername = db.toFullUsername(username,network)
        if (!userInfo[fullusername]) return {}
        return userInfo[fullusername]
    },
    setupDb,
    // Write data in variables to disk
    writeUserInfoData: () => {
        fs.writeFile(dbDir+'/userinfo.json',JSON.stringify(userInfo),(err) => {
            if (err)
                console.log('Error saving user info: ' + err)
        })
    },
    writeHashesData: () => {
        fs.writeFile(dbDir+'/hashes.json',JSON.stringify(hashes),(err) => {
            if (err)
                console.log('Error saving hash logs: ' + err)
        })
    },
    writeHashInfoData: () => {
        fs.writeFile(dbDir+'/hashInfo.json',JSON.stringify(hashInfo),(err) => {
            if (err)
                console.log('Error saving hash sizes: ' + err)
        })
    },
    writeSkylinksData: () => {
        fs.writeFile(dbDir+'/skylinks.json',JSON.stringify(skylinks),(err) => {
            if (err)
                console.log('Error saving skylinks: ' + err)
        })
    },
    // Username helpers
    toFullUsername: (username,network,aliasOf) => {
        let result = username
        if (network && network != 'all') result += '@' + network
        if (aliasOf && db.getAliasOf(username,network))
            result = db.getAliasOf(username,network)
        return result
    },
    toUsername: (fullusername) => {
        return fullusername.split('@')[0]
    },
    toNetwork: (fullusername) => {
        let parts = fullusername.split('@')
        if (parts.length > 1)
            return parts[1]
        else
            return 'all'
    }
}

export default db