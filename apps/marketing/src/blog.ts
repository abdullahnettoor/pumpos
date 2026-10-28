import { getCollection, type CollectionEntry } from 'astro:content';

export type Post = CollectionEntry<'blog'>;

// Preview builds and `astro dev` show scheduled posts so they can be reviewed
// before their time. Production shows a post once `publishedAt` has passed at
// build time; scripts/blog-due.mjs applies the same rule to decide when to rebuild.
const showScheduled = import.meta.env.DEV || import.meta.env.PUBLIC_BLOG_SHOW_SCHEDULED === 'true';

export function isLive(post: Post, now = new Date()): boolean {
  return !post.data.draft && (showScheduled || post.data.publishedAt <= now);
}

export async function getLivePosts(): Promise<Post[]> {
  const now = new Date();
  return (await getCollection('blog', (post) => isLive(post, now))).sort(
    (a, b) => b.data.publishedAt.valueOf() - a.data.publishedAt.valueOf(),
  );
}

export const formatPostDate = (date: Date) =>
  date.toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'Asia/Kolkata' });
