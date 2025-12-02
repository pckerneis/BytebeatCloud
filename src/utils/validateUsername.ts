export function validateUsername(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return 'Username is required';
  if (trimmed.length < 3) return 'Username must be at least 3 characters';
  if (trimmed.length > 32) return 'Username must be at most 32 characters';
  if (!/^[A-Za-z0-9_.-]+$/.test(trimmed)) {
    return 'Only letters, digits, dots and hyphens and underscores are allowed';
  }
  return '';
}
