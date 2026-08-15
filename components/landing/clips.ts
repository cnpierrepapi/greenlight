/**
 * Real output, recorded.
 *
 * Contract: the data the landing page animates. Every line, timecode, flagged
 * term and verdict below was produced by Greenlight itself, transcribing these
 * three clips in a browser and clearing them against the packs. The clips are
 * in `public/clips/` and the waveforms on screen are drawn from their actual
 * audio.
 *
 * Recorded rather than computed at request time because the landing page must
 * paint instantly and cannot wait on a model download. It is a recording of a
 * real run, not an illustration of one, which also means it can go stale: if
 * the packs or the lexicon change what these clips produce, this file is wrong
 * until somebody re-runs them through /clear and updates it.
 */

export type Level = 'cleared' | 'limited' | 'strike'

/**
 * One line of speech, split around the word that was picked up.
 *
 * Split rather than stored whole because the flagged word has to sit where it
 * was actually said. The first version appended it to the end of the line and
 * "I swear this game is broken again" came out as "game is broken againfucking",
 * which reads as a bug and undermines the one thing the page is demonstrating.
 */
export interface Bubble {
  /** Seconds into the clip. Drives when the bubble appears. */
  atSec: number
  /** The words before the flagged one. */
  before: string
  /** The word Greenlight picked up, if this line has one. */
  flagged?: string
  /** The rest of the line after it. */
  after?: string
  /** What that word turned out to mean. */
  level?: Level
}

export interface LandingClip {
  id: string
  /** Muted, looping waveform drawn from this clip's own audio. */
  video: string
  /**
   * A frame from a loud moment of the same waveform.
   *
   * Not decoration. Browsers refuse muted autoplay more often than they should,
   * and without a poster the card sits on frame one, which for a waveform is
   * silence, which is a black rectangle. The poster means the worst case still
   * shows a voice.
   */
  poster: string
  title: string
  /** The one line summary under the card. */
  strap: string
  runtimeSec: number
  bubbles: Bubble[]
  verdicts: { platform: string; level: Level }[]
  /** The finding, as the app reported it. */
  finding: { span: string; term: string; className: string; countedBy: string }
}

export const CLIPS: LandingClip[] = [
  {
    id: 'language',
    video: '/clips/yt-language.mp4',
    poster: '/clips/yt-language.jpg',
    title: 'Two words, eleven seconds in',
    strap: 'Strong language in the opening thirty seconds. YouTube limits it. Nobody else cares.',
    runtimeSec: 11,
    bubbles: [
      { atSec: 0.4, before: 'Right, what the', flagged: 'fuck', after: 'was that patch?', level: 'limited' },
      { atSec: 3.4, before: 'I swear this', flagged: 'fucking', after: 'game is broken again.', level: 'limited' },
      { atSec: 6.2, before: 'Anyway, welcome back to the channel.' },
    ],
    verdicts: [
      { platform: 'YouTube', level: 'limited' },
      { platform: 'TikTok', level: 'cleared' },
      { platform: 'Instagram', level: 'cleared' },
    ],
    finding: {
      span: '00:01.5 to 00:04.5',
      term: 'fuck, fucking',
      className: 'profanity.strong',
      countedBy: 'YouTube',
    },
  },
  {
    id: 'selfharm',
    video: '/clips/tt-selfharm.mp4',
    poster: '/clips/tt-selfharm.jpg',
    title: 'One word, three different answers',
    strap: 'TikTok removes it, Instagram limits it, YouTube lets the framing carry it.',
    runtimeSec: 14,
    bubbles: [
      { atSec: 0.5, before: 'This next part is heavy, so here is your warning.' },
      {
        atSec: 4.8,
        before: 'The report said he had attempted',
        flagged: 'suicide',
        after: 'twice before anyone noticed.',
        level: 'strike',
      },
      { atSec: 10.2, before: 'If you are struggling, there are people who will help.' },
    ],
    verdicts: [
      { platform: 'TikTok', level: 'strike' },
      { platform: 'Instagram', level: 'limited' },
      { platform: 'YouTube', level: 'cleared' },
    ],
    finding: {
      span: '00:06.0 to 00:06.7',
      term: 'suicide',
      className: 'selfharm',
      countedBy: 'Instagram, TikTok',
    },
  },
  {
    id: 'injury',
    video: '/clips/ig-injury.mp4',
    poster: '/clips/ig-injury.jpg',
    title: 'The framing that saves you on one platform',
    strap: 'Attributed to a coroner. YouTube and TikTok accept that. Instagram says it still counts.',
    runtimeSec: 12,
    bubbles: [
      {
        atSec: 0.5,
        before: "According to the coroner's report, the",
        flagged: 'injuries',
        after: 'were extensive.',
        level: 'limited',
      },
      {
        atSec: 4.9,
        before: 'The record lists seven separate',
        flagged: 'wounds',
        after: 'and significant blood loss.',
        level: 'limited',
      },
      { atSec: 9.0, before: 'I am reading it out because the jury never saw it.' },
    ],
    verdicts: [
      { platform: 'Instagram', level: 'limited' },
      { platform: 'YouTube', level: 'cleared' },
      { platform: 'TikTok', level: 'cleared' },
    ],
    finding: {
      span: '00:02.7 to 00:08.1',
      term: 'injuries, wounds, blood',
      className: 'violence.graphic',
      countedBy: 'Instagram',
    },
  },
]

