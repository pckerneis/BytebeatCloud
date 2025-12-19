/**
 * Default fallback for untitled posts
 */
export const UNTITLED_POST = '(untitled)';

/**
 * Default fallback for unknown authors
 */
export const UNKNOWN_AUTHOR = 'unknown';

/**
 * Format a post title with fallback for untitled posts
 */
export function formatPostTitle(title: string | null | undefined): string {
  return title || UNTITLED_POST;
}

/**
 * Format an author username with fallback for unknown authors
 */
export function formatAuthorUsername(username: string | null | undefined): string {
  return username || UNKNOWN_AUTHOR;
}

/**
 * Format a post display string as "<title> by @<username>"
 */
export function formatPostByAuthor(
  title: string | null | undefined,
  username: string | null | undefined,
): string {
  return `${formatPostTitle(title)} by @${formatAuthorUsername(username)}`;
}
