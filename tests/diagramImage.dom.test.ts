import { describe, expect, it, vi } from 'vitest';

vi.mock('../src/preview/ViewerRenderer', () => ({
  renderPreview: vi.fn((el: HTMLElement, xml: string) => {
    if (!xml.includes('<mxfile')) {
      el.createDiv({ cls: 'drawio-error', text: 'Invalid drawio diagram' });
      return false;
    }
    el.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="-4 -4 120 60" '
      + 'width="120" height="60"><rect width="10" height="10"/></svg>';
    return true;
  }),
}));

import { renderPreview } from '../src/preview/ViewerRenderer';
import {
  canvasScale, exportFileName, renderDiagramPng, renderDiagramSvg,
} from '../src/preview/diagramImage';

const XML = '<mxfile><diagram id="a" name="One"/><diagram id="b" name="Two"/></mxfile>';

function readText(blob: Blob): Promise<string> {
  // jsdom's Blob has no text(); read it the FileReader way.
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.readAsText(blob);
  });
}

// The canvas rasterization needs a real browser (jsdom has no canvas); it is
// exercised end to end in Chromium, not here.
describe('diagram image export', () => {
  it('writes the page as a standalone SVG file, rendered in the light theme', async () => {
    const blob = renderDiagramSvg(XML, 1, document);
    expect(renderPreview).toHaveBeenCalledWith(expect.any(HTMLElement), XML, { dark: false, page: 1 });
    expect(blob.type).toBe('image/svg+xml');
    const text = await readText(blob);
    expect(text.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<svg')).toBe(true);
    expect(text).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(text).toContain('width="120" height="60"');
  });

  it('fails with the preview engine\'s own message for unrenderable XML', async () => {
    expect(() => renderDiagramSvg('not a diagram', 0, document)).toThrow('Invalid drawio diagram');
    await expect(renderDiagramPng('not a diagram', 0, 2, document))
      .rejects.toThrow('Invalid drawio diagram');
  });

  it('names files after the source, adding the page for multi-page diagrams', () => {
    expect(exportFileName({ xml: XML, page: 1, name: 'net' })).toBe('net - Two');
    expect(exportFileName({ xml: '<mxfile><diagram name="Only"/></mxfile>', page: 0, name: 'net' }))
      .toBe('net');
    expect(exportFileName({ xml: XML, page: 0, name: 'a/b:c' })).toBe('a-b-c - One');
    expect(exportFileName({ xml: '<mxGraphModel/>', page: 0, name: '  ' })).toBe('diagram');
  });

  it('keeps the PNG export scale unless the canvas limits require less', () => {
    expect(canvasScale(800, 600, 2)).toBe(2);
    expect(canvasScale(800, 600, Number.NaN)).toBe(1);
    // 12000 px wide at 2x would exceed the 16384 px side limit.
    expect(canvasScale(12000, 500, 2)).toBeCloseTo(16384 / 12000);
    // 8000 x 8000 at 2x stays under the side limit but not the pixel budget.
    expect(canvasScale(8000, 8000, 2)).toBeCloseTo(Math.sqrt(16384 * 8192 / 64e6));
  });
});
