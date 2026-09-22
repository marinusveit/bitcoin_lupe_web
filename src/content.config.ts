import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const kapitel = defineCollection({
  loader: glob({ pattern: '**/*.mdx', base: './src/content/kapitel' }),
  schema: z.object({
    title: z.string(),
    order: z.number(),
    summary: z.string(),
    draft: z.boolean().default(false),
  }),
});

export const collections = { kapitel };
