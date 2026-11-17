import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/app/main.ts', 'src/app/view.ts', 'src/app/dom.ts', 'src/app/icons.ts'],
      reporter: ['text', 'html'],
    },
  },
});
