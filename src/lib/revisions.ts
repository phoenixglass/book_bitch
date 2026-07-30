import { supabase } from './supabase';
import { withRetry } from './dbRetry';

const MAX_REVISIONS_PER_PROJECT = 50;

// Every snapshot used to store the whole project as raw JSONB, so 50 retained
// revisions meant 50 full copies of the manuscript per project. Two changes cut
// that down: identical states are not stored twice, and what is stored is
// gzipped (prose JSON compresses roughly an order of magnitude).
//
// Deliberately NOT delta-encoded against the previous revision. These rows are
// the recovery path for someone's book: a delta chain makes every restore
// depend on every earlier link, so one corrupt or pruned row silently breaks
// recovery, and pruning stops being safe to do in any order. Each row here
// stays independently restorable on its own.
const GZIP_FORMAT = 'gzip-b64-v1';

interface CompressedRevision {
  __format: typeof GZIP_FORMAT;
  payload: string;
}

export interface RevisionMeta {
  id: string;
  name: string;
  wordCount: number;
  createdAt: string;
}

function canCompress(): boolean {
  return typeof CompressionStream !== 'undefined' && typeof DecompressionStream !== 'undefined';
}

// Chunked rather than String.fromCharCode(...bytes): a manuscript's worth of
// gzipped bytes is a large enough spread to blow the argument limit.
function bytesToBase64(bytes: Uint8Array): string {
  const CHUNK = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

// Backed by an explicit ArrayBuffer so the result is a valid BlobPart — the
// bare `new Uint8Array(n)` form widens to ArrayBufferLike, which Blob rejects.
function base64ToBytes(base64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function gzipToBase64(text: string): Promise<string> {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
  const buffer = await new Response(stream).arrayBuffer();
  return bytesToBase64(new Uint8Array(buffer));
}

async function base64ToUngzipped(base64: string): Promise<string> {
  const stream = new Blob([base64ToBytes(base64)]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).text();
}

// Identity of the snapshot's content, used only to skip storing a byte-identical
// repeat. Falls back to null where SubtleCrypto is unavailable (non-secure
// context), which just means dedup is skipped — never a failed snapshot.
async function contentHash(json: string): Promise<string | null> {
  if (!globalThis.crypto?.subtle) return null;
  try {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(json));
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
  } catch {
    return null;
  }
}

async function encodeRevisionData(
  json: string,
  raw: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  if (!canCompress()) return raw;
  try {
    return { __format: GZIP_FORMAT, payload: await gzipToBase64(json) } satisfies CompressedRevision;
  } catch (err) {
    // Storing it uncompressed is worse for disk but still a valid snapshot,
    // which beats losing the snapshot entirely.
    console.error('Revision compression failed, storing uncompressed:', err);
    return raw;
  }
}

async function decodeRevisionData(stored: unknown): Promise<Record<string, unknown>> {
  if (stored && typeof stored === 'object' && (stored as CompressedRevision).__format === GZIP_FORMAT) {
    const { payload } = stored as CompressedRevision;
    return JSON.parse(await base64ToUngzipped(payload)) as Record<string, unknown>;
  }
  // Rows written before compression existed are plain JSONB.
  return (stored as Record<string, unknown> | null) ?? {};
}

// The serialized state carries `localLastModified`, which the autosave path
// refreshes to the current time immediately before every snapshot. Hashing it
// would make every snapshot unique and defeat dedup entirely, so identity is
// taken over the content alone. The stored payload still keeps the field.
function contentOnly(data: Record<string, unknown>): Record<string, unknown> {
  const content = { ...data };
  delete content.localLastModified;
  return content;
}

async function latestRevisionHash(projectId: string): Promise<string | null> {
  const { data, error } = await withRetry(() => supabase
    .from('project_revisions')
    .select('content_hash')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle());
  if (error) return null;
  return (data?.content_hash as string | null) ?? null;
}

export async function snapshotProjectRevision(
  userId: string,
  projectId: string,
  name: string,
  wordCount: number,
  data: Record<string, unknown>,
) {
  const json = JSON.stringify(data);
  const hash = await contentHash(JSON.stringify(contentOnly(data)));

  // An open tab that isn't being edited would otherwise bank a fresh full copy
  // every snapshot interval.
  if (hash && await latestRevisionHash(projectId) === hash) return;

  // Encoded once up front: withRetry re-issues its thunk on a transient
  // failure, and re-gzipping the manuscript on every attempt would be wasteful.
  const payload = await encodeRevisionData(json, data);

  const { error } = await withRetry(() => supabase.from('project_revisions').insert({
    project_id: projectId,
    user_id: userId,
    name,
    word_count: wordCount,
    data: payload,
    content_hash: hash,
  }));
  if (error) {
    console.error('Failed to snapshot project revision:', error.message);
    throw new Error(error.message);
  }
  await pruneOldRevisions(projectId);
}

// Called once a project's row is gone. Its revisions deliberately outlive it
// (migration 003) so the project can still be recovered — but recovery reads
// the *last* revision, and nothing in the app can browse the rest: the version
// history dialog only ever lists the active project's revisions, and a deleted
// project can't be active. The other ~49 full copies were therefore
// unreachable and unprunable, since pruneOldRevisions only ever runs when a
// new snapshot is inserted for the same project — which can never happen
// again. Collapsing to the newest keeps the documented recovery path and stops
// every deletion from leaking a manuscript's worth of storage forever.
//
// Best-effort: the project is already deleted by this point, so failing here
// must not surface as a failed deletion.
export async function collapseRevisionsToLatest(projectId: string) {
  const { data, error } = await withRetry(() => supabase
    .from('project_revisions')
    .select('id')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
    .range(1, 1000));
  if (error || !data || data.length === 0) return;
  const supersededIds = data.map((row) => row.id as string);
  const { error: deleteError } = await withRetry(() => supabase
    .from('project_revisions')
    .delete()
    .in('id', supersededIds));
  if (deleteError) {
    console.error('Failed to collapse revisions for deleted project:', deleteError.message);
  }
}

async function pruneOldRevisions(projectId: string) {
  const { data, error } = await withRetry(() => supabase
    .from('project_revisions')
    .select('id')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
    .range(MAX_REVISIONS_PER_PROJECT, MAX_REVISIONS_PER_PROJECT + 200));
  if (error || !data || data.length === 0) return;
  const staleIds = data.map((row) => row.id as string);
  await withRetry(() => supabase.from('project_revisions').delete().in('id', staleIds));
}

export async function listProjectRevisions(projectId: string): Promise<RevisionMeta[]> {
  const { data, error } = await withRetry(() => supabase
    .from('project_revisions')
    .select('id, name, word_count, created_at')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
    .limit(MAX_REVISIONS_PER_PROJECT));
  if (error) {
    console.error('Failed to list project revisions:', error.message);
    throw new Error(error.message);
  }
  return (data ?? []).map((row) => ({
    id: row.id as string,
    name: row.name as string,
    wordCount: (row.word_count as number) ?? 0,
    createdAt: row.created_at as string,
  }));
}

export async function getProjectRevisionData(revisionId: string): Promise<Record<string, unknown>> {
  const { data, error } = await withRetry(() => supabase
    .from('project_revisions')
    .select('data')
    .eq('id', revisionId)
    .single());
  if (error) {
    console.error('Failed to load project revision:', error.message);
    throw new Error(error.message);
  }
  return decodeRevisionData(data?.data);
}
