import { ImageResponse } from 'next/og'

export const size = { width: 180, height: 180 }
export const contentType = 'image/png'

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#141819',
        }}
      >
        <div
          style={{
            width: 116,
            height: 116,
            borderRadius: '50%',
            border: '4px solid rgba(43,208,122,0.30)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div style={{ width: 78, height: 78, borderRadius: '50%', background: '#2BD07A' }} />
        </div>
      </div>
    ),
    size
  )
}
