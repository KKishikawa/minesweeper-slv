import { afterAll, beforeAll, expect, it } from 'vitest';
import type { Page } from 'playwright';
import { startBrowserHarness } from './harness';
import type { BrowserHarness } from './harness';
let harness: BrowserHarness;
let page: Page;
beforeAll(async () => { harness = await startBrowserHarness(); page = await harness.browser.newPage(); page.setDefaultTimeout(3000); });
afterAll(async () => { await harness?.close(); });
async function board(width: number, height: number, mines: number) {
  await page.getByLabel('幅', { exact: true }).fill(String(width));
  await page.getByLabel('高さ', { exact: true }).fill(String(height));
  await page.getByLabel('総地雷数', { exact: true }).fill(String(mines));
  await page.getByRole('button', { name: '盤面を作成', exact: true }).click();
}
async function status(text: string) { await page.getByRole('status').filter({ hasText: text }).waitFor(); }
it('creates, solves, detects contradictions and recovers by editing', async () => {
  await page.goto(harness.baseUrl);
  await board(3, 1, 1);
  await page.getByRole('gridcell').nth(0).focus();
  await page.keyboard.press('0');
  await status('確定した手があります');
  expect(await page.getByRole('gridcell').nth(1).getAttribute('aria-label')).toContain('閉じたセル 提案: 安全 S');
  expect(await page.getByRole('gridcell').nth(2).getAttribute('aria-label')).toContain('閉じたセル 提案: 地雷 M');
  await board(3, 1, 2);
  await page.getByRole('gridcell').nth(1).focus(); await page.keyboard.press('1');
  await status('盤面に矛盾があります');
  expect(await page.getByRole('gridcell').nth(0).getAttribute('aria-label')).not.toContain('提案');
  await page.keyboard.press('2'); await status('確定した手があります');
  await board(2, 1, 1); await status('推測が必要です');
});
it('treats flags as fixed mines, explains the limitation and recovers by manual correction', async () => {
  await page.goto(harness.baseUrl); await board(3, 1, 1);
  expect(await page.getByText('入力旗は地雷として扱います。誤った旗でも数字と矛盾しなければ、その旗を前提とした提案が出ます。旗が正しいことを確認してください。', { exact: true }).isVisible()).toBe(true);
  expect(await page.locator('input[name="flag-policy"], input[name="auto-reconsider"]').count()).toBe(0);
  await page.getByRole('gridcell').nth(0).focus(); await page.keyboard.press('0');
  await page.keyboard.press('ArrowRight'); await page.keyboard.press('f');
  await status('盤面に矛盾があります');
  expect(await page.getByRole('gridcell').nth(1).getAttribute('aria-label')).toContain('入力旗');
  expect(await page.getByRole('gridcell').nth(1).getAttribute('aria-label')).not.toContain('提案:');
  await page.getByRole('button', { name: '再解析する', exact: true }).click();
  await status('盤面に矛盾があります');
  await page.getByRole('gridcell').nth(1).focus(); await page.keyboard.press('Delete');
  await status('確定した手があります');
  expect(await page.getByRole('gridcell').nth(1).getAttribute('aria-label')).toContain('閉じたセル 提案: 安全 S');
  await board(3, 1, 1);
  await page.getByRole('gridcell').nth(1).focus(); await page.keyboard.press('1');
  await page.keyboard.press('ArrowLeft'); await page.keyboard.press('f');
  await status('確定した手があります');
  expect(await page.getByRole('gridcell').nth(0).getAttribute('aria-label')).toContain('入力旗');
  expect(await page.getByRole('gridcell').nth(0).getAttribute('aria-label')).not.toContain('提案:');
  expect(await page.getByRole('gridcell').nth(2).getAttribute('aria-label')).toContain('提案: 安全 S');
});
it.each([['error', '解析に失敗しました'], ['limit', '待機時間の上限に達しました']])('clears proposals on %s and exposes retry', async (mode, message) => {
  await page.goto(`${harness.baseUrl}/test/browser/app.fixture.html?mode=${mode}`);
  await status(message!);
  expect(await page.getByRole('gridcell').first().getAttribute('aria-label')).not.toContain('提案:');
  await page.getByRole('button', { name: '再解析する', exact: true }).click();
  await status(message!);
});
it('discards delayed proposals after a newer board has been analyzed', async () => {
  await page.goto(`${harness.baseUrl}/test/browser/app.fixture.html?mode=late`);
  await board(2, 1, 0); // Delayed all-safe response.
  await board(2, 1, 1); // Newer tied-guess result.
  await status('推測が必要です');
  await page.waitForTimeout(500); // Cross the deliberately delayed test event.
  expect(await page.getByRole('status').textContent()).toBe('推測が必要です');
  expect(await page.getByRole('gridcell').first().getAttribute('aria-label')).toContain('提案: 推測 ?');
});
