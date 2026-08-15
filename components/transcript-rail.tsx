'use client'

/**
 * The transcript, with the selected finding scrolled into view.
 *
 * Contract: renders every cue in order, marks the cues a selected finding sits
 * inside, and scrolls to it when the selection changes. Clicking a cue seeks
 * the player. Callers: `components/clearing.tsx`.
 *
 * Cue text is rendered as the source wrote it, punctuation and all, and the
 * highlight covers the whole line rather than the individual words. The engine
 * strips punctuation to match, so painting a word level highlight back onto the
 * original text would mean re-deriving where each token sits in a string it no
 * longer matches. The exact span is printed on the finding card, where it is a
 * number rather than a guess.
 */

import { useEffect, useRef } from 'react'
import type { ClearingResult, Finding } from '@/lib/engine/types'
import { formatTime } from '@/lib/ui/format'

interface TranscriptRailProps {
  result: ClearingResult
  selected: Finding | null
  onSeek: (seconds: number) => void
}

export function TranscriptRail({ result, selected, onSeek }: TranscriptRailProps) {
  const scrollerRef = useRef<HTMLDivElement>(null)

  const firstCue = selected ? (result.transcript.tokens[selected.tokenStart]?.cueIndex ?? null) : null
  const lastCue = selected ? (result.transcript.tokens[selected.tokenEnd]?.cueIndex ?? firstCue) : null

  useEffect(() => {
    const scroller = scrollerRef.current
    if (!scroller || firstCue === null) return

    // The anchor is found by query rather than held in a ref. A ref attached
    // conditionally to whichever cue is currently selected gets detached by the
    // outgoing element after the incoming one has claimed it, depending on
    // which way the selection moved through the list, so it reads null exactly
    // when it is needed. Querying by index has no such ordering to get wrong.
    const active = scroller.querySelector<HTMLElement>(`[data-cue="${firstCue}"]`)
    if (!active) return

    // Scrolls the rail itself rather than the page. scrollIntoView on the
    // element would drag the whole window when the rail is off screen.
    //
    // No `behavior` option. Passing 'smooth' here silently did nothing in some
    // browser states, and the scroll simply never happened: a creator clicked a
    // band and the transcript sat where it was. The animation is CSS on
    // .rail-scroll instead, so if a browser declines to animate, the rail still
    // lands on the right line.
    scroller.scrollTo({ top: Math.max(0, active.offsetTop - scroller.clientHeight / 3) })
  }, [firstCue])

  return (
    <section className="rail" aria-label="Transcript">
      <header className="rail-head">
        <span className="gl-label">Transcript</span>
        <span className="gl-mono rail-source">
          {result.transcript.source}
          {result.transcript.exactTimings ? ' · word timings' : ' · line timings'}
        </span>
      </header>

      <div className="rail-scroll" ref={scrollerRef}>
        {result.transcript.cues.map((cue) => {
          const inSelection =
            firstCue !== null && lastCue !== null && cue.index >= firstCue && cue.index <= lastCue

          return (
            <button
              type="button"
              key={cue.index}
              data-cue={cue.index}
              className={`cue ${inSelection ? 'cue-on' : ''}`}
              onClick={() => cue.startSec !== null && onSeek(cue.startSec)}
            >
              <span className="cue-time gl-mono">
                {cue.startSec === null ? '--' : formatTime(cue.startSec)}
              </span>
              <span className="cue-text">{cue.text}</span>
            </button>
          )
        })}
      </div>
    </section>
  )
}
