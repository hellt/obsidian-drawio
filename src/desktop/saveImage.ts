import { writeFile } from 'node:fs/promises';
import { remote } from 'electron';
import type { ImageFormat } from '../preview/diagramImage';

const FILTERS: Record<ImageFormat, { name: string; extensions: string[] }> = {
  png: { name: 'PNG image', extensions: ['png'] },
  svg: { name: 'SVG image', extensions: ['svg'] },
};

/**
 * Ask where to save an exported image with the native Save dialog — the same
 * remote dialog Obsidian's own Canvas "Export as image" uses. Resolves with
 * the chosen path, or null when the user cancels. Desktop-only: reached only
 * through a lazy import (see CLAUDE.md, Node/Electron imports).
 */
export async function chooseImagePath(name: string, format: ImageFormat): Promise<string | null> {
  if (!remote?.dialog) throw new Error('this Obsidian version offers no save dialog to plugins');
  const result = await remote.dialog.showSaveDialog({
    defaultPath: `${name}.${format}`,
    filters: [FILTERS[format], { name: 'All files', extensions: ['*'] }],
    properties: ['showOverwriteConfirmation', 'createDirectory'],
  });
  return result.canceled || !result.filePath ? null : result.filePath;
}

export async function writeImageFile(path: string, image: Blob): Promise<void> {
  await writeFile(path, new Uint8Array(await image.arrayBuffer()));
}
