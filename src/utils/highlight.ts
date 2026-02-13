/**
 * Wraps every occurrence of each search term in the given text with <mark>...</mark>.
 * Uses a single-pass regex (all terms alternated) to avoid double-marking when
 * one term is a substring of another. Case-insensitive, preserves original casing.
 */
export function highlightTerms(text: string, terms: string[]): string {
  if (!text) return text;

  const tokens = terms
    .map((t) => t.trim())
    .filter((t) => t.length > 0)
    .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));

  if (tokens.length === 0) return text;

  const pattern = new RegExp(`(${tokens.join('|')})`, 'gi');
  return text.replace(pattern, '<mark>$1</mark>');
}
