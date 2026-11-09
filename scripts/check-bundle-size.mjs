// TC-4.3-04: login'siz QR bildirim sayfası (/q/:token) hafif kalmalı.
// Build manifest'inden sayfanın lazy chunk'ını ve yalnızca onun çektiği (giriş chunk'ında
// olmayan) statik import'ları toplar, gzip boyutunu eşikle karşılaştırır.
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { gzipSync } from "node:zlib"

const DIST = new URL("../dist/", import.meta.url).pathname
const PAGE = "src/features/public-feedback/routes/public-feedback-page.tsx"
/** QR sayfasına özgü kodun gzip üst sınırı (KB) */
const LIMIT_KB = 15

const manifest = JSON.parse(
  readFileSync(join(DIST, ".vite/manifest.json"), "utf8")
)
const entryKey = Object.keys(manifest).find((key) => manifest[key].isEntry)
if (!entryKey || !manifest[PAGE]) {
  console.error(`Manifest'te giriş veya ${PAGE} bulunamadı`)
  process.exit(1)
}

/** Bir chunk'ın statik import kapanışı */
function closure(key, seen = new Set()) {
  if (seen.has(key)) return seen
  seen.add(key)
  for (const next of manifest[key].imports ?? []) closure(next, seen)
  return seen
}

const shell = closure(entryKey)
const own = [...closure(PAGE)].filter((key) => !shell.has(key))
const gzipKb = (file) => gzipSync(readFileSync(join(DIST, file))).length / 1024
const rows = own.map((key) => ({
  chunk: manifest[key].file,
  kb: gzipKb(manifest[key].file),
}))
const total = rows.reduce((sum, row) => sum + row.kb, 0)
for (const row of rows)
  console.log(`  ${row.chunk.padEnd(60)} ${row.kb.toFixed(1)} KB gzip`)
console.log(
  `QR bildirim sayfası: ${total.toFixed(1)} KB gzip (eşik ${String(LIMIT_KB)} KB)`
)

// Ağır bağımlılıklar sayfanın kendi grafiğine girmemeli
const forbidden = ["recharts", "leaflet", "dnd-kit", "xlsx", "oidc-client"]
const heavy = own.filter((key) => forbidden.some((name) => key.includes(name)))
if (heavy.length > 0) {
  console.error(`QR sayfası ağır bağımlılık çekiyor: ${heavy.join(", ")}`)
  process.exit(1)
}
if (total > LIMIT_KB) {
  console.error("QR bildirim sayfası boyut eşiğini aştı")
  process.exit(1)
}
