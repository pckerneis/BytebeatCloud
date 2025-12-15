import dynamic from 'next/dynamic';
import { javascript } from '@codemirror/lang-javascript';
import { EditorView } from '@codemirror/view';
import { keymap } from '@codemirror/view';
import { linter, type Diagnostic } from '@codemirror/lint';
import { insertNewline } from '@codemirror/commands';
import { Prec } from '@codemirror/state';
import { validateExpression, ValidationIssue } from '../utils/expression-validator';
import { minimizeExpression } from '../utils/minimize-expression';
import { memo, useMemo, useState, useCallback } from 'react';
import { getUiTheme } from '../theme/themes';
import { useThemeId } from '../theme/ThemeContext';

const CodeMirror = dynamic(() => import('@uiw/react-codemirror').then((mod) => mod.default), {
  ssr: false,
});

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

const editorExtensions = [
  Prec.highest(
    keymap.of([
      {
        key: 'Enter',
        run: insertNewline,
      },
    ]),
  ),
  javascript(),
  EditorView.lineWrapping,
  expressionLinter,
];

const editorBasicSetup = {
  lineNumbers: false,
  foldGutter: false,
  highlightActiveLine: false,
  autocompletion: false,
  indentOnInput: false,
} as const;

export function ExpressionEditor({ value, onChange }: ExpressionEditorProps) {
  const uiThemeId = useThemeId();
  const codeMirrorTheme = getUiTheme(uiThemeId).codeMirrorTheme;

  return (
    <CodeMirror
      value={value}
      height="200px"
      extensions={editorExtensions}
      basicSetup={editorBasicSetup}
      theme={codeMirrorTheme}
      onChange={(nextValue: string) => onChange(nextValue)}
    />
  );
}

interface ReadonlyExpressionProps {
  expression: string;
}

const readonlyExtensions = [javascript(), EditorView.lineWrapping];

const readonlyBasicSetup = {
  lineNumbers: false,
  foldGutter: false,
  highlightActiveLine: false,
} as const;

export const ReadonlyExpression = memo(function ReadonlyExpression({
  expression,
}: ReadonlyExpressionProps) {
  const minimized = useMemo(() => minimizeExpression(expression), [expression]);
  const [copied, setCopied] = useState(false);

  const uiThemeId = useThemeId();
  const codeMirrorTheme = getUiTheme(uiThemeId).codeMirrorTheme;

  const handleCopy = useCallback((event: React.MouseEvent) => {
    event.stopPropagation();
    navigator.clipboard.writeText(expression).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    });
  }, [expression]);

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <CodeMirror
        value={minimized}
        height="auto"
        editable={false}
        extensions={readonlyExtensions}
        basicSetup={readonlyBasicSetup}
        theme={codeMirrorTheme}
        onChange={() => {}}
      />
      <button
        onClick={handleCopy}
        style={{
          position: 'absolute',
          top: '4px',
          right: '4px',
          padding: '4px 8px',
          fontSize: '12px',
          background: 'rgba(0, 0, 0, 0.6)',
          color: '#fff',
          border: 'none',
          borderRadius: '4px',
          cursor: 'pointer',
          opacity: 0.8,
          transition: 'opacity 0.2s',
          zIndex: 10,
        }}
        onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
        onMouseLeave={(e) => (e.currentTarget.style.opacity = '0.8')}
      >
        {copied ? 'Copied to clipboard' : 'Copy'}
      </button>
    </div>
  );
});

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
  const uiThemeId = useThemeId();
  const codeMirrorTheme = getUiTheme(uiThemeId).codeMirrorTheme;

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
      theme={codeMirrorTheme}
      onChange={() => {}}
    />
  );
}
