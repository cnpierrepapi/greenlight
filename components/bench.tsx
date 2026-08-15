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

import { useCallback, useRef, useState } from 'react'
import { clearSegments, clearText } from '@/lib/engine'
import type { ClearingResult } from '@/lib/engine/types'
import { DecodeError, decodeToPcm, isProbablySupported } from '@/lib/media/decode'
import { transcribe } from '@/lib/media/transcribe'
import { Clearing, type MediaSource } from './clearing'

type Stage =
  | { name: 'idle' }
  | { name: 'working'; label: string; detail: string; ratio: number | null }
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
    note: 'Language in the opening line, and game violence that should not count against anybody.',
  },
  {
    file: 'true-crime-hollow-lane.srt',
    title: 'True crime, narration',
    note: 'A coroner passage that Instagram limits and YouTube clears. Same cut, different answers.',
  },
  {
    file: 'studio-tour-clean.srt',
    title: 'Studio tour',
    note: 'Clean all the way through, which proves a green result is an answer and not a shrug.',
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
          setStage({ name: 'working', label: 'Reading the transcript', detail: file.name, ratio: null })
          const text = await file.text()
          const result = clearText(file.name, text, { clearedAt })
          setStage({
            name: 'done',
            result,
            media: null,
            sourceName: file.name,
            note: 'Cleared from a subtitle file, so timecodes are accurate to the line. Drop the video in for word level timings.',
          })
          return
        }

        if (!isProbablySupported(file.name)) {
          setStage({
            name: 'error',
            message: `Greenlight cannot open ${extension ? `.${extension} files` : 'that file'}. Drop an MP4, MOV, MP3 or WAV, or a subtitle file.`,
          })
          return
        }

        setStage({ name: 'working', label: 'Reading the audio', detail: file.name, ratio: null })
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
          })
        })

        const transcription = await transcribe(pcm, {
          onProgress: (progress) => {
            setStage({
              name: 'working',
              label: progress.stage === 'model' ? 'Loading the speech model' : 'Transcribing',
              detail: progress.note,
              ratio: progress.ratio,
            })
          },
        })

        setStage({ name: 'working', label: 'Clearing', detail: 'Checking against the packs', ratio: null })
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
            ? `Transcribed on this machine on the ${where}, with per word timings. Nothing was uploaded.`
            : `Transcribed on this machine on the ${where}. This model returned timings per line rather than per word, so timecodes are accurate to the line. Nothing was uploaded.`,
        })
      } catch (error) {
        setStage({
          name: 'error',
          message:
            error instanceof DecodeError || error instanceof Error
              ? error.message
              : 'Something failed that Greenlight could not name. Try a subtitle file.',
        })
      }
    },
    [releaseMedia]
  )

  const runSample = useCallback(
    async (file: string) => {
      releaseMedia()
      setStage({ name: 'working', label: 'Opening the sample', detail: file, ratio: null })
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
          note: 'Sample cut, cleared from its subtitle file. Drop your own video in to see the word level path.',
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
                MP4, MOV, MP3, WAV, or a subtitle file. Video is transcribed here in your browser and never
                uploaded.
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

function Working({ stage }: { stage: Extract<Stage, { name: 'working' }> }) {
  return (
    <div className="working">
      <p className="drop-title">{stage.label}</p>
      <p className="drop-note">{stage.detail}</p>
      <div className="bar" aria-hidden="true">
        <span
          className={stage.ratio === null ? 'bar-fill bar-indeterminate' : 'bar-fill'}
          style={stage.ratio === null ? undefined : { width: `${Math.round(stage.ratio * 100)}%` }}
        />
      </div>
    </div>
  )
}

