const OPERATORS = new Set([
  '+',
  '-',
  '*',
  '/',
  '%',
  '&',
  '|',
  '^',
  '!',
  '<',
  '>',
  '=',
  '?',
  ':',
  ',',
  ';',
  '(',
  ')',
  '{',
  '}',
  '[',
  ']',
]);

// A `/` starts a regex (rather than a division) when the previous token can't end an operand.
function isRegexContext(out: string): boolean {
  const prev = out.trimEnd().slice(-1);
  if (prev === '') return true;
  if (prev === ')' || prev === ']' || prev === '}') return false;
  return OPERATORS.has(prev);
}

// Returns the index just past the regex literal (including flags) starting at `start`, or -1.
function findRegexEnd(expr: string, start: number): number {
  let i = start + 1;
  let inClass = false;
  while (i < expr.length) {
    const c = expr[i] as string;
    if (c === '\n') return -1;
    if (c === '\\') {
      i += 2;
      continue;
    }
    if (c === '[') inClass = true;
    else if (c === ']') inClass = false;
    else if (c === '/' && !inClass) {
      i += 1;
      while (i < expr.length && /[a-z]/i.test(expr[i] as string)) i += 1;
      return i;
    }
    i += 1;
  }
  return -1;
}

export function minimizeExpression(expr: string): string {
  try {
    let out = '';
    let i = 0;
    let inSingle = false;
    let inDouble = false;
    let inTemplate = false;
    let escaped = false;

    while (i < expr.length) {
      const ch = expr[i] as string;
      const next = i + 1 < expr.length ? (expr[i + 1] as string) : '';

      // Inside string literals: preserve everything as-is
      if (inSingle || inDouble || inTemplate) {
        out += ch;
        if (escaped) {
          escaped = false;
        } else if (ch === '\\') {
          escaped = true;
        } else if (inSingle && ch === "'") {
          inSingle = false;
        } else if (inDouble && ch === '"') {
          inDouble = false;
        } else if (inTemplate && ch === '`') {
          inTemplate = false;
        }
        i += 1;
        continue;
      }

      // Regex literals: preserve as-is so `//` or `/*` inside them aren't taken for comments
      if (ch === '/' && next !== '/' && next !== '*' && isRegexContext(out)) {
        const end = findRegexEnd(expr, i);
        if (end !== -1) {
          out += expr.slice(i, end);
          i = end;
          continue;
        }
      }

      // Skip single-line comments
      if (ch === '/' && next === '/') {
        i += 2;
        while (i < expr.length && expr[i] !== '\n') {
          i += 1;
        }
        continue;
      }

      // Skip block comments
      if (ch === '/' && next === '*') {
        i += 2;
        while (i + 1 < expr.length && !(expr[i] === '*' && expr[i + 1] === '/')) {
          i += 1;
        }
        i = Math.min(expr.length, i + 2);
        continue;
      }

      // Enter string literals
      if (ch === "'") {
        inSingle = true;
        out += ch;
        i += 1;
        continue;
      }

      if (ch === '"') {
        inDouble = true;
        out += ch;
        i += 1;
        continue;
      }

      if (ch === '`') {
        inTemplate = true;
        out += ch;
        i += 1;
        continue;
      }

      // Handle whitespace outside strings: collapse and strip around operators
      if (/\s/.test(ch)) {
        // Skip all consecutive whitespace
        while (i < expr.length && /\s/.test(expr[i] as string)) {
          i += 1;
        }
        // Only add a space if needed (not adjacent to operators, not at start/end)
        const lastChar = out.length > 0 ? out[out.length - 1] : '';
        const nextChar = i < expr.length ? (expr[i] as string) : '';
        if (
          out.length > 0 &&
          i < expr.length &&
          !OPERATORS.has(lastChar as string) &&
          !OPERATORS.has(nextChar)
        ) {
          out += ' ';
        }
        continue;
      }

      out += ch;
      i += 1;
    }

    return out.trim();
  } catch {
    return expr;
  }
}
