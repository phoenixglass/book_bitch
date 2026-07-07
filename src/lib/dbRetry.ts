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

// Substrings seen in Postgres/Supabase infra-side failures (statement
// timeouts, connection refusals, standby/recovery states) as opposed to
// errors caused by something in this app or the user's data.
const OUTAGE_MESSAGE_SUBSTRINGS = [
  'timeout',
  'canceling statement',
  'fetch failed',
  'network',
  'not accepting connections',
  'hot standby',
  'connection refused',
  'connection terminated',
];

function isTransientError(error: RetryableError | null | undefined): boolean {
  if (!error) return false;
  if (error.code && TRANSIENT_PG_CODES.has(error.code)) return true;
  const msg = error.message?.toLowerCase() ?? '';
  return OUTAGE_MESSAGE_SUBSTRINGS.some((s) => msg.includes(s));
}

// Same classification, usable downstream of a plain `Error` whose Postgres
// error code was already lost (e.g. re-thrown as `new Error(error.message)`),
// so the UI can tell "Supabase is having an outage" apart from a real bug.
export function isLikelyOutageMessage(message: string | null | undefined): boolean {
  if (!message) return false;
  const msg = message.toLowerCase();
  return OUTAGE_MESSAGE_SUBSTRINGS.some((s) => msg.includes(s));
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
