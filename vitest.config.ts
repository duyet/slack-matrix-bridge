import { defineConfig } from 'vitest/config';
import { workersPool } from '@cloudflare/vitest-pool-workers';

export default defineConfig({
  test: {
    globals: true,
    pool: workersPool,
    poolOptions: {
      workers: {
        isolatedStorage: true,
        wrangler: {
          configPath: './wrangler.toml',
        },
      },
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts'],
    },
  },
});
