/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    typedRoutes: true,
    // argon2 is a native module (the password door's hash). Bundling it
    // breaks its binary lookup, so the server loads it from node_modules.
    serverComponentsExternalPackages: ['argon2'],
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
