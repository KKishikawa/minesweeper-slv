import { afterAll, beforeAll, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import type { Page } from 'playwright';
import { startBrowserHarness } from './harness';
import type { BrowserHarness } from './harness';
let harness: BrowserHarness;
beforeAll(async () => { harness = await startBrowserHarness(); });
afterAll(async () => { await harness?.close(); });
async function exported(page: Page) {
  const event = page.waitForEvent('download');
  await page.getByRole('button', { name: '診断JSONをダウンロード', exact: true }).click();
  const file = await event;
  return JSON.parse(await readFile((await file.path())!, 'utf8'));
}

it.each([['limit', 'timeout', '待機時間の上限に達しました'], ['error', 'worker-error', '解析に失敗しました']])(
  'exports %s with unavailable statistics and leaves all proposals empty', async (mode, outcome, status) => {
    const page = await harness.browser.newPage(); page.setDefaultTimeout(3000);
    await page.goto(`${harness.baseUrl}/test/browser/app.fixture.html?mode=${mode}`);
    await page.getByRole('status').filter({ hasText: status! }).waitFor();
    await page.getByText('開発者向け診断', { exact: true }).click();
    await page.getByLabel('診断履歴を取得する', { exact: true }).check();
    await page.getByRole('button', { name: '再解析する', exact: true }).click();
    await page.getByRole('status').filter({ hasText: status! }).waitFor();
    expect((await exported(page)).entries).toMatchObject([{ outcome, statisticsSource: 'unavailable', statistics: null }]);
    expect(await page.locator('[role=gridcell][aria-label*="提案:"]').count()).toBe(0);
    await page.close();
  });

it('exports cancellation of the original snapshot separately from a newer completed run', async () => {
  const page = await harness.browser.newPage(); page.setDefaultTimeout(3000);
  await page.goto(`${harness.baseUrl}/test/browser/app.fixture.html?mode=late`);
  await page.getByText('開発者向け診断', { exact: true }).click();
  await page.getByLabel('診断履歴を取得する', { exact: true }).check();
  await page.getByRole('button', { name: '再解析する', exact: true }).click();
  await page.getByLabel('幅', { exact: true }).fill('2');
  await page.getByLabel('高さ', { exact: true }).fill('1');
  await page.getByLabel('総地雷数', { exact: true }).fill('1');
  await page.getByRole('button', { name: '盤面を作成', exact: true }).click();
  await page.getByRole('status').filter({ hasText: '推測が必要です' }).waitFor();
  const data = await exported(page);
  expect(data.entries).toMatchObject([
    { outcome: 'cancelled', board: { width: 9, height: 9 } },
    { outcome: 'guess-required', board: { width: 2, height: 1 } },
  ]);
  await page.close();
});
