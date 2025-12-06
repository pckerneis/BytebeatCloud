import * as acorn from 'acorn';

const allowedGlobals = new Set([
  't',
  'Math',
  'sin',
  'cos',
  'tan',
  'abs',
  'floor',
  'ceil',
  'sqrt',
  'pow',
  'min',
  'max',
  'round',
  'random',
  'TAU',
  'PI',
  'tanh',
  'exp',
  'parseInt',
  'charCodeAt',
  'SR',
]);

const disallowedNodes = new Set<string>([
  'ForStatement',
  'WhileStatement',
  'DoWhileStatement',
  'SwitchStatement',
  'IfStatement',
]);

type AcornNode = acorn.Node & {
  [key: string]: unknown;
};

interface ValidationContext {
  errors: string[];
  warnings: string[];
  issues: ValidationIssue[];
  declaredVars: Set<string>;
  scope: Array<Set<string>>;
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
        ecmaVersion: 2020,
        sourceType: 'script',
      });

      // Walk the AST and validate
      const errors: string[] = [];
      const warnings: string[] = [];
      const issues: ValidationIssue[] = [];
      const declaredVars = new Set<string>();

      this.walkNode(ast as unknown as AcornNode, {
        errors,
        warnings,
        issues,
        declaredVars,
        scope: [new Set(allowedGlobals)],
      });

      // If there is trailing non-whitespace after the parsed expression,
      // treat it as a syntax error at the first unexpected token.
      const end = (ast as any).end ?? expr.length;
      const rest = expr.slice(end);
      const nonWsIndex = rest.search(/\S/);
      if (nonWsIndex !== -1) {
        const pos = end + nonWsIndex;
        const message = 'Unexpected token';
        errors.push(`Parse error: ${message}`);
        issues.push({
          message,
          start: pos,
          end: pos + 1,
        });
      }

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

    // Check for disallowed node types
    if (disallowedNodes.has(node.type)) {
      const message = `${node.type} is not allowed in bytebeat expressions`;
      context.errors.push(message);
      context.issues.push({
        message,
        start: (node as any).start ?? 0,
        end: (node as any).end ?? (node as any).start ?? 0,
      });
    }

    // Treat assignment to an identifier as an implicit declaration in this scope
    if (node.type === 'AssignmentExpression') {
      const left = (node as any).left;
      if (left?.type === 'Identifier') {
        const name = left.name as string;
        const currentScope = context.scope[context.scope.length - 1];
        currentScope.add(name);
        context.declaredVars.add(name);
      }
    }

    // Track variable declarations
    if (node.type === 'VariableDeclaration') {
      for (const decl of (node as any).declarations ?? []) {
        if (decl.id?.type === 'Identifier') {
          context.scope[context.scope.length - 1].add(decl.id.name);
          context.declaredVars.add(decl.id.name);
        }
      }
    }

    // Track function parameters
    if (
      node.type === 'FunctionDeclaration' ||
      node.type === 'FunctionExpression' ||
      node.type === 'ArrowFunctionExpression'
    ) {
      const currentScope = context.scope[context.scope.length - 1];
      const newScope = new Set<string>(currentScope);

      for (const param of (node as any).params ?? []) {
        if (param.type === 'Identifier') {
          newScope.add(param.name);
        }
      }

      context.scope.push(newScope);

      // Walk function body
      if ((node as any).body) {
        this.walkNode((node as any).body, context);
      }

      context.scope.pop();
      return; // Don't walk children again
    }

    // Check identifier usage
    if (node.type === 'Identifier' && !this.isInDeclarationPosition(node)) {
      const isDeclared = context.scope.some((scope) => scope.has((node as any).name));

      if (!isDeclared) {
        const message = `Undefined variable: '${(node as any).name}'`;
        context.errors.push(message);
        context.issues.push({
          message,
          start: (node as any).start ?? 0,
          end: (node as any).end ?? (node as any).start ?? 0,
        });
      }
    }

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
    if (node.type === 'MemberExpression' && !(node as any).computed) {
      const property = (node as any).property;
      if (property?.type === 'Identifier') {
        const propName = property.name;
        if (['constructor', 'prototype', '__proto__'].includes(propName)) {
          context.warnings.push(`Potentially dangerous property access: ${propName}`);
        }
      }
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

  isInDeclarationPosition(_node: AcornNode): boolean {
    // This is a simplified check - in a real implementation,
    // you'd track parent relationships more carefully
    return false;
  }
}

export function validateExpression(expr: string): ValidationResult {
  const validator = new BytebeatValidator();
  return validator.validate(expr);
}
