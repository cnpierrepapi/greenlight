'use client'

/**
 * The bench: drop a cut in, watch it clear, read the verdicts.
 *
 * Contract: owns the whole client side state machine and is the only component
 * that calls into `lib/media` and `lib/engine`. Everything below it renders a
 * `ClearingResult` and nothing else.
 *
 * The state machine is deliberately explicit rather than a set of booleans. A
 * creator dropping a 40 minute video waits through a model download and then a
 * transcription, and every one of those stages has to be able to say what it is
 * doing and what went wrong. Booleans lose that the first time two of them are
 * true at once.
 */

import { useCallback, useRef, useState } from 'react'
import { clearSegments, clearText } from '@/lib/engine'
import type { ClearingResult, Finding, VerdictLevel } from '@/lib/engine/types'
import { DecodeError, decodeToPcm, isProbablySupported } from '@/lib/media/decode'
import { transcribe } from '@/lib/media/transcribe'

type Stage =
  | { name: 'idle' }
  | { name: 'working'; label: string; detail: string; ratio: number | null }
  | { name: 'done'; result: ClearingResult; note: string | null }
  | { name: 'error'; message: string }

const SAMPLES = [
  { file: 'gaming-patch-rant.srt', title: 'Gaming, patch rant', note: '13 min. Language in the opening line, and game violence that should not count.' },
  { file: 'true-crime-hollow-lane.srt', title: 'True crime, narration', note: '15 min. A coroner passage that three platforms judge differently.' },
  { file: 'studio-tour-clean.srt', title: 'Studio tour', note: '7 min. Clean. Proves a green result is a real answer.' },
]

const SUBTITLE_EXTENSIONS = ['srt', 'vtt', 'json', 'txt']

export function Bench() {
  const [stage, setStage] = useState<Stage>({ name: 'idle' })
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const runFile = useCallback(async (file: File) => {
    const extension = file.name.split('.').pop()?.toLowerCase() ?? ''
    const clearedAt = new Date().toISOString()

    try {
      if (SUBTITLE_EXTENSIONS.includes(extension)) {
        setStage({ name: 'working', label: 'Reading the transcript', detail: file.name, ratio: null })
        const text = await file.text()
        const result = clearText(file.name, text, { clearedAt })
        setStage({ name: 'done', result, note: null })
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
          label: progress.stage === 'reading' ? 'Reading the file' : progress.stage === 'decoding' ? 'Decoding the audio' : 'Resampling',
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

      setStage({
        name: 'done',
        result,
        note: transcription.wordTimestamps
          ? `Transcribed on this machine, ${transcription.device === 'webgpu' ? 'GPU' : 'CPU'}, with per word timings.`
          : `Transcribed on this machine, ${transcription.device === 'webgpu' ? 'GPU' : 'CPU'}. This model returned timings per line rather than per word, so timecodes are accurate to the line.`,
      })
    } catch (error) {
      setStage({
        name: 'error',
        message:
          error instanceof DecodeError
            ? error.message
            : error instanceof Error
              ? error.message
              : 'Something failed that Greenlight could not name. Try a subtitle file.',
      })
    }
  }, [])

  const runSample = useCallback(async (file: string) => {
    setStage({ name: 'working', label: 'Opening the sample', detail: file, ratio: null })
    try {
      const response = await fetch(`/samples/${file}`)
      if (!response.ok) throw new Error('That sample could not be loaded.')
      const text = await response.text()
      const result = clearText(file, text, { clearedAt: new Date().toISOString() })
      setStage({ name: 'done', result, note: 'Sample cut, cleared from its subtitle file.' })
    } catch (error) {
      setStage({ name: 'error', message: error instanceof Error ? error.message : 'That sample could not be loaded.' })
    }
  }, [])

  return (
    <div className="bench">
      <section
        className={`drop ${dragging ? 'drop-active' : ''}`}
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
        {/* Visually hidden rather than `hidden`, which would take it out of the
            accessibility tree and leave keyboard and screen reader users with a
            button that opens nothing. */}
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
            <p className="drop-title">Drop the cut in</p>
            <p className="drop-note">
              MP4, MOV, MP3, WAV, or a subtitle file. Video is transcribed here in your browser and never uploaded.
            </p>
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

      <section className="samples">
        <p className="gl-label">Or open a sample cut</p>
        <div className="sample-row">
          {SAMPLES.map((sample) => (
            <button key={sample.file} type="button" className="sample" onClick={() => void runSample(sample.file)}>
              <span className="sample-title">{sample.title}</span>
              <span className="sample-note">{sample.note}</span>
            </button>
          ))}
        </div>
      </section>

      {stage.name === 'done' && <Result result={stage.result} note={stage.note} />}
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

function Result({ result, note }: { result: ClearingResult; note: string | null }) {
  const duration = result.transcript.durationSec

  return (
    <section className="result">
      <div className="verdicts">
        {result.platforms.map((platform) => (
          <article key={platform.packId} className={`verdict level-${platform.level}`}>
            <header>
              <span className="verdict-name">{platform.packLabel}</span>
              <span className="stamp">{label(platform.level)}</span>
            </header>
            <ul>
              {platform.categories
                .filter((category) => category.level !== 'cleared')
                .map((category) => (
                  <li key={category.categoryId}>
                    <span className={`dot dot-${category.level}`} aria-hidden="true" />
                    <span>
                      <strong>{category.label}.</strong> {category.reason}
                    </span>
                  </li>
                ))}
              {platform.categories.every((category) => category.level === 'cleared') && (
                <li className="all-clear">Nothing above the threshold in any category.</li>
              )}
            </ul>
          </article>
        ))}
      </div>

      <div className="findings">
        <p className="gl-label">
          {result.findings.length} finding{result.findings.length === 1 ? '' : 's'}
          {duration ? ` across ${formatTime(duration)}` : ''}
          {result.considered.length > 0 ? `, ${result.considered.length} considered and cleared` : ''}
        </p>

        {result.findings.map((finding) => (
          <FindingRow key={finding.id} finding={finding} />
        ))}

        {result.considered.length > 0 && (
          <details className="considered">
            <summary>Considered and cleared</summary>
            {result.considered.map((finding) => (
              <FindingRow key={finding.id} finding={finding} muted />
            ))}
          </details>
        )}

        {note && <p className="note">{note}</p>}
        <p className="note">
          Cleared against the packs as published on their retrieval dates. Greenlight reads published platform
          policy. It does not speak for any platform, it is not legal advice, and it cannot guarantee
          monetization.
        </p>
      </div>
    </section>
  )
}

function FindingRow({ finding, muted = false }: { finding: Finding; muted?: boolean }) {
  return (
    <article className={`finding ${muted ? 'finding-muted' : ''}`}>
      <div className="finding-time gl-mono">
        {finding.startSec === null ? 'no time' : formatTime(finding.startSec)}
      </div>
      <div className="finding-body">
        <p className="finding-quote">{finding.quote}</p>
        <p className="finding-meta gl-mono">
          {finding.class} · severity {finding.severity} · confidence {finding.confidence.toFixed(2)}
        </p>
        <ul className="finding-why">
          {finding.modifiers.map((modifier) => (
            <li key={modifier.id}>{modifier.note}</li>
          ))}
        </ul>
      </div>
    </article>
  )
}

function label(level: VerdictLevel): string {
  if (level === 'cleared') return 'Cleared'
  if (level === 'limited') return 'Limited'
  return 'Strike risk'
}

export function formatTime(seconds: number): string {
  const whole = Math.floor(seconds)
  const minutes = Math.floor(whole / 60)
  const rest = whole % 60
  const tenths = Math.floor((seconds - whole) * 10)
  return `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}.${tenths}`
}
