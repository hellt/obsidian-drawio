import { ensureMxfile, getDiagramPages } from '../model/xmlUtils';
import { renderPreview } from './ViewerRenderer';

export type ImageFormat = 'png' | 'svg';

/** What the viewer's Export menu exports: the diagram page being viewed. */
export interface ExportSource {
  xml: string;
  /** 0-based index of the page shown. */
  page: number;
  /** Base for the suggested file name (no extension), e.g. the diagram file's name. */
  name: string;
}

/** Canvas limits that hold across Chromium builds; larger renders fail. */
const MAX_CANVAS_SIDE = 16384;
const MAX_CANVAS_PIXELS = 16384 * 8192;

interface RenderedSvg {
  markup: string;
  width: number;
  height: number;
  /** The window the page was rendered in (popout-aware). */
  win: Window & typeof globalThis;
}

/**
 * Render one page with the bundled preview engine — the same offline viewer
 * that draws every preview — so exporting needs neither the drawio editor nor
 * a network. The page is rendered afresh in the light theme: the diagram as
 * authored, like a drawio export, whatever Obsidian's theme.
 */
function renderLightSvg(xml: string, page: number, doc: Document): RenderedSvg {
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
  return { markup: new win.XMLSerializer().serializeToString(svg), width, height, win };
}

/** The page as a standalone SVG file (the sanitized preview SVG). */
export function renderDiagramSvg(xml: string, page: number, doc: Document): Blob {
  const { markup } = renderLightSvg(xml, page, doc);
  return new Blob(['<?xml version="1.0" encoding="UTF-8"?>\n', markup], { type: 'image/svg+xml' });
}

/** The page as a PNG at `scale` (the PNG export scale), on a white background. */
export async function renderDiagramPng(
  xml: string,
  page: number,
  scale: number,
  doc: Document,
): Promise<Blob> {
  const { markup, width, height, win } = renderLightSvg(xml, page, doc);
  const image = new win.Image();
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`;
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

/**
 * Suggested file name (no extension) for Save as: the source's name, plus the
 * page name for multi-page diagrams, with characters no OS allows in a file
 * name replaced.
 */
export function exportFileName(source: ExportSource): string {
  const pages = getDiagramPages(ensureMxfile(source.xml));
  const pageName = pages.length > 1 ? pages[source.page]?.name : undefined;
  const raw = pageName ? `${source.name} - ${pageName}` : source.name;
  return raw.replace(/[\\/:*?"<>|]/g, '-').trim() || 'diagram';
}
