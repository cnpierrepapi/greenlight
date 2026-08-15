/**
 * Whisper, in a Web Worker.
 *
 * Contract: receives `{ type: 'transcribe', pcm, model, device }` and posts back
 * `progress`, then exactly one `done` or `error`. Never touches the DOM.
 * Callers: `lib/media/transcribe.ts`, which is the only module that should know
 * this worker exists.
 *
 * It runs here rather than on the main thread because transcription is minutes
 * of solid compute. On the main thread the tab freezes, the progress bar it is
 * trying to draw never paints, and a creator concludes the product is broken
 * thirty seconds in.
 *
 * Word level timestamps are requested but not assumed. transformers.js returns
 * them for most models and quietly falls back to chunk level for some, so the
 * client checks what actually came back rather than trusting the request. See
 * transcribe.ts.
 */

import { pipeline, type AutomaticSpeechRecognitionPipeline } from '@huggingface/transformers'

export type WhisperDevice = 'webgpu' | 'wasm'

export interface TranscribeRequest {
  type: 'transcribe'
  pcm: Float32Array
  model: string
  device: WhisperDevice
}

export interface WhisperChunk {
  text: string
  timestamp: [number, number | null]
}

export type WorkerMessage =
  | { type: 'progress'; stage: 'model'; ratio: number | null; note: string }
  | { type: 'progress'; stage: 'transcribe'; ratio: number | null; note: string }
  | { type: 'done'; text: string; chunks: WhisperChunk[]; device: WhisperDevice; model: string }
  | { type: 'error'; message: string }

let cached: { key: string; instance: AutomaticSpeechRecognitionPipeline } | null = null

function post(message: WorkerMessage) {
  self.postMessage(message)
}

async function getPipeline(model: string, device: WhisperDevice) {
  const key = `${model}:${device}`
  if (cached?.key === key) return cached.instance

  const instance = (await pipeline('automatic-speech-recognition', model, {
    device,
    progress_callback: (event: { status?: string; progress?: number; file?: string }) => {
      if (event.status === 'progress' && typeof event.progress === 'number') {
        post({
          type: 'progress',
          stage: 'model',
          ratio: event.progress / 100,
          note: 'Downloading the speech model. This happens once, then it is cached.',
        })
      }
    },
  })) as AutomaticSpeechRecognitionPipeline

  cached = { key, instance }
  return instance
}

self.addEventListener('message', async (event: MessageEvent<TranscribeRequest>) => {
  const request = event.data
  if (request?.type !== 'transcribe') return

  try {
    const transcriber = await getPipeline(request.model, request.device)

    post({
      type: 'progress',
      stage: 'transcribe',
      ratio: null,
      note: 'Reading the audio.',
    })

    // No per window progress is reported here, and that is not an oversight.
    // transformers.js builds every 30 second window up front and then loops
    // through them inside one call, with no hook exposed. An earlier version of
    // this file passed a `chunk_callback` that does not exist in this version,
    // so it silently never fired and the interface counted down against
    // nothing. The honest signal is elapsed time against this machine's
    // measured speed, and that lives in transcribe.ts where it can be labelled
    // as the projection it is.
    const output = await transcriber(request.pcm, {
      // 30 second windows with a 5 second overlap is Whisper's own training
      // shape. The overlap is what stops a word being cut in half at a window
      // boundary, which would put a finding on the wrong side of a cut point.
      chunk_length_s: 30,
      stride_length_s: 5,
      return_timestamps: 'word',
    })

    const result = Array.isArray(output) ? output[0] : output

    post({
      type: 'done',
      text: String(result?.text ?? ''),
      chunks: (result?.chunks ?? []) as WhisperChunk[],
      device: request.device,
      model: request.model,
    })
  } catch (error) {
    post({
      type: 'error',
      message: error instanceof Error ? error.message : 'Transcription failed for an unknown reason.',
    })
  }
})
