import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({ remote: { dialog: { showSaveDialog: vi.fn() } } }));
const { writeFile } = vi.hoisted(() => ({ writeFile: vi.fn() }));
vi.mock('node:fs/promises', () => ({ default: { writeFile }, writeFile }));

import { remote } from 'electron';
import { chooseImagePath, writeImageFile } from '../src/desktop/saveImage';

const showSaveDialog = vi.mocked(remote!.dialog.showSaveDialog);

describe('native Save dialog for exported images', () => {
  beforeEach(() => {
    showSaveDialog.mockReset();
    writeFile.mockReset();
  });

  it('suggests the file name and limits the dialog to the chosen format', async () => {
    showSaveDialog.mockResolvedValue({ canceled: false, filePath: '/Users/me/net - Two.svg' });
    await expect(chooseImagePath('net - Two', 'svg')).resolves.toBe('/Users/me/net - Two.svg');
    expect(showSaveDialog).toHaveBeenCalledWith({
      defaultPath: 'net - Two.svg',
      filters: [
        { name: 'SVG image', extensions: ['svg'] },
        { name: 'All files', extensions: ['*'] },
      ],
      properties: ['showOverwriteConfirmation', 'createDirectory'],
    });
  });

  it('resolves to null when the dialog is cancelled', async () => {
    showSaveDialog.mockResolvedValue({ canceled: true, filePath: '' });
    await expect(chooseImagePath('net', 'png')).resolves.toBeNull();
  });

  it('writes the image bytes to the chosen path', async () => {
    const image = { arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer } as Blob;
    await writeImageFile('/tmp/net.png', image);
    expect(writeFile).toHaveBeenCalledWith('/tmp/net.png', new Uint8Array([1, 2, 3]));
  });
});
