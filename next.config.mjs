/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  async headers() {
    return [
      {
        // WebGPU and the threaded wasm backend both want cross origin isolation.
        // Without these two headers the Whisper worker silently drops to the slow
        // single threaded path, which is the difference between a 40 second and a
        // 4 minute transcription on a 13 minute video.
        //
        // credentialless rather than require-corp so the model files can still be
        // fetched from the CDN without a CORP header on every asset.
        source: '/(.*)',
        headers: [
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
          { key: 'Cross-Origin-Embedder-Policy', value: 'credentialless' },
        ],
      },
    ]
  },
}

export default nextConfig
