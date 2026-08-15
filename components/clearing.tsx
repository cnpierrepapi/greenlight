'use client'

/**
 * The bench proper: everything you look at after a cut has been cleared.
 *
 * Contract: owns the one piece of state the four panels share, which finding is
 * selected, and the seek that follows from it. Takes a `ClearingResult` and an
 * optional media URL. Callers: `components/bench.tsx`.
 *
 * Selection is held here rather than in each panel because the whole point of
 * the layout is that the four views agree: click a band on the strip and the
 * transcript scrolls to it, the finding card opens, and the video jumps to the
 * second it happened. Four panels each holding their own idea of what is
 * selected is how that stops being true.
 *
 * The media element is only mounted when the source was a real video or audio
 * file. Clearing a subtitle file gives the same report with no player, and the
 * layout does not pretend otherwise.
 */

import { useCallback, useRef, useState } from 'react'
import type { ClearingResult, Finding } from '@/lib/engine/types'
import { Timeline } from './timeline'
import { Verdicts } from './verdicts'
import { TranscriptRail } from './transcript-rail'
import { Findings } from './findings'

export interface MediaSource {
  url: string
  kind: 'video' | 'audio'
  name: string
}

interface ClearingProps {
  result: ClearingResult
  media: MediaSource | null
  note: string | null
}

export function Clearing({ result, media, note }: ClearingProps) {
  const [selected, setSelected] = useState<Finding | null>(null)
  const [playheadSec, setPlayheadSec] = useState<number | null>(null)
  const playerRef = useRef<HTMLVideoElement | HTMLAudioElement>(null)

  const seek = useCallback((seconds: number) => {
    const player = playerRef.current
    if (!player) return
    // A quarter second of lead in. Landing exactly on the word means the first
    // syllable is already gone by the time the audio starts, and a creator
    // checking a finding needs to hear it said.
    player.currentTime = Math.max(0, seconds - 0.25)
    void player.play().catch(() => {
      // Autoplay refusal is not an error worth showing. The playhead moved and
      // the creator can press play.
    })
  }, [])

  const select = useCallback(
    (finding: Finding) => {
      setSelected(finding)
      if (finding.startSec !== null) {
        setPlayheadSec(finding.startSec)
        seek(finding.startSec)
      }
    },
    [seek]
  )

  return (
    <div className="clearing">
      <Timeline
        result={result}
        selectedId={selected?.id ?? null}
        onSelect={select}
        playheadSec={playheadSec}
      />

      {media && (
        <div className="player">
          {media.kind === 'video' ? (
            <video
              ref={playerRef as React.RefObject<HTMLVideoElement>}
              src={media.url}
              controls
              preload="metadata"
              onTimeUpdate={(event) => setPlayheadSec(event.currentTarget.currentTime)}
            />
          ) : (
            <audio
              ref={playerRef as React.RefObject<HTMLAudioElement>}
              src={media.url}
              controls
              preload="metadata"
              onTimeUpdate={(event) => setPlayheadSec(event.currentTarget.currentTime)}
            />
          )}
          <p className="gl-mono player-name">{media.name}</p>
        </div>
      )}

      <Verdicts result={result} onSelect={select} />

      <div className="split">
        <TranscriptRail
          result={result}
          selected={selected}
          onSeek={(seconds) => {
            setPlayheadSec(seconds)
            seek(seconds)
          }}
        />
        <Findings result={result} selectedId={selected?.id ?? null} onSelect={select} />
      </div>

      <footer className="clearing-foot">
        {note && <p className="note">{note}</p>}
        <p className="note">
          Packs read on {[...new Set(result.platforms.map((p) => p.packVersion))].join(', ')} · engine{' '}
          {result.engineVersion}. Greenlight reads published platform policy. It does not speak for any
          platform, it is not legal advice, and it cannot guarantee monetization. The platform makes the
          call.
        </p>
      </footer>
    </div>
  )
}
