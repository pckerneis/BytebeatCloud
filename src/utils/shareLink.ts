import { ModeOption } from '../model/expression';

interface ShareLinkParams {
  title?: string;
  expression: string;
  mode: ModeOption;
  sampleRate: number;
  isFork?: boolean;
}

export function generateShareLink(params: ShareLinkParams): string | null {
  const { title, expression, mode, sampleRate, isFork = false } = params;
  
  if (typeof window === 'undefined') return null;
  
  const trimmedExpr = expression.trim();
  if (!trimmedExpr) return null;

  const trimmedTitle = title?.trim();

  const payload = {
    title: trimmedTitle || undefined,
    expr: trimmedExpr,
    mode,
    sr: sampleRate,
  };

  let encoded = '';
  try {
    encoded = btoa(JSON.stringify(payload));
  } catch {
    return null;
  }

  const origin = window.location.origin;
  return `${origin}/${isFork ? 'fork' : 'create'}?q=${encodeURIComponent(encoded)}`;
}

export async function copyShareLinkToClipboard(params: ShareLinkParams): Promise<boolean> {
  const link = generateShareLink(params);
  if (!link) return false;

  try {
    await navigator.clipboard.writeText(link);
    return true;
  } catch {
    return false;
  }
}
