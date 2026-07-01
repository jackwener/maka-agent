import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { readMainProcessCombinedSource } from './main-process-contract-source-helpers.js';

describe('main-process safe-send to renderer contract', () => {
  it('routes every mainWindow webContents.send through safeSendToRenderer', async () => {
    // Regression guard: 2026-06-20 yuejing repro — pressing Cmd+, from a
    // freshly-launched Maka surfaced a main-process JS-error dialog
    //   "TypeError: Object has been destroyed at click (main.js:1286)
    //    at MenuItem.click"
    // because the menu accelerator handler did
    //   click: () => mainWindow?.webContents.send('window:openSettings')
    // The `?.` only guards a null `mainWindow` ref — it does NOT catch
    // the case where the BrowserWindow has been destroyed (window
    // closed, renderer crashed, teardown raced) while the variable still
    // points at the freed object. `.webContents` on a destroyed
    // BrowserWindow returns a destroyed object whose `.send` throws.
    //
    // Every channel send to the main window must go through the
    // `safeSendToRenderer` helper instead, which checks
    // `mainWindow.isDestroyed()` and `webContents.isDestroyed()` first.
    const src = await readMainProcessCombinedSource();

    assert.match(
      src,
      /function safeSendToRenderer\(channel: string, \.\.\.args: unknown\[\]\): void \{[\s\S]*?if \(!mainWindow \|\| mainWindow\.isDestroyed\(\)\) return;[\s\S]*?const wc = mainWindow\.webContents;[\s\S]*?if \(wc\.isDestroyed\(\)\) return;[\s\S]*?wc\.send\(channel, \.\.\.args\);[\s\S]*?\}/,
      'safeSendToRenderer must guard both mainWindow.isDestroyed and webContents.isDestroyed before sending',
    );

    assert.doesNotMatch(
      src,
      /mainWindow\?\.webContents\.send\(/,
      'No raw mainWindow?.webContents.send( call may remain — use safeSendToRenderer instead',
    );
    assert.doesNotMatch(
      src,
      /\bmainWindow\.webContents\.send\(/,
      'No raw mainWindow.webContents.send( call may remain either — use safeSendToRenderer instead',
    );

    // The legacy native application menu has been retired in favor of in-app
    // settings/navigation surfaces, so the old Cmd+, menu accelerator no
    // longer exists as a main-process send site.
    assert.match(
      src,
      /function installApplicationMenu\(\): void \{[\s\S]*?Menu\.setApplicationMenu\(null\);[\s\S]*?\}/,
      'The native application menu must stay disabled',
    );
    assert.doesNotMatch(
      src,
      /Menu\.buildFromTemplate\(/,
      'No native application menu template should be installed',
    );
  });
});
