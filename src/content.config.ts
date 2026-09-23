import { defineCollection } from 'astro:content';
import { z } from 'astro/zod';
import { glob } from 'astro/loaders';

const kapitel = defineCollection({
  loader: glob({ pattern: '**/*.mdx', base: './src/content/kapitel' }),
  schema: z.object({
    title: z.string(),
    /** Kurzes Label für die Kopfnavigation, z. B. „Hash“; fehlt es, wird `title` verwendet. */
    navTitle: z.string().optional(),
    order: z.number(),
    summary: z.string(),
    draft: z.boolean().default(false),
  }),
});

export const collections = { kapitel };
