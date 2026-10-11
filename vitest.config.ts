import path from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(process.cwd(), 'src'),
      'next/headers': path.resolve(process.cwd(), 'src/tests/stubs/next-headers.ts'),
    },
  },
  test: {
    environment: 'node',
    include: ['src/tests/**/*.test.ts'],
    fileParallelism: false,
    // Remote Aiven MySQL target (sandbox rebuild lost the local MariaDB):
    // every query carries WAN latency — 30s is not enough for the heavier
    // route-handler flows (bulk ops, checkout transactions).
    testTimeout: 120000,
    hookTimeout: 180000,
    env: {
      NODE_ENV: 'test',
      // Env override wins (used to target the isolated Aiven vendora_test DB
      // after the sandbox rebuild lost the local MariaDB); default stays local.
      DATABASE_URL:
        process.env.TEST_DATABASE_URL ??
        'mysql://vendora:VendoraDb_2025_Prod@127.0.0.1:3306/vendora_test',
      AUTH_SECRET: 'vitest-secret-0123456789abcdef0123456789abcdef',
    },
  },
})
