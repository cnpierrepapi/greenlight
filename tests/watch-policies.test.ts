import { describe, it, expect } from 'vitest'
// @ts-expect-error plain .mjs script, no types, exercised here for its pure parts
import { toComparableText, hashText } from '../scripts/watch-policies.mjs'

describe('toComparableText', () => {
  it('drops scripts and styles rather than hashing their contents', () => {
    const html = `
      <html><head><style>.a{color:red}</style><script>var buildId="abc123"</script></head>
      <body><p>Excessive profanity may be ineligible.</p></body></html>`
    const text = toComparableText(html)
    expect(text).toBe('Excessive profanity may be ineligible.')
  })

  it('is stable when only a build id inside a script changes', () => {
    const page = (build: string) =>
      `<html><script>var b="${build}"</script><body><p>Same policy wording.</p></body></html>`
    expect(hashText(toComparableText(page('r1')))).toBe(hashText(toComparableText(page('r2'))))
  })

  it('changes when the policy wording changes', () => {
    const a = toComparableText('<body><p>Occasional profanity is eligible.</p></body>')
    const b = toComparableText('<body><p>Occasional profanity is not eligible.</p></body>')
    expect(hashText(a)).not.toBe(hashText(b))
  })

  it('collapses whitespace so a reflow is not read as a change', () => {
    const a = toComparableText('<body><p>Graphic   injury\n\n  is ineligible.</p></body>')
    const b = toComparableText('<body>\n  <p>Graphic injury is ineligible.</p>\n</body>')
    expect(a).toBe(b)
  })

  it('decodes the entities that show up in policy prose', () => {
    expect(toComparableText('<p>ads &amp; brand deals &quot;limited&quot;</p>')).toBe(
      'ads & brand deals "limited"'
    )
  })

  // Found the hard way: Google's Help Center stamps a fresh request id into the
  // page chrome on every response, so the first version of this watcher
  // reported drift on its own second run.
  it('ignores a per-request id in the page chrome', () => {
    const page = (id: string) =>
      `<body><p>Main menu ${id} true Search Help Center</p><p>Advertiser-friendly guidelines.</p></body>`
    expect(hashText(toComparableText(page('7489372447939283845')))).toBe(
      hashText(toComparableText(page('6444335181362668987')))
    )
  })

  it('ignores long opaque tokens but keeps ordinary numbers', () => {
    expect(toComparableText('<p>ref a1b2c3d4e5f6g7h8i9j0k1l2m3</p>')).toBe('ref #tok')
    expect(toComparableText('<p>more than 4 instances in 60 seconds</p>')).toBe(
      'more than 4 instances in 60 seconds'
    )
  })

  it('strips comments, which is where CMS timestamps hide', () => {
    const a = toComparableText('<body><!-- rendered 09:01 --><p>Policy.</p></body>')
    const b = toComparableText('<body><!-- rendered 14:44 --><p>Policy.</p></body>')
    expect(a).toBe(b)
  })
})

describe('hashText', () => {
  it('is short enough to read in a log and still wide enough to trust', () => {
    expect(hashText('anything')).toHaveLength(16)
  })
})
