import { supabase } from './supabase';

// Images embedded in imported documents used to be inlined into the HTML as
// base64 data URIs (mammoth's default). That put binary into the project JSON,
// which is written whole on every autosave and copied whole into every revision
// snapshot — a single illustrated research document could outweigh the entire
// manuscript by an order of magnitude. Images now live in Storage and the HTML
// carries only a URL.
export const IMAGE_BUCKET = 'research-images';

// Data URIs look like: data:image/png;base64,iVBORw0KGgo...
const DATA_URI_PATTERN = /^data:([^;,]+)(;base64)?,(.*)$/s;

function extensionFor(contentType: string): string {
  const subtype = contentType.split('/')[1]?.split('+')[0] ?? 'bin';
  return subtype === 'jpeg' ? 'jpg' : subtype.replace(/[^a-z0-9]/gi, '') || 'bin';
}

// Paths are prefixed with the owner's id so a single storage policy can scope
// access per user, matching how the projects tables are secured.
async function ownedPath(contentType: string): Promise<string | null> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return `${data.user.id}/${crypto.randomUUID()}.${extensionFor(contentType)}`;
}

/**
 * Uploads image bytes and returns a public URL, or null if the upload could not
 * be made. Callers must treat null as "keep the image out of the document"
 * rather than falling back to a data URI, which is the problem being avoided.
 */
export async function uploadImage(blob: Blob, contentType: string): Promise<string | null> {
  const path = await ownedPath(contentType);
  if (!path) return null;

  const { error } = await supabase.storage
    .from(IMAGE_BUCKET)
    .upload(path, blob, { contentType, upsert: false });
  if (error) {
    console.error('Image upload failed:', error.message);
    return null;
  }

  const { data } = supabase.storage.from(IMAGE_BUCKET).getPublicUrl(path);
  return data.publicUrl ?? null;
}

/** Decodes a data: URI into a Blob, or null if it isn't one we can read. */
export function dataUriToBlob(dataUri: string): { blob: Blob; contentType: string } | null {
  const match = DATA_URI_PATTERN.exec(dataUri);
  if (!match) return null;
  const [, contentType, base64Marker, payload] = match;
  if (!base64Marker) return null;

  try {
    const binary = atob(payload);
    const bytes = new Uint8Array(new ArrayBuffer(binary.length));
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return { blob: new Blob([bytes], { type: contentType }), contentType };
  } catch {
    return null;
  }
}

/** True if the HTML still carries at least one inlined image. */
export function hasInlineImage(html: string): boolean {
  return /src\s*=\s*["']data:image\//i.test(html);
}
