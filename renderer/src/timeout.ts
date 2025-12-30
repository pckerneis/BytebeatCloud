export class TimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TimeoutError';
  }
}

export function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  errorMessage: string = 'Operation timed out',
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new TimeoutError(errorMessage)), timeoutMs)
    ),
  ]);
}

export function runWithTimeout<T>(
  fn: () => T,
  timeoutMs: number,
  errorMessage: string = 'Operation timed out',
): Promise<T> {
  return withTimeout(
    Promise.resolve().then(() => fn()),
    timeoutMs,
    errorMessage,
  );
}
