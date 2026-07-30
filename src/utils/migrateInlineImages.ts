import { useAppStore } from '../store/appStore';
import { uploadImage, dataUriToBlob, hasInlineImage } from '../lib/imageStorage';

// One-off repair for content imported before images were uploaded to Storage.
// Those documents carry their images inlined as base64 data URIs, which sits in
// the project JSON — rewritten whole on every autosave, copied whole into every
// revision snapshot. Moving them out is what actually reclaims the space; the
// importer fix only stops more arriving.

export interface InlineImageMigrationResult {
  entriesScanned: number;
  entriesRewritten: number;
  imagesUploaded: number;
  imagesFailed: number;
  bytesFreed: number;
}

/**
 * Rewrites a single HTML fragment, uploading each inlined image and replacing
 * it with its URL. Images that fail to upload are left inline: dropping
 * someone's only copy of an image to save space is not a trade this should make
 * silently, so it reports the failure and moves on.
 */
export async function migrateHtmlInlineImages(
  html: string,
): Promise<{ html: string; uploaded: number; failed: number }> {
  if (!hasInlineImage(html)) return { html, uploaded: 0, failed: 0 };

  const doc = new DOMParser().parseFromString(html, 'text/html');
  const images = [...doc.querySelectorAll('img')].filter((img) =>
    img.getAttribute('src')?.startsWith('data:image/'));

  let uploaded = 0;
  let failed = 0;

  for (const img of images) {
    const src = img.getAttribute('src');
    if (!src) continue;
    const decoded = dataUriToBlob(src);
    if (!decoded) { failed += 1; continue; }

    const url = await uploadImage(decoded.blob, decoded.contentType);
    if (!url) { failed += 1; continue; }

    img.setAttribute('src', url);
    uploaded += 1;
  }

  return { html: doc.body.innerHTML, uploaded, failed };
}

/**
 * Walks every collection that can hold imported HTML and migrates it in place.
 * Safe to run repeatedly: entries with no inlined images are skipped, so a run
 * interrupted partway can simply be run again.
 */
export async function migrateProjectInlineImages(): Promise<InlineImageMigrationResult> {
  const result: InlineImageMigrationResult = {
    entriesScanned: 0,
    entriesRewritten: 0,
    imagesUploaded: 0,
    imagesFailed: 0,
    bytesFreed: 0,
  };

  const state = useAppStore.getState();

  // Each collection pairs the records to scan with the store action that
  // writes a rewritten record back.
  const collections: {
    items: { id: string; content: string }[];
    update: (id: string, patch: { content: string }) => void;
  }[] = [
    { items: state.researchEntries, update: state.updateResearchEntry },
    { items: state.fragments, update: state.updateFragment },
    { items: state.omittedMaterial, update: state.updateOmittedMaterial },
  ];

  for (const { items, update } of collections) {
    for (const item of items) {
      result.entriesScanned += 1;
      if (typeof item.content !== 'string' || !hasInlineImage(item.content)) continue;

      const before = item.content.length;
      const { html, uploaded, failed } = await migrateHtmlInlineImages(item.content);
      result.imagesUploaded += uploaded;
      result.imagesFailed += failed;

      if (html !== item.content) {
        update(item.id, { content: html });
        result.entriesRewritten += 1;
        result.bytesFreed += Math.max(0, before - html.length);
      }
    }
  }

  return result;
}
