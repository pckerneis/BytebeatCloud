import {
  autocompletion,
  type CompletionContext,
  type CompletionResult,
  type Completion,
} from '@codemirror/autocomplete';

// All Math property names injected into the worklet expression scope
const mathNames = Object.getOwnPropertyNames(Math);

const MATH_FUNCTIONS = new Set([
  'abs',
  'acos',
  'acosh',
  'asin',
  'asinh',
  'atan',
  'atan2',
  'atanh',
  'cbrt',
  'ceil',
  'clz32',
  'cos',
  'cosh',
  'exp',
  'expm1',
  'floor',
  'fround',
  'hypot',
  'imul',
  'log',
  'log10',
  'log1p',
  'log2',
  'max',
  'min',
  'pow',
  'random',
  'round',
  'sign',
  'sin',
  'sinh',
  'sqrt',
  'tan',
  'tanh',
  'trunc',
]);

const MATH_CONSTANTS = new Set(['E', 'LN2', 'LN10', 'LOG2E', 'LOG10E', 'PI', 'SQRT1_2', 'SQRT2']);

// Detail labels
const BUILTIN_DETAIL = 'bytebeat built-in';
const MATH_DETAIL = 'Math alias';

const STATIC_COMPLETIONS: Completion[] = [
  // Bytebeat-specific injected names
  {
    label: 't',
    type: 'variable',
    detail: BUILTIN_DETAIL,
    info: 'Current sample index (auto-incremented)',
  },
  {
    label: 'SR',
    type: 'variable',
    detail: BUILTIN_DETAIL,
    info: 'Sample rate in Hz (e.g. 8000, 44100)',
  },
  { label: 'TAU', type: 'variable', detail: BUILTIN_DETAIL, info: '2 * Math.PI (≈6.2832)' },
  {
    label: 'int',
    type: 'function',
    detail: BUILTIN_DETAIL,
    info: 'Alias for Math.floor — truncates to integer',
  },
  // Math functions
  ...mathNames
    .filter((name) => MATH_FUNCTIONS.has(name))
    .map<Completion>((name) => ({
      label: name,
      type: 'function',
      detail: MATH_DETAIL,
    })),
  // Math constants
  ...mathNames
    .filter((name) => MATH_CONSTANTS.has(name))
    .map<Completion>((name) => ({
      label: name,
      type: 'constant',
      detail: MATH_DETAIL,
    })),
];

// Matches declarations and bare assignments (excluding == and =>) to find user-defined names
const DECL_RE = /(?:(?:let|const|var)\s+([$\w]+))|(?:function\s+([$\w]+))|([$\w]+)\s*=(?![>=])/g;

function getUserDefinedCompletions(doc: string, cursorPos: number): Completion[] {
  const names = new Set<string>();
  let match: RegExpExecArray | null;
  DECL_RE.lastIndex = 0;
  while ((match = DECL_RE.exec(doc)) !== null) {
    const name = match[1] ?? match[2] ?? match[3];
    if (name && match.index !== cursorPos) {
      names.add(name);
    }
  }
  return Array.from(names).map((name) => ({
    label: name,
    type: 'variable',
    detail: 'user-defined',
  }));
}

function bytebeatCompletionSource(context: CompletionContext): CompletionResult | null {
  // Match an identifier word at the cursor
  const word = context.matchBefore(/[$\w]+/);
  if (!word || (word.from === word.to && !context.explicit)) return null;

  const doc = context.state.doc.toString();
  const userCompletions = getUserDefinedCompletions(doc, word.from);

  const options = [...STATIC_COMPLETIONS, ...userCompletions];

  return {
    from: word.from,
    options,
    validFor: /^[$\w]*$/,
  };
}

export const bytebeatAutocompletion = autocompletion({
  override: [bytebeatCompletionSource],
  activateOnTyping: false,
});
