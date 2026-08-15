'use client'

/**
 * The drop zone and the state machine behind it.
 *
 * Contract: owns the whole client side flow and is the only component that
 * calls into `lib/media` and `lib/engine`. Everything below it renders a
 * `ClearingResult` and nothing else. Callers: `app/page.tsx`.
 *
 * The state machine is explicit rather than a set of booleans. A creator
 * dropping a 40 minute video waits through a model download and then a
 * transcription, and each of those has to be able to say what it is doing and
 * what went wrong. Booleans lose that the first time two of them are true.
 *
 * The dropped file is kept alive as an object URL so the player can seek back
 * into it. It is revoked when another file arrives, because a 2GB video held by
 * a stale URL is a 2GB leak.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { clearSegments, clearText } from '@/lib/engine'
import type { ClearingResult } from '@/lib/engine/types'
import { DecodeError, decodeToPcm, isProbablySupported } from '@/lib/media/decode'
import { transcribe } from '@/lib/media/transcribe'
import { Clearing, type MediaSource } from './clearing'

type Stage =
  | { name: 'idle' }
  | {
      name: 'working'
      label: string
      detail: string
      ratio: number | null
      /** Projected total for this stage, in seconds, or null if unknown. */
      projectedTotalSec: number | null
      /** When the stage began, so the display can count down from it. */
      startedAt: number
      /** True once this machine has been timed rather than assumed. */
      calibrated: boolean
    }
  | {
      name: 'done'
      result: ClearingResult
      media: MediaSource | null
      note: string | null
      sourceName: string
    }
  | { name: 'error'; message: string }

const SAMPLES = [
  {
    file: 'gaming-patch-rant.srt',
    title: 'Gaming, patch rant',
    note: 'Swearing in the opening line. Plus game violence, which should not count against anybody.',
  },
  {
    file: 'true-crime-hollow-lane.srt',
    title: 'True crime, narration',
    note: 'One coroner passage. Instagram limits it, YouTube waves it through.',
  },
  {
    file: 'studio-tour-clean.srt',
    title: 'Studio tour',
    note: 'Clean the whole way. Green here means green, not that nobody looked.',
  },
]

const SUBTITLE_EXTENSIONS = ['srt', 'vtt', 'json', 'txt']

export function Bench() {
  const [stage, setStage] = useState<Stage>({ name: 'idle' })
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const mediaUrlRef = useRef<string | null>(null)

  const releaseMedia = useCallback(() => {
    if (mediaUrlRef.current) {
      URL.revokeObjectURL(mediaUrlRef.current)
      mediaUrlRef.current = null
    }
  }, [])

  const runFile = useCallback(
    async (file: File) => {
      releaseMedia()
      const extension = file.name.split('.').pop()?.toLowerCase() ?? ''
      const clearedAt = new Date().toISOString()

      try {
        if (SUBTITLE_EXTENSIONS.includes(extension)) {
          setStage({ name: 'working', label: 'Reading the transcript', detail: file.name, ratio: null, projectedTotalSec: null, startedAt: 0, calibrated: false })
          const text = await file.text()
          const result = clearText(file.name, text, { clearedAt })
          setStage({
            name: 'done',
            result,
            media: null,
            sourceName: file.name,
            note: 'Read from a subtitle file, so the timecodes land on the line rather than the word. Drop the video in if you want them exact.',
          })
          return
        }

        if (!isProbablySupported(file.name)) {
          setStage({
            name: 'error',
            message: `Greenlight cannot open ${extension ? `.${extension} files` : 'that file'}. Try an MP4, MOV, MP3 or WAV. Or drop your subtitle file instead.`,
          })
          return
        }

        setStage({ name: 'working', label: 'Reading the audio', detail: file.name, ratio: null, projectedTotalSec: null, startedAt: 0, calibrated: false })
        const { pcm, durationSec } = await decodeToPcm(file, (progress) => {
          setStage({
            name: 'working',
            label:
              progress.stage === 'reading'
                ? 'Reading the file'
                : progress.stage === 'decoding'
                  ? 'Decoding the audio'
                  : 'Resampling to 16kHz',
            detail: file.name,
            ratio: progress.ratio,
            projectedTotalSec: null,
            startedAt: 0,
            calibrated: false,
          })
        })

        // One clock for the whole transcription, taken here rather than on
        // every progress message, so the countdown does not restart each time
        // the worker speaks.
        const transcribeStartedAt = Date.now()

        const transcription = await transcribe(pcm, {
          durationSec,
          onProgress: (progress) => {
            setStage({
              name: 'working',
              label: progress.stage === 'model' ? 'Loading the speech model' : 'Transcribing',
              detail: progress.note,
              ratio: progress.ratio,
              projectedTotalSec: progress.projectedTotalSec,
              startedAt: transcribeStartedAt,
              calibrated: progress.calibrated,
            })
          },
        })

        setStage({ name: 'working', label: 'Clearing', detail: 'Checking against the packs', ratio: null, projectedTotalSec: null, startedAt: 0, calibrated: false })
        const result = clearSegments(transcription.segments, 'whisper', { clearedAt, durationSec })

        mediaUrlRef.current = URL.createObjectURL(file)
        const where = transcription.device === 'webgpu' ? 'GPU' : 'CPU'

        setStage({
          name: 'done',
          result,
          media: {
            url: mediaUrlRef.current,
            kind: file.type.startsWith('video/') ? 'video' : 'audio',
            name: file.name,
          },
          sourceName: file.name,
          note: transcription.wordTimestamps
            ? `Transcribed here on your ${where}, word by word. Nothing left the machine.`
            : `Transcribed here on your ${where}. This model timed the lines rather than the words, so the timecodes land on the line. Nothing left the machine.`,
        })
      } catch (error) {
        setStage({
          name: 'error',
          message:
            error instanceof DecodeError || error instanceof Error
              ? error.message
              : 'Something went wrong that Greenlight could not name. Try a subtitle file.',
        })
      }
    },
    [releaseMedia]
  )

  const runSample = useCallback(
    async (file: string) => {
      releaseMedia()
      setStage({ name: 'working', label: 'Opening the sample', detail: file, ratio: null, projectedTotalSec: null, startedAt: 0, calibrated: false })
      try {
        const response = await fetch(`/samples/${file}`)
        if (!response.ok) throw new Error('That sample could not be loaded.')
        const text = await response.text()
        const result = clearText(file, text, { clearedAt: new Date().toISOString() })
        setStage({
          name: 'done',
          result,
          media: null,
          sourceName: file,
          note: 'Sample cut, read from its subtitle file. Drop one of your own in for the real thing.',
        })
      } catch (error) {
        setStage({
          name: 'error',
          message: error instanceof Error ? error.message : 'That sample could not be loaded.',
        })
      }
    },
    [releaseMedia]
  )

  const compact = stage.name === 'done'

  return (
    <div className="bench">
      <section
        className={`drop ${dragging ? 'drop-active' : ''} ${compact ? 'drop-compact' : ''}`}
        onDragOver={(event) => {
          event.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault()
          setDragging(false)
          const file = event.dataTransfer.files[0]
          if (file) void runFile(file)
        }}
      >
        <input
          ref={inputRef}
          id="cut-file"
          className="visually-hidden"
          type="file"
          aria-label="Choose a video, audio or subtitle file to clear"
          accept="video/*,audio/*,.srt,.vtt,.json,.txt"
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) void runFile(file)
          }}
        />

        {stage.name === 'working' ? (
          <Working stage={stage} />
        ) : (
          <>
            <p className="drop-title">{compact ? 'Clear another cut' : 'Drop the cut in'}</p>
            {!compact && (
              <p className="drop-note">
                MP4, MOV, MP3, WAV, or a subtitle file. All of it happens in this tab. Nothing leaves your
                machine.
              </p>
            )}
            <button type="button" className="drop-button" onClick={() => inputRef.current?.click()}>
              Choose a file
            </button>
          </>
        )}
      </section>

      {stage.name === 'error' && (
        <p className="error" role="alert">
          {stage.message}
        </p>
      )}

      {!compact && (
        <section className="samples">
          <p className="gl-label">Or open a sample cut</p>
          <div className="sample-row">
            {SAMPLES.map((sample) => (
              <button
                key={sample.file}
                type="button"
                className="sample"
                onClick={() => void runSample(sample.file)}
              >
                <span className="sample-title">{sample.title}</span>
                <span className="sample-note">{sample.note}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {stage.name === 'done' && (
        <Clearing
          result={stage.result}
          media={stage.media}
          note={stage.note}
          sourceName={stage.sourceName}
        />
      )}
    </div>
  )
}

/**
 * The waiting screen.
 *
 * The countdown ticks locally rather than waiting for the next message from the
 * worker. Whisper reports once every thirty second window, so a display that
 * only updated on those messages would sit frozen on the same number for half a
 * minute at a time, which reads as a hang. The estimate arrives, and this
 * counts down from it.
 */
function Working({ stage }: { stage: Extract<Stage, { name: 'working' }> }) {
  const [now, setNow] = useState(() => Date.now())
  const projected = stage.projectedTotalSec

  useEffect(() => {
    if (projected === null) return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [projected, stage.startedAt])

  const elapsed = projected === null ? 0 : Math.max(0, (now - stage.startedAt) / 1000)
  const remaining = projected === null ? null : projected - elapsed
  const overrun = remaining !== null && remaining <= 0

  // The bar tracks the projection while it holds, then parks just short of full
  // rather than completing, because a full bar over unfinished work is the
  // thing that makes a page look hung.
  const fill =
    stage.ratio !== null
      ? stage.ratio
      : projected === null
        ? null
        : Math.min(0.97, elapsed / projected)

  return (
    <div className="working">
      <p className="drop-title">{stage.label}</p>
      <p className="drop-note">{stage.detail}</p>

      <div className="bar" aria-hidden="true">
        <span
          className={fill === null ? 'bar-fill bar-indeterminate' : 'bar-fill'}
          style={fill === null ? undefined : { width: `${Math.round(fill * 100)}%` }}
        />
      </div>

      <p className="eta gl-mono" aria-live="polite">
        {projected === null
          ? 'Working out how long this takes.'
          : overrun
            ? `Running long. ${formatEta(elapsed)} in, still going.`
            : `About ${formatEta(remaining ?? 0)} left${stage.calibrated ? '' : '. First run here, so take that loosely'}`}
      </p>
    </div>
  )
}

function formatEta(seconds: number): string {
  const whole = Math.ceil(seconds)
  if (whole < 60) return `${whole}s`
  const minutes = Math.floor(whole / 60)
  const rest = whole % 60
  return rest === 0 ? `${minutes}m` : `${minutes}m ${String(rest).padStart(2, '0')}s`
}




