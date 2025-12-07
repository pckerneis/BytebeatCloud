import { supabase } from '../lib/supabaseClient';

/**
 * Stored format: @[userId] where userId is a UUID
 * Display format: @username
 * 
 * When saving, we convert @username to @[userId]
 * When rendering, we convert @[userId] back to @username
 */

// Regex to match @username (display format)
const MENTION_USERNAME_REGEX = /(?<![A-Za-z0-9_])@([A-Za-z0-9_]{1,30})(?![A-Za-z0-9_])/g;

// Regex to match @[userId] (stored format)
const MENTION_ID_REGEX = /@\[([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\]/gi;

/**
 * Convert @username mentions to @[userId] format for storage.
 * Usernames that don't exist are left as-is.
 */
export async function convertMentionsToIds(text: string): Promise<string> {
  // Extract all unique usernames
  const matches = [...text.matchAll(MENTION_USERNAME_REGEX)];
  if (matches.length === 0) return text;

  const usernames = [...new Set(matches.map((m) => m[1].toLowerCase()))];

  // Fetch user IDs for all usernames
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, username')
    .in('username', usernames);

  if (!profiles || profiles.length === 0) return text;

  // Build a map of lowercase username -> id
  const usernameToId = new Map<string, string>();
  for (const p of profiles) {
    usernameToId.set(p.username.toLowerCase(), p.id);
  }

  // Replace @username with @[userId]
  return text.replace(MENTION_USERNAME_REGEX, (match, username: string) => {
    const id = usernameToId.get(username.toLowerCase());
    return id ? `@[${id}]` : match; // Keep original if user not found
  });
}

/**
 * Convert @[userId] mentions to @username format for display.
 * Returns both the converted text and a map of userId -> username for rendering.
 */
export async function convertMentionsToUsernames(
  text: string,
): Promise<{ text: string; userMap: Map<string, string> }> {
  const matches = [...text.matchAll(MENTION_ID_REGEX)];
  if (matches.length === 0) return { text, userMap: new Map() };

  const userIds = [...new Set(matches.map((m) => m[1]))];

  // Fetch usernames for all user IDs
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, username')
    .in('id', userIds);

  const userMap = new Map<string, string>();
  if (profiles) {
    for (const p of profiles) {
      userMap.set(p.id, p.username);
    }
  }

  // Replace @[userId] with @username
  const convertedText = text.replace(MENTION_ID_REGEX, (match, userId: string) => {
    const username = userMap.get(userId);
    return username ? `@${username}` : match; // Keep original if user not found
  });

  return { text: convertedText, userMap };
}

/**
 * Extract user IDs from stored mention format.
 * Used for creating notifications.
 */
export function extractMentionedUserIds(text: string): string[] {
  const matches = [...text.matchAll(MENTION_ID_REGEX)];
  return [...new Set(matches.map((m) => m[1]))];
}
