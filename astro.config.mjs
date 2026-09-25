// @ts-check
import { defineConfig } from 'astro/config';
import svelte from '@astrojs/svelte';
import mdx from '@astrojs/mdx';
import { unified } from '@astrojs/markdown-remark';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';

// https://astro.build/config
export default defineConfig({
  site: 'https://example.invalid',
  integrations: [svelte(), mdx()],
  markdown: {
    // Astro 7 nutzt standardmäßig Sätteri; für remark-math/KaTeX wird der unified-Prozessor gesetzt.
    processor: unified({ remarkPlugins: [remarkMath], rehypePlugins: [rehypeKatex] }),
    // Code-Blöcke im hellen Modus hell; die dunklen Farben schaltet global.css per --shiki-dark um.
    shikiConfig: { themes: { light: 'github-light', dark: 'github-dark' } },
  },
});
