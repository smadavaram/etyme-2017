/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    typedRoutes: true,
  },
  // Old Rails directories — exclude from Next.js compilation
  webpack: (config) => {
    config.watchOptions = {
      ...config.watchOptions,
      ignored: [
        '**/app/assets/**',
        '**/app/channels/**',
        '**/app/controllers/**',
        '**/app/helpers/**',
        '**/app/jobs/**',
        '**/app/mailers/**',
        '**/app/models/**',
        '**/app/services/**',
        '**/app/uploaders/**',
        '**/app/views/**',
        '**/app/workers/**',
        '**/config/**',
        '**/db/**',
        '**/lib/**',
        '**/vendor/**',
        '**/node_modules/**',
      ],
    }
    return config
  },
}

export default nextConfig
