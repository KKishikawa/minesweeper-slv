import { afterAll, beforeAll, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import type { Page } from 'playwright';
import { startBrowserHarness, type BrowserHarness } from './harness';
import type {} from './image-input.fixture';

let production: BrowserHarness;
let fixture: BrowserHarness;
beforeAll(async () => { production = await startBrowserHarness(true); fixture = await startBrowserHarness(); });
afterAll(async () => { await fixture?.close(); await production?.close(); });
const privateFilename = 'private-board-do-not-export.png';
async function settled(page: Page) {
  await page.waitForFunction(() => document.querySelector('.result-card')?.getAttribute('data-phase') !== 'solving');
}
async function exportDiagnostic(page: Page) {
  const event = page.waitForEvent('download');
  await page.getByRole('button', { name: '診断JSONをダウンロード', exact: true }).click();
  return JSON.parse(await readFile((await (await event).path())!, 'utf8'));
}
async function assertRedPreview(page: Page) {
  expect(await page.locator('.image-preview').evaluate(node => {
    const canvas = node as HTMLCanvasElement;
    return { width: canvas.width, height: canvas.height, pixel: Array.from(canvas.getContext('2d')!.getImageData(0, 0, 1, 1).data) };
  })).toEqual({ width: 4, height: 3, pixel: [255, 0, 0, 255] });
}
function assertNoImageData(value: unknown) {
  const serialized = JSON.stringify(value);
  expect(serialized).not.toContain(privateFilename);
  // These fields would expose pixel payloads or input metadata through the solver's diagnostic contract.
  const inspect = (node: unknown): void => {
    if (node === null || typeof node !== 'object') return;
    for (const [key, child] of Object.entries(node)) {
      expect(key).not.toMatch(/image|pixel|rgba|file.?name|blob|data.?url|track|label|sharing|display|capture/i);
      inspect(child);
    }
  };
  inspect(value);
}

// Any upload, beacon/socket use, persistence or image metadata in diagnostics breaks the local-only contract.
it('image_operations_do_not_send_or_store_data', async () => {
  const context = await production.browser.newContext();
  const requests: Array<{ url: string; method: string; body: string | null }> = [];
  const sockets: string[] = [];
  const failed: string[] = [];
  context.on('request', request => requests.push({ url: request.url(), method: request.method(), body: request.postData() }));
  context.on('requestfailed', request => failed.push(request.url()));
  await context.route('**/*', route => new URL(route.request().url()).origin === new URL(production.baseUrl).origin ? route.continue() : route.abort());
  const page = await context.newPage(); page.setDefaultTimeout(3000);
  page.on('websocket', socket => sockets.push(socket.url()));
  await page.addInitScript(() => {
    Object.defineProperty(window, '__imageBeacons', { value: [] });
    navigator.sendBeacon = url => { (window as unknown as { __imageBeacons: string[] }).__imageBeacons.push(String(url)); return false; };
    // Exercise the actual browser adapter's API-unavailable path, without replacing decoding or the app.
    Object.defineProperty(navigator.mediaDevices, 'getDisplayMedia', { value: undefined, configurable: true });
  });
  const storage = () => page.evaluate(async () => ({ local: localStorage.length, session: sessionStorage.length,
    databases: (await indexedDB.databases()).length, workers: (await navigator.serviceWorker.getRegistrations()).length,
    beacons: (window as unknown as { __imageBeacons: string[] }).__imageBeacons }));
  await page.goto(production.baseUrl); await settled(page);
  expect(await storage()).toEqual({ local: 0, session: 0, databases: 0, workers: 0, beacons: [] });
  await page.getByText('開発者向け診断', { exact: true }).click();
  await page.getByLabel('診断履歴を取得する', { exact: true }).check();
  await page.getByRole('button', { name: '再解析する', exact: true }).click(); await settled(page);
  const baseline = await exportDiagnostic(page);
  expect(baseline.entries).toHaveLength(1);
  const board = await page.locator('.board-surface').innerHTML();
  await page.locator('.image-input summary').click();
  expect(await page.getByRole('button', { name: '画面共有を開始', exact: true }).isDisabled()).toBe(true);
  expect(await page.locator('.display-status').textContent()).toContain('対応していません');
  // A real decoded PNG with independently checked red pixels, not a fake adapter result.
  const bytes = await page.evaluate(async () => {
    const canvas = document.createElement('canvas'); canvas.width = 4; canvas.height = 3;
    const ctx = canvas.getContext('2d')!; ctx.fillStyle = '#ff0000'; ctx.fillRect(0, 0, 4, 3);
    const blob = await new Promise<Blob>(resolve => canvas.toBlob(blob => resolve(blob!), 'image/png'));
    return Array.from(new Uint8Array(await blob.arrayBuffer()));
  });
  await page.locator('.image-file').setInputFiles({ name: privateFilename, mimeType: 'image/png', buffer: Buffer.from(bytes) });
  await page.locator('.image-metadata').filter({ hasText: 'ファイル' }).waitFor();
  await assertRedPreview(page);
  expect(await storage()).toEqual({ local: 0, session: 0, databases: 0, workers: 0, beacons: [] });
  expect((await exportDiagnostic(page)).entries).toEqual(baseline.entries);
  expect(await page.locator('.undo-button').isDisabled()).toBe(true);
  // Explicit solving while the named file image is retained must not attach its pixels or metadata.
  await page.getByRole('button', { name: '再解析する', exact: true }).click(); await settled(page);
  const fileDiagnostic = await exportDiagnostic(page);
  expect(fileDiagnostic.entries).toHaveLength(2); assertNoImageData(fileDiagnostic);
  await assertRedPreview(page);
  expect(await page.locator('.image-metadata').textContent()).toContain('ファイル');
  for (const kind of ['paste', 'drop'] as const) {
    await page.evaluate(({ bytes, name, kind }) => {
      const data = new DataTransfer(); data.items.add(new File([new Uint8Array(bytes)], name, { type: 'image/png' }));
      const event = kind === 'paste' ? new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true })
        : new DragEvent('drop', { dataTransfer: data, bubbles: true, cancelable: true });
      document.querySelector('.image-input-zone')!.dispatchEvent(event);
    }, { bytes, name: privateFilename, kind });
    await page.locator('.image-metadata').filter({ hasText: kind === 'paste' ? '貼り付け' : 'ドロップ' }).waitFor();
    await assertRedPreview(page);
    expect(await storage()).toEqual({ local: 0, session: 0, databases: 0, workers: 0, beacons: [] });
    expect((await exportDiagnostic(page)).entries).toEqual(fileDiagnostic.entries);
  }
  const imported = await exportDiagnostic(page);
  expect(imported.entries).toEqual(fileDiagnostic.entries); assertNoImageData(imported);
  expect(await page.locator('.board-surface').innerHTML()).toBe(board);
  expect(await page.locator('.undo-button').isDisabled()).toBe(true);
  // Manual editing also creates a diagnostic entry while the drop image is still retained.
  await page.getByRole('gridcell').first().focus(); await page.keyboard.press('0'); await settled(page);
  const edited = await exportDiagnostic(page);
  expect(edited.entries).toHaveLength(3); expect(edited.entries[2].board.cells[0].value).toBe(0); assertNoImageData(edited);
  await assertRedPreview(page);
  expect(await page.locator('.undo-button').isEnabled()).toBe(true);
  expect(await storage()).toEqual({ local: 0, session: 0, databases: 0, workers: 0, beacons: [] });
  await page.getByRole('button', { name: '画像をクリア', exact: true }).click();
  expect(await page.locator('.image-preview').evaluate(node => [(node as HTMLCanvasElement).width, (node as HTMLCanvasElement).height])).toEqual([0, 0]);
  expect((await exportDiagnostic(page)).entries).toEqual(edited.entries);
  expect(await storage()).toEqual({ local: 0, session: 0, databases: 0, workers: 0, beacons: [] });
  await page.reload(); await settled(page);
  expect(await page.locator('.image-preview').evaluate(node => (node as HTMLCanvasElement).width)).toBe(0);
  expect(await storage()).toEqual({ local: 0, session: 0, databases: 0, workers: 0, beacons: [] });
  const base = new URL(production.baseUrl);
  expect(requests.length).toBeGreaterThan(0);
  for (const request of requests) {
    const url = new URL(request.url);
    expect(url.origin).toBe(base.origin); expect(url.search).toBe('');
    expect(url.pathname === '/' || /^\/assets\/[^/]+\.(js|css)$/.test(url.pathname)).toBe(true);
    expect(request.method).toBe('GET'); expect(request.body).toBeNull();
  }
  expect(requests.some(request => request.url.includes('solver.worker-'))).toBe(true);
  expect(sockets).toEqual([]); expect(failed).toEqual([]);
  expect(await page.locator('footer').textContent()).toContain('画像・盤面の外部送信と自動保存はありません');
  await context.close();
});

// A mistaken image->AppAction connection would run the solver, add Undo entries or discard Redo.
it('keeps_image_and_sharing_operations_out_of_solver_history_and_diagnostics', async () => {
  const page = await fixture.browser.newPage(); page.setDefaultTimeout(3000);
  await page.goto(`${fixture.baseUrl}/test/browser/image-input.fixture.html`); await settled(page);
  const initial = await page.locator('.board-surface').innerHTML();
  await page.getByRole('gridcell').first().focus(); await page.keyboard.press('0'); await settled(page);
  await page.locator('.undo-button').click(); await settled(page);
  expect(await page.locator('.board-surface').innerHTML()).toBe(initial);
  const requests = await page.evaluate(() => window.imageFixture.solverRequests());
  await page.getByText('開発者向け診断', { exact: true }).click();
  await page.getByLabel('診断履歴を取得する', { exact: true }).check();
  await page.locator('.image-input summary').click();
  const file = await page.evaluate(() => window.imageFixture.image('image/png'));
  await page.locator('.image-file').setInputFiles({ name: privateFilename, mimeType: file.type, buffer: Buffer.from(file.bytes) });
  await page.locator('.image-metadata').filter({ hasText: 'ファイル' }).waitFor();
  await page.getByRole('button', { name: '画面共有を開始', exact: true }).click();
  await page.evaluate(() => window.imageFixture.send());
  await page.getByRole('button', { name: '最新フレームを取得', exact: true }).waitFor();
  await page.getByRole('button', { name: '最新フレームを取得', exact: true }).click();
  await page.locator('.image-metadata').filter({ hasText: '画面共有' }).waitFor();
  await assertRedPreview(page);
  expect(await page.locator('.board-surface').innerHTML()).toBe(initial);
  expect(await page.locator('.undo-button').isDisabled()).toBe(true);
  expect(await page.locator('.redo-button').isEnabled()).toBe(true);
  expect(await page.evaluate(() => window.imageFixture.solverRequests())).toEqual(requests);
  expect(await page.getByRole('button', { name: '診断JSONをダウンロード', exact: true }).isDisabled()).toBe(true);
  const trackLabel = await page.evaluate(() => window.imageFixture.trackLabel());
  expect(trackLabel.length).toBeGreaterThan(0);
  expect(await page.evaluate(() => window.imageFixture.trackState())).toBe('live');
  // Generate an entry with the sharing session and its captured image still present.
  await page.getByRole('button', { name: '再解析する', exact: true }).click(); await settled(page);
  const diagnostic = await exportDiagnostic(page); expect(diagnostic.entries).toHaveLength(1); assertNoImageData(diagnostic);
  expect(JSON.stringify(diagnostic)).not.toContain(trackLabel);
  await assertRedPreview(page);
  expect(await page.locator('.image-metadata').textContent()).toContain('画面共有');
  expect(await page.evaluate(() => window.imageFixture.trackState())).toBe('live');
  const explicitRequests = await page.evaluate(() => window.imageFixture.solverRequests());
  expect(explicitRequests).toEqual([...requests, requests.at(-1)! + 1]);
  await page.getByRole('button', { name: '共有を停止', exact: true }).click();
  expect(await page.evaluate(() => window.imageFixture.trackState())).toBe('ended');
  await page.getByRole('button', { name: '画像をクリア', exact: true }).click();
  expect(await page.locator('.board-surface').innerHTML()).toBe(initial);
  expect(await page.locator('.undo-button').isDisabled()).toBe(true);
  expect(await page.locator('.redo-button').isEnabled()).toBe(true);
  expect(await page.evaluate(() => window.imageFixture.solverRequests())).toEqual(explicitRequests);
  expect((await exportDiagnostic(page)).entries).toEqual(diagnostic.entries);
  await page.locator('.redo-button').click(); await settled(page);
  expect(await page.getByRole('gridcell').first().getAttribute('aria-label')).toContain('空き');
  expect(await page.evaluate(() => window.imageFixture.solverRequests())).toEqual(explicitRequests);
  expect((await exportDiagnostic(page)).entries).toEqual(diagnostic.entries);
  await page.close();
});
