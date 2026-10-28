import rss from '@astrojs/rss';
import type { APIContext } from 'astro';
import { getLivePosts } from '../blog';

export async function GET(context: APIContext) {
  const posts = await getLivePosts();
  return rss({
    title: 'PumpOS Blog',
    description: 'Release notes and deep dives from the PumpOS team.',
    site: context.site ?? 'https://pumpos.abdullahnettoor.com',
    items: posts.map((post) => ({
      title: post.data.title,
      description: post.data.description,
      pubDate: post.data.publishedAt,
      link: `/blog/${post.id}/`,
    })),
  });
}
