/**
 * The four documents.
 *
 * These assert the promises the documents make to a creator: that a cut list
 * only touches what actually cost something, that a self-cert answer is never
 * guessed from imagery Greenlight cannot see, and that an appeal brief does not
 * argue against a decision this video's own evidence supports.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  buildAppeal,
  buildCutRanges,
  buildPack,
  clearText,
  PACKS,
  renderEdl,
  renderFfmpeg,
  renderReport,
  renderSelfCert,
  edlTime,
} from '@/lib/engine'
import type { ClearingResult } from '@/lib/engine/types'

const CLEARED_AT = '2026-08-15T09:00:00.000Z'

function fixture(name: string): ClearingResult {
  const text = readFileSync(join(process.cwd(), 'fixtures', name), 'utf8')
  return clearText(name, text, { clearedAt: CLEARED_AT })
}

const trueCrime = fixture('true-crime-hollow-lane.srt')
const gaming = fixture('gaming-patch-rant.srt')
const clean = fixture('studio-tour-clean.srt')

describe('cut list', () => {
  it('only touches findings that actually cost something', () => {
    // The gaming cut has findings, but nothing any platform counted. Editing a
    // video on our say so when nothing was at stake is how a creator stops
    // trusting the tool.
    expect(gaming.findings.length).toBeGreaterThan(0)
    expect(buildCutRanges(gaming)).toHaveLength(0)
  })

  it('builds ranges for findings a platform did count', () => {
    const ranges = buildCutRanges(trueCrime)
    expect(ranges.length).toBeGreaterThan(0)
    for (const range of ranges) {
      expect(range.endSec).toBeGreaterThan(range.startSec)
      expect(range.findingIds.length).toBeGreaterThan(0)
    }
  })

  it('pads either side, because a mute that starts on the vowel leaves the word', () => {
    const counted = trueCrime.platforms
      .flatMap((p) => p.categories)
      .filter((c) => c.level !== 'cleared')
      .flatMap((c) => c.findingIds)
    const finding = trueCrime.findings.find((f) => counted.includes(f.id))!
    const range = buildCutRanges(trueCrime).find((r) => r.findingIds.includes(finding.id))!
    expect(range.startSec).toBeLessThan(finding.startSec!)
    expect(range.endSec).toBeGreaterThan(finding.endSec!)
  })

  it('never invents a range for an untimed finding', () => {
    const untimed = clearText('script.txt', 'This is a sustained assault with a blunt object causing injuries.', {
      clearedAt: CLEARED_AT,
    })
    expect(buildCutRanges(untimed)).toHaveLength(0)
  })

  it('merges ranges that overlap once padded', () => {
    const ranges = buildCutRanges(trueCrime, { padSec: 30 })
    for (let i = 1; i < ranges.length; i++) {
      expect(ranges[i]!.startSec).toBeGreaterThan(ranges[i - 1]!.endSec)
    }
  })

  it('writes an ffmpeg command that copies the video and only touches audio', () => {
    const script = renderFfmpeg(trueCrime, { inputName: 'hollow-lane.mp4' })
    expect(script).toContain('ffmpeg -i "hollow-lane.mp4"')
    expect(script).toContain('-c:v copy')
    expect(script).toMatch(/volume=enable='between\(t,[\d.]+,[\d.]+\)/)
    expect(script).toContain('hollow-lane-cleared.mp4')
  })

  it('says plainly when there is no edit to make', () => {
    const script = renderFfmpeg(clean)
    expect(script).toContain('Nothing to mute')
    expect(script).not.toContain('ffmpeg -i')
  })

  it('writes an EDL of what survives a trim, and labels it as the other remedy', () => {
    const edl = renderEdl(trueCrime)
    expect(edl).toContain('TITLE: GREENLIGHT CUT LIST')
    expect(edl).toContain('WHAT REMAINS IF THE FLAGGED SPANS ARE TRIMMED OUT')
    expect(edl).toMatch(/001 {2}AX {7}AA\/V {2}C {8}\d\d:\d\d:\d\d:\d\d/)
  })

  it('floors EDL frames so a timecode never lands after the moment it describes', () => {
    // A frame that arrives late clips the first sound of the word an editor was
    // trying to remove, so 1.999s at 25fps is frame 24 of second one, never
    // frame zero of second two.
    expect(edlTime(1.999, 25)).toBe('00:00:01:24')
    expect(edlTime(0, 25)).toBe('00:00:00:00')
    expect(edlTime(3661.5, 25)).toBe('01:01:01:12')
    // Never overruns into a frame index the rate does not have.
    expect(edlTime(1.9999999, 25)).toBe('00:00:01:24')
  })
})

describe('self-certification', () => {
  const sheet = renderSelfCert(gaming)

  it('answers from the transcript', () => {
    expect(sheet).toContain('Does this video contain inappropriate language?')
    expect(sheet).toContain('Yes, infrequent or moderate language.')
  })

  it('attaches the timecodes behind each answer', () => {
    expect(sheet).toMatch(/- `\d\d:\d\d\.\d` "/)
  })

  it('separates a cleared category that has findings from one that has none', () => {
    // The distinction that stops a creator certifying "none" over a video with
    // swearing in it just because the category cleared.
    expect(sheet).toContain('Yes, infrequent or moderate language.')
    expect(renderSelfCert(clean)).toContain('No inappropriate language.')
  })

  it('refuses to answer what it cannot see', () => {
    expect(sheet).toContain('Questions Greenlight cannot answer for you')
    expect(sheet).toContain('Firearms related content')
    expect(sheet).toContain('reads what is said in')
  })
})

describe('appeal brief', () => {
  const instagram = PACKS.find((p) => p.id === 'instagram')!

  it('does not argue against a decision this video supports', () => {
    // Instagram limited the true crime cut, and so did we. A confident appeal
    // here would get the creator ignored.
    const brief = buildAppeal(trueCrime, {
      packId: 'instagram',
      decision: 'limited',
      statedReason: 'Violent and graphic content',
      filedOn: '2026-08-16',
    }).contents

    expect(brief).toContain('does not assert that the determination was reached in error')
    expect(brief).toContain('conforming edit may be prepared')
    expect(brief).not.toMatch(/\*\*Ground 1\./)
  })

  it('argues, with grounds, when the evidence supports arguing', () => {
    // YouTube clearing the same passage means a YouTube limitation is one we
    // can properly answer.
    const brief = buildAppeal(trueCrime, {
      packId: 'youtube',
      decision: 'limited',
      statedReason: 'Violence',
      filedOn: '2026-08-16',
    }).contents

    expect(brief).toMatch(/\*\*Ground 1\./)
    expect(brief).toContain('documentary rather than gratuitous')
    expect(brief).toContain('reinstatement of full advertising suitability')
  })

  it('numbers exhibits with this video s own timecodes and words', () => {
    const brief = buildAppeal(trueCrime, {
      packId: 'youtube',
      decision: 'limited',
      statedReason: 'Violence',
      filedOn: '2026-08-16',
    }).contents

    expect(brief).toMatch(/EX\. A {2}\d\d:\d\d:\d\d\.\d\d\d - \d\d:\d\d:\d\d\.\d\d\d/)
    expect(brief).toContain('the injuries were consistent with a sustained assault')
  })

  it('never presents our summary of a rule as the platform s own wording', () => {
    const brief = buildAppeal(trueCrime, {
      packId: 'instagram',
      decision: 'limited',
      statedReason: 'Violent and graphic content',
      filedOn: '2026-08-16',
    }).contents

    expect(instagram.categories.every((c) => !c.citationVerbatim)).toBe(true)
    expect(brief).toContain('is a summary of that provision rather than a quotation of it')
    expect(brief).toContain(instagram.sourceUrl)
  })

  it('leaves blanks only for facts the creator holds', () => {
    const brief = buildAppeal(trueCrime, {
      packId: 'youtube',
      decision: 'removed',
      statedReason: 'Violence',
      filedOn: '2026-08-16',
    }).contents

    expect(brief).toContain('[CHANNEL NAME]')
    expect(brief).toContain('[PLATFORM CASE REFERENCE]')
    // Nothing about the video itself is left for the creator to fill in.
    expect(brief).not.toContain('[TIMECODE')
    expect(brief).not.toContain('[QUOTE')
  })

  it('carries the disclaimer and the pack provenance', () => {
    const brief = buildAppeal(trueCrime, {
      packId: 'youtube',
      decision: 'limited',
      statedReason: 'Violence',
      filedOn: '2026-08-16',
    }).contents

    expect(brief).toContain('not legal advice')
    expect(brief).toContain('does not guarantee any outcome')
    expect(brief).toContain('guidelines read 2026-08-14')
  })

  it('refuses a platform it has no verdict for', () => {
    expect(() =>
      buildAppeal(trueCrime, {
        packId: 'myspace',
        decision: 'limited',
        statedReason: 'anything',
        filedOn: '2026-08-16',
      })
    ).toThrow(/myspace/)
  })
})

describe('report', () => {
  const html = renderReport(trueCrime)

  it('is self-contained, so it still opens in six months with no network', () => {
    expect(html).not.toMatch(/<link[^>]+href=["']http/)
    expect(html).not.toMatch(/<script/)
    expect(html).not.toMatch(/src=["']http/)
    expect(html).not.toMatch(/@import/)
  })

  it('carries the verdicts and the findings', () => {
    expect(html).toContain('Instagram')
    expect(html).toContain('Limited')
    expect(html).toContain('the injuries were consistent')
  })

  it('shows what was considered and cleared, not just what counted', () => {
    // The gaming cut is the one with suppressed findings: game violence that
    // was looked at and let go. The report has to show that it was reviewed
    // rather than filtered.
    const out = renderReport(gaming)
    expect(out).toContain('considered and cleared')
    expect(out).toContain('describes what happened in a game')
  })

  it('strips markup at ingest, before it ever reaches a document', () => {
    const injected = clearText(
      'x.srt',
      '1\n00:00:01,000 --> 00:00:03,000\nThis damn <script>alert(1)</script> patch\n',
      { clearedAt: CLEARED_AT }
    )
    // The cue cleaner removes tags, so the payload never becomes a finding
    // quote in the first place. Belt as well as braces: the report escapes too.
    expect(injected.findings[0]?.quote).not.toContain('<script>')
    expect(renderReport(injected)).not.toContain('<script>alert(1)</script>')
  })

  it('escapes what does survive ingest', () => {
    const injected = clearText(
      'x.srt',
      '1\n00:00:01,000 --> 00:00:03,000\nThis damn patch costs 5 < 6 dollars & "more"\n',
      { clearedAt: CLEARED_AT }
    )
    const out = renderReport(injected)
    expect(out).toContain('5 &lt; 6 dollars &amp;')
  })
})

describe('the pack', () => {
  it('names its files after the cut', () => {
    const files = buildPack(trueCrime, { slug: 'Hollow Lane FINAL.mp4' }).map((d) => d.filename)
    expect(files).toEqual([
      'hollow-lane-final-report.html',
      'hollow-lane-final-cutlist.sh',
      'hollow-lane-final-cutlist.edl',
      'hollow-lane-final-selfcert.md',
    ])
  })

  it('leaves the appeal out until a decision exists', () => {
    const files = buildPack(trueCrime).map((d) => d.filename)
    expect(files.some((name) => name.includes('appeal'))).toBe(false)
  })

  it('gives every document contents and a blurb', () => {
    for (const document of buildPack(trueCrime)) {
      expect(document.contents.length).toBeGreaterThan(100)
      expect(document.blurb.length).toBeGreaterThan(20)
    }
  })
})
