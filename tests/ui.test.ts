/**
 * The presentation rules that are logic rather than styling.
 *
 * `levelForFinding` is the join that stops the timeline disagreeing with the
 * verdict cards, and `groupIntoPassages` is the fix for a list that claimed one
 * passage was two separate problems. Both are worth pinning.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { clearText } from '@/lib/engine'
import {
  formatTick,
  formatTime,
  groupIntoPassages,
  levelForFinding,
  platformsForFinding,
  runtimeOf,
  worseOf,
} from '@/lib/ui/format'

const result = clearText(
  'true-crime-hollow-lane.srt',
  readFileSync(join(process.cwd(), 'fixtures', 'true-crime-hollow-lane.srt'), 'utf8'),
  { clearedAt: '2026-08-15T00:00:00.000Z' }
)

describe('timecodes', () => {
  it('reads like an editor timeline', () => {
    expect(formatTime(0)).toBe('00:00.0')
    expect(formatTime(377.24)).toBe('06:17.2')
    expect(formatTime(3600)).toBe('60:00.0')
    expect(formatTick(377.6)).toBe('06:18')
  })
})

describe('the timeline agrees with the verdict cards', () => {
  it('colours a finding by the verdict it actually drove', () => {
    const graphic = result.findings.find((f) => f.class === 'violence.graphic')!
    expect(levelForFinding(result, graphic.id)).toBe('limited')
  })

  it('leaves a finding no platform counted as cleared', () => {
    // A finding can exist, be reported, and still not have moved any verdict.
    // The strip has to say that rather than paint it as a problem.
    const uncounted = result.findings.filter((f) => platformsForFinding(result, f.id).length === 0)
    for (const finding of uncounted) {
      expect(levelForFinding(result, finding.id)).toBe('cleared')
    }
  })

  it('names the platforms that counted a finding', () => {
    const graphic = result.findings.find((f) => f.class === 'violence.graphic')!
    expect(platformsForFinding(result, graphic.id)).toEqual(['Instagram'])
  })

  it('takes the worse of two levels', () => {
    expect(worseOf('cleared', 'limited')).toBe('limited')
    expect(worseOf('strike', 'limited')).toBe('strike')
    expect(worseOf('cleared', 'cleared')).toBe('cleared')
  })
})

describe('passages', () => {
  it('folds findings that quote the same sentence into one card', () => {
    const passages = groupIntoPassages(result.findings)
    expect(passages.length).toBeLessThan(result.findings.length)
    const shared = passages.find((passage) => passage.findings.length > 1)
    expect(shared, 'the coroner passage should be one card').toBeDefined()
    expect(new Set(shared!.findings.map((f) => f.class)).size).toBeGreaterThan(1)
  })

  it('keeps separate moments separate', () => {
    const passages = groupIntoPassages(result.findings)
    for (let i = 1; i < passages.length; i++) {
      expect(passages[i]!.tokenStart).toBeGreaterThan(passages[i - 1]!.tokenEnd)
    }
  })

  it('shows the widest quote in the group, because it contains the others', () => {
    const passages = groupIntoPassages(result.findings)
    const shared = passages.find((passage) => passage.findings.length > 1)!
    for (const finding of shared.findings) {
      expect(shared.quote.length).toBeGreaterThanOrEqual(finding.quote.length)
    }
  })

  it('handles an empty list', () => {
    expect(groupIntoPassages([])).toEqual([])
  })
})

describe('runtime', () => {
  it('falls back to the last cue when the source cannot say', () => {
    expect(runtimeOf(result)).toBeGreaterThan(800)
  })

  it('never returns zero, which would stack every band at the left edge', () => {
    const empty = clearText('script.txt', 'nothing of note here at all', {
      clearedAt: '2026-08-15T00:00:00.000Z',
    })
    expect(runtimeOf(empty)).toBeGreaterThan(0)
  })
})
