import { defineConfig } from 'vitest/config';
import path from 'node:path';
export default defineConfig({
  resolve: { alias: { '@dc/shared': path.resolve(__dirname, 'shared/src/index.ts') } },
  test: { include: ['tests/**/*.test.ts'], testTimeout: 180000, hookTimeout: 120000, pool: 'forks', fileParallelism: false, env: { NODE_ENV: 'test', BOT_DELAY: '0' } },
});
