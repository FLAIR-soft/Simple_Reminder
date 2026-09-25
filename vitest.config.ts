import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts'],
    // All date logic is tested in the user's zone, including DST changes.
    env: { TZ: 'Europe/Berlin' }
  }
})
