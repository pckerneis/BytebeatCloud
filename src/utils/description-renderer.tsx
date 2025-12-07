import Link from 'next/link';
import type { JSX } from 'react';

type MatchType = 'tag' | 'mention';

interface Match {
  type: MatchType;
  fullMatch: string;
  value: string; // tag name or userId
  start: number;
  end: number;
}

/**
 * Renders a description string with clickable #tags and @[userId] mentions.
 * - Tags link to /tags/{tagname}
 * - Mentions (stored as @[userId]) link to /u/{username}
 *
 * @param description - The description text (with stored @[userId] format)
 * @param userMap - Map of userId -> username for resolving mentions
 */
export function renderDescriptionWithTagsAndMentions(
  description: string,
  userMap: Map<string, string> = new Map(),
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
    } else {
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
