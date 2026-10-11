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
    testTimeout: 30000,
    hookTimeout: 60000,
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: 'mysql://vendora:VendoraDb_2025_Prod@127.0.0.1:3306/vendora_test',
      AUTH_SECRET: 'vitest-secret-0123456789abcdef0123456789abcdef',
    },
  },
})
