/**
 * The transcription client. The only module that knows the Whisper worker
 * exists.
 *
 * Contract: `transcribe(pcm, options)` returns `RawSegment[]` ready for
 * `clearSegments()` in `lib/engine`, plus what it took to get there. Browser
 * only. Callers: the drop handler in the UI.
 *
 * Two judgements live here rather than in the worker.
 *
 * 1. Device choice and fallback. WebGPU is tried when the browser has it and
 *    wasm is the fallback, including when WebGPU is present but fails at
 *    runtime, which happens on older drivers and inside some browser profiles.
 *    A creator should never see a GPU error, they should see it working slower.
 *
 * 2. Whether the timings that came back are per word or per chunk.
 *    transformers.js is asked for word level and quietly returns chunk level
 *    for some models, so the answer is measured from the output rather than
 *    assumed from the request. That single boolean decides whether the cut list
 *    is accurate to the word or to the sentence, and it is carried all the way
 *    to the report instead of being papered over.
 */

import type { RawSegment, RawWord } from '@/lib/engine/types'
import type { TranscribeRequest, WhisperChunk, WhisperDevice, WorkerMessage } from './whisper.worker'

/**
 * The default is the small English model. It is roughly a 40MB download and it
 * runs on a laptop with no GPU, which is the machine a judge or a creator
 * actually has. Accuracy is good enough for the job here, because a finding is
 * confirmed against the creator's own audio at a timecode before they cut.
 */
export const MODELS = {
  fast: { id: 'Xenova/whisper-tiny.en', label: 'Fast', note: 'About 40MB. Good on any laptop.' },
  accurate: { id: 'Xenova/whisper-base.en', label: 'Accurate', note: 'About 150MB. Slower, better with accents.' },
} as const

export type ModelChoice = keyof typeof MODELS

export interface TranscribeOptions {
  model?: ModelChoice
  onProgress?: (progress: TranscribeProgress) => void
  signal?: AbortSignal
  /** Runtime of the audio. Without it there is no ETA, only a spinner. */
  durationSec?: number
}

export interface TranscribeProgress {
  stage: 'model' | 'transcribe'
  ratio: number | null
  note: string
  /**
   * How long the whole transcription is projected to take, in seconds, or null
   * when there is nothing to base that on.
   *
   * A projection, not a measurement, and the interface says so. transformers.js
   * exposes no per window hook, so nothing can honestly claim to know how far
   * through it is. What it can do is know how fast this machine went last time
   * and say "about". When the projection runs out and the work is still going,
   * the interface stops counting down and says it is taking longer, because a
   * countdown stuck on zero is how a working page comes to look broken.
   */
  projectedTotalSec: number | null
  /** True once this machine has actually been timed, rather than assumed. */
  calibrated: boolean
}

/**
 * How many seconds of audio this machine gets through per wall clock second,
 * remembered between runs so the first estimate on the next video is not a
 * guess. Written after every successful transcription.
 */
const SPEED_KEY = 'greenlight.speed'

interface SpeedRecord {
  webgpu?: number
  wasm?: number
}

/**
 * Conservative first guesses, used only until this machine has run once.
 *
 * Deliberately pessimistic. An estimate that turns out short is a pleasant
 * surprise; one that turns out long is the tool lying to somebody who planned
 * around it.
 */
const ASSUMED_SPEED: Record<WhisperDevice, number> = { webgpu: 2, wasm: 0.8 }

/** Runs shorter than this do not update the speed. See writeSpeed's caller. */
const CALIBRATION_MIN_SEC = 45

function readSpeed(device: WhisperDevice): { speed: number; calibrated: boolean } {
  if (typeof localStorage === 'undefined') return { speed: ASSUMED_SPEED[device], calibrated: false }
  try {
    const stored = JSON.parse(localStorage.getItem(SPEED_KEY) ?? '{}') as SpeedRecord
    const value = stored[device]
    return typeof value === 'number' && value > 0
      ? { speed: value, calibrated: true }
      : { speed: ASSUMED_SPEED[device], calibrated: false }
  } catch {
    return { speed: ASSUMED_SPEED[device], calibrated: false }
  }
}

function writeSpeed(device: WhisperDevice, speed: number): void {
  if (typeof localStorage === 'undefined' || !Number.isFinite(speed) || speed <= 0) return
  try {
    const stored = JSON.parse(localStorage.getItem(SPEED_KEY) ?? '{}') as SpeedRecord
    // Averaged with the previous reading so one cold run does not swing it.
    const previous = stored[device]
    stored[device] = typeof previous === 'number' ? (previous + speed) / 2 : speed
    localStorage.setItem(SPEED_KEY, JSON.stringify(stored))
  } catch {
    // A browser with storage disabled just gets the assumed speed next time.
  }
}

export interface TranscriptionResult {
  segments: RawSegment[]
  /** True when Whisper gave per word timings. Reaches the report. */
  wordTimestamps: boolean
  device: WhisperDevice
  model: string
}

export function pickDevice(): WhisperDevice {
  return typeof navigator !== 'undefined' && 'gpu' in navigator ? 'webgpu' : 'wasm'
}

export async function transcribe(
  pcm: Float32Array,
  options: TranscribeOptions = {}
): Promise<TranscriptionResult> {
  const model = MODELS[options.model ?? 'fast'].id
  const first = pickDevice()

  try {
    return await run(pcm, model, first, options)
  } catch (error) {
    if (first === 'webgpu') {
      options.onProgress?.({
        stage: 'model',
        ratio: null,
        note: 'This machine could not use the GPU path, so it is running on the CPU instead. Slower, same result.',
        projectedTotalSec: null,
        calibrated: false,
      })
      return await run(pcm, model, 'wasm', options)
    }
    throw error
  }
}

function run(
  pcm: Float32Array,
  model: string,
  device: WhisperDevice,
  options: TranscribeOptions
): Promise<TranscriptionResult> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./whisper.worker.ts', import.meta.url), { type: 'module' })

    const duration = options.durationSec ?? 0
    const { speed, calibrated } = readSpeed(device)
    let startedAt = 0

    const finish = () => {
      worker.terminate()
      options.signal?.removeEventListener('abort', onAbort)
    }

    const onAbort = () => {
      finish()
      reject(new Error('Transcription cancelled.'))
    }
    options.signal?.addEventListener('abort', onAbort, { once: true })

    worker.addEventListener('message', (event: MessageEvent<WorkerMessage>) => {
      const message = event.data

      if (message.type === 'progress') {
        if (message.stage !== 'transcribe') {
          // Model download. It has a real ratio of its own and no bearing on
          // how long the transcription will take.
          options.onProgress?.({
            stage: message.stage,
            ratio: message.ratio,
            note: message.note,
            projectedTotalSec: null,
            calibrated: false,
          })
          return
        }

        // The clock starts at the first sign of transcription, not when the
        // worker was created, so a slow model download does not make the
        // machine look slow.
        if (startedAt === 0) startedAt = Date.now()

        options.onProgress?.({
          stage: 'transcribe',
          ratio: null,
          note: message.note,
          projectedTotalSec: duration > 0 ? duration / speed : null,
          calibrated,
        })
        return
      }

      if (message.type === 'error') {
        finish()
        reject(new Error(message.message))
        return
      }

      finish()

      // Remember how fast this machine actually was, so the next video opens
      // with a real number instead of an assumption.
      //
      // Short clips are excluded. A ten second clip is mostly fixed startup
      // cost, so timing one and calling the result a speed makes the machine
      // look several times slower than it is, and every later estimate inherits
      // that. Only runs long enough for the steady state to dominate count.
      if (startedAt > 0 && duration >= CALIBRATION_MIN_SEC) {
        writeSpeed(message.device, duration / ((Date.now() - startedAt) / 1000))
      }

      const wordTimestamps = looksWordLevel(message.chunks)
      resolve({
        segments: chunksToSegments(message.chunks, wordTimestamps),
        wordTimestamps,
        device: message.device,
        model: message.model,
      })
    })

    worker.addEventListener('error', (event) => {
      finish()
      reject(new Error(event.message || 'The transcription worker failed to start.'))
    })

    // The samples are transferred rather than copied. A 13 minute video is
    // about 25MB of floats, and copying it into the worker doubles peak memory
    // for no reason.
    const request: TranscribeRequest = { type: 'transcribe', pcm, model, device }
    worker.postMessage(request, [pcm.buffer])
  })
}

/**
 * Measures whether the output is per word or per chunk, rather than trusting
 * that `return_timestamps: 'word'` was honoured.
 *
 * Word level output is overwhelmingly one word per chunk. Chunk level output is
 * whole phrases. Averaging over the first fifty is enough to tell them apart
 * and cannot be fooled by one long compound word.
 */
export function looksWordLevel(chunks: WhisperChunk[]): boolean {
  if (chunks.length === 0) return false
  const sample = chunks.slice(0, 50)
  const words = sample.reduce((n, chunk) => n + chunk.text.trim().split(/\s+/).length, 0)
  return words / sample.length < 2.5
}

/** A sentence is long enough to read and short enough to quote. */
const MAX_SEGMENT_SECONDS = 14
const MAX_SEGMENT_WORDS = 32

/**
 * Whisper output to segments.
 *
 * When timings are per word, words are gathered into sentences so the report
 * quotes a whole line, while every word keeps its own measured timing on
 * `RawSegment.words`. `normalize()` then marks those tokens `measured` and the
 * cut list is accurate to the word.
 *
 * When timings are per chunk, the chunk becomes a segment with no word timings
 * and `normalize()` marks its tokens `inferred`. Nothing pretends to a
 * precision it does not have.
 */
export function chunksToSegments(chunks: WhisperChunk[], wordTimestamps: boolean): RawSegment[] {
  if (!wordTimestamps) {
    return chunks
      .map((chunk) => ({
        text: chunk.text.trim(),
        startSec: chunk.timestamp[0] ?? null,
        endSec: chunk.timestamp[1] ?? null,
      }))
      .filter((segment) => segment.text !== '')
  }

  const segments: RawSegment[] = []
  let words: RawWord[] = []

  const flush = () => {
    if (words.length === 0) return
    const first = words[0] as RawWord
    const last = words[words.length - 1] as RawWord
    segments.push({
      text: words.map((word) => word.text).join(' '),
      startSec: first.startSec,
      endSec: last.endSec,
      words,
    })
    words = []
  }

  chunks.forEach((chunk, index) => {
    const text = chunk.text.trim()
    if (text === '') return

    const startSec = chunk.timestamp[0] ?? 0
    // The final word of a run often has a null end. The next word's start is
    // the honest answer, and a fifth of a second is the fallback when there is
    // no next word.
    const endSec = chunk.timestamp[1] ?? chunks[index + 1]?.timestamp[0] ?? startSec + 0.2

    words.push({ text, startSec, endSec })

    const spannedSeconds = endSec - (words[0]?.startSec ?? endSec)
    const endsSentence = /[.!?]$/.test(text)

    if (endsSentence || spannedSeconds >= MAX_SEGMENT_SECONDS || words.length >= MAX_SEGMENT_WORDS) {
      flush()
    }
  })

  flush()
  return segments
}
