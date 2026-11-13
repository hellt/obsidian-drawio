import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('obsidian', async (importOriginal) => {
  const orig = await importOriginal<typeof import('obsidian')>();
  return { ...orig, Notice: vi.fn() };
});
vi.mock('../src/preview/diagramImage', async (importOriginal) => {
  const orig = await importOriginal<typeof import('../src/preview/diagramImage')>();
  return { ...orig, renderDiagramPng: vi.fn(), renderDiagramSvg: vi.fn() };
});
vi.mock('../src/desktop/saveImage', () => ({ chooseImagePath: vi.fn(), writeImageFile: vi.fn() }));

import { Notice } from 'obsidian';
import { chooseImagePath, writeImageFile } from '../src/desktop/saveImage';
import { renderDiagramPng, renderDiagramSvg } from '../src/preview/diagramImage';
import { InteractiveViewerController, type ImageExportSpec } from '../src/preview/interactiveViewer';

const XML = '<mxfile><diagram id="a" name="One"/><diagram id="b" name="Two"/></mxfile>';
const PNG = new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' });
const SVG = new Blob(['<svg/>'], { type: 'image/svg+xml' });
const SPEC: ImageExportSpec = {
  source: () => ({ xml: XML, page: 1, name: 'net' }),
  pngScale: () => 3,
};

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

function mount(imageExport: ImageExportSpec | null = SPEC) {
  const root = document.body.createDiv({ cls: 'drawio-codeblock' });
  const preview = root.createDiv({ cls: 'drawio-preview' });
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 200 100');
  preview.appendChild(svg);
  const controller = new InteractiveViewerController(root, preview, {
    imageExport: imageExport ?? undefined,
  });
  controller.bindSvg(svg);
  preview.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  const exportButton = root.querySelector<HTMLButtonElement>('[aria-label="Export diagram"]')!;
  const menu = root.querySelector<HTMLElement>('.drawio-interactive-menu')!;
  const item = (label: string) =>
    menu.querySelector<HTMLButtonElement>(`[role="menuitem"][aria-label="${label}"]`)!;
  return { root, preview, controller, exportButton, menu, item };
}

describe('interactive viewer Export menu', () => {
  beforeEach(() => {
    vi.mocked(Notice).mockClear();
    vi.mocked(renderDiagramPng).mockReset().mockResolvedValue(PNG);
    vi.mocked(renderDiagramSvg).mockReset().mockReturnValue(SVG);
    vi.mocked(chooseImagePath).mockReset();
    vi.mocked(writeImageFile).mockReset().mockResolvedValue(undefined);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    delete (window.navigator as { clipboard?: unknown }).clipboard;
    document.body.empty();
  });

  it('opens with the three actions and closes on Escape without leaving the viewer', () => {
    const { controller, exportButton, menu, item, preview } = mount();
    expect(exportButton.textContent).toBe('Export ▾');
    expect(exportButton.getAttribute('aria-haspopup')).toBe('menu');
    expect(menu.hidden).toBe(true);

    exportButton.click();
    expect(menu.hidden).toBe(false);
    expect(exportButton.getAttribute('aria-expanded')).toBe('true');
    expect(Array.from(menu.querySelectorAll('[role="menuitem"]'), (b) => b.textContent))
      .toEqual(['Copy PNG to clipboard', 'Save as PNG', 'Save as SVG']);
    // No clipboard image support here: Copy is disabled, focus starts on Save.
    expect(item('Copy PNG to clipboard').disabled).toBe(true);
    expect(document.activeElement).toBe(item('Save as PNG'));

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(menu.hidden).toBe(true);
    expect(exportButton.getAttribute('aria-expanded')).toBe('false');
    expect(controller.isActive).toBe(true);
    expect(document.activeElement).toBe(exportButton);

    exportButton.click();
    preview.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(menu.hidden).toBe(true);
    expect(controller.isActive).toBe(true);
    controller.dispose();
  });

  it('moves between enabled items with the arrow keys', () => {
    stubClipboard(async () => {});
    const { controller, exportButton, menu, item } = mount();
    exportButton.click();
    expect(document.activeElement).toBe(item('Copy PNG to clipboard'));
    menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(document.activeElement).toBe(item('Save as PNG'));
    menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
    menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
    expect(document.activeElement).toBe(item('Save as SVG'));
    controller.dispose();
  });

  it('copies the page being viewed as a PNG and reports it on the button', async () => {
    vi.useFakeTimers();
    let written: FakeClipboardItem[] = [];
    stubClipboard(async (items) => { written = items; await items[0]!.items['image/png']; });
    const { controller, exportButton, menu, item } = mount();

    exportButton.click();
    item('Copy PNG to clipboard').click();
    expect(menu.hidden).toBe(true);
    expect(exportButton.textContent).toBe('Copying…');
    expect(exportButton.disabled).toBe(true);
    await vi.waitFor(() => expect(exportButton.textContent).toBe('Copied'));

    expect(renderDiagramPng).toHaveBeenCalledWith(XML, 1, 3, document);
    await expect(written[0]!.items['image/png']).resolves.toBe(PNG);
    expect(exportButton.disabled).toBe(false);
    vi.advanceTimersByTime(1500);
    expect(exportButton.textContent).toBe('Export ▾');
    controller.dispose();
  });

  it('reports a render failure, not the clipboard rejection it causes', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(renderDiagramPng).mockRejectedValue(new Error('the diagram did not render'));
    stubClipboard(async (items) => {
      try { await items[0]!.items['image/png']; } catch { throw new Error('NotAllowedError'); }
    });
    const { controller, exportButton, item } = mount();

    exportButton.click();
    item('Copy PNG to clipboard').click();
    await vi.waitFor(() => expect(exportButton.textContent).toBe('Export failed'));
    expect(Notice).toHaveBeenCalledWith(
      'Drawio: could not export the diagram — Error: the diagram did not render',
    );
    controller.dispose();
  });

  it('asks where to save, then writes the PNG there', async () => {
    vi.mocked(chooseImagePath).mockResolvedValue('/tmp/net - Two.png');
    const { controller, exportButton, item } = mount();

    exportButton.click();
    item('Save as PNG').click();
    await vi.waitFor(() => expect(exportButton.textContent).toBe('Saved'));

    expect(chooseImagePath).toHaveBeenCalledWith('net - Two', 'png');
    expect(renderDiagramPng).toHaveBeenCalledWith(XML, 1, 3, document);
    expect(writeImageFile).toHaveBeenCalledWith('/tmp/net - Two.png', PNG);
    expect(Notice).not.toHaveBeenCalled();
    controller.dispose();
  });

  it('asks where to save, then writes the SVG there', async () => {
    vi.mocked(chooseImagePath).mockResolvedValue('/tmp/net - Two.svg');
    const { controller, exportButton, item } = mount();

    exportButton.click();
    item('Save as SVG').click();
    await vi.waitFor(() => expect(exportButton.textContent).toBe('Saved'));

    expect(chooseImagePath).toHaveBeenCalledWith('net - Two', 'svg');
    expect(renderDiagramSvg).toHaveBeenCalledWith(XML, 1, document);
    expect(writeImageFile).toHaveBeenCalledWith('/tmp/net - Two.svg', SVG);
    controller.dispose();
  });

  it('renders and writes nothing when the save dialog is cancelled', async () => {
    vi.mocked(chooseImagePath).mockResolvedValue(null);
    const { controller, exportButton, item } = mount();

    exportButton.click();
    item('Save as PNG').click();
    await vi.waitFor(() => expect(exportButton.disabled).toBe(false));

    expect(exportButton.textContent).toBe('Export ▾');
    expect(renderDiagramPng).not.toHaveBeenCalled();
    expect(writeImageFile).not.toHaveBeenCalled();
    expect(Notice).not.toHaveBeenCalled();
    controller.dispose();
  });

  it('stays disabled without an export source', () => {
    const { controller, exportButton, menu } = mount(null);
    expect(exportButton.disabled).toBe(true);
    exportButton.click();
    expect(menu.hidden).toBe(true);
    controller.dispose();
  });
});
