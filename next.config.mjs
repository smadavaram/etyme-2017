/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    typedRoutes: true,
    // argon2 is a native module (the password door's hash). Bundling it
    // breaks its binary lookup, so the server loads it from node_modules.
    serverComponentsExternalPackages: ['argon2'],
    // And the binary itself: node-gyp-build finds it at run time by path,
    // which the file tracer cannot follow, so on the serverless host the
    // function shipped argon2's JavaScript without its .node file and every
    // password sign-up failed with "no native build" (found 2026-10-13,
    // first candidate sign-up on production). Name the prebuilds so they
    // are packed with every function that may hash or check a password.
    outputFileTracingIncludes: {
      '/**/*': ['./node_modules/argon2/prebuilds/linux-x64/**'],
    },
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
