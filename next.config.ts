import type { NextConfig } from 'next'

// Lab reports are uploaded through a Server Action (up to 10 MB).
const config: NextConfig = { experimental: { serverActions: { bodySizeLimit: '11mb' } } }
export default config
