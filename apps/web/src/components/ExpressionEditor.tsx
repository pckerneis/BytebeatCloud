import dynamic from 'next/dynamic';
import { javascript } from '@codemirror/lang-javascript';
import { EditorView } from '@codemirror/view';
import { linter, type Diagnostic } from '@codemirror/lint';
import { tomorrowNightBlue } from '@uiw/codemirror-theme-tomorrow-night-blue';
import { validateExpression, minimizeExpression, type ValidationIssue } from 'shared';

const CodeMirror = dynamic(
  () => import('@uiw/react-codemirror').then((mod) => mod.default),
  { ssr: false },
);

interface ExpressionEditorProps {
  value: string;
  onChange: (value: string) => void;
}

const expressionLinter = linter((view): Diagnostic[] => {
  const text = view.state.doc.toString();
  const trimmed = text.trim();
  if (!trimmed) {
    return [];
  }

  const result = validateExpression(text);

  if (result.valid) return [];

  const issue = result.issues[0];
  if (!issue) return [];

  return [
    {
      from: issue.start,
      to: issue.end,
      message: issue.message,
      severity: 'error',
    },
  ];
});

export function ExpressionEditor({ value, onChange }: ExpressionEditorProps) {
  return (
    <CodeMirror
      value={value}
      height="200px"
      extensions={[javascript(), EditorView.lineWrapping, expressionLinter]}
      basicSetup={{
        lineNumbers: false,
        foldGutter: false,
        highlightActiveLine: false,
      }}
      theme={tomorrowNightBlue}
      onChange={(nextValue: string) => onChange(nextValue)}
    />
  );
}

interface ReadonlyExpressionProps {
  expression: string;
}

export function ReadonlyExpression({ expression }: ReadonlyExpressionProps) {
  const minimized = minimizeExpression(expression);

  return (
    <CodeMirror
      value={minimized}
      height="auto"
      editable={false}
      extensions={[javascript(), EditorView.lineWrapping]}
      basicSetup={{
        lineNumbers: false,
        foldGutter: false,
        highlightActiveLine: false,
      }}
      theme={tomorrowNightBlue}
      onChange={() => {}}
    />
  );
}

interface ExpressionErrorSnippetProps {
  expression: string;
  issue: ValidationIssue;
}

export function ExpressionErrorSnippet({ expression, issue }: ExpressionErrorSnippetProps) {
  const start = issue.start;
  const end = issue.end;

  const lineStart = expression.lastIndexOf('\n', Math.max(0, start - 1)) + 1;
  const lineEndRaw = expression.indexOf('\n', end);
  const lineEnd = lineEndRaw === -1 ? expression.length : lineEndRaw;

  let prevLine: string | null = null;
  if (lineStart > 0) {
    const prevEnd = lineStart - 1;
    const prevStart = expression.lastIndexOf('\n', Math.max(0, prevEnd - 1)) + 1;
    prevLine = expression.slice(prevStart, prevEnd);
  }

  let nextLine: string | null = null;
  if (lineEnd < expression.length) {
    const nextStart = lineEnd + 1;
    const nextEndRaw = expression.indexOf('\n', nextStart);
    const nextEnd = nextEndRaw === -1 ? expression.length : nextEndRaw;
    nextLine = expression.slice(nextStart, nextEnd);
  }

  const currentLine = expression.slice(lineStart, lineEnd);

  const prevText = prevLine ? `${prevLine}\n` : '';
  const nextText = nextLine ? `\n${nextLine}` : '';
  const snippet = `${prevText}${currentLine}${nextText}`;

  const offsetInSnippet = prevText.length + (start - lineStart);
  const errorLength = Math.max(0, end - start);
  const from = offsetInSnippet;
  const to = offsetInSnippet + errorLength;

  const snippetLinter = linter((): Diagnostic[] => {
    if (errorLength <= 0) return [];
    return [
      {
        from,
        to,
        message: issue.message,
        severity: 'error',
      },
    ];
  });

  return (
    <CodeMirror
      className="expression-error-snippet"
      value={snippet}
      height="auto"
      editable={false}
      extensions={[javascript(), EditorView.lineWrapping, snippetLinter]}
      basicSetup={{
        lineNumbers: false,
        foldGutter: false,
        highlightActiveLine: false,
      }}
      theme={tomorrowNightBlue}
      onChange={() => {}}
    />
  );
}
