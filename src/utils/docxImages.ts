import { ImageRun } from 'docx';
import { dataUriToBlob } from '../lib/imageStorage';

// Word measures embedded images in pixels at 96 DPI. Cap them at the usable
// width inside the page's one-inch margins, and at a height that leaves an
// image on a page of its own rather than pushing past the bottom.
const MAX_WIDTH_PX = 624; // 6.5in
const MAX_HEIGHT_PX = 768; // 8in

type DocxImageType = 'png' | 'jpg' | 'gif' | 'bmp';

const DOCX_TYPES: Record<string, DocxImageType> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/gif': 'gif',
  'image/bmp': 'bmp',
  'image/x-ms-bmp': 'bmp',
};

interface LoadedImage {
  data: ArrayBuffer;
  type: DocxImageType;
  width: number;
  height: number;
}

/** Images keyed by the `src` they appear under in the document HTML. */
export type DocxImageMap = Map<string, LoadedImage>;

export function collectImageSources(html: string): string[] {
  if (!html?.includes('<img')) return [];
  const dom = new DOMParser().parseFromString(html, 'text/html');
  return [...dom.querySelectorAll('img')]
    .map((img) => img.getAttribute('src') ?? '')
    .filter(Boolean);
}

function scaleToFit(width: number, height: number): { width: number; height: number } {
  const ratio = Math.min(MAX_WIDTH_PX / width, MAX_HEIGHT_PX / height, 1);
  return { width: Math.round(width * ratio), height: Math.round(height * ratio) };
}

/**
 * Re-encodes a format Word cannot embed (WebP, AVIF and friends) as PNG. The
 * browser has already decoded it to a bitmap by this point, so this only costs
 * the encode.
 */
async function toPng(bitmap: ImageBitmap): Promise<Blob | null> {
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext('2d');
  if (!context) return null;
  context.drawImage(bitmap, 0, 0);
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}

async function loadImage(src: string): Promise<LoadedImage | null> {
  const decoded = dataUriToBlob(src);
  let blob: Blob;

  if (decoded) {
    blob = decoded.blob;
  } else {
    const response = await fetch(src);
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    blob = await response.blob();
  }

  // Word needs the pixel dimensions up front, and decoding is also how an
  // unsupported format gets converted.
  const bitmap = await createImageBitmap(blob);
  let type = DOCX_TYPES[blob.type.toLowerCase()];

  if (!type) {
    const png = await toPng(bitmap);
    if (!png) return null;
    blob = png;
    type = 'png';
  }

  const { width, height } = scaleToFit(bitmap.width, bitmap.height);
  bitmap.close();

  return { data: await blob.arrayBuffer(), type, width, height };
}

/**
 * Fetches every image the given documents reference, once each. Images live in
 * Storage (or, for older documents, as data URIs), so the bytes have to be in
 * hand before the synchronous HTML→docx conversion runs. An image that cannot
 * be loaded is left out of the map, and the conversion says so in its place
 * rather than dropping it silently.
 */
export async function loadDocxImages(htmls: string[]): Promise<DocxImageMap> {
  const sources = [...new Set(htmls.flatMap(collectImageSources))];
  const images: DocxImageMap = new Map();

  const loaded = await Promise.all(
    sources.map(async (src) => {
      try {
        return [src, await loadImage(src)] as const;
      } catch (error) {
        console.error(`[docx-export] could not load image ${src.slice(0, 80)}:`, error);
        return [src, null] as const;
      }
    }),
  );

  for (const [src, image] of loaded) if (image) images.set(src, image);
  return images;
}

export function imageRunFor(img: Element, images: DocxImageMap): ImageRun | null {
  const src = img.getAttribute('src');
  const image = src ? images.get(src) : undefined;
  if (!image) return null;

  const alt = img.getAttribute('alt') ?? '';
  return new ImageRun({
    type: image.type,
    data: image.data,
    transformation: { width: image.width, height: image.height },
    altText: alt ? { name: alt, description: alt, title: alt } : undefined,
  });
}
