import * as acorn from 'acorn';

type AcornNode = acorn.Node & {
  [key: string]: unknown;
};

interface ValidationContext {
  errors: string[];
  warnings: string[];
  issues: ValidationIssue[];
}

export interface ValidationIssue {
  message: string;
  start: number;
  end: number;
}

export interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
}

class BytebeatValidator {
  validate(expr: string): ValidationResult {
    try {
      // Parse the code into an AST
      const ast = acorn.parseExpressionAt(expr, 0, {
        ecmaVersion: 2021,
        sourceType: 'script',
      });

      // Walk the AST and validate
      const errors: string[] = [];
      const warnings: string[] = [];
      const issues: ValidationIssue[] = [];

      this.walkNode(ast as unknown as AcornNode, {
        errors,
        warnings,
        issues,
      });

      return {
        valid: errors.length === 0,
        issues,
      };
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      let issues: ValidationIssue[] = [];

      if (e && typeof e === 'object') {
        const err = e as { pos?: number; raisedAt?: number };
        const rawPos =
          typeof err.pos === 'number'
            ? err.pos
            : typeof err.raisedAt === 'number'
              ? err.raisedAt
              : 0;
        const pos = Math.max(0, rawPos);
        issues = [
          {
            message: `Parse error: ${message}`,
            start: pos,
            end: pos + 1,
          },
        ];
      }

      return {
        valid: false,
        issues,
      };
    }
  }

  walkNode(node: AcornNode, context: ValidationContext): void {
    if (!node || typeof node !== 'object') return;

    // Check for dangerous patterns
    if (node.type === 'CallExpression') {
      const callee = (node as any).callee;
      if (callee?.type === 'Identifier') {
        const funcName = callee.name;
        if (funcName === 'eval' || funcName === 'Function') {
          context.errors.push(`Dangerous function call: ${funcName}`);
        }
      }
    }

    // Check for property access that might be dangerous
    if (node.type === 'MemberExpression') {
      const property = (node as any).property;
      if (!(node as any).computed && property?.type === 'Identifier') {
        const propName = property.name;
        if (['constructor', 'prototype', '__proto__'].includes(propName)) {
          const message = `Dangerous property access: ${propName}`;
          context.errors.push(message);
          context.issues.push({
            message,
            start: node.start,
            end: node.end,
          });
        }
      }

      this.walkNode((node as any).object, context);
      if ((node as any).computed) {
        this.walkNode((node as any).property, context);
      }
      return;
    }

    // Recursively walk all child nodes
    for (const key in node) {
      if (key === 'loc' || key === 'range') continue;

      const child = (node as any)[key];
      if (Array.isArray(child)) {
        child.forEach((c) => this.walkNode(c, context));
      } else if (child && typeof child === 'object') {
        this.walkNode(child as AcornNode, context);
      }
    }
  }
}

export function validateExpression(expr: string): ValidationResult {
  const validator = new BytebeatValidator();
  return validator.validate(expr);
}
