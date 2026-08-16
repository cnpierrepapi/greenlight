/**
 * Checks whether the platform policy pages a pack was written from have changed
 * since somebody last read them.
 *
 * Every pack in packs/ carries a source_url and a retrieved date. This fetches
 * each of those pages, reduces it to visible text, hashes it, and compares that
 * against the baseline in packs/policy-watch.json. Drift exits non-zero so the
 * scheduled run in .github/workflows/policy-watch.yml goes red and files an
 * issue.
 *
 * What this deliberately does NOT do: rewrite a pack. A policy page changing is
 * a signal that a human should read the diff and decide what it means for the
 * thresholds. Auto-ingesting scraped prose into the rules would move verdicts
 * without anybody checking, which is the one failure this product cannot have.
 * See docs/DECISIONS.md D18.
 *
 * Usage:
 *   node scripts/watch-policies.mjs            check, exit 1 on drift
 *   node scripts/watch-policies.mjs --adopt    accept current pages as baseline
 */

import { readdir, readFile, writeFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { parse } from 'yaml'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const PACKS_DIR = join(ROOT, 'packs')
const STATE_FILE = join(PACKS_DIR, 'policy-watch.json')

const ADOPT = process.argv.includes('--adopt')
const TIMEOUT_MS = 20_000

// A plain fetch gets a challenge page from most of these hosts, and a challenge
// page hashes differently every time, which would look like drift forever.
const HEADERS = {
  'user-agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36',
  accept: 'text/html,application/xhtml+xml',
  'accept-language': 'en-GB,en;q=0.9',
}

/**
 * HTML to comparable text. Scripts and styles go first, then tags, then
 * whitespace collapses. Anything that survives is what a reader would see.
 *
 * This is intentionally blunt. A nav rewrite or a rotating promo strip on the
 * same page counts as a change here even though the policy did not move, which
 * is a false positive we accept: a check that misses a real policy change is
 * far worse than one that occasionally asks a human to look.
 */
export function toComparableText(html) {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    // Google's Help Center stamps a fresh request id into the page chrome on
    // every response, so two reads a second apart hash differently and every
    // run would report drift. Long digit runs and long mixed alphanumeric
    // tokens are ids, not policy prose: no rule about profanity contains a
    // twenty digit number. Blank them before hashing.
    .replace(/\b\d{10,}\b/g, '#id')
    .replace(/\b(?=[A-Za-z0-9_-]{24,}\b)(?=[^ ]*\d)(?=[^ ]*[A-Za-z])[A-Za-z0-9_-]+\b/g, '#tok')
    .replace(/\s+/g, ' ')
    .trim()
}

export function hashText(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex').slice(0, 16)
}

async function readPacks() {
  const files = (await readdir(PACKS_DIR)).filter((f) => f.endsWith('.yaml')).sort()
  const packs = []
  for (const file of files) {
    const raw = parse(await readFile(join(PACKS_DIR, file), 'utf8'))
    packs.push({
      id: raw.id,
      label: raw.label,
      version: raw.version,
      retrieved: raw.retrieved,
      sourceUrl: raw.source_url,
      file,
    })
  }
  return packs
}

async function readState() {
  try {
    return JSON.parse(await readFile(STATE_FILE, 'utf8'))
  } catch {
    return { lastChecked: null, sources: {} }
  }
}

async function fetchText(url) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(url, { headers: HEADERS, signal: controller.signal, redirect: 'follow' })
    if (!res.ok) return { ok: false, reason: `HTTP ${res.status}` }
    const html = await res.text()
    const text = toComparableText(html)
    // A challenge or consent interstitial is short. Treat it as unreachable
    // rather than hashing it, otherwise the baseline records the wall.
    if (text.length < 2000) return { ok: false, reason: `only ${text.length} chars of text, probably a challenge page` }
    return { ok: true, text }
  } catch (error) {
    return { ok: false, reason: error.name === 'AbortError' ? 'timed out' : error.message }
  } finally {
    clearTimeout(timer)
  }
}

async function main() {
const packs = await readPacks()
const state = await readState()
const now = new Date().toISOString()

const changed = []
const unreachable = []
const firstSeen = []
const sources = {}

for (const pack of packs) {
  const previous = state.sources?.[pack.id]
  const result = await fetchText(pack.sourceUrl)

  if (!result.ok) {
    unreachable.push({ ...pack, reason: result.reason })
    // Keep the old hash. An unreachable page is not evidence of a change.
    sources[pack.id] = {
      ...(previous ?? {}),
      url: pack.sourceUrl,
      lastAttempt: now,
      lastError: result.reason,
    }
    continue
  }

  const hash = hashText(result.text)
  const entry = {
    url: pack.sourceUrl,
    hash,
    chars: result.text.length,
    packVersion: pack.version,
    packRetrieved: pack.retrieved,
    lastAttempt: now,
    lastSeenUnchanged: now,
    lastError: null,
  }

  if (!previous?.hash) {
    firstSeen.push(pack)
    sources[pack.id] = { ...entry, baselineSetAt: now }
  } else if (previous.hash !== hash && !ADOPT) {
    changed.push({ ...pack, from: previous.hash, to: hash, since: previous.baselineSetAt ?? previous.lastSeenUnchanged })
    sources[pack.id] = {
      ...previous,
      url: pack.sourceUrl,
      lastAttempt: now,
      lastError: null,
      pendingHash: hash,
      pendingChars: result.text.length,
      pendingSince: previous.pendingSince ?? now,
    }
  } else {
    sources[pack.id] = { ...entry, baselineSetAt: ADOPT ? now : (previous.baselineSetAt ?? now) }
  }
}

const checkedOk = packs.length - unreachable.length
await writeFile(
  STATE_FILE,
  JSON.stringify({ lastChecked: now, checkedOk, total: packs.length, sources }, null, 2) + '\n',
  'utf8'
)

for (const p of firstSeen) console.log(`  baseline  ${p.id}  ${p.sourceUrl}`)
for (const p of unreachable) console.log(`  skipped   ${p.id}  ${p.reason}`)
for (const p of changed) {
  console.log(`\n  CHANGED   ${p.label} (${p.file})`)
  console.log(`            ${p.sourceUrl}`)
  console.log(`            ${p.from} -> ${p.to}, baseline set ${p.since}`)
  console.log(`            pack says retrieved ${p.retrieved}, version ${p.version}`)
}

if (changed.length > 0) {
  console.log(
    `\n  ${changed.length} policy page(s) moved since the pack was written.` +
      `\n  Read the page, decide whether any threshold changes, bump retrieved and version in the YAML,` +
      `\n  then run: node scripts/watch-policies.mjs --adopt\n`
  )
  process.exit(1)
}

if (unreachable.length === packs.length) {
  console.log('\n  every source was unreachable, so this run proved nothing\n')
  process.exit(1)
}

console.log(`  policies  ${checkedOk}/${packs.length} sources checked, no change since baseline`)
}

// Importing this file (tests/watch-policies.test.ts does) must not fetch
// anything or exit the process. Only run when invoked as a script.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await main()
}
