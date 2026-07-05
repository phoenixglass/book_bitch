// Transient-error retry wrapper for Supabase/Postgres calls. Statement
// timeouts, deadlocks, and dropped connections are usually momentary — most
// succeed on a second attempt a moment later — so we retry those instead of
// immediately surfacing a sync error to the user.
const TRANSIENT_PG_CODES = new Set([
  '57014', // query_canceled (statement timeout)
  '40001', // serialization_failure
  '40P01', // deadlock_detected
  '08000', '08003', '08006', '08001', '08004', // connection errors
]);

interface RetryableError {
  code?: string;
  message?: string;
}

function isTransientError(error: RetryableError | null | undefined): boolean {
  if (!error) return false;
  if (error.code && TRANSIENT_PG_CODES.has(error.code)) return true;
  const msg = error.message?.toLowerCase() ?? '';
  return (
    msg.includes('timeout') ||
    msg.includes('canceling statement') ||
    msg.includes('fetch failed') ||
    msg.includes('network')
  );
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// `operation` is a thunk (not a bare promise) so each retry re-issues the
// Supabase query builder rather than re-awaiting an already-settled promise.
// Constrained to `R` (rather than unpacking into `{ data, error }`) so the
// discriminated union PostgrestResponse types return from this function -
// callers narrowing on `error` still get `data` narrowed to non-null.
export async function withRetry<R extends { error: RetryableError | null }>(
  operation: () => PromiseLike<R>,
  { retries = 2, baseDelayMs = 800 }: { retries?: number; baseDelayMs?: number } = {},
): Promise<R> {
  let attempt = 0;
  for (;;) {
    const result = await operation();
    if (!result.error || !isTransientError(result.error) || attempt >= retries) return result;
    await sleep(baseDelayMs * 2 ** attempt);
    attempt += 1;
  }
}
