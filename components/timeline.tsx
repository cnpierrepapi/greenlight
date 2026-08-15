'use client'

/**
 * The risk strip. Full bleed, above everything else.
 *
 * Contract: draws one band per timed finding, positioned by its real start and
 * end, coloured by the verdict it actually drove. Clicking a band selects that
 * finding. Callers: `components/clearing.tsx`.
 *
 * Two decisions worth knowing before changing it.
 *
 * A band shorter than about half a second is widened to a minimum so it can be
 * seen and clicked. That makes the strip a map rather than a measurement, so
 * the real span is always printed next to the finding rather than read off the
 * bar. A creator cuts from the timecode, never from the picture.
 *
 * When the transcript has no timings at all there is nothing honest to draw, so
 * the strip says so and renders nothing.
 */

import type { ClearingResult, Finding, VerdictLevel } from '@/lib/engine/types'
import { formatTick, levelForFinding, runtimeOf } from '@/lib/ui/format'

/** Painting order. Later means on top, so the worst band is never buried. */
const PAINT_ORDER: Record<VerdictLevel, number> = { cleared: 0, limited: 1, strike: 2 }

/** Smallest band, as a percentage of the runtime, so a word stays clickable. */
const MIN_BAND_PERCENT = 0.45

interface TimelineProps {
  result: ClearingResult
  selectedId: string | null
  onSelect: (finding: Finding) => void
  playheadSec: number | null
}

export function Timeline({ result, selectedId, onSelect, playheadSec }: TimelineProps) {
  const runtime = runtimeOf(result)

  /**
   * Findings overlap in time, so bands overlap on the strip, and the last one
   * drawn is the one a creator sees. In transcript order that was whichever
   * happened to come second, which meant a grey cleared band painting over the
   * amber one underneath it and hiding the only finding on the strip that had
   * changed a verdict. Worst level is drawn last.
   */
  const timed = result.findings
    .filter((finding) => finding.startSec !== null)
    .map((finding) => ({ finding, level: levelForFinding(result, finding.id) }))
    .sort((a, b) => PAINT_ORDER[a.level] - PAINT_ORDER[b.level])

  if (result.transcript.cues.every((cue) => cue.startSec === null)) {
    return (
      <section className="strip-wrap">
        <p className="strip-empty">
          This transcript carries no timings, so there is no timeline to draw. Findings are listed below
          without timecodes. Drop the video in to place them.
        </p>
      </section>
    )
  }

  return (
    <section className="strip-wrap" aria-label="Risk timeline">
      <div className="strip">
        {timed.map(({ finding, level }) => {
          const start = ((finding.startSec ?? 0) / runtime) * 100
          const rawWidth = (((finding.endSec ?? 0) - (finding.startSec ?? 0)) / runtime) * 100
          const width = Math.max(MIN_BAND_PERCENT, rawWidth)

          return (
            <button
              type="button"
              key={finding.id}
              className={`band band-${level} ${selectedId === finding.id ? 'band-on' : ''}`}
              style={{ left: `${start}%`, width: `${width}%` }}
              onClick={() => onSelect(finding)}
              title={`${finding.class} at ${formatTick(finding.startSec ?? 0)}`}
            >
              <span className="visually-hidden">
                {finding.class} at {formatTick(finding.startSec ?? 0)}
              </span>
            </button>
          )
        })}

        {playheadSec !== null && (
          <span className="playhead" style={{ left: `${(playheadSec / runtime) * 100}%` }} aria-hidden="true" />
        )}
      </div>

      <div className="strip-axis gl-mono">
        <span>00:00</span>
        <span>{formatTick(runtime / 2)}</span>
        <span>{formatTick(runtime)}</span>
      </div>
    </section>
  )
}
