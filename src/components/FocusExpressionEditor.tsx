import dynamic from 'next/dynamic';
import { javascript } from '@codemirror/lang-javascript';
import { EditorView } from '@codemirror/view';
import { keymap } from '@codemirror/view';
import { linter, type Diagnostic } from '@codemirror/lint';
import { insertNewline } from '@codemirror/commands';
import { Prec } from '@codemirror/state';
import { validateExpression } from '../utils/expression-validator';
import { getUiTheme } from '../theme/themes';
import { useThemeId } from '../theme/ThemeContext';

const CodeMirror = dynamic(() => import('@uiw/react-codemirror').then((mod) => mod.default), {
  ssr: false,
});

interface FocusExpressionEditorProps {
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
  lineNumbers: true,
  foldGutter: true,
  highlightActiveLine: false,
  autocompletion: false,
  indentOnInput: false,
} as const;

export function FocusExpressionEditor({ value, onChange }: FocusExpressionEditorProps) {
  const uiThemeId = useThemeId();
  const codeMirrorTheme = getUiTheme(uiThemeId).codeMirrorTheme;

  return (
    <CodeMirror
      style={{ height: '100%' }}
      value={value}
      height="100%"
      extensions={editorExtensions}
      basicSetup={editorBasicSetup}
      theme={codeMirrorTheme}
      onChange={(nextValue: string) => onChange(nextValue)}
    />
  );
}
