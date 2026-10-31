import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

/**
 * Content collections are scaffolded now so blog + docs can be activated in
 * Phase M4 by simply dropping MDX files into src/content/{blog,docs}. No entries
 * exist yet, so nothing is rendered.
 */
const blog = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/blog' }),
  schema: ({ image }) =>
    z
      .object({
        title: z.string(),
        description: z.string(),
        publishedAt: z.coerce.date(),
        updatedAt: z.coerce.date().optional(),
        tags: z.array(z.string()).default([]),
        draft: z.boolean().default(false),
        // 1200×630 SVG beside the post in images/<slug>/; also rendered to the PNG share image.
        cover: image().optional(),
        coverAlt: z.string().optional(),
      })
      .refine((post) => !post.cover || post.coverAlt, {
        message: 'coverAlt is required when cover is set',
        path: ['coverAlt'],
      }),
});

const docs = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/docs' }),
  schema: z.object({
    title: z.string(),
    description: z.string().optional(),
    order: z.number().default(0),
    category: z.string().optional(),
  }),
});

export const collections = { blog, docs };
