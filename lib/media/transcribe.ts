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
}

export interface TranscribeProgress {
  stage: 'model' | 'transcribe'
  ratio: number | null
  note: string
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
        options.onProgress?.({ stage: message.stage, ratio: message.ratio, note: message.note })
        return
      }

      if (message.type === 'error') {
        finish()
        reject(new Error(message.message))
        return
      }

      finish()
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
