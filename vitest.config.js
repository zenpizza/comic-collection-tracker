import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['**/*.property.test.js'],
    exclude: ['**/node_modules/**', '**/ImageURLService.test.js'],
    testTimeout: 30000,
  },
})
