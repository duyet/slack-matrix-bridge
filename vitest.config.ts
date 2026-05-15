import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';
import { defaultExclude } from 'vitest/config';

export default defineWorkersConfig({
  test: {
    globals: true,
    exclude: [...defaultExclude, '**/.bun-cache/**', '**/.bun-tmp/**'],
    pool: '@cloudflare/vitest-pool-workers',
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
