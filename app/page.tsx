/**
 * Placeholder shell. The bench UI lands in phase 3 and replaces this file.
 * It exists now so the deploy target is real from the first push rather than a
 * 404 that has to be explained.
 */
export default function Home() {
  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '48px 24px',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 640 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <svg width="48" height="48" viewBox="0 0 64 64" role="img" aria-label="Greenlight">
            <rect width="64" height="64" rx="7" fill="#141819" />
            <circle cx="32" cy="32" r="20.5" fill="none" stroke="#2BD07A" strokeOpacity=".22" strokeWidth="2" />
            <circle cx="32" cy="32" r="13" fill="#2BD07A" />
            <path d="M7.5 32h5M51.5 32h5" stroke="#DCDED7" strokeOpacity=".55" strokeWidth="2" strokeLinecap="square" />
          </svg>
          <h1 style={{ fontSize: 40, margin: 0, fontWeight: 400, letterSpacing: '.015em', textTransform: 'uppercase' }}>
            Green<span style={{ color: 'var(--gl-ink-soft)' }}>light</span>
          </h1>
        </div>
        <p style={{ margin: 0, fontSize: 21, lineHeight: 1.45, color: 'var(--gl-ink-soft)' }}>
          A monetization check for a cut you have already made. Drop a video in, get the timecodes that
          cost you the ad revenue, and the documents to do something about it.
        </p>
        <p className="gl-label">Building. The bench opens here.</p>
      </div>
    </main>
  )
}
