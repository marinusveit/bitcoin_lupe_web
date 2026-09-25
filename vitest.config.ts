/// <reference types="vitest/config" />
import { getViteConfig } from 'astro/config';

export default getViteConfig({
  // Svelte-Komponententests laufen in jsdom und brauchen den Browser-Build von Svelte.
  resolve: { conditions: ['browser'] },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    setupFiles: ['src/test/setup-dom.ts'],
  },
});
