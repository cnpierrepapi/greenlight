import { ImageResponse } from 'next/og'

export const alt = 'Greenlight. Find out which nine seconds cost you the ad revenue, before you upload.'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

// Colours are the brand tokens, dark theme. Kept literal because Satori has no
// custom properties. If brand/tokens.css changes, change these too.
const INK_BG = '#0E1214'
const PANEL = '#171C1E'
const RULE = '#293134'
const BONE = '#E3E6E0'
const SOFT = '#9BA29F'
const FAINT = '#6E7775'
const TALLY = '#2BD07A'
const LIMIT = '#E0A72E'
const STRIKE = '#E76A5F'

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          background: INK_BG,
          padding: 64,
        }}
      >
        {/* lockup */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: 7,
              background: '#0A0D0E',
              border: `1px solid ${RULE}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <div
              style={{
                width: 41,
                height: 41,
                borderRadius: '50%',
                border: '2px solid rgba(43,208,122,0.28)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <div style={{ width: 26, height: 26, borderRadius: '50%', background: TALLY }} />
            </div>
          </div>
          <div style={{ display: 'flex', fontSize: 34, letterSpacing: 2, color: BONE }}>
            GREEN<span style={{ color: SOFT }}>LIGHT</span>
          </div>
        </div>

        {/* thesis */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 22, maxWidth: 940 }}>
          <div style={{ fontSize: 68, lineHeight: 1.08, color: BONE, letterSpacing: -1.5 }}>
            Find out which nine seconds cost you the ad revenue, before you upload.
          </div>
          <div style={{ fontSize: 27, lineHeight: 1.4, color: SOFT, maxWidth: 820 }}>
            Drop the cut in. Greenlight transcribes it in your browser, checks it against what the
            platforms publish, and hands back the timecodes and the fix.
          </div>
        </div>

        {/* evidence strip */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', height: 26, border: `1px solid ${RULE}` }}>
            <div style={{ width: '6%', background: LIMIT }} />
            <div style={{ width: '24%', background: PANEL }} />
            <div style={{ width: '4%', background: LIMIT }} />
            <div style={{ width: '18%', background: PANEL }} />
            <div style={{ width: '11%', background: STRIKE }} />
            <div style={{ width: '37%', background: PANEL }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 21, color: FAINT }}>
            <div style={{ display: 'flex' }}>00:04.2 strong language, first 30 seconds</div>
            <div style={{ display: 'flex' }}>06:12.0 descriptive violence, 29s</div>
            <div style={{ display: 'flex' }}>13:22 end</div>
          </div>
        </div>
      </div>
    ),
    size
  )
}
