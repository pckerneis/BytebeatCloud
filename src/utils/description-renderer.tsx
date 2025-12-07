import Link from 'next/link';
import type { JSX } from 'react';

type MatchType = 'tag' | 'mention';

interface Match {
  type: MatchType;
  fullMatch: string;
  value: string; // tag name or username
  start: number;
  end: number;
}

/**
 * Renders a description string with clickable #tags and @mentions.
 * - Tags link to /tags/{tagname}
 * - Mentions link to /u/{username}
 */
export function renderDescriptionWithTagsAndMentions(description: string): JSX.Element[] {
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

  // Match @mentions: 1-30 alphanumeric/underscore chars
  const mentionRegex = /(?<![A-Za-z0-9_])@([A-Za-z0-9_]{1,30})(?![A-Za-z0-9_])/g;

  while ((match = mentionRegex.exec(description)) !== null) {
    matches.push({
      type: 'mention',
      fullMatch: match[0],
      value: match[1],
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
      // mention
      nodes.push(
        <Link key={`mention-${i}`} href={`/u/${m.value}`} className="mention-link">
          @{m.value}
        </Link>,
      );
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
