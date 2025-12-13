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
