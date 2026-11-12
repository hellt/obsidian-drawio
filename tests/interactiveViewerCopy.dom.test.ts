import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('obsidian', async (importOriginal) => {
  const orig = await importOriginal<typeof import('obsidian')>();
  return { ...orig, Notice: vi.fn() };
});

import { Notice } from 'obsidian';
import { canvasScale, renderDiagramPng } from '../src/preview/diagramPng';
import { InteractiveViewerController } from '../src/preview/interactiveViewer';

/** jsdom has neither ClipboardItem nor navigator.clipboard; record writes. */
class FakeClipboardItem {
  constructor(readonly items: Record<string, Promise<Blob> | Blob>) {}
}

function stubClipboard(write: (items: FakeClipboardItem[]) => Promise<void>): void {
  vi.stubGlobal('ClipboardItem', FakeClipboardItem);
  Object.defineProperty(window.navigator, 'clipboard', {
    configurable: true, value: { write: vi.fn(write) },
  });
}

function mount(renderPng?: () => Promise<Blob>) {
  const root = document.body.createDiv({ cls: 'drawio-codeblock' });
  const preview = root.createDiv({ cls: 'drawio-preview' });
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 200 100');
  preview.appendChild(svg);
  const controller = new InteractiveViewerController(root, preview, { renderPng });
  controller.bindSvg(svg);
  preview.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  const copy = root.querySelector<HTMLButtonElement>('[aria-label="Copy diagram as PNG"]')!;
  return { root, controller, copy };
}

async function settle(): Promise<void> {
  for (let i = 0; i < 5; i++) await Promise.resolve();
}

describe('interactive viewer Copy button', () => {
  beforeEach(() => { vi.mocked(Notice).mockClear(); });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    delete (window.navigator as { clipboard?: unknown }).clipboard;
    document.body.empty();
  });

  it('writes the rendered PNG to the clipboard and reports the outcome on the button', async () => {
    vi.useFakeTimers();
    const png = new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' });
    let written: FakeClipboardItem[] = [];
    stubClipboard(async (items) => { written = items; await items[0]!.items['image/png']; });
    const { controller, copy } = mount(() => Promise.resolve(png));
    expect(copy.disabled).toBe(false);

    copy.click();
    expect(copy.textContent).toBe('Copying…');
    expect(copy.disabled).toBe(true);
    await settle();

    expect(written).toHaveLength(1);
    await expect(written[0]!.items['image/png']).resolves.toBe(png);
    expect(copy.textContent).toBe('Copied');
    expect(copy.disabled).toBe(false);
    expect(Notice).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1500);
    expect(copy.textContent).toBe('Copy');
    controller.dispose();
  });

  it('surfaces the render error, not the clipboard rejection it causes', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    stubClipboard(async (items) => {
      try { await items[0]!.items['image/png']; } catch { throw new Error('NotAllowedError'); }
    });
    const { controller, copy } = mount(() => Promise.reject(new Error('the diagram did not render')));

    copy.click();
    await settle();

    expect(copy.textContent).toBe('Copy failed');
    expect(Notice).toHaveBeenCalledWith(
      'Drawio: could not copy the diagram — Error: the diagram did not render',
    );
    controller.dispose();
  });

  it('stays disabled without a renderer or a clipboard that accepts images', () => {
    const noRenderer = mount();
    expect(noRenderer.copy.disabled).toBe(true);
    noRenderer.controller.dispose();

    const noClipboard = mount(() => Promise.resolve(new Blob()));
    expect(noClipboard.copy.disabled).toBe(true);
    noClipboard.controller.dispose();
  });
});

// The canvas rasterization itself needs a real browser (jsdom has no canvas);
// it is exercised end to end in Chromium, not here.
describe('renderDiagramPng', () => {
  it('rejects with the preview engine\'s own message for unrenderable XML', async () => {
    await expect(renderDiagramPng('not a diagram', 0, 2, document))
      .rejects.toThrow('Invalid drawio diagram');
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
