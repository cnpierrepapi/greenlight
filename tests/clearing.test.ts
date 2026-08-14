/**
 * End to end clearings against the three sample cuts in fixtures/.
 *
 * These are the tests that would catch the failure that actually matters: a
 * change that quietly turns a limited video green, or a clean video red. They
 * assert behaviour a creator would notice, not internal shapes.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { clearText } from '@/lib/engine'
import type { ClearingResult, PlatformVerdict } from '@/lib/engine/types'

const CLEARED_AT = '2026-08-14T00:00:00.000Z'

function clearFixture(name: string): ClearingResult {
  const text = readFileSync(join(process.cwd(), 'fixtures', name), 'utf8')
  return clearText(name, text, { clearedAt: CLEARED_AT })
}

function platform(result: ClearingResult, id: string): PlatformVerdict {
  const found = result.platforms.find((p) => p.packId === id)
  if (!found) throw new Error(`no verdict for ${id}`)
  return found
}

function category(result: ClearingResult, packId: string, categoryId: string) {
  const found = platform(result, packId).categories.find((c) => c.categoryId === categoryId)
  if (!found) throw new Error(`no category ${packId}/${categoryId}`)
  return found
}

describe('gaming patch rant', () => {
  const result = clearFixture('gaming-patch-rant.srt')

  it('finds the mild language in the opening line', () => {
    const opening = result.findings.filter(
      (f) => f.startSec !== null && f.startSec < 30 && f.class.startsWith('profanity')
    )
    expect(opening.length).toBeGreaterThan(0)
    expect(opening[0]?.quote).toContain('nightmare of a patch')
  })

  it('explains why the opening matters, in the finding itself', () => {
    const opening = result.findings.find((f) => f.startSec !== null && f.startSec < 30)
    expect(opening?.modifiers.map((m) => m.id)).toContain('position.opening')
  })

  it('clears the violent language, because it describes game play', () => {
    // "he turns around and kills me with a pistol" is a game mechanic, not
    // violence against a person. If this ever fails, every gaming creator on
    // the platform gets a false strike risk.
    const suppressed = result.considered.filter((f) => f.class.startsWith('violence'))
    expect(suppressed.length).toBeGreaterThan(0)
    expect(suppressed.every((f) => f.modifiers.some((m) => m.id === 'context.gameplay'))).toBe(true)
    expect(category(result, 'youtube', 'violence').level).toBe('cleared')
  })

  it('keeps the cleared findings on file rather than deleting them', () => {
    expect(result.considered.length).toBeGreaterThan(0)
    expect(result.considered.every((f) => f.suppressed)).toBe(true)
  })

  it('does not reach strike risk anywhere', () => {
    expect(result.platforms.every((p) => p.level !== 'strike')).toBe(true)
  })
})

describe('true crime narration', () => {
  const result = clearFixture('true-crime-hollow-lane.srt')

  it('merges the coroner passage into sustained findings, not a dozen hits', () => {
    const violence = result.findings.filter((f) => f.class.startsWith('violence'))
    const hitCount = violence.reduce((n, f) => n + f.hits.length, 0)
    expect(hitCount).toBeGreaterThan(violence.length)

    const passage = violence.find(
      (f) => f.startSec !== null && f.startSec > 360 && f.startSec < 400 && f.hits.length > 1
    )
    expect(passage, 'the coroner passage should read as one span').toBeDefined()
    expect(passage!.endSec! - passage!.startSec!).toBeGreaterThan(5)
  })

  it('lowers the passage because it is attributed to an official record', () => {
    const violence = result.findings.filter((f) => f.class.startsWith('violence'))
    const framed = violence.filter((f) => f.modifiers.some((m) => m.id === 'context.news'))
    expect(framed.length).toBeGreaterThan(0)
  })

  it('still reports it, because documentary framing is a mitigation and not a pass', () => {
    // The distinction the product rests on. Framing lowers severity. It does
    // not make a sustained description of an assault invisible.
    expect(result.findings.some((f) => f.class.startsWith('violence'))).toBe(true)
  })

  it('is treated differently by different platforms', () => {
    // The reason a creator needs this: the same cut is not one answer.
    const levels = new Set(result.platforms.map((p) => p.level))
    expect(levels.size).toBeGreaterThan(1)
  })

  it('cites a published rule on every category that is not cleared', () => {
    for (const p of result.platforms) {
      for (const c of p.categories) {
        if (c.level === 'cleared') continue
        expect(c.citation.length, `${p.packId}/${c.categoryId}`).toBeGreaterThan(20)
        expect(c.reason.length, `${p.packId}/${c.categoryId}`).toBeGreaterThan(10)
      }
    }
  })
})

describe('studio tour', () => {
  const result = clearFixture('studio-tour-clean.srt')

  it('clears on every platform', () => {
    expect(result.findings).toHaveLength(0)
    expect(result.platforms.every((p) => p.level === 'cleared')).toBe(true)
  })
})

describe('reproducibility', () => {
  it('produces an identical result on a second run', () => {
    // The property that makes a live demo safe and golden output tests
    // possible. If this fails, something in the engine is reading the clock or
    // iterating a set in insertion order that changed.
    const a = clearFixture('true-crime-hollow-lane.srt')
    const b = clearFixture('true-crime-hollow-lane.srt')
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })
})

describe('untimed transcripts', () => {
  // Strong language in the first sentence on purpose. With timings this would
  // trip YouTube's opening window rule, so it is the case that proves the rule
  // does not fire on a guess.
  const result = clearText(
    'script.txt',
    'Right, so the fucking patch dropped last night. And this nightmare of a patch has broken everything.',
    { clearedAt: CLEARED_AT }
  )

  it('still finds the language', () => {
    expect(result.findings.length).toBeGreaterThan(0)
  })

  it('refuses to invent a timecode', () => {
    expect(result.findings.every((f) => f.startSec === null)).toBe(true)
  })

  it('says so in the finding, and lowers confidence for it', () => {
    const finding = result.findings[0]!
    expect(finding.modifiers.map((m) => m.id)).toContain('timing.none')
    expect(finding.confidence).toBeLessThan(0.8)
  })

  it('does not fire an opening window rule it cannot evaluate', () => {
    // The YouTube language category has an opening 30 seconds threshold. With
    // no timings we cannot know, so it must not fire on a guess.
    const language = category(result, 'youtube', 'language')
    expect(language.level).toBe('cleared')
    expect(language.reason).not.toMatch(/inside the opening/i)
  })
})
