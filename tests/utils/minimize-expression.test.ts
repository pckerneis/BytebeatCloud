import { describe, it, expect } from 'vitest';
import { minimizeExpression } from '../../src/utils/minimize-expression';

describe('minimizeExpression', () => {
  describe('whitespace handling', () => {
    it('removes spaces around operators', () => {
      expect(minimizeExpression('t + 1')).toBe('t+1');
      expect(minimizeExpression('t * 2')).toBe('t*2');
      expect(minimizeExpression('a - b')).toBe('a-b');
      expect(minimizeExpression('x / y')).toBe('x/y');
    });

    it('collapses multiple spaces into one', () => {
      expect(minimizeExpression('t    +    1')).toBe('t+1');
    });

    it('trims leading and trailing whitespace', () => {
      expect(minimizeExpression('  t + 1  ')).toBe('t+1');
    });

    it('handles newlines and tabs', () => {
      expect(minimizeExpression('t\n+\n1')).toBe('t+1');
      expect(minimizeExpression('t\t+\t1')).toBe('t+1');
    });

    it('removes spaces around punctuation', () => {
      expect(minimizeExpression('foo ( x , y )')).toBe('foo(x,y)');
      expect(minimizeExpression('arr [ 0 ]')).toBe('arr[0]');
      expect(minimizeExpression('a ? b : c')).toBe('a?b:c');
    });
  });

  describe('comment removal', () => {
    it('removes single-line comments', () => {
      expect(minimizeExpression('t // comment')).toBe('t');
      expect(minimizeExpression('t // comment\n+ 1')).toBe('t+1');
    });

    it('removes multi-line comments', () => {
      expect(minimizeExpression('t /* comment */ + 1')).toBe('t+1');
      expect(minimizeExpression('t /* multi\nline\ncomment */ + 1')).toBe('t+1');
    });

    it('handles multiple comments', () => {
      expect(minimizeExpression('t // first\n+ 1 // second')).toBe('t+1');
      expect(minimizeExpression('t /* a */ + /* b */ 1')).toBe('t+1');
    });

    it('handles comment at end of expression', () => {
      expect(minimizeExpression('t + 1 // trailing')).toBe('t+1');
      expect(minimizeExpression('t + 1 /* trailing */')).toBe('t+1');
    });
  });

  describe('string literal preservation', () => {
    it('preserves single-quoted strings exactly', () => {
      expect(minimizeExpression("'hello world'")).toBe("'hello world'");
      expect(minimizeExpression("t + ' + '")).toBe("t+' + '");
    });

    it('preserves double-quoted strings exactly', () => {
      expect(minimizeExpression('"hello world"')).toBe('"hello world"');
      expect(minimizeExpression('t + " + "')).toBe('t+" + "');
    });

    it('preserves template literals exactly', () => {
      expect(minimizeExpression('`hello world`')).toBe('`hello world`');
      expect(minimizeExpression('t + ` + `')).toBe('t+` + `');
    });

    it('does not strip comment-like content inside strings', () => {
      expect(minimizeExpression('"// not a comment"')).toBe('"// not a comment"');
      expect(minimizeExpression('"/* not a comment */"')).toBe('"/* not a comment */"');
      expect(minimizeExpression("'// not a comment'")).toBe("'// not a comment'");
    });

    it('handles escaped quotes in strings', () => {
      expect(minimizeExpression("'it\\'s fine'")).toBe("'it\\'s fine'");
      expect(minimizeExpression('"say \\"hello\\""')).toBe('"say \\"hello\\""');
    });
  });

  describe('complex expressions', () => {
    it('handles a realistic bytebeat expression', () => {
      const input = `
        // Simple bytebeat
        t * ((t >> 12 | t >> 8) & 63 & t >> 4)
      `;
      expect(minimizeExpression(input)).toBe('t*((t>>12|t>>8)&63&t>>4)');
    });

    it('handles expression with inline comments', () => {
      const input = 't /* time */ * 2 // double it';
      expect(minimizeExpression(input)).toBe('t*2');
    });

    it('preserves division operator (not confused with comment)', () => {
      expect(minimizeExpression('t / 2')).toBe('t/2');
      expect(minimizeExpression('a / b / c')).toBe('a/b/c');
    });
  });

  describe('edge cases', () => {
    it('returns empty string for empty input', () => {
      expect(minimizeExpression('')).toBe('');
    });

    it('returns empty string for whitespace-only input', () => {
      expect(minimizeExpression('   ')).toBe('');
    });

    it('returns empty string for comment-only input', () => {
      expect(minimizeExpression('// just a comment')).toBe('');
      expect(minimizeExpression('/* just a comment */')).toBe('');
    });

    it('handles unclosed block comment gracefully', () => {
      expect(minimizeExpression('t /* unclosed')).toBe('t');
    });

    it('handles unclosed string gracefully', () => {
      const result = minimizeExpression('"unclosed');
      expect(typeof result).toBe('string');
    });
  });
});
