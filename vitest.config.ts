import { cloudflareTest } from '@cloudflare/vitest-pool-workers';
import { defaultExclude, defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [
    cloudflareTest({
      isolatedStorage: true,
      wrangler: {
        configPath: './wrangler.toml',
      },
    }),
  ],
  test: {
    globals: true,
    maxWorkers: 1,
    exclude: [...defaultExclude],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts'],
    },
  },
});
