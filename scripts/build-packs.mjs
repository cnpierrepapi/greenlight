/**
 * Compiles packs/*.yaml into lib/engine/policy/generated/packs.ts.
 *
 * Contract: run before dev and before build (see package.json scripts). Reads
 * every YAML file in packs/, validates it, converts snake_case keys to the
 * camelCase the engine types use, and writes one typed module.
 *
 * Why a build step rather than reading YAML at runtime: a malformed pack fails
 * the build instead of the demo, and the browser gets a typed import with no
 * loader and no fetch. See docs/DECISIONS.md D4.
 *
 * What this script does NOT check: that every class named by a pack exists in
 * the lexicon. That check needs both TypeScript modules loaded together and
 * lives in tests/packs.test.ts, which runs under vitest where the types are
 * real.
 */

import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse } from 'yaml'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const PACKS_DIR = join(ROOT, 'packs')
const OUT_DIR = join(ROOT, 'lib', 'engine', 'policy', 'generated')
const OUT_FILE = join(OUT_DIR, 'packs.ts')

const LEVELS = new Set(['cleared', 'limited', 'strike'])

function fail(file, message) {
  console.error(`\n  pack error  ${file}\n              ${message}\n`)
  process.exit(1)
}

function requireString(file, obj, key) {
  const value = obj[key]
  if (typeof value !== 'string' || value.trim() === '') {
    fail(file, `missing or empty "${key}"`)
  }
  return value.trim()
}

function validateCategory(file, raw, index) {
  const where = `category ${index + 1}`
  if (!raw || typeof raw !== 'object') fail(file, `${where} is not a mapping`)

  const id = requireString(file, raw, 'id')
  const label = requireString(file, raw, 'label')
  const citation = requireString(file, raw, 'citation')

  if (typeof raw.citation_verbatim !== 'boolean') {
    fail(
      file,
      `${where} ("${id}") must set citation_verbatim. Use false unless the citation is copied word for word from the platform's own page.`
    )
  }

  if (!Array.isArray(raw.classes) || raw.classes.length === 0) {
    fail(file, `${where} ("${id}") needs at least one entry in classes`)
  }

  if (!Array.isArray(raw.thresholds) || raw.thresholds.length === 0) {
    fail(file, `${where} ("${id}") needs at least one threshold`)
  }

  const thresholds = raw.thresholds.map((t, i) => {
    const at = `${where} ("${id}") threshold ${i + 1}`
    if (!LEVELS.has(t.level)) {
      fail(file, `${at} has level "${t.level}". Expected cleared, limited or strike.`)
    }
    if (typeof t.reason !== 'string' || t.reason.trim() === '') {
      fail(file, `${at} needs a reason. It is printed next to the verdict, so write it for a creator.`)
    }
    if (
      t.level !== 'cleared' &&
      t.min_findings === undefined &&
      t.min_severity === undefined
    ) {
      fail(file, `${at} would fire on every video. Give it a min_findings or a min_severity.`)
    }
    return {
      level: t.level,
      ...(t.min_findings !== undefined ? { minFindings: t.min_findings } : {}),
      ...(t.min_severity !== undefined ? { minSeverity: t.min_severity } : {}),
      ...(t.within_opening_sec !== undefined ? { withinOpeningSec: t.within_opening_sec } : {}),
      reason: t.reason.trim(),
    }
  })

  // Thresholds are first match wins, so a category with no unconditional
  // cleared at the end could return nothing at all. Catch that here rather
  // than shipping a category that silently has no verdict.
  const last = thresholds[thresholds.length - 1]
  if (last.level !== 'cleared' || last.minFindings !== undefined || last.minSeverity !== undefined) {
    fail(
      file,
      `${where} ("${id}") must end with an unconditional cleared threshold, otherwise a clean video gets no verdict in this category.`
    )
  }

  return { id, label, classes: raw.classes, citation, citationVerbatim: raw.citation_verbatim, thresholds }
}

function validatePack(file, raw) {
  if (!raw || typeof raw !== 'object') fail(file, 'file is empty or not a mapping')
  if (!Array.isArray(raw.categories) || raw.categories.length === 0) {
    fail(file, 'needs at least one category')
  }
  const retrieved = requireString(file, raw, 'retrieved')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(retrieved)) {
    fail(file, `retrieved must be an ISO date like 2026-08-14, got "${retrieved}"`)
  }
  return {
    id: requireString(file, raw, 'id'),
    label: requireString(file, raw, 'label'),
    version: requireString(file, raw, 'version'),
    retrieved,
    sourceUrl: requireString(file, raw, 'source_url'),
    sourceTitle: requireString(file, raw, 'source_title'),
    categories: raw.categories.map((c, i) => validateCategory(file, c, i)),
  }
}

const files = (await readdir(PACKS_DIR)).filter((f) => f.endsWith('.yaml')).sort()
if (files.length === 0) fail('packs/', 'no .yaml files found')

const packs = []
for (const file of files) {
  const text = await readFile(join(PACKS_DIR, file), 'utf8')
  let raw
  try {
    raw = parse(text)
  } catch (error) {
    fail(file, `could not be parsed as YAML: ${error.message}`)
  }
  packs.push(validatePack(file, raw))
}

const ids = packs.map((p) => p.id)
const duplicate = ids.find((id, i) => ids.indexOf(id) !== i)
if (duplicate) fail('packs/', `two packs share the id "${duplicate}"`)

const banner = `// Generated by scripts/build-packs.mjs from packs/*.yaml. Do not edit.
// Edit the YAML and run \`npm run packs\`.
//
// Packs in this build: ${packs.map((p) => `${p.id}@${p.version}`).join(', ')}

import type { Pack } from '../../types'

export const PACKS: Pack[] = ${JSON.stringify(packs, null, 2)}

export const PACK_IDS = ${JSON.stringify(ids)} as const
`

await mkdir(OUT_DIR, { recursive: true })
await writeFile(OUT_FILE, banner, 'utf8')

const categoryCount = packs.reduce((n, p) => n + p.categories.length, 0)
console.log(`  packs  ${packs.length} platforms, ${categoryCount} categories -> lib/engine/policy/generated/packs.ts`)
