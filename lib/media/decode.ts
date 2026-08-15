/**
 * Video or audio file to the mono 16kHz samples Whisper wants.
 *
 * Contract: `decodeToPcm(file, onProgress)` returns `{ pcm, durationSec }`, or
 * throws a `DecodeError` whose message is written for a creator rather than a
 * developer. Browser only. Callers: `lib/media/transcribe.ts` and the drop
 * handler in the UI.
 *
 * There is no ffmpeg here and no server. The browser already contains a demuxer
 * and every codec it supports, reached through `decodeAudioData`, and using it
 * keeps the promise that the file never leaves the machine. The cost is that
 * the container support is Chrome's, not ffmpeg's, which is why this module
 * spends most of its length on saying clearly what it cannot open.
 */

export type DecodeFailure = 'unsupported-container' | 'no-audio-track' | 'too-large' | 'corrupt'

export class DecodeError extends Error {
  readonly kind: DecodeFailure
  constructor(kind: DecodeFailure, message: string) {
    super(message)
    this.name = 'DecodeError'
    this.kind = kind
  }
}

/** Whisper is trained at 16kHz. Anything else has to be resampled to it. */
export const TARGET_SAMPLE_RATE = 16000

/**
 * Files above this are refused before decoding rather than after.
 *
 * Decoding expands audio to 32 bit floats, so a long recording briefly holds
 * both the compressed file and the decoded buffer in memory. Refusing early
 * with a clear message beats a tab that dies with no explanation, which is what
 * a creator would otherwise see.
 */
export const MAX_FILE_BYTES = 2 * 1024 * 1024 * 1024

/** Containers Chrome can demux. Everything else gets named, not guessed at. */
const SUPPORTED_EXTENSIONS = ['mp4', 'm4a', 'm4v', 'mov', 'mp3', 'wav', 'webm', 'ogg', 'oga', 'flac', 'aac']

export interface DecodeResult {
  pcm: Float32Array
  durationSec: number
}

export interface DecodeProgress {
  stage: 'reading' | 'decoding' | 'resampling'
  /** 0 to 1 where the stage can report it, otherwise null. */
  ratio: number | null
}

export function extensionOf(filename: string): string {
  const match = /\.([a-z0-9]+)$/i.exec(filename.trim())
  return match?.[1]?.toLowerCase() ?? ''
}

export function isProbablySupported(filename: string): boolean {
  return SUPPORTED_EXTENSIONS.includes(extensionOf(filename))
}

export async function decodeToPcm(
  file: File,
  onProgress?: (progress: DecodeProgress) => void
): Promise<DecodeResult> {
  if (file.size > MAX_FILE_BYTES) {
    throw new DecodeError(
      'too-large',
      `That file is ${Math.round(file.size / 1024 / 1024 / 1024)}GB, which is past what a browser tab can decode. Export the audio on its own and drop that in instead.`
    )
  }

  const extension = extensionOf(file.name)
  if (extension === 'mkv' || extension === 'avi' || extension === 'wmv' || extension === 'flv') {
    throw new DecodeError(
      'unsupported-container',
      `Browsers cannot open ${extension.toUpperCase()} files. Export the audio as MP3 or WAV, or drop your subtitle file in instead.`
    )
  }

  onProgress?.({ stage: 'reading', ratio: null })
  const bytes = await file.arrayBuffer()

  onProgress?.({ stage: 'decoding', ratio: null })
  const audio = await decodeAudioData(bytes, file.name)

  if (audio.numberOfChannels === 0 || audio.length === 0) {
    throw new DecodeError('no-audio-track', 'That file has no audio track, so there is nothing to clear.')
  }

  onProgress?.({ stage: 'resampling', ratio: null })
  const pcm = await toMono16k(audio)

  return { pcm, durationSec: audio.duration }
}

async function decodeAudioData(bytes: ArrayBuffer, filename: string): Promise<AudioBuffer> {
  // A short lived context purely for decoding. Sample rate is left at the
  // hardware default here: forcing 16000 makes Safari refuse outright, and the
  // resample below handles it anyway.
  const context = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
  try {
    return await context.decodeAudioData(bytes)
  } catch {
    throw new DecodeError(
      'unsupported-container',
      `This browser could not open ${filename}. It is either an unsupported codec or the file is damaged. Export the audio as MP3 or WAV and drop that in.`
    )
  } finally {
    void context.close()
  }
}

/**
 * Downmix to mono and resample to 16kHz in one pass.
 *
 * `OfflineAudioContext` does both, using the browser's own resampler, which is
 * better than anything worth hand rolling here and runs off the main thread.
 * Averaging the channels rather than taking the left one matters for anyone who
 * records voice on one side and game audio on the other.
 */
async function toMono16k(audio: AudioBuffer): Promise<Float32Array> {
  if (audio.sampleRate === TARGET_SAMPLE_RATE && audio.numberOfChannels === 1) {
    return audio.getChannelData(0).slice()
  }

  const frames = Math.max(1, Math.ceil(audio.duration * TARGET_SAMPLE_RATE))
  const offline = new OfflineAudioContext(1, frames, TARGET_SAMPLE_RATE)

  const source = offline.createBufferSource()
  source.buffer = audio
  source.connect(offline.destination)
  source.start()

  const rendered = await offline.startRendering()
  return rendered.getChannelData(0).slice()
}
