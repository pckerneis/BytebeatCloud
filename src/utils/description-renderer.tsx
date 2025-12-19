import Link from 'next/link';
import type { JSX } from 'react';
import { formatPostTitle, formatAuthorUsername } from './post-format';

/**
 * Build a regex to match post URLs for the current app domain.
 * Returns null if running server-side.
 */
function buildPostUrlRegex(): RegExp | null {
  if (typeof window === 'undefined') return null;
  const escapedOrigin = window.location.origin.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(
    `${escapedOrigin}/post/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})`,
    'gi',
  );
}

type MatchType = 'tag' | 'mention' | 'postLink';

interface Match {
  type: MatchType;
  fullMatch: string;
  value: string; // tag name, userId, or postId
  start: number;
  end: number;
}

export interface PostInfo {
  title: string;
  authorUsername: string;
}

/**
 * Renders a description string with clickable #tags and @[userId] mentions.
 * - Tags link to /tags/{tagname}
 * - Mentions (stored as @[userId]) link to /u/{username}
 * - Post URLs are replaced with "<title> by @<username>" links
 *
 * @param description - The description text (with stored @[userId] format)
 * @param userMap - Map of userId -> username for resolving mentions
 * @param postMap - Map of postId -> PostInfo for resolving post links
 */
export function renderDescriptionWithTagsAndMentions(
  description: string,
  userMap: Map<string, string> = new Map(),
  postMap: Map<string, PostInfo> = new Map(),
): JSX.Element[] {
  const nodes: JSX.Element[] = [];

  // Collect all matches (tags and mentions)
  const matches: Match[] = [];

  // Match #tags: 1-30 alphanumeric/underscore/hyphen chars
  const tagRegex = /(?<![A-Za-z0-9_-])#([A-Za-z0-9_-]{1,30})(?![A-Za-z0-9_-])/g;
  let match: RegExpExecArray | null;

  while ((match = tagRegex.exec(description)) !== null) {
    matches.push({
      type: 'tag',
      fullMatch: match[0],
      value: match[1],
      start: match.index,
      end: match.index + match[0].length,
    });
  }

  // Match @[userId] mentions (stored format with UUID)
  const mentionIdRegex = /@\[([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})]/gi;

  while ((match = mentionIdRegex.exec(description)) !== null) {
    matches.push({
      type: 'mention',
      fullMatch: match[0],
      value: match[1], // userId
      start: match.index,
      end: match.index + match[0].length,
    });
  }

  // Match post URLs only for the current app domain
  const postUrlRegex = buildPostUrlRegex();
  if (postUrlRegex) {
    while ((match = postUrlRegex.exec(description)) !== null) {
      matches.push({
        type: 'postLink',
        fullMatch: match[0],
        value: match[1], // postId
        start: match.index,
        end: match.index + match[0].length,
      });
    }
  }

  // Sort matches by start position
  matches.sort((a, b) => a.start - b.start);

  // Build nodes
  let lastIndex = 0;
  let i = 0;

  for (const m of matches) {
    // Skip overlapping matches
    if (m.start < lastIndex) {
      continue;
    }

    // Add plain text before this match
    if (m.start > lastIndex) {
      nodes.push(<span key={`text-${i}`}>{description.slice(lastIndex, m.start)}</span>);
      i += 1;
    }

    if (m.type === 'tag') {
      const normalized = m.value.toLowerCase();
      nodes.push(
        <Link key={`tag-${i}`} href={`/tags/${normalized}`} className="tag-link">
          #{m.value}
        </Link>,
      );
    } else if (m.type === 'mention') {
      // mention - m.value is userId, look up username
      const username = userMap.get(m.value);
      if (username) {
        nodes.push(
          <Link key={`mention-${i}`} href={`/u/${username}`} className="mention-link">
            @{username}
          </Link>,
        );
      } else {
        // User not found or deleted - show placeholder
        nodes.push(
          <span key={`mention-${i}`} className="mention-link mention-deleted">
            @[deleted]
          </span>,
        );
      }
    } else if (m.type === 'postLink') {
      // post link - m.value is postId, look up post info
      const postInfo = postMap.get(m.value);
      if (postInfo) {
        nodes.push(
          <Link key={`post-${i}`} href={`/post/${m.value}`} className="post-link">
            {postInfo.title} by @{postInfo.authorUsername}
          </Link>,
        );
      } else {
        // Post not found or deleted - show as regular link
        nodes.push(
          <Link key={`post-${i}`} href={`/post/${m.value}`} className="post-link">
            {m.fullMatch}
          </Link>,
        );
      }
    }
    i += 1;

    lastIndex = m.end;
  }

  // Trailing text after the last match
  if (lastIndex < description.length) {
    nodes.push(<span key={`text-${i}`}>{description.slice(lastIndex)}</span>);
  }

  return nodes;
}

/**
 * Extract user IDs from stored mention format for pre-fetching.
 */
export function extractMentionUserIds(description: string): string[] {
  const mentionIdRegex = /@\[([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})]/gi;
  const matches = [...description.matchAll(mentionIdRegex)];
  return [...new Set(matches.map((m) => m[1]))];
}

/**
 * Extract post IDs from post URLs for pre-fetching.
 * Only matches URLs from the current app domain.
 */
export function extractPostIds(description: string): string[] {
  const postUrlRegex = buildPostUrlRegex();
  if (!postUrlRegex) return [];

  const matches = [...description.matchAll(postUrlRegex)];
  return [...new Set(matches.map((m) => m[1]))];
}
