import { describe, it, expect } from 'vitest';
import { validateExpression } from '../../src/utils/expression-validator';

describe('validateExpression - valid expressions', () => {
  it('accepts a simple identifier t', () => {
    const result = validateExpression('t');
    expect(result.valid).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it('accepts arithmetic with t', () => {
    const result = validateExpression('t + 1');
    expect(result.valid).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it('accepts calls to allowed globals like Math and sin', () => {
    const result1 = validateExpression('Math.sin(t)');
    const result2 = validateExpression('sin(t)');

    expect(result1.valid).toBe(true);
    expect(result1.issues).toHaveLength(0);

    expect(result2.valid).toBe(true);
    expect(result2.issues).toHaveLength(0);
  });

  it('accepts implicit variable declarations', () => {
    const result = validateExpression('x = t, x + 1');
    expect(result.valid).toBe(true);
    expect(result.issues).toHaveLength(0);
  });
});

describe('validateExpression - undefined variables and declarations', () => {
  it('rejects declarations with var', () => {
    const result = validateExpression('var x = t');
    expect(result.valid).toBe(false);
    expect(result.issues).toHaveLength(1);
  });

  it('rejects declarations with const', () => {
    const result = validateExpression('const x = t');
    expect(result.valid).toBe(false);
    expect(result.issues).toHaveLength(1);
  });

  it('rejects declarations with let', () => {
    const result = validateExpression('let x = 0');
    expect(result.valid).toBe(false);
  });
});

describe('validateExpression - disallowed node types', () => {
  it('disallows if statements', () => {
    const result = validateExpression('if (t > 0) t; else t + 1');
    expect(result.valid).toBe(false);
    expect(result.issues).toHaveLength(1);
  });
});

describe('validateExpression - dangerous calls and properties', () => {
  it('flags eval calls as invalid', () => {
    const result = validateExpression('eval("t + 1")');
    expect(result.valid).toBe(false);
  });

  it('flags Function constructor calls as invalid', () => {
    const result = validateExpression('Function("return t")');
    expect(result.valid).toBe(false);
  });

  it('adds warnings for dangerous property access', () => {
    const result = validateExpression('Math.constructor');
    expect(result.valid).toBe(false);
  });
});

describe('validateExpression - trailing and parse errors', () => {
  it('flags trailing non-whitespace after a valid expression', () => {
    const expr = 't + 1 !!!';
    const result = validateExpression(expr);

    expect(result.valid).toBe(false);
    const hasUnexpectedToken = result.issues.some((i) => i.message === 'Unexpected token');
    expect(hasUnexpectedToken).toBe(true);
  });

  it('returns a parse error with a position on invalid syntax', () => {
    const expr = 't +';
    const result = validateExpression(expr);

    expect(result.valid).toBe(false);
    expect(result.issues.length).toBeGreaterThan(0);
    const parseIssue = result.issues[0];
    expect(parseIssue.message.toLowerCase()).toContain('parse error');
    expect(parseIssue.start).toBeGreaterThanOrEqual(0);
    expect(parseIssue.end).toBeGreaterThan(parseIssue.start);
  });
});
