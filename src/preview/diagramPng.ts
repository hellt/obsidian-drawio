import { renderPreview } from './ViewerRenderer';

/** Canvas limits that hold across Chromium builds; larger renders fail. */
const MAX_CANVAS_SIDE = 16384;
const MAX_CANVAS_PIXELS = 16384 * 8192;

/**
 * Render one page of a diagram to a PNG with the bundled preview engine, the
 * same offline viewer that draws every preview, so Copy needs neither the
 * drawio editor nor a network. The page is rendered afresh in the light theme
 * (the diagram as authored, like a drawio export, whatever Obsidian's theme)
 * and rasterized on a white background at `scale`, the PNG export scale.
 */
export async function renderDiagramPng(
  xml: string,
  page: number,
  scale: number,
  doc: Document,
): Promise<Blob> {
  const win = doc.defaultView;
  if (!win) throw new Error('the diagram is not in an open window');
  const holder = doc.createElement('div');
  renderPreview(holder, xml, { dark: false, page });
  const svg = holder.querySelector('svg');
  const width = Number(svg?.getAttribute('width'));
  const height = Number(svg?.getAttribute('height'));
  if (!svg || !(width > 0) || !(height > 0)) {
    throw new Error(holder.textContent?.trim() || 'the diagram did not render');
  }

  const image = new win.Image();
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
    new win.XMLSerializer().serializeToString(svg),
  )}`;
  await image.decode();

  const factor = canvasScale(width, height, scale);
  const canvas = doc.createElement('canvas');
  canvas.width = Math.round(width * factor);
  canvas.height = Math.round(height * factor);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no 2D canvas available');
  // Opaque like a drawio PNG export: a transparent image pasted onto a dark
  // background would hide black lines and text.
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('the PNG could not be encoded'));
    }, 'image/png');
  });
}

/** The requested scale, reduced only as far as the canvas limits require. */
export function canvasScale(width: number, height: number, requested: number): number {
  const wanted = Number.isFinite(requested) && requested > 0 ? requested : 1;
  return Math.min(
    wanted,
    MAX_CANVAS_SIDE / width,
    MAX_CANVAS_SIDE / height,
    Math.sqrt(MAX_CANVAS_PIXELS / (width * height)),
  );
}
