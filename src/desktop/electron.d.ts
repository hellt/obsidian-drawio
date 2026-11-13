/**
 * Obsidian's desktop renderer exposes Electron's `remote` module — its own
 * "Export to PDF" and Canvas "Export as image" call
 * `remote.dialog.showSaveDialog`. The plugin doesn't depend on the electron
 * package (it's external at build time), so declare just the part it uses.
 */
declare module 'electron' {
  interface SaveDialogOptions {
    defaultPath?: string;
    filters?: { name: string; extensions: string[] }[];
    properties?: ('showOverwriteConfirmation' | 'createDirectory')[];
  }
  interface SaveDialogReturnValue {
    canceled: boolean;
    filePath?: string;
  }
  export const remote:
    | { dialog: { showSaveDialog(options: SaveDialogOptions): Promise<SaveDialogReturnValue> } }
    | undefined;
}
