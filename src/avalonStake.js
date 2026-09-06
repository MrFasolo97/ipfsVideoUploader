import axios from 'axios'
const Config = (await import('./config.js')).default

const FreemiumConfig = Config.Freemium || {}
const AVALON_API = FreemiumConfig.avalonAPI || 'https://api.avalonblocks.com'
const TIERS = FreemiumConfig.tiers || {
    onboarding: { minStake: 0,     storageGB: 2,   maxUploadMB: 512,    hlsOutputs: [480],          rateLimitPerHour: 1 },
    free:       { minStake: 500,   storageGB: 5,   maxUploadMB: 2048,   hlsOutputs: [480],          rateLimitPerHour: 3 },
    silver:     { minStake: 2000,  storageGB: 10,  maxUploadMB: 5120,   hlsOutputs: [480,720,1080], rateLimitPerHour: 10 },
    gold:       { minStake: 10000, storageGB: 50,  maxUploadMB: 10240,  hlsOutputs: [480,720,1080,1440,2160], rateLimitPerHour: 50 }
}
const CACHE_TTL_MS = (FreemiumConfig.cacheTTLSeconds || 300) * 1000
const MIN_VIDEO_DURATION_SEC = FreemiumConfig.minVideoDurationSec || 30

// In-memory cache: { username: { tier, balance, ts } }
const tierCache = {}

const TIER_ORDER = ['onboarding', 'free', 'silver', 'gold']

const determineTier = (dtcBalance) => {
    let result = 'onboarding'
    for (let i = TIER_ORDER.length - 1; i >= 0; i--) {
        if (dtcBalance >= TIERS[TIER_ORDER[i]].minStake) {
            result = TIER_ORDER[i]
            break
        }
    }
    return result
}

const AvalonStake = {
    TIERS,
    TIER_ORDER,
    MIN_VIDEO_DURATION_SEC,

    getTier: async (username) => {
        if (!username) return { tier: 'onboarding', balance: 0, cached: false }

        let cached = tierCache[username]
        if (cached && (Date.now() - cached.ts) < CACHE_TTL_MS)
            return { tier: cached.tier, balance: cached.balance, cached: true }

        try {
            let res = await axios.get(AVALON_API + '/account/' + username, { timeout: 5000, family: 4 })
            let account = res.data
            let dtcBalance = typeof account.balance === 'number' ? account.balance / 100 : 0
            let tier = determineTier(dtcBalance)

            tierCache[username] = { tier, balance: dtcBalance, ts: Date.now() }
            return { tier, balance: dtcBalance, cached: false }
        } catch (e) {
            console.log('Avalon API error for', username + ':', e.message || e)
            // Use expired cache if available
            if (cached)
                return { tier: cached.tier, balance: cached.balance, cached: true }
            return { tier: 'onboarding', balance: 0, cached: false }
        }
    },

    getEffectiveTier: async (username, shawpBalance) => {
        if (typeof shawpBalance === 'number' && shawpBalance > 0)
            return { tier: 'shawp', storageGB: Infinity, maxUploadMB: Infinity, hlsOutputs: TIERS.gold.hlsOutputs, rateLimitPerHour: Infinity }
        let stake = await AvalonStake.getTier(username)
        let tierConfig = TIERS[stake.tier] || TIERS.onboarding
        return { tier: stake.tier, dtcBalance: stake.balance, ...tierConfig }
    },

    getTierConfig: (tierName) => {
        return TIERS[tierName] || TIERS.onboarding
    },

    clearCache: (username) => {
        if (username) delete tierCache[username]
        else Object.keys(tierCache).forEach(k => delete tierCache[k])
    }
}

export default AvalonStake
