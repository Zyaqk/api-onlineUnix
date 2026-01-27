import express from "express"
import dotenv from "dotenv";
dotenv.config()
import { status } from "minecraft-server-util"

const app = express()
const PORT = process.env.PORT || 3000;

const HOSTS = {
  lobby:  "mc.teslacraft.org",
  royale: "hub.holyworld.ru",
  uhc:    "astrummc.su",
  meetup: "mc.politmine.ru",
}

const UPDATE_INTERVAL = 30_000
const KEEP_TIME = 72 * 60 * 60 * 1000
const CHART_STEP = 5 * 60 * 1000
const CHART_CACHE_TIME = 60_000

let cache = {
  lobby: 0,
  royale: 0,
  uhc: 0,
  meetup: 0,
  total: 0,
  updated: 0
}

let history = []
let updating = false

let lastValidOnline = {
  lobby: null,
  royale: null,
  uhc: null,
  meetup: null
}

let chartCache = {
  data: [],
  updated: 0
}

async function getOnline(host) {
  try {
    const res = await status(host, 25565, { timeout: 800 })
    return res.players?.online ?? null
  } catch {
    return null
  }
}

function fixZero(server, value) {
  if (value > 0) {
    lastValidOnline[server] = value
    return value
  }
  if (lastValidOnline[server] !== null) {
    return lastValidOnline[server]
  }
  return 0
}

function buildChart() {
  const buckets = new Map()

  for (const p of history) {
    const bucket = Math.floor(p.time / CHART_STEP) * CHART_STEP
    if (!buckets.has(bucket)) {
      buckets.set(bucket, { time: bucket, sum: 0, count: 0 })
    }
    const b = buckets.get(bucket)
    b.sum += p.total
    b.count++
  }

  return [...buckets.values()].map(b => ({
    time: b.time,
    total: Math.round(b.sum / b.count)
  }))
}

async function updateOnline() {
  if (updating) return
  updating = true

  try {
    let total = 0

    for (const [key, host] of Object.entries(HOSTS)) {
      const raw = await getOnline(host)
      if (raw !== null) {
        const fixed = fixZero(key, raw)
        cache[key] = fixed
        total += fixed
      }
    }

    cache.total = total
    cache.updated = Date.now()

    history.push({
      time: cache.updated,
      total: cache.total,
      servers: { ...cache }
    })

    const cutoff = Date.now() - KEEP_TIME
    history = history.filter(p => p.time >= cutoff)

  } finally {
    updating = false
  }
}

setInterval(updateOnline, UPDATE_INTERVAL)
updateOnline()

app.get("/online", (req, res) => {
  res.json({
    success: true,
    servers: {
      lobby: cache.lobby,
      royale: cache.royale,
      uhc: cache.uhc,
      meetup: cache.meetup
    },
    total: cache.total,
    updated: cache.updated
  })
})

app.get("/online/chart", (req, res) => {
  const now = Date.now()

  if (now - chartCache.updated > CHART_CACHE_TIME) {
    chartCache.data = buildChart()
    chartCache.updated = now
  }

  res.json({
    success: true,
    updated: chartCache.updated,
    data: chartCache.data
  })
})

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`)
})