// PROTOTYPE — throwaway. Journal list variants for picking a layout; see ./Switcher.astro.
import type { Post } from '../../blog';
import { formatPostDate, readingMinutes } from '../../blog';

export const href = (post: Post) => `/blog/${post.id}`;
export const topic = (post: Post) => {
  const tag = post.data.tags[0] ?? 'notes';
  return tag.charAt(0).toUpperCase() + tag.slice(1);
};
export const meta = (post: Post) => `${formatPostDate(post.data.publishedAt)} · ${readingMinutes(post)} min read`;
export const year = (post: Post) => post.data.publishedAt.getFullYear();
